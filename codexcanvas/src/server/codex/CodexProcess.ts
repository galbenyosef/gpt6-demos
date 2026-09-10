import { CodexRpcClient, type RpcRequest } from './CodexRpcClient';
export class CodexProcess {
  rpc?: CodexRpcClient;
  private process?: ReturnType<typeof Bun.spawn>;
  private starting?: Promise<void>;
  private generation = 0;
  onNotification: (method: string, params: any) => void = () => {};
  onRequest: (request: RpcRequest) => void = () => {};
  onState: (status: 'starting' | 'ready' | 'disconnected', detail?: string) => void = () => {};
  constructor(private command = [process.env.CODEX_BIN || 'codex', 'app-server'], private cwd = process.cwd()) {}
  start() { return this.starting ??= this.launch().finally(() => { this.starting = undefined; }); }
  private async launch() {
    if (this.process) return;
    const generation = ++this.generation;
    this.onState('starting');
    try {
      const child = Bun.spawn(this.command, { cwd: this.cwd, stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' });
      this.process = child;
      const rpc = this.rpc = new CodexRpcClient(line => { child.stdin.write(line); child.stdin.flush(); });
      rpc.onNotification = (m, p) => this.onNotification(m, p);
      rpc.onRequest = request => this.onRequest(request);
      rpc.onMalformed = message => console.warn(message);
      void (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of child.stdout) rpc.feed(decoder.decode(chunk, { stream: true }));
      })().catch(error => rpc.close(error));
      void child.exited.then(code => {
        rpc.close(new Error(`Codex App Server exited (code ${code})`));
        if (generation !== this.generation) return;
        this.process = undefined;
        this.onState('disconnected', `Codex App Server exited (code ${code}). Restart Codex to resume your session.`);
      });
      await rpc.request('initialize', { clientInfo: { name: 'codex_canvas', title: 'Codex Canvas', version: '0.1.0' } });
      rpc.notify('initialized');
      this.onState('ready');
    } catch (error) {
      this.stop(); this.onState('disconnected', `Cannot start Codex: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }
  stop() { this.generation++; this.rpc?.close(); this.process?.kill(); this.process = undefined; }
}
