import { CrosstalkError, errorResult, failure, needsConfirmation, toolTimeout, type CrosstalkApplication, type CrosstalkToolResult, type ToolInvocation } from '../protocol';
import { validate, validateInvocation } from '../protocol/validation';
export class ToolExecutor {
  private disposed = false;
  private completed = new Map<string, { fingerprint: string; expiresAt: number; result: Promise<CrosstalkToolResult> }>();
  private active = new Map<string, { abort: AbortController; interruptible: boolean; delegationId: string }>();
  private cancelled = new Set<string>();
  private approvals = new Map<string, string>();
  constructor(private application: CrosstalkApplication, private sessionId: string) {}
  approve(id: string, tool: string, args: unknown) { this.approvals.set(id, JSON.stringify({ tool, args })); }
  cancel(id: string) { const item = this.active.get(id); if (item?.interruptible) item.abort.abort(); }
  cancelDelegation(id: string) { this.cancelled.add(id); for (const entry of this.active.values()) if (entry.interruptible && entry.delegationId === id) entry.abort.abort(); this.approvals.clear(); }
  dispose() { this.disposed = true; for (const entry of this.active.values()) entry.abort.abort(); this.approvals.clear(); }
  execute(invocation: ToolInvocation): Promise<CrosstalkToolResult> {
    try { validateInvocation(invocation); } catch (error) { return Promise.resolve(errorResult(error)); }
    const fingerprint = JSON.stringify(invocation);
    if (this.disposed || invocation.sessionId !== this.sessionId || this.cancelled.has(invocation.delegationId)) return Promise.resolve(failure('STALE_INVOCATION', 'This action belongs to an inactive request.'));
    const cached = this.completed.get(invocation.invocationId);
    if (cached) return cached.fingerprint === fingerprint ? cached.result : Promise.resolve(failure('INVALID_INVOCATION', 'Invocation ID was reused with different arguments.'));
    if (Date.now() > invocation.expiresAt || invocation.expiresAt > Date.now() + 31_000) return Promise.resolve(failure('STALE_INVOCATION', 'This action has expired.'));
    for (const [id, entry] of this.completed) if (entry.expiresAt < Date.now() && !this.active.has(id)) this.completed.delete(id);
    if (this.completed.size >= 1024) return Promise.resolve(failure('TOO_MANY_ACTIONS', 'Too many actions are pending. Please try again.', true));
    // Cache pending promises too, so simultaneous duplicates cannot execute twice.
    const result = this.run(invocation);
    this.completed.set(invocation.invocationId, { fingerprint, result, expiresAt: invocation.expiresAt });
    return result;
  }
  private async run(invocation: ToolInvocation): Promise<CrosstalkToolResult> {
    const tool = this.application.tools.find(t => t.definition.name === invocation.tool);
    if (!tool) return failure('UNKNOWN_TOOL', 'That application action is not available.');
    const controller = new AbortController();
    this.active.set(invocation.invocationId, { abort: controller, interruptible: tool.definition.interruptible, delegationId: invocation.delegationId });
    const timeout = setTimeout(() => controller.abort(new CrosstalkError('TOOL_TIMEOUT', 'The application did not finish the action in time.', true)), Math.min(toolTimeout(tool.definition), invocation.expiresAt - Date.now()));
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', onAbort, { once: true }); });
    void aborted.catch(() => {});
    try {
      validate(tool.definition.inputSchema, invocation.arguments);
      if (needsConfirmation(tool.definition, invocation.explicitUserRequest)) {
        const approved = this.approvals.get(invocation.invocationId) === JSON.stringify({ tool: invocation.tool, args: invocation.arguments });
        this.approvals.delete(invocation.invocationId);
        if (!invocation.confirmed || !approved) return failure('PERMISSION_DENIED', 'This action needs user confirmation.');
      }
      const state = await Promise.race([this.application.getState(), aborted]);
      controller.signal.throwIfAborted();
      if ('ready' in state && state.ready === false) return failure('APPLICATION_NOT_READY', 'The application is still loading.', true);
      const data = await Promise.race([tool.execute(invocation.arguments, { invocationId: invocation.invocationId, sessionId: this.sessionId, delegationId: invocation.delegationId, signal: controller.signal, explicitUserRequest: invocation.explicitUserRequest }), aborted]);
      controller.signal.throwIfAborted();
      if (tool.definition.outputSchema) validate(tool.definition.outputSchema, data);
      // Round-trip serialization prevents DOM objects, class instances and exceptions crossing the bridge.
      const result: CrosstalkToolResult = { ok: true, data: data ?? null, stateChanged: tool.definition.effect !== 'read' };
      return JSON.parse(JSON.stringify(result));
    } catch (error) { return errorResult(error); }
    finally { if (onAbort) controller.signal.removeEventListener('abort', onAbort); clearTimeout(timeout); this.active.delete(invocation.invocationId); }
  }
}
