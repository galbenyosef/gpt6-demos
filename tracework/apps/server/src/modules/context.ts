import { TaskInput, ensure } from "../../../../packages/contracts";
import type {
  ContextPlan,
  Evidence,
  SourceVersion,
  Source,
  ObjectRevision,
  Artifact,
  Classification,
  TaskInput as Task,
} from "../../../../packages/contracts";
import { Store, id } from "../storage/store";
import { assertHead, validEvidence } from "./model";
import { canSubmit, classificationOfEvidence, mostRestricted } from "./sources";
export function objectClassification(
  s: Store,
  w: string,
  o: ObjectRevision,
): Classification {
  return mostRestricted(
    o.classification,
    classificationOfEvidence(s, w, o.evidenceIds),
  );
}
export function assemble(s: Store, w: string, input: unknown) {
  const task = TaskInput.parse(input);
  const ws = assertHead(s, w, task.expectedContextVersionId);
  if (task.question)
    ensure(
      ws.settings.allowInternalAI,
      "DATA_POLICY",
      "Free-form questions are internal. Enable internal submission in workspace settings first.",
      403,
    );
  const snap = s.snapshot(w, ws.headId);
  const selected = new Set(task.elementIds);
  for (const key of selected)
    ensure(
      snap.objects.some((o) => o.id === key),
      "INVALID_SCOPE",
      "A selected object is outside the accepted snapshot",
    );
  for (const o of snap.objects)
    if (
      o.kind === "relationship" &&
      (selected.has(o.from) || selected.has(o.to))
    ) {
      selected.add(o.id);
      selected.add(o.from);
      selected.add(o.to);
    }
  const objects = snap.objects.filter((o) => selected.has(o.id));
  let classification: Classification = task.question ? "internal" : "public";
  for (const o of objects) {
    const c = objectClassification(s, w, o);
    ensure(
      canSubmit(s, w, c),
      "DATA_POLICY",
      `Selected model content is ${c} and cannot be submitted`,
      403,
    );
    classification = mostRestricted(classification, c);
  }
  const versions = new Set(task.sourceVersionIds);
  for (const o of objects)
    for (const eid of o.evidenceIds)
      versions.add(validEvidence(s, w, eid).sourceVersionId);
  const exclusions: string[] = [];
  for (const vid of versions) {
    const v = s.get<SourceVersion>("source-version", w, vid);
    ensure(
      v.status === "ready",
      "SOURCE_NOT_READY",
      "Wait until selected sources finish extraction",
    );
    const source = s.get<Source>("source", w, v.sourceId);
    ensure(
      canSubmit(s, w, source.classification),
      "DATA_POLICY",
      `${source.name} is ${source.classification} and is not permitted for AI submission`,
      403,
    );
    classification = mostRestricted(classification, source.classification);
  }
  let size = JSON.stringify(objects).length + task.question.length;
  const evidence: Evidence[] = [];
  for (const e of s
    .list<Evidence>("evidence", w)
    .filter((e) => versions.has(e.sourceVersionId))) {
    if (size + e.excerpt.length > 70000) {
      exclusions.push(`Evidence ${e.id} omitted by context size limit`);
      continue;
    }
    evidence.push(e);
    size += e.excerpt.length;
  }
  for (const aid of task.inputArtifactIds) {
    const a = s.get<Artifact>("artifact", w, aid);
    ensure(
      a.review === "accepted",
      "ARTIFACT_NOT_ACCEPTED",
      "Select accepted input artifacts",
    );
    ensure(
      canSubmit(s, w, a.manifest.classification),
      "DATA_POLICY",
      "Input artifact policy blocks submission",
      403,
    );
    classification = mostRestricted(classification, a.manifest.classification);
  }
  const plan: ContextPlan = {
    id: id(),
    workspaceId: w,
    task,
    contextVersionId: ws.headId,
    sourceVersionIds: [...versions],
    elementRevisionIds: objects.map((o) => o.revisionId),
    evidenceIds: evidence.map((e) => e.id),
    inputArtifactIds: task.inputArtifactIds,
    exclusions,
    estimatedCharacters: size,
    promptVersion: "tracework-1",
    schemaVersion: "1",
    assemblyVersion: "1",
    classification,
    policyRevision: ws.settings.revision,
    extensions: [],
  };
  s.insert("context-plan", w, plan);
  return plan;
}
export function enforcePlan(s: Store, w: string, plan: ContextPlan) {
  const ws = s.getWorkspace(w);
  if (plan.task.question)
    ensure(
      ws.settings.allowInternalAI,
      "DATA_POLICY",
      "Internal question submission is disabled",
      403,
    );
  for (const vid of [...plan.sourceVersionIds, ...plan.extensions]) {
    const v = s.get<SourceVersion>("source-version", w, vid);
    const source = s.get<Source>("source", w, v.sourceId);
    ensure(
      canSubmit(s, w, source.classification),
      "DATA_POLICY",
      "Current policy blocks this saved context",
      403,
    );
  }
  const objects = s
    .snapshot(w, plan.contextVersionId)
    .objects.filter((o) => plan.elementRevisionIds.includes(o.revisionId));
  for (const o of objects)
    ensure(
      canSubmit(s, w, objectClassification(s, w, o)),
      "DATA_POLICY",
      "Current policy blocks saved model context",
      403,
    );
  for (const aid of plan.inputArtifactIds) {
    const a = s.get<Artifact>("artifact", w, aid);
    ensure(
      canSubmit(s, w, a.manifest.classification),
      "DATA_POLICY",
      "Artifact submission is no longer permitted",
      403,
    );
    for (const eid of a.manifest.evidenceIds)
      ensure(
        canSubmit(s, w, classificationOfEvidence(s, w, [eid])),
        "DATA_POLICY",
        "Artifact source policy has changed",
        403,
      );
  }
  return objects;
}
export function planEvidence(
  s: Store,
  w: string,
  plan: ContextPlan,
  eid: string,
) {
  enforcePlan(s, w, plan);
  const e = validEvidence(s, w, eid);
  ensure(
    plan.evidenceIds.includes(eid) ||
      plan.extensions.includes(e.sourceVersionId),
    "OUT_OF_SCOPE",
    "Evidence is outside the authorized source scope",
    403,
  );
  return e;
}
