import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import index from '../web/index.html';
import { Store } from './persistence/Store';
import { CodexProcess } from './codex/CodexProcess';
import { Host, type Peer } from './Host';
import { trustedRequest } from './validation';
import { BrowserMessages } from './BrowserMessages';
const dataDir = process.env.CODEX_CANVAS_DATA_DIR || resolve(homedir(), '.codex-canvas');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const store = new Store(resolve(dataDir, 'canvas.db'));
const codex = new CodexProcess();
const host = new Host(store, () => { if (!codex.rpc) throw new Error('Codex has not started'); return codex.rpc; });
codex.onNotification = (m, p) => host.notification(m, p);
codex.onRequest = request => host.approvals.receive(request);
codex.onState = (status, detail) => { if (status !== 'ready') host.state(status, detail); };
host.restart = async () => { await codex.start(); await host.refresh(); host.state('ready'); };
const port = Number(process.env.PORT || 3030);
const browserToken = crypto.randomUUID();
interface SocketData { peer?: Peer; messages?: BrowserMessages }
// Bun 1.4 resolves prebuilt HTML manifest paths relative to cwd at serve() creation.
// Keep asset resolution rooted in the bundle. CodexProcess has captured the user's launch cwd.
if (typeof index === 'object' && 'files' in index) process.chdir(import.meta.dir);
const server = Bun.serve<SocketData>({
  hostname: '127.0.0.1', port,
  routes: { '/': index },
  development: process.env.NODE_ENV !== 'production' ? { hmr: true, console: true } : false,
  async fetch(request, server) {
    if (!trustedRequest(request, port)) return new Response('Forbidden origin', { status: 403 });
    const url = new URL(request.url);
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (url.pathname === '/api/bootstrap') return Response.json({ token: browserToken }, { headers });
    if (url.pathname === '/ws') {
      if (request.headers.get('origin') !== url.origin || url.searchParams.get('token') !== browserToken) return new Response('Forbidden', { status: 403 });
      if (server.upgrade(request, { data: {} })) return;
      return new Response('WebSocket upgrade required', { status: 426 });
    }
    if (url.pathname === '/api/image') {
      if (url.searchParams.get('token') !== browserToken) return new Response('Forbidden', { status: 403 });
      try { return new Response(await host.image(url.searchParams.get('thread') ?? '', url.searchParams.get('item') ?? ''), { headers }); }
      catch (error) { return new Response(String(error), { status: 404, headers }); }
    }
    return new Response('Not found', { status: 404 });
  },
  websocket: {
    maxPayloadLength: 256 * 1024,
    open(ws) {
      const peer: Peer = { send: message => { ws.send(JSON.stringify(message)); } };
      ws.data.peer = peer; host.peers.add(peer);
      ws.data.messages = new BrowserMessages(message => host.handle(peer, message), peer.send);
    },
    message(ws, raw) {
      void ws.data.messages!.receive(String(raw));
    },
    close(ws) { if (ws.data.peer) host.peers.delete(ws.data.peer); },
  },
});
console.log(`Codex Canvas → http://127.0.0.1:${server.port}`);
void host.restart().catch(error => host.state('disconnected', String(error)));
function shutdown() { codex.stop(); server.stop(true); store.close(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
