import { startServer } from "./server";
const app = await startServer();
console.log(`One More Match · http://127.0.0.1:${app.server.port}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
