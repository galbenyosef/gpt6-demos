import { z } from "zod";

export const Classification = z.enum(["public", "internal", "restricted"]);
export type Classification = z.infer<typeof Classification>;
export const Assertion = z.enum(["source-stated", "inferred", "human-assumed"]);
export const elementTypes = [
  "actor",
  "capability",
  "requirement",
  "user-story",
  "domain-concept",
  "domain-event",
  "policy",
  "invariant",
  "bounded-context",
  "quality-attribute",
  "constraint",
  "software-system",
  "container",
  "component",
  "interface",
  "risk",
  "assumption",
  "open-question",
] as const;
export const relationshipTypes = [
  "contains",
  "depends-on",
  "uses",
  "realizes",
  "constrains",
  "communicates-with",
  "produces",
  "consumes",
  "conflicts-with",
] as const;
export const guardrailTypes = [
  "require-evidence",
  "interface-change-needs-decision",
  "require-requirement-mapping",
  "forbid-context-dependency",
  "require-quality-attribute",
  "advisory-architecture-review",
] as const;
const Id = z.string().min(1).max(200);
const text = z.string().max(40000);
const common = {
  name: z.string().min(1).max(240),
  description: text,
  classification: Classification,
  assertion: Assertion,
  evidenceIds: z.array(Id).max(100),
  evidenceException: z.string().max(2000).optional(),
};
const attributes = z
  .object({
    aliases: z.array(z.string()).optional(),
    definition: text.optional(),
    owner: z.string().optional(),
    acceptanceCriteria: z.array(text).optional(),
    priority: z.enum(["must", "should", "could"]).optional(),
    technology: z.string().optional(),
    protocol: z.string().optional(),
    responsibilities: z.array(text).optional(),
    metric: z.string().optional(),
    threshold: z.string().optional(),
    question: text.optional(),
    resolution: text.optional(),
  })
  .strict();
export const Element = z
  .object({
    kind: z.literal("element"),
    type: z.enum(elementTypes),
    ...common,
    attributes,
  })
  .strict();
export const Relationship = z
  .object({
    kind: z.literal("relationship"),
    type: z.enum(relationshipTypes),
    from: Id,
    to: Id,
    ...common,
    attributes: z
      .object({ label: z.string().optional(), protocol: z.string().optional() })
      .strict(),
  })
  .strict();
export const Decision = z
  .object({
    kind: z.literal("decision"),
    ...common,
    context: text,
    alternatives: z.array(text).min(1),
    chosen: text,
    consequences: z.array(text),
    elementIds: z.array(Id),
    risks: z.array(text),
    author: z.string(),
  })
  .strict();
export const Guardrail = z
  .object({
    kind: z.literal("guardrail"),
    ...common,
    evaluator: z.enum(guardrailTypes),
    enabled: z.boolean(),
    severity: z.enum(["warn", "approval-required", "block"]),
    parameters: z
      .object({
        from: Id.optional(),
        to: Id.optional(),
        quality: z.string().optional(),
      })
      .strict(),
    scope: z.array(Id),
  })
  .strict();
export const Semantic = z.discriminatedUnion("kind", [
  Element,
  Relationship,
  Decision,
  Guardrail,
]);
export type Semantic = z.infer<typeof Semantic>;
export type ObjectRevision = Semantic & {
  id: string;
  revisionId: string;
  workspaceId: string;
  createdAt: string;
};
const create = z
  .object({ id: Id, action: z.literal("create"), localId: Id, value: Semantic })
  .strict();
const update = z
  .object({
    id: Id,
    action: z.literal("update"),
    targetId: Id,
    value: Semantic,
  })
  .strict();
const supersede = z
  .object({ id: Id, action: z.literal("supersede"), targetId: Id })
  .strict();
export const Operation = z.discriminatedUnion("action", [
  create,
  update,
  supersede,
]);
export type Operation = z.infer<typeof Operation>;
export const Operations = z.array(Operation).min(1).max(500);
export const Command = z
  .object({
    expectedContextVersionId: Id,
    idempotencyKey: Id,
    reason: z.string().min(1).max(2000),
    operations: Operations,
  })
  .strict();
export const WorkspaceInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().max(2000).default(""),
  })
  .strict();
export const WorkspaceSettings = z
  .object({ allowInternalAI: z.boolean(), reason: z.string().min(1).max(2000) })
  .strict();
export const AcceptInput = z
  .object({
    expectedContextVersionId: Id,
    idempotencyKey: Id,
    selectedOperationIds: z.array(Id).min(1).optional(),
    reason: z.string().min(1).max(2000),
    evidenceExceptions: z
      .record(z.string(), z.string().min(1).max(2000))
      .default({}),
  })
  .strict();
export const ProposalInput = z
  .object({
    title: z.string().min(1).max(240),
    kind: z.enum(["interpretation", "architecture", "remediation", "revision"]),
    baseVersionId: Id,
    operations: Operations,
    rationale: text,
    critic: z.array(text).default([]),
  })
  .strict();
export type Proposal = z.infer<typeof ProposalInput> & {
  id: string;
  workspaceId: string;
  status: "pending" | "accepted" | "rejected" | "superseded";
  createdAt: string;
  derivedFrom?: string;
  runId?: string;
  comment?: string;
  resultVersionId?: string;
};
export type Workspace = {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  headId: string;
  settings: { allowInternalAI: boolean; revision: number };
  example: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Version = {
  id: string;
  workspaceId: string;
  sequence: number;
  parentId: string | null;
  reason: string;
  actor: string;
  createdAt: string;
  hash: string;
};
export type Snapshot = { version: Version; objects: ObjectRevision[] };
export type Source = {
  id: string;
  workspaceId: string;
  name: string;
  kind: string;
  authority: "authoritative" | "supporting" | "informal";
  classification: Classification;
  status: "active" | "archived";
  latestVersionId: string | null;
  createdAt: string;
};
export type Locator = {
  kind: "lines" | "page" | "block" | "pointer" | "csv" | "git";
  start: number;
  end: number;
  page?: number;
  block?: string;
  pointer?: string;
  row?: number;
  column?: string;
  commit?: string;
  path?: string;
  repositoryId?: string;
};
export type ExtractedBlock = { text: string; locator: Locator };
export type SourceVersion = {
  id: string;
  workspaceId: string;
  sourceId: string;
  ordinal: number;
  hash: string;
  extractedHash?: string;
  extractionId: string;
  extractorVersion: string;
  status: "queued" | "extracting" | "indexing" | "ready" | "failed";
  warnings: string[];
  error?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};
export type Evidence = {
  id: string;
  workspaceId: string;
  sourceVersionId: string;
  sourceId: string;
  extractionId: string;
  locator: Locator;
  excerpt: string;
  hash: string;
};
export const ArtifactKind = z.enum([
  "specification",
  "architecture-report",
  "openapi",
  "json-schema",
  "test-plan",
  "implementation-package",
  "service-module",
  "validation-report",
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;
export const TaskInput = z
  .object({
    kind: z.enum([
      "interpretation",
      "question",
      "architecture",
      "revision",
      "remediation",
      "artifact",
      "code",
    ]),
    sourceVersionIds: z.array(Id).max(100).default([]),
    elementIds: z.array(Id).max(500).default([]),
    question: z.string().max(10000).default(""),
    proposalId: Id.optional(),
    findingIds: z.array(Id).optional(),
    artifactKind: ArtifactKind.optional(),
    inputArtifactIds: z.array(Id).default([]),
    expectedContextVersionId: Id,
  })
  .strict();
export type TaskInput = z.infer<typeof TaskInput>;
export type ContextPlan = {
  id: string;
  workspaceId: string;
  task: TaskInput;
  contextVersionId: string;
  sourceVersionIds: string[];
  elementRevisionIds: string[];
  evidenceIds: string[];
  inputArtifactIds: string[];
  exclusions: string[];
  estimatedCharacters: number;
  promptVersion: string;
  schemaVersion: string;
  assemblyVersion: string;
  classification: Classification;
  policyRevision: number;
  extensions: string[];
};
export type RunStatus =
  | "queued"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled";
export type Run = {
  id: string;
  workspaceId: string;
  kind: string;
  status: RunStatus;
  payload: Record<string, unknown>;
  attempt: number;
  leaseToken: number;
  leaseOwner: string | null;
  leaseExpiry: number | null;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
  model?: string;
  planId?: string;
  error?: { code: string; message: string };
  result?: unknown;
  usage?: unknown;
  sdkState?: string;
  sdkStateHash?: string;
  approval?: unknown;
  approvalDecision?: { approved: boolean; stateHash: string };
  recorded?: boolean;
};
export type Manifest = {
  workspaceId: string;
  contextVersionId: string;
  objectRevisions: Record<string, string>;
  sourceVersions: Record<string, string>;
  evidenceIds: string[];
  inputArtifacts: Record<string, string>;
  scope: "selected-objects" | "selected-subgraph" | "whole-workspace";
  classification: Classification;
  runtime: string;
  sdkVersion: string;
  model: string | null;
  runId: string | null;
  templateVersion: string;
  promptVersion: string;
  schemaVersion: string;
  generatedAt: string;
  missingChecks: string[];
  lineage?: string;
  repositoryReferences?: unknown[];
};
export type Check = {
  id: string;
  origin: "deterministic" | "advisory" | "staleness";
  result: "pass" | "warn" | "approval-required" | "block" | "not-run";
  message: string;
  objectIds: string[];
};
export type Artifact = {
  id: string;
  artifactId: string;
  workspaceId: string;
  ordinal: number;
  kind: ArtifactKind;
  name: string;
  hash: string;
  contentType: string;
  manifest: Manifest;
  checks: Check[];
  review: "draft" | "reviewed" | "accepted" | "superseded";
  createdAt: string;
  execution?: { hash: string; passed: boolean; runId: string; checks: Check[] };
};
export type Finding = Check & {
  checkId?: string;
  workspaceId: string;
  validationRunId: string;
  baselineId: string;
  comparisonId: string;
  disposition: "open" | "resolved" | "dismissed" | "accepted-risk";
  comment?: string;
  paths?: string[][];
};
export const GeneratedFiles = z
  .array(
    z
      .object({ path: z.string().min(1), content: z.string().max(150000) })
      .strict(),
  )
  .min(1)
  .max(40);
export const SceneInput = z
  .object({
    projection: z
      .enum(["semantic", "context-map", "c4-context", "c4-container"])
      .default("semantic"),
    expectedSceneRevision: z.number().int().min(0),
    contextVersionId: Id,
    elements: z.array(z.unknown()).max(5000),
    name: z.string().min(1).max(100),
    hiddenIds: z.array(Id).default([]),
  })
  .strict();
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(code, message, status);
}
