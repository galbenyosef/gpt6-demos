import { join } from "node:path";
import { Store, id, now } from "../storage/store";
import { createWorkspace, humanCommand, createProposal } from "./model";
import { ingest, extractVersion } from "./sources";
import { checkpoint } from "./backups";
import { generateArtifact, reviewArtifact } from "./artifacts";
import { ensure } from "../../../../packages/contracts";
import type {
  Evidence,
  Operation,
  ObjectRevision,
  Source,
  Run,
  Workspace,
} from "../../../../packages/contracts";
const fixtureRoot = join(import.meta.dir, "../../../../fixtures/service-desk");
export async function seed(s: Store) {
  const w = createWorkspace(
    s,
    {
      name: "Neighborhood repair service",
      description:
        "A fictional repair scheduling project. Trace a customer brief through decisions, contracts, and a changing requirement.",
    },
    true,
  );
  const sources: Record<
    string,
    { sourceId: string; versionId: string; evidenceIds: string[] }
  > = {};
  for (const name of [
    "customer-brief.md",
    "existing-api.json",
    "stakeholder-notes.md",
    "engineering-constraints.md",
    "glossary.md",
  ]) {
    const result = await ingest(
      s,
      w.id,
      name,
      new Uint8Array(await Bun.file(join(fixtureRoot, name)).arrayBuffer()),
      {
        classification: "public",
        authority:
          name === "customer-brief.md" ? "authoritative" : "supporting",
      },
    );
    if ("runId" in result && result.runId) {
      const r = s.get<Run>("run", w.id, result.runId);
      s.update("run", w.id, {
        ...r,
        status: "completed",
        recorded: true,
        result: { message: "Example checkpoint extraction" },
      });
    }
    await extractVersion(
      s,
      w.id,
      result.version.id,
      new AbortController().signal,
      () => {},
    );
    sources[name] = {
      sourceId: result.source.id,
      versionId: result.version.id,
      evidenceIds: s
        .list<Evidence>("evidence", w.id)
        .filter((e) => e.sourceVersionId === result.version.id)
        .map((e) => e.id),
    };
  }
  await checkpoint(s, w.id, "Imported sources");
  const ops: Operation[] = [];
  const add = (
    localId: string,
    type: any,
    name: string,
    description: string,
    source: string,
    attributes: Record<string, unknown> = {},
  ) =>
    ops.push({
      id: id(),
      action: "create",
      localId,
      value: {
        kind: "element",
        type,
        name,
        description,
        attributes,
        evidenceIds: sources[source]!.evidenceIds,
        assertion: "source-stated",
        classification: "public",
      } as any,
    });
  add(
    "resident",
    "actor",
    "Resident",
    "Requests a household repair and receives appointment updates.",
    "customer-brief.md",
  );
  add(
    "coordinator",
    "actor",
    "Coordinator",
    "Assigns available technicians and confirms appointment windows.",
    "customer-brief.md",
  );
  add(
    "appointment",
    "domain-concept",
    "Appointment",
    "A reserved window in which one technician visits a customer.",
    "customer-brief.md",
    {
      definition: "A reserved window of time for a repair visit.",
      aliases: ["Repair visit"],
    },
  );
  add(
    "technician",
    "domain-concept",
    "Technician",
    "A repair specialist with availability used by appointment scheduling.",
    "customer-brief.md",
    { definition: "A person assigned to perform the requested repair." },
  );
  add(
    "category",
    "domain-concept",
    "Repair category",
    "The kind of work requested; a classification of work, not a certification.",
    "glossary.md",
    {
      definition:
        "A classification such as plumbing, electrical work, or appliance repair.",
    },
  );
  add(
    "scheduling",
    "bounded-context",
    "Scheduling",
    "Owns appointment availability and technician assignments.",
    "engineering-constraints.md",
  );
  add(
    "communication",
    "bounded-context",
    "Customer communication",
    "Owns confirmation and arrival notifications.",
    "engineering-constraints.md",
  );
  add(
    "request",
    "requirement",
    "Request a repair",
    "Capture repair category, preferred date, address, and a contact method.",
    "customer-brief.md",
    {
      priority: "must",
      acceptanceCriteria: [
        "A resident can submit the required appointment details.",
      ],
    },
  );
  add(
    "assignment",
    "requirement",
    "Assign a technician",
    "The coordinator assigns an available technician to an appointment window.",
    "customer-brief.md",
    {
      priority: "must",
      acceptanceCriteria: [
        "A technician cannot have overlapping appointments.",
      ],
    },
  );
  add(
    "overlap",
    "invariant",
    "No overlapping assignments",
    "A technician cannot be assigned to overlapping appointment windows.",
    "customer-brief.md",
  );
  add(
    "notification",
    "domain-event",
    "Appointment confirmed",
    "An appointment window has been confirmed for the customer.",
    "customer-brief.md",
  );
  add(
    "privacy",
    "constraint",
    "Minimal customer data",
    "Retain only necessary contact data and limit access to assigned staff.",
    "engineering-constraints.md",
  );
  add(
    "audit",
    "quality-attribute",
    "Auditability",
    "Every assignment and state change has an audit record.",
    "engineering-constraints.md",
    { metric: "Audited state changes", threshold: "All" },
  );
  const rel = (
    localId: string,
    type: any,
    from: string,
    to: string,
    name: string,
    source = "customer-brief.md",
  ) =>
    ops.push({
      id: id(),
      action: "create",
      localId,
      value: {
        kind: "relationship",
        type,
        from,
        to,
        name,
        description: name,
        attributes: {},
        evidenceIds: sources[source]!.evidenceIds,
        assertion: "inferred",
        classification: "public",
      },
    });
  rel(
    "s-a",
    "contains",
    "scheduling",
    "appointment",
    "Scheduling owns appointments",
    "engineering-constraints.md",
  );
  rel(
    "s-t",
    "contains",
    "scheduling",
    "technician",
    "Scheduling manages assignments",
    "engineering-constraints.md",
  );
  rel(
    "ass-t",
    "uses",
    "assignment",
    "technician",
    "Assignment selects a technician",
  );
  rel(
    "ass-a",
    "uses",
    "assignment",
    "appointment",
    "Assignment reserves an appointment",
  );
  rel(
    "no-overlap",
    "constrains",
    "overlap",
    "assignment",
    "Prevent overlapping assignments",
  );
  rel(
    "confirmed",
    "produces",
    "scheduling",
    "notification",
    "Scheduling confirms appointments",
  );
  const model = humanCommand(s, w.id, {
    expectedContextVersionId: w.headId,
    idempotencyKey: id(),
    reason: "Example checkpoint: reviewed model from synthetic public sources",
    operations: ops,
  });
  await checkpoint(s, w.id, "Accepted model");
  const system: Operation = {
    id: id(),
    action: "create",
    localId: "system",
    value: {
      kind: "element",
      type: "software-system",
      name: "Repair service",
      description:
        "A small local system for scheduling repairs and notifying residents.",
      attributes: {},
      evidenceIds: sources["engineering-constraints.md"]!.evidenceIds,
      assertion: "inferred",
      classification: "public",
    },
  };
  const container: Operation = {
    id: id(),
    action: "create",
    localId: "application",
    value: {
      kind: "element",
      type: "container",
      name: "Service application",
      description: "A modular Bun application with local SQLite storage.",
      attributes: { technology: "Bun + SQLite" },
      evidenceIds: sources["engineering-constraints.md"]!.evidenceIds,
      assertion: "inferred",
      classification: "public",
    },
  };
  const decision: Operation = {
    id: id(),
    action: "create",
    localId: "adr-local",
    value: {
      kind: "decision",
      name: "Keep the first deployment local",
      description:
        "Use a modular monolith for the initial neighborhood office.",
      context:
        "Small local deployment with privacy and auditability constraints.",
      alternatives: [
        "Modular monolith with SQLite",
        "Separate scheduling and notification services",
      ],
      chosen: "Modular monolith with SQLite",
      consequences: [
        "Simple deployment and backup",
        "Keep scheduling and communication boundaries explicit",
        "Revisit deployment if usage changes",
      ],
      risks: ["A single process is a local availability dependency"],
      elementIds: ["system", "application", model.locals.scheduling!],
      author: "Example reviewer",
      evidenceIds: sources["engineering-constraints.md"]!.evidenceIds,
      assertion: "inferred",
      classification: "public",
    },
  };
  humanCommand(s, w.id, {
    expectedContextVersionId: model.version.id,
    idempotencyKey: id(),
    reason: "Example checkpoint: accepted architecture and ADR",
    operations: [
      system,
      container,
      decision,
      {
        id: id(),
        action: "create",
        localId: "sys-container",
        value: {
          kind: "relationship",
          type: "contains",
          from: "system",
          to: "application",
          name: "Hosts service application",
          description: "Local application container",
          attributes: {},
          evidenceIds: sources["engineering-constraints.md"]!.evidenceIds,
          assertion: "inferred",
          classification: "public",
        },
      },
    ],
  });
  await checkpoint(s, w.id, "Accepted architecture");
  const base = s.getWorkspace(w.id).headId;
  const e = sources["stakeholder-notes.md"]!.evidenceIds;
  createProposal(s, w.id, {
    title: "Resolve guest appointment requests",
    kind: "interpretation",
    baseVersionId: base,
    rationale:
      "The stakeholder request contradicts the existing API. Review the proposed guest path and record an ownership decision before implementation.",
    critic: [
      "The existing API requires a customerAccountId. Guest cancellation ownership is unresolved.",
    ],
    operations: [
      {
        id: id(),
        action: "create",
        localId: "guest",
        value: {
          kind: "element",
          type: "requirement",
          name: "Allow guest requests",
          description:
            "Residents can request a repair without registering an account; a contact method is still required.",
          attributes: { priority: "must" },
          evidenceIds: e,
          assertion: "source-stated",
          classification: "public",
        },
      },
      {
        id: id(),
        action: "create",
        localId: "guest-question",
        value: {
          kind: "element",
          type: "open-question",
          name: "How does a guest cancel?",
          description:
            "Decide how a guest proves ownership when cancelling a request.",
          attributes: {
            question: "How should cancellation ownership be verified?",
          },
          evidenceIds: e,
          assertion: "source-stated",
          classification: "public",
        },
      },
    ],
  });
  const artifactIds: string[] = [];
  for (const kind of [
    "specification",
    "openapi",
    "test-plan",
    "architecture-report",
  ]) {
    const a = await generateArtifact(s, w.id, { kind, contextVersionId: base });
    artifactIds.push(a.id);
  }
  await generateArtifact(s, w.id, {
    kind: "implementation-package",
    contextVersionId: base,
    inputArtifactIds: artifactIds,
  });
  await checkpoint(s, w.id, "Generated artifacts");
  const run: Run = {
    id: id(),
    workspaceId: w.id,
    kind: "recorded",
    recorded: true,
    status: "completed",
    payload: { label: "Recorded run — synthetic example" },
    attempt: 1,
    leaseToken: 0,
    leaseOwner: null,
    leaseExpiry: null,
    cancelRequested: false,
    createdAt: now(),
    updatedAt: now(),
    result: {
      summary:
        "Example model and architecture were prepared from the synthetic source pack. No fresh model call or execution was performed.",
    },
  };
  s.insert("run", w.id, run);
  for (const message of [
    "Read synthetic customer brief",
    "Identified mandatory-account / guest-request conflict",
    "Prepared reviewable proposal",
    "Human-reviewed model saved as an example checkpoint",
  ])
    s.event(run.id, { type: "recorded", message });
  return s.getWorkspace(w.id);
}
export async function introduceChange(s: Store, w: string) {
  ensure(
    s.getWorkspace(w).example,
    "NOT_EXAMPLE",
    "This action applies only to a labelled example workspace",
  );
  const source = s
    .list<Source>("source", w)
    .find((x) => x.name === "customer-brief.md");
  ensure(source, "NOT_FOUND", "Original example customer brief is missing");
  const result = await ingest(
    s,
    w,
    "customer-brief.md",
    new Uint8Array(
      await Bun.file(join(fixtureRoot, "changed-brief.md")).arrayBuffer(),
    ),
    { sourceId: source.id },
  );
  return result;
}
export async function resetExample(s: Store, w: string) {
  const ws = s.getWorkspace(w);
  ensure(ws.example, "NOT_EXAMPLE", "Reset refuses non-example workspaces");
  s.putWorkspace({ ...ws, status: "archived", updatedAt: now() });
  s.audit(w, "example.archived-for-reset", { workspaceId: w });
  return seed(s);
}
