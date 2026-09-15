import type { Assemblage, BuildResult, Kind, ModelArtifact, Override, Revision } from "../../shared/domain";
import { RUNTIME_VERSION } from "../../shared/domain";
import { Store, id, now } from "../persistence/store";
import type { RenderOutput } from "../render/RenderService";
export class WorkspaceService {
  readonly busy = new Set<string>();
  constructor(readonly store: Store) {}
  assertIdle(id: string) { if (this.busy.has(id)) throw Error("This assemblage already has an active operation"); }
  async mutate<T>(asmId: string, action: () => Promise<T>): Promise<T> { this.assertIdle(asmId); this.busy.add(asmId); try { return await action(); } finally { this.busy.delete(asmId); } }
  async create(name: string, kind: Kind, description = "") { const a: Assemblage = { id: id("asm"), name, kind, description, status: "draft", references: [], currentRevision: 0, createdAt: now(), updatedAt: now() }; await this.store.assemblages.put(a); return a; }
  async detail(asmId: string) { const a = await this.store.assemblages.require(asmId); const revision = a.currentRevisionId ? await this.store.revisions.require(a.currentRevisionId) : undefined; return { ...a, revision, source: a.sourceProgramId ? await this.store.programs.require(a.sourceProgramId) : null, model: a.currentModelId ? await this.store.models.require(a.currentModelId) : null, messages: (await this.store.messages.list()).filter(m => m.assemblageId === asmId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }; }
  async textureUrls(a: Assemblage) { const urls: Record<string, string> = {}; for (const meta of (await this.store.assets.metadata.list()).filter(m => m.assemblageId === a.id && m.category === "texture")) { urls[meta.id] = `data:${meta.mimeType};base64,${Buffer.from(await this.store.assets.get(meta.id)).toString("base64")}`; } return urls; }
  async commit(a: Assemblage, input: { code: string; build: BuildResult; render: RenderOutput; prompt: string; summary: string; model: string; overrides: Override[]; parameters: Record<string, unknown>; parent?: string; evaluation?: Revision["evaluation"] }) {
    const versions = (await this.store.revisions.list()).filter(r => r.assemblageId === a.id); const version = Math.max(0, ...versions.map(r => r.revisionNumber)) + 1;
    const program = { id: id("src"), assemblageId: a.id, language: "typescript" as const, target: "threejs-build-module" as const, entryPoint: "buildModel" as const, code: input.code, version, createdAt: now() };
    await this.store.programs.put(program);
    const asset = async (bytes: Uint8Array, mimeType: string, category: "model" | "preview") => (await this.store.assets.put(bytes, { assemblageId: a.id, mimeType, category })).id;
    const sceneId = await asset(new TextEncoder().encode(JSON.stringify(input.build.scene)), "application/json", "model");
    const glbId = await asset(Buffer.from(input.render.glb, "base64"), "model/gltf-binary", "model");
    const gltfId = await asset(new TextEncoder().encode(input.render.gltf), "model/gltf+json", "model");
    const previews: string[] = []; for (const p of input.render.previews) previews.push(await asset(Buffer.from(p.data, "base64"), "image/png", "preview"));
    const artifact: ModelArtifact = { id: id("model"), assemblageId: a.id, sourceProgramId: program.id, format: "internal-scene", assetId: sceneId, glbAssetId: glbId, gltfAssetId: gltfId, thumbnailAssetId: previews[1] ?? previews[0]!, previewAssetIds: previews, metadata: input.build.metadata, createdAt: now() };
    await this.store.models.put(artifact);
    const revision: Revision = { id: id("rev"), assemblageId: a.id, revisionNumber: version, parentRevisionId: input.parent ?? a.currentRevisionId, sourceProgramId: program.id, modelArtifactId: artifact.id, referenceAssetIds: a.references.map(r => r.assetId), originatingPrompt: input.prompt, aiSummary: input.summary, diagnostics: { ...input.render.diagnostics, durationMs: input.build.diagnostics.durationMs }, previewAssetIds: previews, overrides: input.overrides, parameters: input.parameters, evaluation: input.evaluation, provenance: { model: input.model, runtimeVersion: RUNTIME_VERSION, createdAt: now() }, createdAt: now() };
    await this.store.revisions.put(revision);
    Object.assign(a, { currentRevision: version, currentRevisionId: revision.id, sourceProgramId: program.id, currentModelId: artifact.id, status: "ready", updatedAt: now() });
    // The assemblage head is the commit point: readers never see a partially written revision.
    await this.store.assemblages.put(a); return revision;
  }
  async checkout(asmId: string, revisionId: string) { return this.mutate(asmId, async () => { const a = await this.store.assemblages.require(asmId), r = await this.store.revisions.require(revisionId); if (r.assemblageId !== asmId) throw Error("Revision belongs to another assemblage"); Object.assign(a, { currentRevision: r.revisionNumber, currentRevisionId: r.id, sourceProgramId: r.sourceProgramId, currentModelId: r.modelArtifactId, status: "ready", updatedAt: now() }); await this.store.assemblages.put(a); return a; }); }
  async duplicate(asmId: string) {
    return this.mutate(asmId, async () => { const original = await this.detail(asmId), copy = await this.create(`${original.name} copy`, original.kind, original.description);
    const assetMap = new Map<string, string>();
    for (const ref of original.references) { const meta = await this.store.assets.getMetadata(ref.assetId), bytes = await this.store.assets.get(ref.assetId); const asset = await this.store.assets.put(bytes, { assemblageId: copy.id, mimeType: meta.mimeType, category: meta.category, originalFilename: meta.originalFilename }); assetMap.set(ref.assetId, asset.id); copy.references.push({ ...ref, id: id("ref"), assemblageId: copy.id, assetId: asset.id, createdAt: now() }); }
    await this.store.assemblages.put(copy);
    return { copy, original, assetMap }; });
  }
  async delete(asmId: string) { return this.mutate(asmId, async () => { await this.store.assemblages.require(asmId); for (const repo of [this.store.models, this.store.programs, this.store.revisions, this.store.jobs, this.store.messages] as const) for (const value of await repo.list()) if (value.assemblageId === asmId) { if ("phase" in value) for (const attempt of await this.store.attempts.list()) if (attempt.jobId === value.id) await this.store.attempts.delete(attempt.id); await repo.delete(value.id); } for (const meta of await this.store.assets.metadata.list()) if (meta.assemblageId === asmId) await this.store.assets.delete(meta.id); await this.store.assemblages.delete(asmId); }); }
}
