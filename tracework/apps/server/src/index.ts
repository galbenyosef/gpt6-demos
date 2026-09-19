import { createApp } from "./app";
const port = Number(process.env.PORT || 4310);
const app = createApp(process.env.TRACEWORK_DATA_DIR || ".tracework-data", {
  port,
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: app.fetch,
  maxRequestBodySize: 26 * 1024 * 1024,
  idleTimeout: 60,
});
app.jobs.start();
console.log(`Tracework · Bun ${Bun.version} · http://localhost:${server.port}`);
async function stop() {
  server.stop(true);
  await app.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
