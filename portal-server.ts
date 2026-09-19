// Serve only the two portals and their assets, never the repository's source files.
import { resolve } from "node:path";

const root = import.meta.dir;
const assets = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/portal/", "portal/index.html"],
  ["/portal/index.html", "portal/index.html"],
  ["/portal/portal.css", "portal/portal.css"],
  ["/portal/portal.js", "portal/portal.js"],
  ...[
    "edificio-europa.png",
    "infinicave.png",
    "tonada.png",
    "tarot-spread.png",
    "orbital-mechanics.png",
    "digital-logic laboratory.png",
    "flip-slop.png",
    "codexcanvas.png",
    "assemblavatar.png",
    "one-more-match.png",
    "tracework.png",
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
  if (pathname === "/portal") {
    return new Response(null, { status: 308, headers: { Location: "/portal/" } });
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
  console.log(`GPT6 Demos portal server listening on port ${server.port}`);
}
