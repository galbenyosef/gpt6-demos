import type { CrosstalkToolDefinition } from '../protocol';
import { needsConfirmation } from '../protocol';
import type { RegisteredApplication } from './ApplicationRegistry';
export class PermissionEngine {
  async authorize(app: RegisteredApplication, tool: CrosstalkToolDefinition, args: unknown, explicit: boolean, invocationId: string, delegationId: string, signal: AbortSignal) {
    if (!needsConfirmation(tool, explicit)) return { allowed: true, confirmed: false };
    app.send({ type: 'session.status', status: 'waiting-for-confirmation' });
    try {
      const approved = await app.request<boolean>(invocationId, 'confirmation', { type: 'confirmation.request', requestId: invocationId, delegationId, tool: tool.name, title: tool.title, arguments: args }, 30_000, signal);
      return { allowed: approved, confirmed: approved };
    } finally {
      app.send({ type: 'confirmation.cancel', requestId: invocationId });
      if (!signal.aborted) app.send({ type: 'session.status', status: 'working' });
    }
  }
}
