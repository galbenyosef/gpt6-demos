import page from "./index.html";
const server = Bun.serve({
  port: process.env.PORT || 3000,
  routes: {
    "/": page,
    "/worker.js": async () => {
      const worker = await Bun.build({
        entrypoints: ["src/simulator/worker.ts"],
        target: "browser",
      });
      if (!worker.success)
        return new Response(worker.logs.join("\n"), { status: 500 });
      return new Response(worker.outputs[0], {
        headers: {
          "Content-Type": "text/javascript",
          "Cache-Control": "no-store",
        },
      });
    },
  },
  development: { hmr: true, console: true },
});
console.log(`Digital Logic Laboratory: ${server.url}`);
