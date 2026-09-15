import { config } from "./src/backend/config";
import { createApplication } from "./src/backend/api";
import app from "./src/frontend/index.html";
const application = createApplication();
await application.store.recover();
const server = Bun.serve({ hostname: config.host, port: config.port, maxRequestBodySize: config.maxUpload + 1024 * 1024, idleTimeout: 120, routes: { "/": app, "/api/*": application.fetch }, development: process.env.NODE_ENV !== "production" });
console.info(`Assemblavatar: ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, async () => { await application.generation.renderer.close(); server.stop(true); process.exit(0); });
