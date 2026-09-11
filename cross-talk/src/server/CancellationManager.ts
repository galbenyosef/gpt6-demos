export class CancellationManager {
  private active?: { id: string; controller: AbortController };
  start(id: string) { this.cancel(); const controller = new AbortController(); this.active = { id, controller }; return controller; }
  cancel() { const old = this.active; this.active = undefined; old?.controller.abort(); return old?.id; }
  isCurrent(id: string) { return this.active?.id === id && !this.active.controller.signal.aborted; }
  complete(id: string) { if (this.active?.id === id) this.active = undefined; }
}
