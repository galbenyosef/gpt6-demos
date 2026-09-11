import type { Registration, ServerMessage, CrosstalkToolResult } from '../protocol';
import { CrosstalkError } from '../protocol';
import { validate, validateRegistration, validateResult } from '../protocol/validation';
export type Send = (message: ServerMessage) => void;
interface Pending { kind: 'state' | 'tool' | 'confirmation'; resolve(value: any): void; reject(error: Error): void }
export class RegisteredApplication {
  readonly pending = new Map<string, Pending>();
  readonly tools;
  lastKnownState: unknown;
  connectedAt = Date.now();
  lastSeenAt = Date.now();
  closed = false;
  constructor(readonly instanceId: string, readonly sessionId: string, readonly registration: Registration, readonly send: Send) {
    this.tools = new Map(registration.tools.map(t => [t.name, t])); this.lastKnownState = registration.state;
  }
  request<T>(id: string, kind: Pending['kind'], message: ServerMessage, timeout: number, signal?: AbortSignal): Promise<T> {
    if (this.closed) return Promise.reject(new CrosstalkError('APPLICATION_DISCONNECTED', 'The application disconnected.', true));
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.pending.delete(id); };
      const fail = (error: Error) => { clean(); reject(error); };
      const abort = () => fail(new DOMException('Cancelled', 'AbortError'));
      const timer = setTimeout(() => fail(new CrosstalkError(kind === 'tool' ? 'TOOL_TIMEOUT' : 'REQUEST_TIMEOUT', 'The application did not respond in time.', true)), timeout);
      this.pending.set(id, { kind, resolve: value => { clean(); resolve(value); }, reject: fail });
      signal?.addEventListener('abort', abort, { once: true });
      try { this.send(message); } catch { fail(new CrosstalkError('APPLICATION_DISCONNECTED', 'The application disconnected.', true)); }
    });
  }
  setState(state: unknown) { validate(this.registration.manifest.stateSchema, state); this.lastKnownState = state; }
  async requestState(signal?: AbortSignal) {
    const requestId = crypto.randomUUID();
    const state = await this.request<unknown>(requestId, 'state', { type: 'state.request', requestId }, 2000, signal);
    this.setState(state); return state;
  }
  receive(id: string, kind: Pending['kind'], value: unknown) {
    const pending = this.pending.get(id);
    if (!pending || pending.kind !== kind) return; // Late/duplicate replies cannot advance a different request.
    if (kind === 'state') this.setState(value);
    if (kind === 'tool') validateResult(value);
    if (kind === 'confirmation' && typeof value !== 'boolean') throw new CrosstalkError('INVALID_MESSAGE', 'Invalid confirmation.');
    this.lastSeenAt = Date.now(); pending.resolve(value);
  }
  disconnect() { this.closed = true; for (const p of [...this.pending.values()]) p.reject(new CrosstalkError('APPLICATION_DISCONNECTED', 'The application disconnected.', true)); }
}
export class ApplicationRegistry {
  private applications = new Map<string, RegisteredApplication>();
  register(instanceId: string, sessionId: string, registration: Registration, send: Send) {
    validateRegistration(registration);
    if (this.applications.has(instanceId)) throw new CrosstalkError('INSTANCE_IN_USE', 'This application instance is already connected.');
    const app = new RegisteredApplication(instanceId, sessionId, registration, send); this.applications.set(instanceId, app); return app;
  }
  get(id: string) { const app = this.applications.get(id); if (!app) throw new CrosstalkError('APPLICATION_DISCONNECTED', 'The application is not registered.', true); return app; }
  unregister(id: string) { this.applications.get(id)?.disconnect(); this.applications.delete(id); }
}
