import { CrosstalkServer, type CrosstalkSocketData } from './src/server';
const crosstalk = new CrosstalkServer({ allowedOrigins: process.env.CROSSTALK_ALLOWED_ORIGINS?.split(',') });
const server = Bun.serve<CrosstalkSocketData>({ hostname: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 3001), maxRequestBodySize: 128 * 1024, websocket: crosstalk.websocket, fetch: crosstalk.handler });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void crosstalk.dispose().finally(() => { server.stop(true); process.exit(0); }); });
console.log(`Crosstalk: http://localhost:${server.port}/crosstalk`);
