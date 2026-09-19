import {
  Command,
  ProposalInput,
  AcceptInput,
  Semantic,
  ensure,
  WorkspaceInput,
} from "../../../../packages/contracts";
import type {
  Operation,
  ObjectRevision,
  Workspace,
  Version,
  Proposal,
  Evidence,
  SourceVersion,
  Check,
  ExtractedBlock,
} from "../../../../packages/contracts";
import { Store, id, now, hash, encode } from "../storage/store";
export function createWorkspace(s: Store, input: unknown, example = false) {
  const data = WorkspaceInput.parse(input);
  const w: Workspace = {
    ...data,
    id: id(),
    status: "active",
    headId: id(),
    example,
    settings: { allowInternalAI: false, revision: 0 },
    createdAt: now(),
    updatedAt: now(),
  };
  s.tx(() => {
    s.putWorkspace(w);
    s.saveVersion(
      {
        id: w.headId,
        workspaceId: w.id,
        sequence: 0,
        parentId: null,
        actor: "human",
        reason: "Workspace created",
        createdAt: now(),
        hash: hash("[]"),
      },
      [],
    );
    s.audit(w.id, "workspace.created", { name: w.name });
  });
  return w;
}
export function assertHead(s: Store, w: string, expected: string) {
  const ws = s.getWorkspace(w);
  ensure(
    ws.headId === expected,
    "STALE_CONTEXT",
    "The accepted model changed. Reload and review the current version before saving.",
    409,
  );
  ensure(
    ws.status === "active",
    "ARCHIVED",
    "Unarchive this workspace before editing",
    409,
  );
  return ws;
}
export function validEvidence(s: Store, w: string, eid: string) {
  const e = s.get<Evidence>("evidence", w, eid);
  const v = s.get<SourceVersion>("source-version", w, e.sourceVersionId);
  ensure(
    v.status === "ready" &&
      e.sourceId === v.sourceId &&
      e.extractionId === v.extractionId &&
      hash(e.excerpt) === e.hash,
    "INVALID_EVIDENCE",
    "Evidence does not resolve to its immutable extraction",
  );
  ensure(
    v.extractedHash,
    "INVALID_EVIDENCE",
    "The immutable extraction is missing",
  );
  const blocks = JSON.parse(
    s.verifiedBlob(v.extractedHash).toString(),
  ) as ExtractedBlock[];
  const expectedLocator = (b: ExtractedBlock) =>
    v.metadata.commit && v.metadata.path
      ? {
          ...b.locator,
          kind: "git",
          commit: String(v.metadata.commit),
          path: String(v.metadata.path),
          repositoryId: String(v.metadata.repositoryId),
        }
      : b.locator;
  ensure(
    blocks.some(
      (b) =>
        b.text === e.excerpt &&
        encode(expectedLocator(b)) === encode(e.locator),
    ),
    "INVALID_EVIDENCE",
    "Evidence text and locator must resolve to an exact extracted passage",
  );
  return e;
}
const architecture = new Set([
  "software-system",
  "container",
  "component",
  "interface",
]);
function endpoints(r: ObjectRevision, a: ObjectRevision, b: ObjectRevision) {
  ensure(
    a.kind === "element" && b.kind === "element",
    "INVALID_ENDPOINT",
    "Relationships must connect active elements",
  );
  if (r.kind !== "relationship") return;
  if (r.type === "contains")
    ensure(
      [
        "bounded-context",
        "software-system",
        "container",
        "component",
        "capability",
      ].includes(a.type),
      "INVALID_ENDPOINT",
      "Containment must start at a boundary, system, container, component, or capability",
    );
  if (r.type === "produces" || r.type === "consumes")
    ensure(
      b.type === "domain-event",
      "INVALID_ENDPOINT",
      "Produces/consumes must target a domain event",
    );
  if (r.type === "realizes")
    ensure(
      ["requirement", "capability", "user-story", "quality-attribute"].includes(
        b.type,
      ),
      "INVALID_ENDPOINT",
      "Realizes must target a requirement, capability, user story, or quality attribute",
    );
  if (r.type === "constrains")
    ensure(
      ["constraint", "policy", "invariant", "quality-attribute"].includes(
        a.type,
      ),
      "INVALID_ENDPOINT",
      "Constrains must start at a constraint, policy, invariant, or quality attribute",
    );
  if (r.type === "communicates-with")
    ensure(
      (architecture.has(a.type) || a.type === "actor") &&
        (architecture.has(b.type) || b.type === "actor"),
      "INVALID_ENDPOINT",
      "Communication must connect architecture objects or actors",
    );
}
export function validateGraph(
  s: Store,
  w: string,
  objects: ObjectRevision[],
): Check[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const o of objects) {
    const { id: oid, revisionId, workspaceId, createdAt, ...value } = o;
    Semantic.parse(value);
    for (const e of o.evidenceIds) validEvidence(s, w, e);
    ensure(
      o.assertion === "human-assumed" ||
        o.evidenceIds.length ||
        o.evidenceException?.trim(),
      "EVIDENCE_REQUIRED",
      `${o.name} needs evidence or an explicit human exception`,
    );
    if (o.kind === "element") {
      if (o.attributes.aliases || o.attributes.definition)
        ensure(
          o.type === "domain-concept",
          "INVALID_ATTRIBUTES",
          "Glossary definitions and aliases belong to domain concepts",
        );
      if (o.attributes.technology)
        ensure(
          architecture.has(o.type),
          "INVALID_ATTRIBUTES",
          "Technology belongs to architecture elements",
        );
    }
    if (o.kind === "relationship") {
      const a = byId.get(o.from),
        b = byId.get(o.to);
      ensure(
        a && b,
        "DANGLING_REFERENCE",
        `${o.name} has an endpoint outside the resulting model`,
      );
      endpoints(o, a, b);
    }
    if (o.kind === "decision")
      for (const e of o.elementIds)
        ensure(
          byId.get(e)?.kind === "element",
          "DANGLING_REFERENCE",
          "Decision refers to a missing element",
        );
    if (o.kind === "guardrail")
      for (const e of [...o.scope, o.parameters.from, o.parameters.to].filter(
        Boolean,
      ) as string[])
        ensure(
          byId.has(e),
          "DANGLING_REFERENCE",
          "Guardrail refers to a missing object",
        );
  }
  const checks: Check[] = [];
  for (const g of objects.filter((o) => o.kind === "guardrail" && o.enabled)) {
    if (g.kind !== "guardrail") continue;
    let ok = true,
      msg = "Configured rule passed";
    if (g.evaluator === "forbid-context-dependency") {
      ok = !objects.some(
        (o) =>
          o.kind === "relationship" &&
          o.type === "depends-on" &&
          o.from === g.parameters.from &&
          o.to === g.parameters.to,
      );
      msg = ok
        ? "No forbidden dependency"
        : "A forbidden bounded-context dependency exists";
    }
    if (g.evaluator === "require-quality-attribute") {
      const qualities = objects.filter(
        (o) =>
          o.kind === "element" &&
          o.type === "quality-attribute" &&
          (!g.parameters.quality ||
            o.name.toLowerCase().includes(g.parameters.quality.toLowerCase())),
      );
      ok =
        qualities.length > 0 &&
        g.scope.every((scopeId) =>
          qualities.some((quality) =>
            objects.some(
              (edge) =>
                edge.kind === "relationship" &&
                ((edge.from === quality.id && edge.to === scopeId) ||
                  (edge.to === quality.id && edge.from === scopeId)),
            ),
          ),
        );
      msg = ok
        ? "Quality attribute present"
        : "Required quality attribute is missing";
    }
    if (g.evaluator === "require-requirement-mapping") {
      checks.push({
        id: g.id,
        origin: "deterministic",
        result: "not-run",
        message:
          "Requirement mapping is checked on generated test plans and implementation packages, not inferred from the model alone.",
        objectIds: g.scope,
      });
      continue;
    }
    if (g.evaluator === "advisory-architecture-review") {
      checks.push({
        id: g.id,
        origin: "advisory",
        result: "not-run",
        message: "Advisory architecture review requires an explicit AI run",
        objectIds: g.scope,
      });
      continue;
    }
    checks.push({
      id: g.id,
      origin: "deterministic",
      result: ok ? "pass" : g.severity,
      message: msg,
      objectIds: g.scope,
    });
  }
  return checks;
}
function resulting(s: Store, w: string, base: string, ops: Operation[]) {
  const map = new Map(s.snapshot(w, base).objects.map((o) => [o.id, o]));
  const locals = new Map<string, string>();
  const opIds = new Set<string>();
  for (const op of ops) {
    ensure(
      !opIds.has(op.id),
      "DUPLICATE_OPERATION",
      "Operation identifiers must be unique",
    );
    opIds.add(op.id);
    if (op.action === "create") {
      ensure(
        !locals.has(op.localId) && !map.has(op.localId),
        "DUPLICATE_REFERENCE",
        "Local references must be unique",
      );
      locals.set(op.localId, id());
    }
  }
  const ref = (r: string) => locals.get(r) ?? r;
  for (const op of ops) {
    if (op.action === "supersede") {
      ensure(
        map.has(op.targetId),
        "NOT_FOUND",
        "Cannot supersede a missing object",
      );
      map.delete(op.targetId);
      continue;
    }
    const value = structuredClone(op.value);
    if (value.kind === "relationship") {
      value.from = ref(value.from);
      value.to = ref(value.to);
    }
    if (value.kind === "decision") value.elementIds = value.elementIds.map(ref);
    if (value.kind === "guardrail") {
      value.scope = value.scope.map(ref);
      if (value.parameters.from)
        value.parameters.from = ref(value.parameters.from);
      if (value.parameters.to) value.parameters.to = ref(value.parameters.to);
    }
    const oid = op.action === "create" ? locals.get(op.localId)! : op.targetId;
    if (op.action === "update") {
      const previous = map.get(oid);
      ensure(
        previous,
        "NOT_FOUND",
        "Cannot edit an object outside the accepted snapshot",
      );
      ensure(
        previous.kind === value.kind,
        "INVALID_TYPE_CHANGE",
        "An object cannot change its semantic kind",
      );
    }
    map.set(oid, {
      ...value,
      id: oid,
      revisionId: id(),
      workspaceId: w,
      createdAt: now(),
    });
  }
  const objects = [...map.values()];
  const checks = validateGraph(s, w, objects);
  ensure(
    !checks.some(
      (c) => c.result === "block" || c.result === "approval-required",
    ),
    "GUARDRAIL_BLOCK",
    "A configured guardrail blocks this change",
  );
  const changedInterfaces = ops.some(
    (o) =>
      o.action === "update" &&
      o.value.kind === "element" &&
      o.value.type === "interface",
  );
  if (
    changedInterfaces &&
    objects.some(
      (o) =>
        o.kind === "guardrail" &&
        o.enabled &&
        o.evaluator === "interface-change-needs-decision",
    )
  )
    ensure(
      ops.some((o) => o.action !== "supersede" && o.value.kind === "decision"),
      "DECISION_REQUIRED",
      "Interface changes require an accompanying decision",
    );
  return { objects, locals: Object.fromEntries(locals), checks };
}
function commit(
  s: Store,
  w: string,
  expected: string,
  operations: Operation[],
  reason: string,
  actor = "human",
) {
  const ws = assertHead(s, w, expected);
  const { objects, locals, checks } = resulting(s, w, expected, operations);
  const parent = s.version(w, expected);
  const v: Version = {
    id: id(),
    workspaceId: w,
    sequence: parent.sequence + 1,
    parentId: expected,
    reason,
    actor,
    createdAt: now(),
    hash: hash(encode(objects.map((o) => [o.id, o.revisionId]).sort())),
  };
  s.saveVersion(v, objects);
  s.putWorkspace({ ...ws, headId: v.id, updatedAt: now() });
  for (const o of objects)
    s.index(w, o.revisionId, "object", v.id, `${o.name} ${o.description}`);
  s.audit(
    w,
    "context.accepted",
    { before: expected, after: v.id, reason, operations, locals },
    actor,
  );
  return { version: v, locals, checks };
}
export function humanCommand(
  s: Store,
  w: string,
  input: unknown,
  failAfterCommit = false,
) {
  const command = Command.parse(input);
  return s.tx(() => {
    const replay = s.replay<ReturnType<typeof commit>>(
      w,
      command.idempotencyKey,
      command,
    );
    if (replay) return replay;
    const result = commit(
      s,
      w,
      command.expectedContextVersionId,
      command.operations,
      command.reason,
    );
    if (failAfterCommit) throw new Error("Injected transaction failure");
    s.remember(w, command.idempotencyKey, command, result);
    return result;
  });
}
export function createProposal(
  s: Store,
  w: string,
  input: unknown,
  meta: Partial<Pick<Proposal, "derivedFrom" | "runId">> = {},
) {
  const data = ProposalInput.parse(input);
  s.version(w, data.baseVersionId);
  if (meta.runId) {
    const prior = s
      .list<Proposal>("proposal", w)
      .find(
        (p) =>
          p.runId === meta.runId && encode(pickProposal(p)) === encode(data),
      );
    if (prior) return prior;
  }
  const p: Proposal = {
    ...data,
    ...meta,
    id: id(),
    workspaceId: w,
    status: "pending",
    createdAt: now(),
  };
  s.insert("proposal", w, p);
  s.audit(
    w,
    "proposal.created",
    { proposalId: p.id, derivedFrom: p.derivedFrom },
    meta.runId ? "agent" : "human",
  );
  return p;
}
export function inspectProposal(s: Store, w: string, p: Proposal) {
  let checks: Check[] = [];
  try {
    checks = resulting(s, w, p.baseVersionId, p.operations).checks;
  } catch (e) {
    checks = [
      {
        id: "structure",
        origin: "deterministic",
        result: "block",
        message: (e as Error).message,
        objectIds: [],
      },
    ];
  }
  return {
    ...p,
    freshness:
      p.baseVersionId === s.getWorkspace(w).headId ? "current" : "stale",
    checks,
  };
}
export function deriveProposal(
  s: Store,
  w: string,
  pid: string,
  input: unknown,
) {
  const p = s.get<Proposal>("proposal", w, pid);
  ensure(
    p.status === "pending",
    "REVIEW_CONFLICT",
    "Only pending proposals may be revised",
    409,
  );
  return s.tx(() => {
    const derived = createProposal(s, w, input, { derivedFrom: p.id });
    s.update("proposal", w, { ...p, status: "superseded" });
    return derived;
  });
}
export function rejectProposal(
  s: Store,
  w: string,
  pid: string,
  reason: string,
) {
  ensure(reason.trim(), "REASON_REQUIRED", "Add a review comment");
  const p = s.get<Proposal>("proposal", w, pid);
  ensure(
    p.status === "pending",
    "REVIEW_CONFLICT",
    "This proposal has already been reviewed",
    409,
  );
  s.tx(() => {
    s.update("proposal", w, { ...p, status: "rejected", comment: reason });
    s.audit(w, "proposal.rejected", { id: pid, reason });
  });
  return { ok: true };
}
export function acceptProposal(
  s: Store,
  w: string,
  pid: string,
  input: unknown,
) {
  const c = AcceptInput.parse(input);
  const payload = { pid, ...c };
  return s.tx(() => {
    const replay = s.replay(w, c.idempotencyKey, payload);
    if (replay) return replay;
    const p = s.get<Proposal>("proposal", w, pid);
    ensure(
      p.status === "pending",
      "REVIEW_CONFLICT",
      "This proposal has already been reviewed",
      409,
    );
    assertHead(s, w, c.expectedContextVersionId);
    ensure(
      p.baseVersionId === c.expectedContextVersionId,
      "STALE_PROPOSAL",
      "Revalidate this proposal against the current model, then review its new diff",
      409,
    );
    const selected = c.selectedOperationIds
      ? new Set(c.selectedOperationIds)
      : new Set(p.operations.map((o) => o.id));
    ensure(
      [...selected].every((oid) => p.operations.some((o) => o.id === oid)),
      "INVALID_SELECTION",
      "Unknown proposal operation",
    );
    const ops = p.operations
      .filter((o) => selected.has(o.id))
      .map((o) => {
        if (o.action === "supersede") return o;
        const reason = c.evidenceExceptions[o.id];
        return reason
          ? { ...o, value: { ...o.value, evidenceException: reason } }
          : o;
      });
    ensure(ops.length, "EMPTY_SELECTION", "Select at least one operation");
    const result = commit(s, w, c.expectedContextVersionId, ops, c.reason);
    let accepted = p;
    let remainder: Proposal | null = null;
    if (ops.length < p.operations.length) {
      accepted = createProposal(
        s,
        w,
        { ...ProposalInput.parse(pickProposal(p)), operations: ops },
        { derivedFrom: p.id, runId: p.runId },
      );
      s.update("proposal", w, { ...p, status: "superseded" });
      const remaining = p.operations
        .filter((o) => !selected.has(o.id))
        .map((o) => remapOperation(o, result.locals));
      remainder = createProposal(
        s,
        w,
        {
          ...pickProposal(p),
          title: `Remaining: ${p.title}`,
          baseVersionId: result.version.id,
          operations: remaining,
        },
        { derivedFrom: p.id, runId: p.runId },
      );
    }
    s.update("proposal", w, {
      ...accepted,
      status: "accepted",
      comment: c.reason,
      resultVersionId: result.version.id,
    });
    s.audit(w, "proposal.accepted", {
      proposalId: accepted.id,
      sourceProposalId: p.id,
      selected: [...selected],
      resultVersionId: result.version.id,
    });
    const followup: Run = {
      id: id(),
      workspaceId: w,
      kind: "validate",
      status: "queued",
      payload: { contextVersionId: result.version.id },
      attempt: 0,
      leaseToken: 0,
      leaseOwner: null,
      leaseExpiry: null,
      cancelRequested: false,
      createdAt: now(),
      updatedAt: now(),
    };
    s.insert("run", w, followup);
    const outcome = {
      ...result,
      proposalId: accepted.id,
      remainderId: remainder?.id ?? null,
    };
    s.remember(w, c.idempotencyKey, payload, outcome);
    return outcome;
  });
}
import type { Run } from "../../../../packages/contracts";
export function pickProposal(p: Proposal) {
  return {
    title: p.title,
    kind: p.kind,
    baseVersionId: p.baseVersionId,
    operations: p.operations,
    rationale: p.rationale,
    critic: p.critic,
  };
}
function remapOperation(o: Operation, ids: Record<string, string>): Operation {
  const op = structuredClone(o);
  if (op.action !== "create") op.targetId = ids[op.targetId] ?? op.targetId;
  if (op.action !== "supersede") {
    if (op.value.kind === "relationship") {
      op.value.from = ids[op.value.from] ?? op.value.from;
      op.value.to = ids[op.value.to] ?? op.value.to;
    }
    if (op.value.kind === "decision")
      op.value.elementIds = op.value.elementIds.map((x) => ids[x] ?? x);
  }
  return op;
}
export function diffVersions(s: Store, w: string, from: string, to: string) {
  const a = s.snapshot(w, from),
    b = s.snapshot(w, to);
  const ai = new Map(a.objects.map((o) => [o.id, o]));
  const bi = new Map(b.objects.map((o) => [o.id, o]));
  return {
    from: a.version,
    to: b.version,
    changes: [...new Set([...ai.keys(), ...bi.keys()])]
      .filter((k) => ai.get(k)?.revisionId !== bi.get(k)?.revisionId)
      .map((k) => ({
        id: k,
        before: ai.get(k) ?? null,
        after: bi.get(k) ?? null,
      })),
  };
}
