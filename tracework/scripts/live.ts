import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../apps/server/src/app";
import { seed } from "../apps/server/src/modules/demo";
import { inspectProposal } from "../apps/server/src/modules/model";
import type { Artifact } from "../packages/contracts";
import { qualifyLiveSDK } from "./live-sdk";
import { introduceChange } from "../apps/server/src/modules/demo";
import { extractVersion } from "../apps/server/src/modules/sources";
import { validateWorkspace } from "../apps/server/src/modules/validation";
import type { Run, Source, Proposal } from "../packages/contracts";
if (!process.env.OPENAI_API_KEY || process.env.TRACEWORK_LIVE !== "1") {
  console.log(
    "Not run: opt in with TRACEWORK_LIVE=1 and OPENAI_API_KEY. This suite makes billed model calls.",
  );
  process.exit(0);
}
const root =
    process.env.TRACEWORK_LIVE_RESUME_DIR ||
    mkdtempSync(join(tmpdir(), "tracework-live-")),
  app = createApp(root),
  w = process.env.TRACEWORK_LIVE_RESUME_DIR
    ? app.s.workspaces()[0]!
    : await seed(app.s);
app.s.putWorkspace({ ...w, settings: { allowInternalAI: true, revision: 1 } });
app.jobs.start();
const report: any = {
  runtime: Bun.version,
  sdk: "0.18.0",
  model: process.env.OPENAI_MODEL || "gpt-6-astra",
  prompt: "tracework-1",
  root,
  checks: [],
};
async function runTask(kind: string, extra: Record<string, unknown> = {}) {
  console.log(
    `Live qualification: ${kind}${extra.artifactKind ? " / " + extra.artifactKind : ""}`,
  );
  const current = app.s.getWorkspace(w.id);
  const originalHead = current.headId;
  const originalFindings = app.s.list("finding", w.id).length;
  const run = app.runtime.start(w.id, {
    kind,
    expectedContextVersionId: current.headId,
    sourceVersionIds: app.s
      .list<Source>("source", w.id)
      .map((s) => s.latestVersionId!),
    elementIds: app.s.snapshot(w.id).objects.map((o) => o.id),
    question:
      "Use only supplied synthetic evidence. Keep this integration test small.",
    ...extra,
  });
  for (let i = 0; i < 650; i++) {
    await Bun.sleep(1000);
    const r = app.s.get<Run>("run", w.id, run.id);
    if (r.status === "awaiting-approval")
      throw new Error("Unexpected scope expansion in a fully scoped test");
    if (["failed", "cancelled", "interrupted"].includes(r.status))
      throw new Error(JSON.stringify(r.error));
    if (r.status === "completed") {
      if (app.s.getWorkspace(w.id).headId !== originalHead)
        throw new Error("Agent mutated accepted context");
      if (
        kind === "question" &&
        app.s.list("finding", w.id).length !== originalFindings
      )
        throw new Error("Question mutated findings");
      const result = r.result as {
        proposalIds?: string[];
        artifactId?: string;
      };
      for (const pid of result.proposalIds ?? []) {
        const proposal = app.s.get<Proposal>("proposal", w.id, pid);
        if (
          inspectProposal(app.s, w.id, proposal).checks.some(
            (c) => c.result === "block",
          )
        )
          throw new Error("Live proposal failed structural validation");
      }
      if (result.artifactId) {
        const artifact = app.s.get<Artifact>(
          "artifact",
          w.id,
          result.artifactId,
        );
        if (artifact.checks.some((c) => c.result === "block"))
          throw new Error(
            "Live artifact failed validation: " +
              artifact.checks.map((c) => c.message).join("; "),
          );
      }
      report.checks.push({
        kind,
        status: "passed",
        runId: r.id,
        usage: r.usage,
        result: r.result,
      });
      return r;
    }
  }
  throw new Error("Live task deadline exceeded");
}
try {
  if (!process.env.TRACEWORK_LIVE_RESUME_DIR) {
    report.checks.push({
      kind: "sdk-compatibility",
      result: await qualifyLiveSDK(app.s, w.id),
    });
    const interpretation = await runTask("interpretation");
    const pids = (interpretation.result as any).proposalIds as string[];
    if (!pids.length) throw new Error("Interpretation returned no proposal");
    for (const pid of pids) {
      const p = app.s.get<Proposal>("proposal", w.id, pid);
      if (
        !p.operations.some(
          (o) => o.action !== "supersede" && o.value.evidenceIds.length,
        )
      )
        throw new Error("No cited semantic output");
    }
    await runTask("question", {
      question:
        "Explain the mandatory-account / guest-request contradiction. Cite the conflicting evidence.",
    });
    const architecture = await runTask("architecture");
    if ((architecture.result as any).proposalIds.length !== 2)
      throw new Error(
        "Architecture did not produce two reviewable alternatives",
      );
    for (const artifactKind of ["specification", "openapi", "test-plan"])
      await runTask("artifact", { artifactKind });
  }
  const changed = await introduceChange(app.s, w.id);
  for (let n = 0; n < 100; n++) {
    const sourceVersion = app.s.get<any>(
      "source-version",
      w.id,
      changed.version.id,
    );
    if (sourceVersion.status === "ready") break;
    if (sourceVersion.status === "failed") throw new Error(sourceVersion.error);
    await Bun.sleep(200);
  }
  if (
    app.s.get<any>("source-version", w.id, changed.version.id).status !==
    "ready"
  )
    throw new Error("Changed source extraction timed out");
  const validation = validateWorkspace(app.s, w.id);
  await runTask("remediation", {
    findingIds: app.s
      .list<any>("finding", w.id)
      .filter((f) => f.validationRunId === validation.id)
      .map((f) => f.id),
    question:
      "Analyze the new technician-certification requirement against the accepted scheduling, API and test scope. Explain dependency impacts and propose a bounded remediation with citations. Leave unrelated glossary entries unchanged.",
  });
  report.outcome = "passed";
} catch (e) {
  report.outcome = "failed";
  report.error = (e as Error).message;
  process.exitCode = 1;
} finally {
  await Bun.write(
    join(
      root,
      process.env.TRACEWORK_LIVE_RESUME_DIR
        ? "live-remediation-report.json"
        : "live-report.json",
    ),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        outcome: report.outcome,
        error: report.error,
        report: join(
          root,
          process.env.TRACEWORK_LIVE_RESUME_DIR
            ? "live-remediation-report.json"
            : "live-report.json",
        ),
        checks: report.checks.map((c: any) => ({
          kind: c.kind,
          status: c.status ?? "passed",
        })),
      },
      null,
      2,
    ),
  );
  await app.close();
}
