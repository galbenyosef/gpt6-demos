import type { ClientMessage, CrosstalkApplication, CrosstalkApplicationEvent } from '../protocol';
import { validateRegistration, validate } from '../protocol/validation';
export class ApplicationBridge {
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(readonly application: CrosstalkApplication, private send: (message: ClientMessage) => void) {}
  async registration() {
    const registration = { manifest: this.application.manifest, tools: this.application.tools.map(tool => tool.definition), state: await this.application.getState() };
    validateRegistration(registration); return registration;
  }
  async state() { const state = await this.application.getState(); validate(this.application.manifest.stateSchema, state); return state; }
  subscribe() {
    this.unsubscribe = this.application.subscribe?.((event: CrosstalkApplicationEvent) => {
      clearTimeout(this.timer);
      this.timer = setTimeout(async () => {
        try { const state = await this.state(); if (!this.disposed) this.send({ type: 'application.event', event, state }); } catch { /* Next state pull reports failure. */ }
      }, 80);
    });
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.unsubscribe?.(); }
}
