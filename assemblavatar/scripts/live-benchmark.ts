import { mkdir } from "node:fs/promises";
const base = process.env.ASSEMBLAVATAR_URL || "http://127.0.0.1:3000";
const cases: Record<string, { prompt: string; kind: string; profile: string; expected: string[] }> = {
  house: { prompt: "Create a small one-storey modern house with a flat roof, two front windows and a recessed entrance.", kind: "object", profile: "architectural-object", expected: ["flat roof", "two front windows", "recessed entrance"] },
  chair: { prompt: "Create a wooden chair with four legs, a seat and a slatted backrest.", kind: "object", profile: "generic-object", expected: ["four legs", "seat", "backrest"] },
  mug: { prompt: "Create a ceramic coffee mug with a hollow bowl, a thick rim and a loop handle.", kind: "object", profile: "generic-object", expected: ["hollow bowl", "handle"] },
  robot: { prompt: "Create a friendly stylised robot with two arms, two legs and expressive eyes.", kind: "object", profile: "generic-object", expected: ["limbs", "eyes"] },
  head: { prompt: "Create a human head bust with anatomically plausible proportions, eyes, nose, mouth, ears and short hair.", kind: "avatar", profile: "avatar-head-realistic", expected: ["anatomy", "facial features"] },
  cartoon: { prompt: "Create a stylised clay character head with a distinctive nose, large eyes, ears and swept hair.", kind: "avatar", profile: "avatar-head-stylised", expected: ["eyes", "nose", "ears", "hair"] },
};
const name = process.argv[2] || "house", spec = cases[name]; if (!spec) throw Error(`Choose: ${Object.keys(cases).join(", ")}`);
async function request(path: string, data?: unknown) { const response = await fetch(base + "/api" + path, data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : undefined); const body = await response.json() as any; if (!response.ok) throw Error(body.error?.message || `HTTP ${response.status}`); return body; }
const a = await request("/assemblages", { name: `Astra benchmark · ${name}`, kind: spec.kind, description: spec.prompt });
const created = await request(`/assemblages/${a.id}/generate`, { prompt: spec.prompt, profile: spec.profile, automaticRefinement: true, maxIterations: 2 });
let previous = ""; const started = Date.now();
while (true) {
  const job = await request(`/jobs/${created.jobId}`); const state = `${job.status}: ${job.phase}, iteration ${job.iteration}/${job.maxIterations}`;
  if (state !== previous) { console.info(state); previous = state; }
  if (!["queued", "running"].includes(job.status)) {
    if (["failed", "cancelled"].includes(job.status)) throw Error(job.error);
    const detail = await request(`/assemblages/${a.id}`); if (!detail.model || !detail.source || !detail.revision) throw Error("Generation did not commit a complete revision");
    const response = await fetch(`${base}/api/models/${detail.model.id}/content?format=glb`); const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || new TextDecoder().decode(bytes.slice(0, 4)) !== "glTF") throw Error("Export failed");
    await mkdir("data/benchmarks", { recursive: true });
    const result = { name, assemblageId: a.id, jobId: job.id, status: job.status, durationMs: Date.now() - started, revision: detail.revision.revisionNumber, diagnostics: detail.revision.diagnostics, evaluation: detail.revision.evaluation, expectedProperties: spec.expected, glbBytes: bytes.length };
    await Bun.write(`data/benchmarks/${name}.json`, JSON.stringify(result, null, 2)); console.info(JSON.stringify(result, null, 2)); break;
  }
  if (Date.now() - started > 900000) { await request(`/jobs/${created.jobId}/cancel`, {}); throw Error("Benchmark exceeded 15 minutes; job cancelled"); }
  await Bun.sleep(1000);
}
