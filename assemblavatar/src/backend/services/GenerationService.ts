import type { BuildResult, GeneratedProgram, GenerationJob, Override, Revision } from "../../shared/domain";
import { config } from "../config";
import { id, now } from "../persistence/store";
import { AstraClient, type AIContext, type ModellingAI } from "../ai/AstraClient";
import { SandboxRunner } from "../sandbox/SandboxRunner";
import { RenderService } from "../render/RenderService";
import { WorkspaceService } from "./WorkspaceService";
export interface GenerationInput { prompt: string; automaticRefinement: boolean; maxIterations: number; profile: string; code?: string; overrides?: Override[]; parameters?: Record<string, unknown>; incorporateOverrides?: boolean; selectedObjectId?: string; parentRevisionId?: string }
export class GenerationService {
  private reservedSlots = 0;
  private controllers = new Map<string, AbortController>(); readonly events = new EventTarget();
  constructor(readonly workspaces: WorkspaceService, readonly renderer = new RenderService(), readonly sandbox = new SandboxRunner(), readonly ai: ModellingAI = new AstraClient(async value => { await workspaces.store.metrics.put({ id: id("metric"), createdAt: now(), ...value }); console.info(JSON.stringify({ event: "astra.request", ...value })); })) {}
  async start(asmId: string, input: GenerationInput) {
    this.workspaces.assertIdle(asmId); if (this.reservedSlots >= 2) throw Error("Generation capacity reached; wait for an active job to finish");
    // Lock before the first await to prevent concurrent request races.
    this.workspaces.busy.add(asmId);
    this.reservedSlots++;
    try {
      const a = await this.workspaces.store.assemblages.require(asmId);
      const job: GenerationJob = { id: id("job"), assemblageId: asmId, status: "queued", phase: "preparing", iteration: 0, maxIterations: Math.min(input.maxIterations, config.maxIterations), progress: 0, createdAt: now(), updatedAt: now() };
      const controller = new AbortController(); this.controllers.set(job.id, controller); await this.workspaces.store.jobs.put(job); a.status = "generating"; await this.workspaces.store.assemblages.put(a);
      await this.workspaces.store.messages.put({ id: id("msg"), assemblageId: asmId, role: "user", content: input.prompt, createdAt: now(), jobId: job.id });
      void this.run(job, input, controller.signal); return job;
    } catch (error) { this.workspaces.busy.delete(asmId); this.reservedSlots--; throw error; }
  }
  async cancel(jobId: string) { const job = await this.workspaces.store.jobs.require(jobId); this.controllers.get(jobId)?.abort(); return job; }
  private async update(job: GenerationJob, phase: string, progress: number) { job.phase = phase; job.progress = progress; job.updatedAt = now(); await this.workspaces.store.jobs.put(job); if (["queued", "running"].includes(job.status)) this.events.dispatchEvent(new CustomEvent(job.id, { detail: { ...job } })); }
  private async run(job: GenerationJob, input: GenerationInput, signal: AbortSignal) {
    const store = this.workspaces.store; let latest: Revision | undefined;
    try {
      const a = await store.assemblages.require(job.assemblageId), detail = await this.workspaces.detail(a.id);
      let source = detail.source?.code, prior = detail.revision;
      if (input.parentRevisionId) { prior = await store.revisions.require(input.parentRevisionId); if (prior.assemblageId !== a.id) throw Error("Revision belongs to another assemblage"); source = (await store.programs.require(prior.sourceProgramId)).code; }
      let overrides = input.overrides ?? prior?.overrides ?? []; const parameters = input.parameters ?? prior?.parameters ?? {};
      const images: AIContext["images"] = [];
      for (const ref of a.references.filter(r => r.type === "photo").sort((x, y) => Number(y.role === "front") - Number(x.role === "front")).slice(0, 6)) { const m = await store.assets.getMetadata(ref.assetId); images.push({ label: `Original reference (${ref.role}): ${ref.description}`, url: `data:${m.mimeType};base64,${Buffer.from(await store.assets.get(ref.assetId)).toString("base64")}` }); }
      let renders: AIContext["images"] = [];
      if (prior) for (const [i, assetId] of prior.previewAssetIds.entries()) renders.push({ label: `Current model render view ${i + 1}`, url: `data:image/png;base64,${Buffer.from(await store.assets.get(assetId)).toString("base64")}` });
      const textureUrls = await this.workspaces.textureUrls(a);
      const context = (): AIContext => ({ prompt: `${input.prompt}${input.selectedObjectId ? `\nSelected object: ${input.selectedObjectId}` : ""}${input.incorporateOverrides ? "\nIncorporate all supplied overrides into the source; they will be cleared after a successful build." : ""}\nAvailable texture asset IDs: ${Object.keys(textureUrls).join(", ")}`, kind: a.kind, profile: input.profile, jobId: job.id, iteration: job.iteration, source, originalPrompt: prior?.originatingPrompt ?? input.prompt, overrides, parameters, images: [...images, ...renders] });
      job.status = "running";
      let generated: GeneratedProgram = input.code !== undefined ? { code: input.code, summary: input.prompt, objectStructure: [], assumptions: [], expectedLimitations: [] } : await (async () => { await this.update(job, source ? "refining" : "generating", .1); return source ? this.ai.refine(context(), signal) : this.ai.generate(context(), signal); })();
      let evaluation: Revision["evaluation"];
      for (let iteration = 1; iteration <= job.maxIterations; iteration++) {
        signal.throwIfAborted(); job.iteration = iteration; source = generated.code;
        let build: BuildResult | undefined;
        for (let repair = 0; repair <= (input.code === undefined ? config.maxRepairs : 0); repair++) {
          await this.update(job, repair ? "repairing" : "validating", .2);
          const attempt = { id: id("attempt"), jobId: job.id, iteration, sourceProgram: source, status: "build-failed" as const };
          try { build = await this.sandbox.build(source, { parameters, metadata: { assemblageId: a.id, revision: a.currentRevision + 1 } }, Object.keys(textureUrls), signal); await store.attempts.put({ ...attempt, status: "rendered", diagnostics: build.diagnostics }); break; }
          catch (error) { signal.throwIfAborted(); const diagnostics = error instanceof Error ? error.message : "Build failed"; await store.attempts.put({ ...attempt, error: diagnostics }); if (input.code !== undefined || repair === config.maxRepairs) throw error; generated = await this.ai.repair({ ...context(), source, diagnostics }, signal); source = generated.code; }
        }
        if (!build) throw Error("No valid build produced");
        if (input.incorporateOverrides) overrides = [];
        build.metadata = { ...build.metadata, assumptions: generated.assumptions, expectedLimitations: generated.expectedLimitations, objectStructure: generated.objectStructure };
        await this.update(job, "rendering", .5); const rendered = await this.renderer.render(build, overrides, textureUrls, signal);
        renders = rendered.previews.map(p => ({ label: `Generated model render: ${p.view}`, url: `data:image/png;base64,${p.data}` }));
        if (input.code === undefined) { await this.update(job, "evaluating", .7); evaluation = await this.ai.evaluate({ ...context(), source }, signal); }
        const catastrophic = evaluation?.issues.some(i => i.severity === "major") ?? false;
        if (!catastrophic) {
          signal.throwIfAborted(); await this.update(job, "exporting", .85);
          latest = await this.workspaces.commit(a, { code: source, build, render: rendered, prompt: input.prompt, summary: generated.summary, model: input.code !== undefined ? "manual" : config.model, overrides, parameters, parent: latest?.id ?? input.parentRevisionId ?? prior?.id, evaluation });
          job.currentSourceProgramId = latest.sourceProgramId; job.currentModelArtifactId = latest.modelArtifactId;
        }
        if (input.code !== undefined || evaluation?.recommendation === "accept" && !catastrophic) { job.status = "completed"; break; }
        if (!input.automaticRefinement || iteration === job.maxIterations || evaluation?.recommendation === "requires-user-review") { if (catastrophic && !latest) throw Error(`Model requires correction: ${evaluation?.overallAssessment}`); job.status = "review"; break; }
        await this.update(job, "refining", .9); generated = await this.ai.refine({ ...context(), source, evaluation }, signal);
        if (generated.code.trim() === source.trim()) { if (!latest) throw Error("Refinement made no source change and geometry still requires correction"); job.status = "review"; break; }
      }
      await store.messages.put({ id: id("msg"), assemblageId: a.id, role: "assistant", content: `${latest?.aiSummary ?? "Generation finished."}${evaluation ? `\n${evaluation.overallAssessment}` : ""}`, createdAt: now(), jobId: job.id });
      await this.update(job, job.status === "review" ? "review" : "completed", 1);
    } catch (error) {
      job.status = signal.aborted ? "cancelled" : "failed"; job.error = signal.aborted ? "Generation cancelled" : error instanceof Error ? error.message : "Generation failed";
      await this.update(job, job.status, 1); await store.messages.put({ id: id("msg"), assemblageId: job.assemblageId, role: "assistant", content: job.error, createdAt: now(), jobId: job.id });
    } finally {
      const a = await store.assemblages.get(job.assemblageId); if (a) { a.status = a.currentModelId ? "ready" : job.status === "failed" ? "failed" : "draft"; a.updatedAt = now(); await store.assemblages.put(a); }
      this.workspaces.busy.delete(job.assemblageId); this.controllers.delete(job.id); this.reservedSlots--;
      this.events.dispatchEvent(new CustomEvent(job.id, { detail: { ...job } }));
    }
  }
}
