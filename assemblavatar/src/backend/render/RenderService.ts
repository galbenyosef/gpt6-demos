import { z } from "zod";
import type { BuildDiagnostics, BuildResult, Override } from "../../shared/domain";
import { config } from "../config";
export interface RenderOutput { previews: { view: string; data: string }[]; glb: string; gltf: string; diagnostics: BuildDiagnostics }
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const diagnostics = z.object({ durationMs: z.number().finite(), objectCount: z.number().int().nonnegative(), meshCount: z.number().int().nonnegative(), vertexCount: z.number().int().nonnegative(), triangleCount: z.number().int().nonnegative(), materialCount: z.number().int().nonnegative(), textureCount: z.number().int().nonnegative(), boundingBox: z.object({ min: vector, max: vector }), warnings: z.array(z.string()) });
const base64 = z.string().min(1).regex(/^[A-Za-z0-9+/]*={0,2}$/);
const results = {
  render: z.object({ previews: z.array(z.object({ view: z.string(), data: base64 })).length(7), glb: base64, gltf: z.string().min(1), diagnostics }),
  inspectImage: z.object({ width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) }),
  importGlb: z.object({ scene: z.record(z.string(), z.unknown()), diagnostics, metadata: z.record(z.string(), z.unknown()) }),
};
type Operation = keyof typeof results;
type Task = { id: string; operation: Operation; input: unknown; token?: string; leaseUntil: number; finish: (value?: unknown, error?: Error) => void };
export const MAX_RENDER_BODY = 128 * 1024 * 1024;
export class RenderService {
  private tasks = new Map<string, Task>();
  private script?: Promise<string>;
  private closed = false;
  constructor(private readonly timeoutMs = 120000, private readonly leaseMs = 15000) {}
  private request<T>(operation: Operation, input: unknown, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (this.closed) return Promise.reject(Error("Renderer closed"));
    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      const finish = (value?: unknown, error?: Error) => {
        clearTimeout(timer); signal?.removeEventListener("abort", abort); this.tasks.delete(id);
        if (error) reject(error); else resolve(value as T);
      };
      const abort = () => finish(undefined, new DOMException("Rendering cancelled", "AbortError"));
      const timer = setTimeout(() => finish(undefined, Error("Browser rendering timed out. Keep Assemblavatar open in a browser tab and retry.")), this.timeoutMs);
      this.tasks.set(id, { id, operation, input, leaseUntil: 0, finish });
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  // Called only after the application's Host/Origin checks. Claim tokens prevent
  // stale tabs from completing work reassigned after a refresh or disconnection.
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.split("/");
    const respond = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
    if (path[3] === "worker" && req.method === "GET") {
      this.script ??= (async () => {
        const build = await Bun.build({ entrypoints: [new URL("./render-page.ts", import.meta.url).pathname], target: "browser", minify: true });
        if (!build.success) throw Error(build.logs.join("\n"));
        return build.outputs[0]!.text();
      })().catch(error => { this.script = undefined; throw error; });
      return new Response(`<!doctype html><title>Assemblavatar renderer</title><script>${(await this.script).replace(/<\/script/gi, "<\\/script")}</script>`, { headers: {
        "Content-Type": "text/html", "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; img-src data: blob:; connect-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'",
      } });
    }
    if (path[3] === "tasks" && req.method === "GET") {
      const task = [...this.tasks.values()].find(task => task.leaseUntil <= Date.now());
      if (!task) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      task.token = crypto.randomUUID(); task.leaseUntil = Date.now() + this.leaseMs;
      return respond({ id: task.id, token: task.token, operation: task.operation, input: task.input });
    }
    if (path[3] === "tasks" && path[4] && req.method === "POST") {
      const task = this.tasks.get(path[4]);
      if (!task || req.headers.get("x-render-token") !== task.token || !task.token) return respond({ error: "Expired render task" }, 409);
      if (path[5] === "heartbeat") { task.leaseUntil = Date.now() + this.leaseMs; return respond({ ok: true }); }
      const text = await req.text();
      if (text.length > MAX_RENDER_BODY) return respond({ error: "Render result exceeds size limit" }, 413);
      const value = z.object({ result: z.unknown().optional(), error: z.string().max(2000).optional() }).parse(JSON.parse(text));
      // Cancellation or reassignment can happen while the request body arrives.
      if (this.tasks.get(task.id) !== task || req.headers.get("x-render-token") !== task.token) return respond({ error: "Expired render task" }, 409);
      if (value.error) task.finish(undefined, Error(value.error));
      else {
        const parsed = results[task.operation].safeParse(value.result);
        if (!parsed.success) { task.finish(undefined, Error("Invalid browser render result")); return respond({ error: "Invalid render result" }, 400); }
        task.finish(parsed.data);
      }
      return respond({ ok: true });
    }
    return respond({ error: "Not found" }, 404);
  }
  render(build: BuildResult, overrides: Override[] = [], textureUrls: Record<string, string> = {}, signal?: AbortSignal): Promise<RenderOutput> { return this.request<RenderOutput>("render", { scene: build.scene, overrides, textureUrls, limits: config.limits }, signal); }
  inspectImage(bytes: Uint8Array, mime: string) { return this.request<{ width: number; height: number }>("inspectImage", `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`); }
  importGlb(bytes: Uint8Array): Promise<BuildResult> {
    // Reject external resource URIs before the loader can touch them.
    if (bytes.length < 20) throw Error("Invalid GLB"); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) throw Error("Only valid GLB 2.0 files are supported");
    const length = view.getUint32(12, true); if (length > bytes.length - 20) throw Error("Invalid GLB JSON chunk");
    const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + length)));
    for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) if (resource.uri) throw Error("Imported GLB must embed all resources in its binary buffer");
    if ((json.extensionsRequired ?? []).length) throw Error("GLB extensions are not supported for import");
    return this.request<BuildResult>("importGlb", Buffer.from(bytes).toString("base64"));
  }
  async close() { this.closed = true; for (const task of this.tasks.values()) task.finish(undefined, Error("Renderer closed")); }
}
