// Serve only the portal and its images, never the repository's source files.
import { resolve } from "node:path";

const root = import.meta.dir;
const assets = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ...[
    "edificio-europa.png",
    "infinicave.png",
    "tonada.png",
    "tarot-spread.png",
    "orbital-mechanics.png",
    "digital-logic laboratory.png",
    "flip-slop.png",
    "codexcanvas.png",
  ].map((name) => [`/images/${name}`, `images/${name}`]),
]);

export async function servePortal(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const asset = assets.get(pathname);
  if (!asset) return new Response("Not found", { status: 404 });
  const file = Bun.file(resolve(root, asset));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : file, {
    headers: { "Content-Type": file.type, "Cache-Control": "no-cache" },
  });
}

if (import.meta.main) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: Number(process.env.PORT || 3000),
    fetch: servePortal,
  });
  console.log(`GPT6 Demos portal: http://localhost:${server.port}/`);
}
