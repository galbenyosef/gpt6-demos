import page from "./index.html";
const worker = await Bun.build({
  entrypoints: ["./src/simulation/worker.ts"],
  target: "browser",
  minify: false,
});
if (!worker.success) throw new Error(worker.logs.join("\n"));
const server = Bun.serve({
  port: process.env.PORT || 3000,
  routes: {
    "/": page,
    "/earth.jpg": () => new Response(Bun.file("./public/earth.jpg")),
    "/worker.js": () =>
      new Response(worker.outputs[0], {
        headers: { "Content-Type": "text/javascript" },
      }),
  },
  development: { hmr: true, console: true },
});
console.log(`Orbital laboratory: ${server.url}`);
