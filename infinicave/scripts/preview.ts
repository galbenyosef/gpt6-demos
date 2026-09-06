if (!(await Bun.file("dist/index.html").exists()))
  throw new Error("Run bun run build first.");
const server = Bun.serve({
  port: Number(process.env.PORT || 3001),
  hostname: "0.0.0.0",
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname.split("/").includes(".."))
      return new Response("Invalid path", { status: 400 });
    const file = Bun.file(`dist${pathname === "/" ? "/index.html" : pathname}`);
    if (!(await file.exists()))
      return new Response("Not found", { status: 404 });
    return new Response(file);
  },
});
console.log(`Static build ready at http://localhost:${server.port}`);
