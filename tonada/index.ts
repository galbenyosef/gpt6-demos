import html from './index.html';
import harness from './tests/harness.html';
import { catalog } from './scripts/catalog';
const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  routes: {
    '/': html,
    '/test-harness':
      process.env.NODE_ENV === 'production' ? new Response('Not found', { status: 404 }) : harness,
    '/packs/catalog.json': async () => Response.json(await catalog()),
  },
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes('..') || !decoded.startsWith('/packs/'))
      return new Response('Not found', { status: 404 });
    const file = Bun.file(`public${decoded}`);
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
  development: process.env.TONADA_TEST === '1' ? false : { hmr: true, console: true },
});
console.log(`Tonada: http://localhost:${server.port}`);
