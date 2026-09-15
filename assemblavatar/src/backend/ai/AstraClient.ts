import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "../config";
import { runtimeContract } from "../sandbox/ProgramValidator";
import type { GeneratedProgram, RenderEvaluation } from "../../shared/domain";
export const generatedSchema = z.object({ code: z.string().min(1).max(config.maxSource), summary: z.string(), objectStructure: z.array(z.object({ name: z.string(), purpose: z.string() })), assumptions: z.array(z.string()), expectedLimitations: z.array(z.string()) });
export const evaluationSchema = z.object({ overallAssessment: z.string(), issues: z.array(z.object({ area: z.string(), severity: z.enum(["minor", "moderate", "major"]), description: z.string(), suggestedChange: z.string() })), recommendation: z.enum(["accept", "refine", "requires-user-review"]) });
export interface AIContext { prompt: string; kind: string; profile: string; jobId?: string; iteration?: number; source?: string; originalPrompt?: string; overrides?: unknown[]; parameters?: Record<string, unknown>; evaluation?: RenderEvaluation; diagnostics?: string; images: { label: string; url: string }[] }
export interface ModellingAI { generate(context: AIContext, signal?: AbortSignal): Promise<GeneratedProgram>; refine(context: AIContext, signal?: AbortSignal): Promise<GeneratedProgram>; repair(context: AIContext, signal?: AbortSignal): Promise<GeneratedProgram>; evaluate(context: AIContext, signal?: AbortSignal): Promise<RenderEvaluation> }
export const profiles: Record<string, string> = {
  "generic-object": "Prioritise silhouette, major components, relative dimensions, symmetry, materials and functional details.",
  "architectural-object": "Prioritise building footprint, roof, windows, entrances and structural plausibility. Do not invent unseen decorative details.",
  "avatar-head-stylised": "Preserve recognizable facial features using simplified forms. Prioritise head silhouette, jaw, eyes, nose, mouth, ears and hair. Describe inferred unseen geometry.",
  "avatar-head-realistic": "Prioritise cranial silhouette, face width/height, jaw/chin, eye placement, nose, mouth, ears, hair silhouette and materials in that order. Use lofts and local deformations for organic transitions. This is a procedural approximation, not photogrammetry.",
};
export class AstraClient implements ModellingAI {
  constructor(private metric: (value: Record<string, unknown>) => Promise<void> = async () => {}, private request: typeof fetch = fetch, private options: { timeoutMs?: number; apiKey?: string; pollIntervalMs?: number } = {}) {}
  private async call<S extends z.ZodType>(operation: string, context: AIContext, schema: S, signal?: AbortSignal): Promise<z.infer<S>> {
    const apiKey = this.options.apiKey ?? config.apiKey;
    if (!apiKey) throw Error("Set OPENAI_API_KEY in the server .env to generate with GPT-6 Astra");
    const timeoutMs = this.options.timeoutMs ?? config.aiRequestTimeoutMs;
    const deadline = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const start = Date.now(); const { images, ...textContext } = context;
    const instructions = `You are Assemblavatar's procedural 3D modeller. Use GPT-6 Astra to construct, inspect and refine editable models.\n${profiles[context.profile] ?? profiles["generic-object"]}\nUse this exact runtime contract:\n${runtimeContract}\nOutput a synchronous exported function buildModel(ctx: ModelBuildContext): ModelBuildOutput. Types in the contract are implicitly available. Use ctx.runtime; no imports are needed. No new, classes, async, await, while, do, recursion, dynamic code, host APIs, IO or uncontrolled randomness. Use typed bounded for loops (at most 3 levels) and helper functions. Operations use radians, metres, Y up, front faces +Z. Name every component consistently. Prefer compact procedural geometry, lofts, extrusions and deformation over vertex dumps. No placeholder models. Return only requested structured fields. Budget: ${JSON.stringify(config.limits)}, maximum source ${config.maxSource} bytes, runtime 1.0.0, build ${config.timeout}ms, segments 3–128.\nFor refinement, preserve good geometry and make targeted changes. The source plus overrides is canonical; retain overrides unless explicitly asked to incorporate them.\nFor repair, make the smallest correction that resolves diagnostics.\nFor evaluation, compare labelled actual renders to references and the original intent. Rank concrete geometric discrepancies. Major issues or invisible/degenerate geometry must never be accepted. Recommend only achievable runtime changes. Do not provide hidden reasoning; concise operational summaries only.`;
    const body = { model: config.model, store: false, max_output_tokens: 12000, input: [{ role: "system", content: instructions }, { role: "user", content: [{ type: "input_text", text: JSON.stringify({ operation, ...textContext }) }, ...images.slice(0, 13).flatMap(image => [{ type: "input_text", text: image.label }, { type: "input_image", image_url: image.url, detail: "high" }])] }], text: { format: { type: "json_schema", name: operation, strict: true, schema: z.toJSONSchema(schema) } } };
    const endpoint = "https://api.openai.com/v1/responses";
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    let responseId: string | undefined, pending = false;
    const readResponse = async (response: Response) => {
      const data = await response.json() as any;
      if (!response.ok) throw Error(`Astra request failed (${response.status}): ${data?.error?.code ?? "upstream_error"}`);
      return data;
    };
    try {
      // Short create/retrieve requests avoid an idle connection throughout model reasoning.
      let data = await readResponse(await this.request(endpoint, { method: "POST", headers, body: JSON.stringify({ ...body, background: true }), signal: requestSignal }));
      responseId = data.id;
      pending = ["queued", "in_progress"].includes(data.status);
      if (pending) await this.metric({ operation, jobId: context.jobId, iteration: context.iteration, requestId: responseId, event: "submitted", model: config.model });
      while (pending) {
        if (!responseId || !/^resp_[a-zA-Z0-9_-]+$/.test(responseId)) throw Error("Astra returned an invalid background response ID");
        await delay(this.options.pollIntervalMs ?? 2000, undefined, { signal: requestSignal });
        // Retrying retrieval is safe: it never submits a duplicate generation.
        for (let attempt = 0; ; attempt++) {
          try {
            data = await readResponse(await this.request(`${endpoint}/${responseId}`, { headers, signal: AbortSignal.any([requestSignal, AbortSignal.timeout(30000)]) }));
            break;
          } catch (error) {
            requestSignal.throwIfAborted();
            if (attempt === 2) throw error;
            await delay(1000 * (attempt + 1), undefined, { signal: requestSignal });
          }
        }
        pending = ["queued", "in_progress"].includes(data.status);
      }
      if (data.status !== "completed") {
        if (["credit_balance_exhausted", "insufficient_quota"].includes(data.error?.code)) throw Error(`OpenAI API credits or quota exhausted (${data.error.code}). Add credits or check billing at https://platform.openai.com/settings/organization/billing/. Your photos and saved model source are preserved.`);
        throw Error(`Astra response ${data.status}: ${data.error?.code ?? data.incomplete_details?.reason ?? "not completed"}`);
      }
      const content = (data.output ?? []).flatMap((o: any) => o.content ?? []);
      if (content.some((c: any) => c.type === "refusal")) throw Error("Astra declined this modelling request");
      const output = content.filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
      const parsed = schema.parse(JSON.parse(output));
      await this.metric({ operation, jobId: context.jobId, iteration: context.iteration, model: config.model, durationMs: Date.now() - start, usage: data.usage, requestId: data.id, success: true });
      return parsed;
    } catch (error) {
      const timedOut = deadline.aborted && !signal?.aborted;
      if (pending && responseId) await this.request(`${endpoint}/${encodeURIComponent(responseId)}/cancel`, { method: "POST", headers, signal: AbortSignal.timeout(5000) }).then(r => r.body?.cancel()).catch(() => {});
      await this.metric({ operation, jobId: context.jobId, iteration: context.iteration, requestId: responseId, model: config.model, durationMs: Date.now() - start, timeoutMs, failureKind: signal?.aborted ? "cancelled" : timedOut ? "timeout" : "request-failed", success: false });
      if (timedOut) throw Error(`Astra ${operation.replaceAll("_", " ")} timed out after ${Math.round(timeoutMs / 1000)} seconds while waiting for the AI response. Your photos and last saved revision are preserved. Retry or increase AI_REQUEST_TIMEOUT_MS in the server configuration.`);
      if (signal?.aborted) throw signal.reason;
      throw error;
    }
  }
  generate(context: AIContext, signal?: AbortSignal) { return this.call("generate_model", context, generatedSchema, signal); }
  refine(context: AIContext, signal?: AbortSignal) { return this.call("refine_model", context, generatedSchema, signal); }
  repair(context: AIContext, signal?: AbortSignal) { return this.call("repair_program", context, generatedSchema, signal); }
  evaluate(context: AIContext, signal?: AbortSignal) { return this.call("evaluate_render", context, evaluationSchema, signal); }
}
