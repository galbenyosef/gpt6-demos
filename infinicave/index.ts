import page from './index.html';
const worker = await Bun.build({ entrypoints: ['./src/generation.worker.ts'], target: 'browser', minify: false });
if (!worker.success) throw new Error(worker.logs.join('\n'));
const server = Bun.serve({ port: Number(process.env.PORT || 3000), hostname: '0.0.0.0', routes: { '/': page, '/generation.worker.js': () => new Response(worker.outputs[0], { headers: { 'Content-Type': 'application/javascript' } }) }, development: { hmr: true, console: true } });
console.log(`InfiniCave ready at http://localhost:${server.port}`);
