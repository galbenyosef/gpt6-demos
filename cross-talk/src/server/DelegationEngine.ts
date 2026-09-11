import type { ResponseInputItem } from 'openai/resources/responses/responses';
import type { ReasoningAgent } from '../openai/AstraAgent';
import type { RegisteredApplication } from './ApplicationRegistry';
import { normalizeArguments } from '../protocol/validation';
import { CancellationManager } from './CancellationManager';
import { ToolRouter, type Logger } from './ToolRouter';
export interface Transcript { role: 'user' | 'assistant'; text: string; startMs: number; endMs: number }
export class DelegationEngine {
  readonly cancellation = new CancellationManager();
  private seen = new Set<string>();
  constructor(private app: RegisteredApplication, private agent: ReasoningAgent, private router: ToolRouter, private commentary: (id: string, text: string) => void, private log: Logger = () => {}, private maxCalls = 12, private timeoutMs = 120_000) {}
  cancel() {
    const id = this.cancellation.cancel();
    if (id) { this.app.send({ type: 'delegation.cancel', delegationId: id }); this.log('delegation.cancelled', { sessionId: this.app.sessionId, delegationId: id }); }
  }
  async handle(id: string, transcript: Transcript[]) {
    if (this.seen.has(id)) return;
    this.seen.add(id); if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value!);
    this.cancel();
    const controller = this.cancellation.start(id), signal = controller.signal;
    let timedOut = false;
    const timer = setTimeout(() => { if (!this.cancellation.isCurrent(id)) return; timedOut = true; controller.abort(); this.app.send({ type: 'delegation.cancel', delegationId: id }); this.commentary(id, 'This request took too long. Please try a smaller request.'); this.app.send({ type: 'session.status', status: 'listening' }); }, this.timeoutMs);
    const current = () => this.cancellation.isCurrent(id);
    this.log('delegation.started', { sessionId: this.app.sessionId, delegationId: id });
    this.app.send({ type: 'session.status', status: 'working' });
    try {
      let state = await this.app.requestState(signal);
      const input: ResponseInputItem[] = [{ role: 'user', content: JSON.stringify({ conversation: transcript, currentState: state }) }];
      let calls = 0;
      while (current()) {
        const started = Date.now();
        const response = await this.agent.respond(this.app.registration, input, signal);
        signal.throwIfAborted();
        this.log('astra.completed', { sessionId: this.app.sessionId, durationMs: Date.now() - started, textLength: response.text.length, toolCalls: response.calls.length });
        input.push(...response.output);
        if (response.text) this.commentary(id, response.text);
        if (!response.calls.length) break;
        for (const call of response.calls) {
          signal.throwIfAborted();
          if (++calls > this.maxCalls) { this.commentary(id, 'The action limit for this request was reached. Please ask to continue.'); return; }
          const tool = this.app.tools.get(call.name);
          const args = tool ? normalizeArguments(tool, call.arguments) : call.arguments;
          const result = await this.router.invoke(this.app, id, call.name, args, call.explicitUserRequest, signal);
          signal.throwIfAborted();
          state = this.app.lastKnownState;
          input.push({ type: 'function_call_output', call_id: call.id, output: JSON.stringify({ result, currentState: state }) });
        }
      }
      this.log('delegation.completed', { sessionId: this.app.sessionId, delegationId: id, calls });
    } catch (error) {
      if (current()) { this.commentary(id, 'The application request could not be completed. Please try again.'); this.log('delegation.failed', { sessionId: this.app.sessionId, delegationId: id, ...(process.env.CROSSTALK_DEBUG === 'true' && error instanceof Error ? { detail: error.message } : {}) }); }
    } finally {
      clearTimeout(timer);
      // A superseded task must never reset the status of the new task.
      if (current()) { this.cancellation.complete(id); this.app.send({ type: 'session.status', status: 'listening' }); }
      else if (timedOut) this.cancellation.complete(id);
    }
  }
}
