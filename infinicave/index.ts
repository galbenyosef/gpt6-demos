import page from "./index.html";
const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  hostname: "0.0.0.0",
  routes: {
    "/": page,
    "/generation.worker.js": async () => {
      const worker = await Bun.build({
        entrypoints: ["./src/generation.worker.ts"],
        target: "browser",
        minify: false,
      });
      if (!worker.success)
        return new Response(worker.logs.join("\n"), { status: 500 });
      return new Response(worker.outputs[0], {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-store",
        },
      });
    },
  },
  development: { hmr: true, console: true },
});
console.log(`InfiniCave ready at http://localhost:${server.port}`);
