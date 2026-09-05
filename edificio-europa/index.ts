import page from './index.html';
const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  routes: { '/': page },
  async fetch(req) {
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path.startsWith('/stock-images/') && !path.includes('..')) {
      const file = Bun.file(`.${path}`);
      if (await file.exists()) return new Response(file);
    }
    return new Response('Not found', { status: 404 });
  },
  development: { hmr: true, console: true },
});
console.log(`Local: http://localhost:${server.port}`);
