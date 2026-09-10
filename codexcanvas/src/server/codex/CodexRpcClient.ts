export type RpcId = number | string;
export interface RpcRequest { id: RpcId; method: string; params?: any }
export interface Rpc {
  request<T = any>(method: string, params?: unknown): Promise<T>;
  respond(id: RpcId, result: unknown): void;
  reject(id: RpcId, message: string): void;
}
export class CodexRpcClient implements Rpc {
  private nextId = 1;
  private pending = new Map<RpcId, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private buffer = '';
  private closed = false;
  onNotification: (method: string, params: any) => void = () => {};
  onRequest: (request: RpcRequest) => void = () => {};
  onMalformed: (error: string) => void = () => {};
  constructor(private write: (line: string) => void, private timeoutMs = 30_000) {}
  request<T = any>(method: string, params?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex process is disconnected'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex RPC timed out: ${method}. Check session state before retrying.`)); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  notify(method: string, params?: unknown) { this.send({ method, params }); }
  respond(id: RpcId, result: unknown) { this.send({ id, result }); }
  reject(id: RpcId, message: string) { this.send({ id, error: { code: -32601, message } }); }
  private send(message: unknown) { if (this.closed) throw new Error('Codex process is disconnected'); this.write(JSON.stringify(message) + '\n'); }
  feed(chunk: string) {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      let msg: any;
      try { msg = JSON.parse(line); if (!msg || typeof msg !== 'object') throw new Error(); }
      catch { this.onMalformed('Malformed JSONL from Codex'); continue; }
      if (typeof msg.method === 'string') {
        if ('id' in msg) this.onRequest(msg); else queueMicrotask(() => this.onNotification(msg.method, msg.params ?? {}));
      } else if ('id' in msg) {
        const pending = this.pending.get(msg.id);
        if (!pending) continue;
        this.pending.delete(msg.id); clearTimeout(pending.timer);
        if (msg.error) pending.reject(new Error(msg.error.message ?? 'Codex RPC error'));
        else pending.resolve(msg.result);
      } else this.onMalformed('Unrecognized Codex JSONL message');
    }
    if (this.buffer.length > 32 * 1024 * 1024) this.close(new Error('Codex JSONL frame exceeded 32 MB'));
  }
  close(error = new Error('Codex App Server process exited')) {
    this.closed = true; this.buffer = '';
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
  }
}
