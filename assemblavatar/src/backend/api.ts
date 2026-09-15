import { z } from "zod";
import { config } from "./config";
import { Store, NotFound, id, now } from "./persistence/store";
import { WorkspaceService } from "./services/WorkspaceService";
import { GenerationService } from "./services/GenerationService";
import { examples } from "../shared/examples";
const vec3 = z.tuple([z.number().finite().min(-1000).max(1000), z.number().finite().min(-1000).max(1000), z.number().finite().min(-1000).max(1000)]);
const override = z.object({ objectId: z.string().max(1000), createGroup: z.object({ name: z.string().min(1).max(100) }).optional(), position: vec3.optional(), rotation: vec3.optional(), scale: vec3.optional(), visible: z.boolean().optional(), deleted: z.boolean().optional(), parentId: z.string().max(1000).optional(), material: z.object({ baseColor: z.string().regex(/^#[0-9a-f]{6}$/i), roughness: z.number().min(0).max(1), metalness: z.number().min(0).max(1) }).optional() });
const createSchema = z.object({ name: z.string().trim().min(1).max(120), kind: z.enum(["avatar", "object", "scene", "other"]).default("object"), description: z.string().max(2000).default("") });
const generationSchema = z.object({ prompt: z.string().min(1).max(12000).default("Build source program"), instruction: z.string().max(12000).optional(), automaticRefinement: z.boolean().default(false), maxIterations: z.number().int().min(1).max(config.maxIterations).default(1), profile: z.enum(["generic-object", "architectural-object", "avatar-head-stylised", "avatar-head-realistic"]).default("generic-object"), code: z.string().max(config.maxSource).optional(), overrides: z.array(override).max(1000).optional(), parameters: z.record(z.string(), z.unknown()).optional(), incorporateOverrides: z.boolean().optional(), selectedObjectId: z.string().max(1000).optional(), parentRevisionId: z.string().optional(), resumeAttemptId: z.string().optional() });
export function createApplication(root = config.dataDir) {
  const store = new Store(root), workspaces = new WorkspaceService(store), generation = new GenerationService(workspaces);
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  async function body(req: Request) { const text = await req.text(); if (text.length > config.maxSource * 2) throw Error("Request body exceeds size limit"); return JSON.parse(text); }
  async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url), parts = url.pathname.split("/").filter(Boolean), method = req.method;
    // Local application API: prevent cross-origin writes and DNS rebinding.
    if (!["localhost", "127.0.0.1", "[::1]", config.host].includes(url.hostname)) return json({ error: { code: "FORBIDDEN", message: "Host not allowed" } }, 403);
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin || req.headers.get("sec-fetch-site") === "cross-site") return json({ error: { code: "FORBIDDEN", message: "Cross-origin requests are not allowed" } }, 403);
    try {
      if (parts[1] === "config" && method === "GET") return json({ model: config.model, apiKeyConfigured: Boolean(config.apiKey), maxIterations: config.maxIterations, maxUpload: config.maxUpload, runtimeVersion: "1.0.0" });
      if (parts[1] === "examples") {
        if (method === "GET") return json(Object.entries(examples).map(([key, value]) => ({ key, name: value.name, kind: value.kind })));
        if (method === "POST") { const { key } = z.object({ key: z.enum(["house", "robot", "head"]) }).parse(await body(req)), e = examples[key]; const a = await workspaces.create(e.name, e.kind, "Hand-written runtime example"); const job = await generation.start(a.id, { code: e.code, prompt: "Load hand-written runtime example", automaticRefinement: false, maxIterations: 1, profile: "generic-object" }); return json({ assemblageId: a.id, jobId: job.id }, 202); }
      }
      if (parts[1] === "assemblages") {
        const asmId = parts[2], action = parts[3];
        if (!asmId) { if (method === "GET") return json((await store.assemblages.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); if (method === "POST") { const input = createSchema.parse(await body(req)); return json(await workspaces.create(input.name, input.kind, input.description), 201); } }
        if (asmId) {
          if (!action) {
            if (method === "GET") return json(await workspaces.detail(asmId));
            if (method === "PUT") return await workspaces.mutate(asmId, async () => { const update = createSchema.partial().parse(await body(req)), a = await store.assemblages.require(asmId); Object.assign(a, update, { updatedAt: now() }); await store.assemblages.put(a); return json(a); });
            if (method === "DELETE") { await workspaces.delete(asmId); return json({ deleted: true }); }
          }
          if (["generate", "refine", "chat", "build"].includes(action ?? "") && method === "POST") { const data = generationSchema.parse(await body(req)); if (action === "build" && data.code === undefined) throw Error("Build requires source code"); if (action !== "build" && data.code !== undefined) throw Error("Use the build endpoint for manual source"); const job = await generation.start(asmId, { ...data, prompt: data.instruction ?? data.prompt }); return json({ jobId: job.id, status: job.status }, 202); }
          if (action === "revisions") { await store.assemblages.require(asmId); if (method === "GET") return json((await store.revisions.list()).filter(r => r.assemblageId === asmId).sort((a, b) => b.revisionNumber - a.revisionNumber)); if (method === "POST") { const { revisionId } = z.object({ revisionId: z.string() }).parse(await body(req)); return json(await workspaces.checkout(asmId, revisionId)); } }
          if (action === "duplicate" && method === "POST") {
            const { copy, original, assetMap } = await workspaces.duplicate(asmId);
            if (original.source) { let code = original.source.code; for (const [from, to] of assetMap) code = code.split(from).join(to); const job = await generation.start(copy.id, { code, prompt: `Duplicate of ${original.name}`, overrides: original.revision?.overrides, parameters: original.revision?.parameters, automaticRefinement: false, maxIterations: 1, profile: "generic-object" }); return json({ assemblageId: copy.id, jobId: job.id }, 202); }
            return json({ assemblageId: copy.id }, 201);
          }
          if (action === "references") {
            const a = await store.assemblages.require(asmId);
            if (method === "GET") return json(a.references);
            if (method === "POST") {
              return await workspaces.mutate(asmId, async () => { const a = await store.assemblages.require(asmId); if (a.references.length >= 24) throw Error("At most 24 references are allowed");
              const data = await req.formData(), file = data.get("file"); if (!(file instanceof File) || !file.size || file.size > config.maxUpload) throw Error("Invalid file or upload exceeds size limit");
              const bytes = new Uint8Array(await file.arrayBuffer()); const mime = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? "image/png" : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" ? "image/webp" : "";
              if (!mime) throw Error("Upload a PNG, JPEG or WebP image"); await generation.renderer.inspectImage(bytes, mime);
              const category = data.get("type") === "texture" ? "texture" : "reference";
              const meta = await store.assets.put(bytes, { assemblageId: asmId, mimeType: mime, category, originalFilename: file.name.slice(0, 200) });
              a.references.push({ id: id("ref"), assemblageId: asmId, assetId: meta.id, type: category === "texture" ? "texture" : "photo", role: String(data.get("role") || "reference").slice(0, 40), description: String(data.get("description") || "").slice(0, 500), createdAt: now() }); a.updatedAt = now(); await store.assemblages.put(a); return json(a.references, 201); });
            }
            if (method === "DELETE" && parts[4]) return await workspaces.mutate(asmId, async () => { const a = await store.assemblages.require(asmId); a.references = a.references.filter(r => r.id !== parts[4]); await store.assemblages.put(a); return json(a.references); });
            if (method === "PUT" && parts[4]) return await workspaces.mutate(asmId, async () => { const a = await store.assemblages.require(asmId), ref = a.references.find(r => r.id === parts[4]); if (!ref) throw new NotFound(); const update = z.object({ role: z.string().max(40), description: z.string().max(500).optional() }).parse(await body(req)); Object.assign(ref, update); await store.assemblages.put(a); return json(a.references); });
          }
          if (action === "import" && method === "POST") {
            workspaces.assertIdle(asmId); workspaces.busy.add(asmId);
            try { const a = await store.assemblages.require(asmId); const data = await req.formData(), file = data.get("file"); if (!(file instanceof File) || file.size > config.maxUpload) throw Error("Invalid GLB upload"); const build = await generation.renderer.importGlb(new Uint8Array(await file.arrayBuffer())); const render = await generation.renderer.render(build);
              // Imported artifacts carry an explicit nonprocedural provenance; generation can replace them.
              const revision = await workspaces.commit(a, { code: "// Imported GLB artifact. Generate a procedural model to create editable source.\n", build, render, prompt: `Imported ${file.name.slice(0, 200)}`, summary: "Imported GLB model", model: "imported", overrides: [], parameters: {} }); return json(revision, 201);
            } finally { workspaces.busy.delete(asmId); }
          }
        }
      }
      if (parts[1] === "jobs" && parts[2]) {
        const job = await store.jobs.require(parts[2]);
        if (parts[3] === "cancel" && method === "POST") return json(await generation.cancel(job.id));
        if (parts[3] === "attempts" && method === "GET") return json((await store.attempts.list()).filter(a => a.jobId === job.id));
        if (parts[3] === "events" && method === "GET") {
          const encoder = new TextEncoder(); let cleanup = () => {};
          const stream = new ReadableStream({ start(controller) { const send = (value: unknown) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); } catch { cleanup(); } }; const listener = (event: Event) => send((event as CustomEvent).detail); const heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { cleanup(); } }, 15000); cleanup = () => { clearInterval(heartbeat); generation.events.removeEventListener(job.id, listener); }; generation.events.addEventListener(job.id, listener); send(job); req.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {} }, { once: true }); }, cancel() { cleanup(); } });
          return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
        }
        if (method === "GET") return json(job);
      }
      if (parts[1] === "models") {
        if (!parts[2] && method === "GET") return json(await store.models.list());
        if (parts[2] && method === "GET") { const model = await store.models.require(parts[2]); if (parts[3] === "content") { const format = url.searchParams.get("format") || "scene"; if (format === "scene") { const a = await store.assemblages.require(model.assemblageId), revision = (await store.revisions.list()).find(r => r.modelArtifactId === model.id); const attempt = (await store.attempts.list()).find(t => t.modelArtifactId === model.id); return json({ scene: JSON.parse(new TextDecoder().decode(await store.assets.get(model.assetId))), overrides: revision?.overrides ?? attempt?.overrides ?? [], textureUrls: await workspaces.textureUrls(a) }); } const assetId = format === "glb" ? model.glbAssetId : format === "gltf" ? model.gltfAssetId : format === "png" ? model.thumbnailAssetId : ""; if (!assetId) throw Error("Unsupported export format"); const metadata = await store.assets.getMetadata(assetId); return new Response(await store.assets.get(assetId), { headers: { "Content-Type": metadata.mimeType, "Content-Disposition": `attachment; filename="assemblavatar.${format}"`, "X-Content-Type-Options": "nosniff" } }); } return json(model); }
      }
      if (parts[1] === "assets" && parts[2] && method === "GET") { const meta = await store.assets.getMetadata(parts[2]); return new Response(await store.assets.get(meta.id), { headers: { "Content-Type": meta.mimeType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=31536000, immutable" } }); }
      return json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
    } catch (error) {
      const status = error instanceof NotFound ? 404 : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : error instanceof Error && /active operation|capacity reached/.test(error.message) ? 409 : 400;
      return json({ error: { code: status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "INVALID_REQUEST", message: error instanceof z.ZodError ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") : error instanceof Error ? error.message : "Request failed" } }, status);
    }
  }
  return { fetch, store, workspaces, generation };
}
