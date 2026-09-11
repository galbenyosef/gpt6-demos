import { errorResult, failure, toolTimeout, type CrosstalkToolResult } from '../protocol';
import { validate } from '../protocol/validation';
import type { RegisteredApplication } from './ApplicationRegistry';
import { PermissionEngine } from './PermissionEngine';
export type Logger = (event: string, fields?: Record<string, unknown>) => void;
export class ToolRouter {
  constructor(private permissions = new PermissionEngine(), private log: Logger = () => {}) {}
  async invoke(app: RegisteredApplication, delegationId: string, name: string, args: unknown, explicit: boolean, signal: AbortSignal): Promise<CrosstalkToolResult> {
    const tool = app.tools.get(name);
    if (!tool) return failure('UNKNOWN_TOOL', 'That application action is not available.');
    const invocationId = crypto.randomUUID(), startedAt = Date.now();
    const cancel = () => { if (tool.interruptible) app.send({ type: 'tool.cancel', invocationId }); };
    try {
      signal.throwIfAborted(); validate(tool.inputSchema, args);
      const authorization = await this.permissions.authorize(app, tool, args, explicit, invocationId, delegationId, signal);
      this.log('tool.permission', { sessionId: app.sessionId, tool: name, ...authorization });
      if (!authorization.allowed) return failure('PERMISSION_DENIED', 'The user did not approve this action.');
      signal.throwIfAborted();
      if (typeof app.lastKnownState === 'object' && app.lastKnownState && 'ready' in app.lastKnownState && app.lastKnownState.ready === false) return failure('APPLICATION_NOT_READY', 'The application is still loading.', true);
      signal.addEventListener('abort', cancel, { once: true });
      this.log('tool.requested', { sessionId: app.sessionId, tool: name, invocationId });
      const result = await app.request<CrosstalkToolResult>(invocationId, 'tool', {
        type: 'tool.invoke', invocationId, sessionId: app.sessionId, delegationId, tool: name, arguments: args,
        explicitUserRequest: explicit, confirmed: authorization.confirmed, expiresAt: Date.now() + toolTimeout(tool),
      }, toolTimeout(tool), signal);
      signal.throwIfAborted();
      if (result.ok && tool.outputSchema) validate(tool.outputSchema, result.data);
      if (result.ok) {
        try { await app.requestState(signal); }
        catch { signal.throwIfAborted(); return failure('STATE_UNAVAILABLE_AFTER_ACTION', 'The action completed, but the updated state is unavailable. Do not repeat the action.'); }
      }
      this.log('tool.executed', { sessionId: app.sessionId, tool: name, durationMs: Date.now() - startedAt, success: result.ok });
      return result;
    } catch (error) { cancel(); return errorResult(error); }
    finally { signal.removeEventListener('abort', cancel); }
  }
}
