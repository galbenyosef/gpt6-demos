import type { ClientMessage, ServerMessage } from '../shared/types';
import { parseClientMessage } from './validation';

/** Keep navigation ordered without putting decisions behind the work awaiting them. */
export class BrowserMessages {
  private queue = Promise.resolve();
  constructor(private handle: (message: ClientMessage) => Promise<void>, private send: (message: ServerMessage) => void) {}
  receive(raw: string): Promise<void> {
    let message: ClientMessage;
    try { message = parseClientMessage(raw); }
    catch (error) { this.report(error); return Promise.resolve(); }
    const run = async () => { try { await this.handle(message); } catch (error) { this.report(error, message); } };
    if (message.type === 'approval.respond' || message.type === 'turn.stop') return run();
    return this.queue = this.queue.then(run);
  }
  private report(error: unknown, message?: ClientMessage) {
    this.send({ type: 'error', category: message?.type.startsWith('canvas.') ? 'Canvas persistence' : message?.type.startsWith('workspace.') ? 'Workspace' : message?.type.startsWith('auth.') ? 'Authentication' : 'Codex request',
      message: error instanceof Error ? error.message : String(error),
      ...((message && 'clientId' in message) ? { clientId: message.clientId } : {}),
      ...((message && 'threadId' in message) ? { threadId: message.threadId } : {}) });
  }
}
