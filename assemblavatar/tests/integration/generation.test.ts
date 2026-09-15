import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenerationService } from "../../src/backend/services/GenerationService";
import { WorkspaceService } from "../../src/backend/services/WorkspaceService";
import { Store } from "../../src/backend/persistence/store";
import { SandboxRunner } from "../../src/backend/sandbox/SandboxRunner";
import type { AIContext, ModellingAI } from "../../src/backend/ai/AstraClient";
import type { RenderService } from "../../src/backend/render/RenderService";
import type { GeneratedProgram, RenderEvaluation } from "../../src/shared/domain";
const code = "export function buildModel(ctx: ModelBuildContext): ModelBuildOutput { return {root:ctx.runtime.create.box({width:1})}; }";
const generated = (source = code): GeneratedProgram => ({ code: source, summary: "Built a box", assumptions: [], expectedLimitations: [], objectStructure: [{ name: "Box", purpose: "Primary body" }] });
async function setup(ai: ModellingAI) { const dir = await mkdtemp(join(tmpdir(), "assemblavatar-generation-")); const store = new Store(dir), workspace = new WorkspaceService(store); const a = await workspace.create("Test", "object"); const renderer = { render: async (build: any) => ({ previews: [{ view: "front", data: "aW1hZ2U=" }], glb: "Z2xURg==", gltf: "{}", diagnostics: build.diagnostics }) } as unknown as RenderService; const generation = new GenerationService(workspace, renderer, new SandboxRunner(), ai); return { dir, store, workspace, a, generation }; }
async function wait(env: Awaited<ReturnType<typeof setup>>, jobId: string) { for (let i = 0; i < 200; i++) { const job = await env.store.jobs.require(jobId); if (!["queued", "running"].includes(job.status) && !env.workspace.busy.has(job.assemblageId)) return job; await Bun.sleep(20); } throw Error("Job did not finish"); }
const accept: RenderEvaluation = { recommendation: "accept", overallAssessment: "Geometry matches the request", issues: [] };
test("recovery reuses failed-job source but still evaluates before committing", async () => {
  let evaluations = 0;
  const env = await setup({ generate: async () => { throw Error("Must reuse saved source"); }, repair: async () => generated(), refine: async () => generated(), evaluate: async () => { evaluations++; return accept; } });
  try {
    await env.store.jobs.put({ id: "job_00000000-0000-4000-8000-000000000001", assemblageId: env.a.id, status: "failed", phase: "failed", iteration: 1, maxIterations: 2, progress: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await env.store.attempts.put({ id: "attempt_00000000-0000-4000-8000-000000000001", jobId: "job_00000000-0000-4000-8000-000000000001", iteration: 1, status: "rendered", sourceProgram: code });
    const job = await env.generation.start(env.a.id, { prompt: "Recover box", profile: "generic-object", maxIterations: 1, automaticRefinement: false, resumeAttemptId: "attempt_00000000-0000-4000-8000-000000000001" });
    expect((await wait(env, job.id)).status).toBe("completed");
    expect(evaluations).toBe(1);
    expect((await env.workspace.detail(env.a.id)).source?.code).toBe(code);
    const other = await env.workspace.create("Other", "object");
    const denied = await env.generation.start(other.id, { prompt: "Recover box", profile: "generic-object", maxIterations: 1, automaticRefinement: false, resumeAttemptId: "attempt_00000000-0000-4000-8000-000000000001" });
    expect((await wait(env, denied.id)).error).toContain("this assemblage");
    expect((await env.workspace.detail(other.id)).currentRevision).toBe(0);
  } finally { await rm(env.dir, { recursive: true, force: true }); }
}, 15000);
test("repairs invalid generated source and commits source, artifact and provenance", async () => { let repairs = 0; const env = await setup({ generate: async () => generated("invalid source"), repair: async context => { expect(context.diagnostics).toBeTruthy(); repairs++; return generated(); }, refine: async () => generated(), evaluate: async context => { expect(context.images.some(i => i.label.includes("Generated model render"))).toBe(true); return accept; } }); try { const job = await env.generation.start(env.a.id, { prompt: "A box", profile: "generic-object", maxIterations: 1, automaticRefinement: false }); expect((await wait(env, job.id)).status).toBe("completed"); expect(repairs).toBe(1); const a = await env.workspace.detail(env.a.id); expect(a.source?.code).toBe(code); expect(a.revision?.provenance.model).toBe("gpt-6-astra"); expect(await env.store.assets.exists(a.model!.glbAssetId)).toBe(true); expect((await env.store.attempts.list()).some(a => a.error)).toBe(true); } finally { await rm(env.dir, { recursive: true, force: true }); } }, 15000);
test("review feeds renders, source and feedback into bounded refinement", async () => { let reviews = 0, refinement: AIContext | undefined; const env = await setup({ generate: async () => generated(), repair: async () => generated(), refine: async context => { refinement = context; return generated(code.replace("width:1", "width:2")); }, evaluate: async () => ++reviews === 1 ? { recommendation: "refine", overallAssessment: "Widen the box", issues: [{ area: "width", severity: "moderate", description: "Too narrow", suggestedChange: "Double width" }] } : accept }); try { const job = await env.generation.start(env.a.id, { prompt: "A wide box", profile: "generic-object", maxIterations: 2, automaticRefinement: true }); const complete = await wait(env, job.id); expect(complete.status).toBe("completed"); expect(complete.iteration).toBe(2); expect(refinement?.evaluation?.overallAssessment).toBe("Widen the box"); expect(refinement?.source).toBe(code); const revisions = await env.store.revisions.list(); expect(revisions.length).toBe(2); expect(revisions.find(r => r.revisionNumber === 2)?.parentRevisionId).toBe(revisions.find(r => r.revisionNumber === 1)?.id); } finally { await rm(env.dir, { recursive: true, force: true }); } }, 15000);
test("major geometry problems do not replace canonical head", async () => { const env = await setup({ generate: async () => generated(), repair: async () => generated(), refine: async () => generated(), evaluate: async () => ({ recommendation: "accept", overallAssessment: "Catastrophic mismatch", issues: [{ area: "geometry", severity: "major", description: "Wrong shape", suggestedChange: "Rebuild" }] }) }); try { const job = await env.generation.start(env.a.id, { prompt: "A box", profile: "generic-object", maxIterations: 1, automaticRefinement: true }); expect((await wait(env, job.id)).status).toBe("failed"); expect((await env.workspace.detail(env.a.id)).currentRevision).toBe(0); expect(await env.store.revisions.list()).toHaveLength(0); } finally { await rm(env.dir, { recursive: true, force: true }); } }, 15000);
