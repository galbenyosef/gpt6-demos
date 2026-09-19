import type {
  Check,
  Finding,
  Artifact,
  ObjectRevision,
  Evidence,
  Source,
  SourceVersion,
} from "../../../../packages/contracts";
import { ensure } from "../../../../packages/contracts";
import { Store, id, now } from "../storage/store";
import { validateGraph, validEvidence } from "./model";
import { artifactFreshness } from "./artifacts";
export function impacts(s: Store, w: string, changedIds: string[]) {
  const objects = s.snapshot(w).objects,
    artifacts = s.list<Artifact>("artifact", w);
  const edges = new Map<string, Set<string>>();
  const edge = (a: string, b: string) => {
    if (!edges.has(a)) edges.set(a, new Set());
    edges.get(a)!.add(b);
  };
  for (const e of s.list<Evidence>("evidence", w)) {
    edge(e.sourceId, e.sourceVersionId);
    edge(e.sourceVersionId, e.id);
  }
  for (const o of objects) {
    for (const e of o.evidenceIds) edge(e, o.id);
    if (o.kind === "relationship") {
      edge(o.from, o.id);
      edge(o.to, o.id);
      if (["depends-on", "uses", "realizes", "constrains"].includes(o.type))
        edge(o.to, o.from);
    }
    if (o.kind === "decision") for (const e of o.elementIds) edge(e, o.id);
  }
  for (const a of artifacts) {
    for (const oid of Object.keys(a.manifest.objectRevisions)) edge(oid, a.id);
    for (const vid of Object.keys(a.manifest.sourceVersions)) edge(vid, a.id);
    for (const aid of Object.keys(a.manifest.inputArtifacts)) edge(aid, a.id);
  }
  const paths = new Map<string, string[]>();
  const queue = changedIds.map((x) => [x]);
  while (queue.length) {
    const path = queue.shift()!;
    for (const next of edges.get(path.at(-1)!) ?? []) {
      if (path.includes(next) || paths.has(next)) continue;
      const p = [...path, next];
      paths.set(next, p);
      queue.push(p);
    }
  }
  return [...paths].map(([objectId, path]) => ({
    objectId,
    path,
    name:
      objects.find((o) => o.id === objectId)?.name ??
      artifacts.find((a) => a.id === objectId)?.name ??
      objectId,
  }));
}
export function validateWorkspace(s: Store, w: string) {
  const snapshot = s.snapshot(w),
    checks: Check[] = [];
  try {
    checks.push(...validateGraph(s, w, snapshot.objects), {
      id: "model-integrity",
      origin: "deterministic",
      result: "pass",
      message: "Types, active references and evidence are valid",
      objectIds: [],
    });
  } catch (e) {
    checks.push({
      id: "model-integrity",
      origin: "deterministic",
      result: "block",
      message: (e as Error).message,
      objectIds: [],
    });
  }
  for (const a of s.list<Artifact>("artifact", w)) {
    checks.push(
      ...artifactFreshness(s, w, a).map((c) => ({
        ...c,
        id: `${a.id}:freshness`,
        message: `${a.name}: ${c.message}`,
        objectIds: [a.id, ...c.objectIds],
      })),
    );
    checks.push(
      ...a.checks
        .filter((c) => c.result !== "pass")
        .map((c) => ({ ...c, id: `${a.id}:${c.id}`, objectIds: [a.id] })),
    );
  }
  for (const source of s.list<Source>("source", w)) {
    for (const o of snapshot.objects) {
      const old = o.evidenceIds.some((eid) => {
        const e = s.get<Evidence>("evidence", w, eid);
        return (
          e.sourceId === source.id &&
          e.sourceVersionId !== source.latestVersionId
        );
      });
      if (old)
        checks.push({
          id: `${source.id}:${o.id}`,
          origin: "staleness",
          result: "warn",
          message: `${o.name} cites an older version of ${source.name}; accepted meaning is unchanged`,
          objectIds: [source.id, o.id],
        });
    }
  }
  checks.push({
    id: "semantic-review",
    origin: "advisory",
    result: "not-run",
    message:
      "Semantic consistency requires an explicit critic or change-analysis run",
    objectIds: [],
  });
  const run = {
    id: id(),
    workspaceId: w,
    contextVersionId: snapshot.version.id,
    createdAt: now(),
    checks,
  };
  s.tx(() => {
    s.insert("validation", w, run);
    for (const c of checks.filter(
      (c) => c.result !== "pass" && c.result !== "not-run",
    )) {
      const f: Finding = {
        ...c,
        checkId: c.id,
        id: id(),
        workspaceId: w,
        validationRunId: run.id,
        baselineId: snapshot.version.id,
        comparisonId: snapshot.version.id,
        disposition: "open",
        paths: impacts(s, w, c.objectIds).map((p) => p.path),
      };
      s.insert("finding", w, f);
    }
  });
  return run;
}
export function disposition(
  s: Store,
  w: string,
  fid: string,
  value: string,
  comment: string,
) {
  const f = s.get<Finding>("finding", w, fid);
  ensure(
    ["open", "resolved", "dismissed", "accepted-risk"].includes(value),
    "INVALID_DISPOSITION",
    "Unknown finding disposition",
  );
  if (value !== "open")
    ensure(comment.trim(), "COMMENT_REQUIRED", "A review comment is required");
  if (value === "resolved" && f.origin === "deterministic") {
    const check = validateWorkspace(s, w).checks;
    ensure(
      !!f.checkId &&
        check.some(
          (c) =>
            c.id === f.checkId &&
            c.origin === "deterministic" &&
            c.result === "pass",
        ),
      "CHECK_STILL_FAILS",
      "The same deterministic check must pass against current inputs before this finding can be resolved. Dismissal never changes its failed outcome.",
    );
  }
  s.update("finding", w, { ...f, disposition: value, comment });
  s.audit(w, "finding.reviewed", { findingId: fid, value, comment });
  return { ok: true };
}
