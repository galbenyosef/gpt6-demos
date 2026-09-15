import index from "../client/index.html";
import { startServer } from "./server";
const app = await startServer({ html: index, assetsDir: "public" });
console.log(`One More Match development · http://127.0.0.1:${app.server.port}`);
if (import.meta.hot) import.meta.hot.dispose(() => app.close());
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
