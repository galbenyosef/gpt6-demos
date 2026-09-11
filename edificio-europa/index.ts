import page from './index.html';
import { CrosstalkServer, type CrosstalkSocketData } from '@crosstalk/server';
const crosstalk = new CrosstalkServer();
const server = Bun.serve<CrosstalkSocketData>({
  hostname: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  routes: { '/': page },
  websocket: crosstalk.websocket,
  maxRequestBodySize: 128 * 1024,
  async fetch(req, server) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path.startsWith('/crosstalk/')) return crosstalk.handler(req, server);
    if (path.startsWith('/stock-images/') && !path.includes('..')) {
      const file = Bun.file(new URL(`.${path}`, import.meta.url));
      if (await file.exists()) return new Response(file);
    }
    return new Response('Not found', { status: 404 });
  },
  development: process.env.NODE_ENV !== 'production' && { hmr: true, console: true },
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void crosstalk.dispose().finally(() => { server.stop(true); process.exit(0); }); });
console.log(`Local: http://localhost:${server.port}`);
