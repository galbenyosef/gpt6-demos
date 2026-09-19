# Loom — Full Product Specification
**Status:** Draft v0.1  
**Date:** 2026-09-18  
**Purpose:** Product-first specification for a full Loom implementation developed independently of the AI Solution Engineering Campus.

---

## 0. Executive definition

**Loom is an agentic solution-engineering environment for turning heterogeneous foundational context into a governed, traceable, evolvable model of a software solution.**

It combines:

- source ingestion and evidence management;
- AI-assisted interpretation;
- a semantic graph as the canonical solution model;
- an Excalidraw-based collaborative canvas;
- human review and approval;
- strategic domain modelling;
- architecture derivation;
- decision and guardrail management;
- engineering-artifact generation;
- validation and drift detection;
- repository and runtime evidence integration.

Loom is not a diagramming tool with an AI chatbot attached. It is not a generic low-code platform, and it is not a code-generation frontend.

Its core purpose is to maintain a controlled chain:

```text
Sources and evidence
        ↓
AI interpretation
        ↓
Proposals
        ↓
Human review and approval
        ↓
Accepted semantic context
        ↓
Architecture, decisions and guardrails
        ↓
Generated engineering artifacts
        ↓
Implementation and runtime evidence
        ↓
Validation and drift
```

The authoritative object is the **accepted semantic context**, not the canvas, a chat transcript, generated documentation, or generated code.

---

# 1. Relationship to the Campus

The full Loom product is developed independently of the ten-session workshop implementation.

The Campus may use simplified or staged versions of the same concepts, but:

- the full product MUST NOT be constrained by the pedagogical sequence;
- the workshop repository MUST NOT be a required runtime dependency;
- the full product may contain capabilities before they are introduced in the Campus;
- the Campus may use reference checkpoints extracted from the full product where useful;
- product architecture decisions MUST be made on engineering merit, not because a concept is easier to teach.

The full product should nevertheless remain an executable reference for the central engineering principles taught in the Campus.

---

# 2. Product principles

## 2.1 Human authority over accepted meaning

AI may interpret, classify, propose, critique and generate.

AI MUST NOT silently mutate accepted semantic context, accepted architecture decisions, or enforceable guardrails.

A state-changing AI action MUST pass through an explicit deterministic application command and, where required, human approval.

## 2.2 Proposal before mutation

AI-originated changes to governed state MUST be represented as proposals.

A proposal is reviewable, explainable, traceable, versioned and either accepted, rejected, modified, expired or superseded.

## 2.3 Semantic model over visual representation

The canvas is a projection of the semantic model.

Moving a box changes visual state. Renaming a governed domain concept changes semantic state and therefore requires a semantic command or proposal path.

## 2.4 Evidence before assertion

Every AI-derived semantic claim SHOULD retain evidence linking it to one or more sources.

Where evidence is weak or contradictory, Loom SHOULD represent uncertainty rather than normalise it away.

## 2.5 Application-owned process, agent-owned bounded reasoning

Loom owns durable business/application workflow.

GitHub Copilot SDK owns bounded inner agent loops such as interpretation, critique, investigation and generation.

Copilot session state MUST NOT be the authoritative store for Loom workflow state.

## 2.6 Deterministic control where determinism is available

Permissions, state transitions, validation, schema enforcement, guardrail enforcement, access control, versioning and persistence MUST be implemented deterministically.

The model may advise on these concerns, but it MUST NOT be the only enforcement mechanism.

## 2.7 Strategic model before implementation pattern

Loom uses strategic DDD concepts to clarify meaning and boundaries.

It MUST NOT require generated code to mechanically implement tactical DDD patterns such as repositories, aggregates or entities.

The model defines semantics and constraints. Generated implementation is one execution form of that model.

## 2.8 Generated code is not the source of truth

Generated source code MAY be highly optimised or structurally different from the conceptual model.

It remains acceptable only when Loom can validate:

- behavioural requirements;
- interface contracts;
- invariants;
- guardrails;
- tests;
- traceability to accepted context and decisions.

---

# 3. Primary users

## 3.1 Solution Engineer

Creates and evolves the semantic solution model, architecture, decisions and artifacts.

Primary operations:

- ingest source material;
- review extracted concepts;
- edit semantic context;
- ask Loom to analyse impact;
- derive architecture;
- generate engineering artifacts;
- validate implementation.

## 3.2 Software Architect / Tech Lead

Focuses on boundaries, quality attributes, decisions, interfaces, alternatives and drift.

Primary operations:

- inspect domain model;
- propose architecture alternatives;
- approve ADRs;
- define guardrails;
- compare architecture with implementation.

## 3.3 Business Analyst / Product Analyst

Works primarily with functional context and domain meaning.

Primary operations:

- ingest requirements;
- manage stories and journeys;
- refine glossary;
- review ambiguity;
- validate relationships and evidence.

## 3.4 Developer

Consumes accepted design and generated artifacts and feeds implementation evidence back into Loom.

Primary operations:

- inspect relevant context;
- generate contracts/tests/skeletons;
- link repository elements;
- resolve validation findings.

## 3.5 Reviewer / Approver

Reviews proposals and decisions without necessarily editing implementation.

Primary operations:

- accept/reject/modify proposals;
- review evidence;
- approve decisions;
- resolve contradictions.

## 3.6 Workspace Administrator

Controls workspace configuration, integrations, permissions, model/runtime settings and retention.

---

# 4. Product modes

Loom SHOULD expose the product as a small number of user-facing modes rather than as a set of internal services.

## 4.1 Discover

Purpose: acquire and interpret foundational context.

Capabilities:

- add files, URLs, repositories and connectors;
- parse supported source formats;
- search and inspect evidence;
- run semantic interpretation;
- identify ambiguity, gaps and contradictions.

## 4.2 Model

Purpose: maintain accepted semantic meaning.

Capabilities:

- view semantic graph;
- review proposals;
- edit concepts and relationships;
- manage glossary;
- define bounded contexts;
- manage domain events, policies and invariants.

## 4.3 Design

Purpose: derive solution structure and decisions.

Capabilities:

- C4 views;
- behavioural flows;
- interfaces;
- alternatives;
- ADRs;
- quality attributes;
- architecture guardrails.

## 4.4 Generate

Purpose: create downstream engineering artifacts.

Capabilities:

- Markdown specifications;
- API contracts;
- test scenarios;
- data schemas;
- backlog items;
- repository changes;
- code or code skeletons;
- implementation instructions.

## 4.5 Validate

Purpose: measure coherence and detect drift.

Capabilities:

- source-to-context drift;
- semantic drift;
- architecture drift;
- decision-to-artifact drift;
- architecture-to-code drift;
- runtime evidence comparison;
- guardrail evaluation;
- regression evaluation.

---

# 5. Canonical domain separation

Loom MUST explicitly distinguish two domains.

## 5.1 Loom control domain

These concepts describe Loom itself:

- Workspace;
- User;
- Role;
- Source;
- SourceVersion;
- Evidence;
- AgentRun;
- ToolInvocation;
- Proposal;
- ProposalOperation;
- Review;
- ContextVersion;
- Guardrail;
- DecisionRecord;
- Artifact;
- ValidationRun;
- ValidationFinding;
- Integration;
- CanvasScene.

These types are stable platform concepts.

## 5.2 Modelled solution domain

These concepts belong to the system being designed.

Examples:

- Customer;
- Dispatcher;
- Invoice;
- Policy;
- Route;
- Capability;
- DomainEvent;
- BoundedContext;
- SoftwareSystem;
- Container;
- Component;
- Interface;
- Constraint.

The modelled solution vocabulary is workspace-specific and extensible.

Loom MUST NOT hard-code a single domain vocabulary beyond a small number of generic modelling primitives.

---

# 6. Canonical information model

## 6.1 Workspace

Represents one governed solution-engineering context.

Fields:

```ts
interface Workspace {
  id: WorkspaceId;
  name: string;
  description?: string;
  status: "active" | "archived";
  createdAt: Instant;
  updatedAt: Instant;
  currentContextVersionId?: ContextVersionId;
  settings: WorkspaceSettings;
}
```

## 6.2 Source

A logical external or uploaded source.

Examples:

- Markdown document;
- PDF;
- Word document;
- URL;
- Git repository;
- API;
- database;
- Jira project;
- Confluence space.

```ts
interface Source {
  id: SourceId;
  workspaceId: WorkspaceId;
  kind: SourceKind;
  name: string;
  uri?: string;
  authority: SourceAuthority;
  classification: DataClassification;
  createdAt: Instant;
}
```

## 6.3 SourceVersion

Immutable version of a source as observed by Loom.

```ts
interface SourceVersion {
  id: SourceVersionId;
  sourceId: SourceId;
  contentHash: string;
  observedAt: Instant;
  extractedTextLocation?: ArtifactLocation;
  metadata: Record<string, unknown>;
}
```

## 6.4 Evidence

Evidence is an immutable reference to a precise part of a source version.

```ts
interface Evidence {
  id: EvidenceId;
  sourceVersionId: SourceVersionId;
  locator: EvidenceLocator;
  excerpt?: string;
  contentHash?: string;
}
```

Locators MAY represent:

- line range;
- page and region;
- JSON pointer;
- SQL row identity;
- repository file and line range;
- API response path;
- event identifier.

## 6.5 SemanticElement

An accepted concept in the modelled solution.

```ts
interface SemanticElement {
  id: SemanticElementId;
  workspaceId: WorkspaceId;
  typeId: SemanticTypeId;
  name: string;
  description?: string;
  attributes: Record<string, unknown>;
  evidenceIds: EvidenceId[];
  lifecycle: "active" | "superseded";
  createdInVersion: ContextVersionId;
  supersededInVersion?: ContextVersionId;
}
```

Examples of `typeId`:

```text
actor
user-story
user-journey
capability
domain-concept
domain-event
policy
invariant
bounded-context
quality-attribute
constraint
software-system
container
component
interface
risk
open-question
```

## 6.6 SemanticRelationship

```ts
interface SemanticRelationship {
  id: SemanticRelationshipId;
  workspaceId: WorkspaceId;
  typeId: RelationshipTypeId;
  sourceElementId: SemanticElementId;
  targetElementId: SemanticElementId;
  attributes: Record<string, unknown>;
  evidenceIds: EvidenceId[];
  lifecycle: "active" | "superseded";
  createdInVersion: ContextVersionId;
  supersededInVersion?: ContextVersionId;
}
```

## 6.7 ContextVersion

An immutable accepted snapshot marker.

Loom MAY physically store context as temporal records rather than copying the entire graph for every version, but the API MUST expose an immutable versioned view.

```ts
interface ContextVersion {
  id: ContextVersionId;
  workspaceId: WorkspaceId;
  sequence: number;
  label?: string;
  createdAt: Instant;
  createdBy: ActorRef;
  reason: string;
  parentVersionId?: ContextVersionId;
}
```

## 6.8 Proposal

A proposal contains operations that MAY alter governed state.

```ts
interface Proposal {
  id: ProposalId;
  workspaceId: WorkspaceId;
  kind: ProposalKind;
  status: "pending" | "accepted" | "rejected" | "expired" | "superseded";
  title: string;
  rationale?: string;
  createdBy: ActorRef;
  agentRunId?: AgentRunId;
  operations: ProposalOperation[];
  evidenceIds: EvidenceId[];
  createdAt: Instant;
  reviewedAt?: Instant;
}
```

## 6.9 ProposalOperation

Initial operation types:

```ts
type ProposalOperation =
  | CreateElementOperation
  | UpdateElementOperation
  | SupersedeElementOperation
  | CreateRelationshipOperation
  | UpdateRelationshipOperation
  | SupersedeRelationshipOperation
  | CreateDecisionOperation
  | UpdateGuardrailOperation
  | CreateArtifactOperation;
```

Proposal acceptance MUST be transactional.

## 6.10 Direct human command

A human MAY be allowed to perform selected semantic mutations without an AI proposal.

These commands:

- MUST be explicit UI actions;
- MUST be authorised;
- MUST create audit events;
- MUST create a new ContextVersion;
- MUST NOT be inferred from arbitrary visual movement.

AI-inferred consequences of a human command remain proposals.

## 6.11 DecisionRecord

ADRs are first-class governed objects.

```ts
interface DecisionRecord {
  id: DecisionId;
  workspaceId: WorkspaceId;
  title: string;
  status: "proposed" | "accepted" | "superseded" | "rejected";
  context: string;
  decision?: string;
  consequences?: string[];
  alternatives?: DecisionAlternative[];
  relatedElementIds: SemanticElementId[];
  evidenceIds: EvidenceId[];
  createdAt: Instant;
}
```

## 6.12 Guardrail

```ts
interface Guardrail {
  id: GuardrailId;
  workspaceId: WorkspaceId;
  name: string;
  scope: GuardrailScope;
  severity: "block" | "approval-required" | "warn";
  evaluator: GuardrailEvaluator;
  parameters: Record<string, unknown>;
  version: number;
  enabled: boolean;
}
```

A guardrail evaluator may be:

- deterministic predicate;
- schema validator;
- architecture fitness rule;
- security rule;
- model-assisted review.

A model-assisted guardrail MUST NOT be treated as deterministic enforcement.

## 6.13 Artifact

```ts
interface Artifact {
  id: ArtifactId;
  workspaceId: WorkspaceId;
  type: ArtifactType;
  status: "draft" | "reviewed" | "accepted" | "superseded";
  version: number;
  contentLocation: ArtifactLocation;
  generatedBy?: AgentRunId;
  contextVersionId: ContextVersionId;
  decisionIds: DecisionId[];
  guardrailIds: GuardrailId[];
  createdAt: Instant;
}
```

Artifact types include:

- markdown-specification;
- c4-model;
- adr;
- openapi;
- json-schema;
- test-plan;
- acceptance-tests;
- backlog;
- source-code;
- repository-patch;
- deployment-model;
- report.

---

# 7. Proposal and approval model

## 7.1 Principle

A proposal is a transaction candidate.

The accepted graph is changed only after approval.

## 7.2 Proposal lifecycle

```text
PENDING
  ├── ACCEPTED → apply operations atomically → new ContextVersion
  ├── REJECTED
  ├── SUPERSEDED
  └── EXPIRED
```

## 7.3 Review

Review supports:

- accept all;
- reject all;
- accept selected operations;
- edit selected operations;
- request agent revision;
- add reviewer comment.

Partial acceptance SHOULD result in a derived proposal containing only accepted edited operations so the audit trail remains explicit.

## 7.4 Impact analysis

Before applying a semantic change, Loom SHOULD calculate:

- direct relationships affected;
- architecture elements derived from changed concepts;
- decisions referencing changed elements;
- artifacts generated from older context versions;
- guardrails potentially affected;
- validation findings likely to become stale.

Impact analysis may be deterministic plus agent-assisted.

---

# 8. Agent architecture

## 8.1 Primary runtime

The primary implementation uses the **GitHub Copilot SDK**.

For backend deployment, the preferred production topology is a persistent headless Copilot runtime connected to the Node.js backend. Local development MAY use the Node SDK's managed runtime mode.

The precise SDK/CLI version MUST be pinned in the implementation repository.

## 8.2 Outer versus inner loop

### Loom outer lifecycle

Owned by deterministic application code and PostgreSQL:

```text
request
→ create AgentRun
→ assemble task context
→ invoke bounded Copilot task
→ validate tool calls
→ receive proposal/artifact/result
→ persist
→ wait for human/system action
→ continue
```

### Copilot inner loop

Owned by Copilot SDK/runtime:

```text
prompt/context
→ reasoning
→ tool selection
→ tool execution
→ observation
→ additional reasoning/tool use
→ completion
```

## 8.3 AgentRun

```ts
interface AgentRun {
  id: AgentRunId;
  workspaceId: WorkspaceId;
  kind: AgentRunKind;
  status:
    | "created"
    | "running"
    | "awaiting-tool"
    | "completed"
    | "failed"
    | "cancelled";
  sessionId?: string;
  model?: string;
  inputContextVersionId?: ContextVersionId;
  startedAt?: Instant;
  completedAt?: Instant;
  usage?: AgentUsage;
}
```

## 8.4 Session state is non-authoritative

Copilot sessions MAY retain:

- conversation history;
- planning context;
- runtime context;
- agent-local working information.

Loom MUST persist authoritative state separately.

Losing a Copilot session MUST NOT corrupt accepted context.

## 8.5 Agent roles

The product SHOULD initially provide bounded specialised agents rather than one omnipotent system agent.

Recommended roles:

### Context Interpreter

Reads source evidence and proposes semantic elements and relationships.

### Context Critic

Looks for ambiguity, contradictions, missing evidence and weak assumptions.

### Impact Analyst

Evaluates consequences of a proposed or direct human change.

### Domain Modeller

Proposes glossary changes, bounded contexts, events, policies and invariants.

### Architecture Designer

Proposes architecture alternatives and trade-offs.

### Architecture Critic

Challenges architecture against quality attributes, guardrails and context.

### Artifact Generator

Generates a requested engineering artifact.

### Drift Analyst

Compares accepted context, decisions, artifacts, repositories and runtime evidence.

Agents MAY internally use custom Copilot agents/sub-agents, but Loom remains responsible for task boundaries and permissions.

---

# 9. Tool model

## 9.1 Rules

Every agent capability that can affect the system MUST be exposed as a typed tool or deterministic application operation.

Tools MUST:

- have one bounded responsibility;
- use schema-validated inputs;
- return typed results;
- identify workspace scope;
- enforce authorization;
- emit audit/trace events;
- be safe to retry where possible;
- distinguish read from write operations.

Agents MUST NOT receive unrestricted shell, filesystem, SQL or HTTP access in the normal application runtime.

## 9.2 Core read tools

Examples:

```text
list_sources
read_source_evidence
search_sources
get_context_snapshot
get_semantic_element
query_semantic_graph
get_decisions
get_guardrails
get_artifact
search_repository
get_validation_findings
```

## 9.3 Core proposal tools

```text
submit_semantic_proposal
submit_impact_proposal
submit_domain_model_proposal
submit_architecture_proposal
submit_decision_proposal
submit_artifact_proposal
submit_drift_findings
```

These tools create proposals/findings. They do not directly mutate accepted state.

## 9.4 Controlled engineering tools

Repository-oriented generation may use a separate engineering-agent execution environment.

Permitted operations MAY include:

- create branch/worktree;
- inspect files;
- apply patch;
- run build;
- run tests;
- run linters;
- produce diff.

These operations require workspace/repository policy and MUST be sandboxed.

---

# 10. Context engineering

## 10.1 Context is assembled, not dumped

Loom MUST NOT place the complete workspace into every agent session.

Each task receives a context plan.

```ts
interface ContextPlan {
  task: string;
  contextVersionId: ContextVersionId;
  semanticElementIds: SemanticElementId[];
  evidenceIds: EvidenceId[];
  decisionIds: DecisionId[];
  guardrailIds: GuardrailId[];
  artifactIds: ArtifactId[];
  retrievalQueries?: RetrievalQuery[];
  tokenBudget?: number;
}
```

## 10.2 Context priority

Default priority:

1. explicit user task;
2. applicable guardrails;
3. accepted semantic context;
4. accepted decisions;
5. primary evidence;
6. relevant artifacts;
7. retrieved supporting context;
8. previous agent conversation only where required.

## 10.3 Context caching

Loom SHOULD support:

- immutable content hashes;
- retrieval-result cache;
- semantic extraction cache;
- model-response cache only for explicitly deterministic/idempotent operations;
- artifact dependency cache.

Caches MUST be invalidated using source/context versions, not wall-clock guesses.

## 10.4 Large context

Large source sets SHOULD be handled through:

- indexing;
- structural segmentation;
- source-specific querying;
- summarisation with provenance;
- hierarchical retrieval;
- incremental interpretation.

Context-window size MUST NOT be treated as permission to send all available information.

---

# 11. Knowledge and retrieval architecture

## 11.1 Principle

Memory is heterogeneous.

Vector search is one retrieval method, not the memory architecture.

## 11.2 Connector abstraction

```ts
interface KnowledgeConnector {
  capabilities(): ConnectorCapabilities;
  search(request: SearchRequest): Promise<SearchResult[]>;
  fetch(ref: KnowledgeRef): Promise<KnowledgeItem>;
  health(): Promise<HealthStatus>;
}
```

Optional extensions:

```ts
interface QueryableConnector extends KnowledgeConnector {
  query(request: StructuredQuery): Promise<QueryResult>;
}

interface WritableConnector extends KnowledgeConnector {
  write(request: KnowledgeWrite): Promise<KnowledgeWriteResult>;
}
```

## 11.3 Initial connectors

The full product SHOULD support:

- local/uploaded files;
- Git repositories;
- HTTP/REST APIs;
- PostgreSQL/SQL;
- generic document stores;
- Jira/Confluence or equivalent through plugin/connectors;
- semantic search index;
- runtime telemetry store.

## 11.4 Graph persistence

The Loom semantic graph SHOULD initially be stored in PostgreSQL as canonical relational records.

A specialised graph database MAY be added if traversal scale or graph algorithms justify it.

The product MUST NOT require a graph database for correctness.

## 11.5 Semantic retrieval

PostgreSQL with `pgvector` MAY be used as an initial semantic index.

Embeddings are indexes over evidence, not canonical memory.

---

# 12. Source ingestion

## 12.1 Supported initial formats

- Markdown;
- plain text;
- PDF;
- DOCX;
- JSON;
- YAML;
- CSV;
- OpenAPI;
- source-code repositories;
- URL/HTML.

## 12.2 Ingestion pipeline

```text
register source
→ acquire content
→ virus/security check where applicable
→ normalise metadata
→ extract text/structure
→ create immutable SourceVersion
→ segment/index
→ create Evidence records
→ optionally trigger interpretation
```

## 12.3 Provenance

Every extraction step MUST preserve lineage back to:

- source;
- source version;
- locator;
- extraction mechanism;
- timestamp.

---

# 13. Semantic modelling and strategic DDD

## 13.1 Ubiquitous language

Each workspace maintains a glossary.

```ts
interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  aliases: string[];
  boundedContextIds: string[];
  status: "proposed" | "accepted" | "deprecated";
}
```

Loom SHOULD detect:

- duplicate terms;
- overloaded terms;
- conflicting definitions;
- undefined terms used in governed artifacts.

## 13.2 Bounded contexts

Bounded contexts are semantic boundaries, not automatically deployment units.

Loom MUST NOT assume:

```text
Bounded Context == microservice
```

## 13.3 Domain events

Domain events represent meaningful business occurrences.

They MAY inform:

- workflows;
- integration contracts;
- test scenarios;
- architecture.

## 13.4 Policies and invariants

Policies describe business reactions or rules.

Invariants represent conditions that must remain true.

Where possible, invariants SHOULD be converted into executable validation.

---

# 14. Architecture modelling

## 14.1 C4 as default structural model

Loom SHOULD support:

- System Landscape;
- System Context;
- Container;
- Component;
- optional Deployment view.

Architecture elements are semantic elements with architecture-specific types and attributes.

## 14.2 Behavioural views

Loom SHOULD support selected complementary views:

- sequence;
- state;
- activity/flow;
- user journey;
- domain story.

No attempt should be made to support all UML diagrams.

## 14.3 Architecture alternatives

Architecture generation MUST support alternatives.

An architecture proposal SHOULD state:

- objectives;
- assumptions;
- trade-offs;
- quality attributes optimised;
- risks;
- decisions required;
- elements derived from accepted context.

## 14.4 Architecture decisions

Accepted architecture alternatives MUST result in explicit DecisionRecords where the choice is architecturally significant.

## 14.5 Traceability

An architecture element SHOULD link to:

- domain concepts/capabilities;
- requirements/stories;
- decisions;
- guardrails;
- generated artifacts;
- repository evidence.

---

# 15. Excalidraw canvas

## 15.1 Role

Excalidraw is the primary free-form collaborative visual workspace.

It is not the semantic database.

## 15.2 Element classes

### Managed elements

Represent semantic elements and relationships.

They contain stable Loom metadata such as:

```ts
interface LoomExcalidrawMetadata {
  loomElementId: string;
  loomElementKind: "semantic-element" | "semantic-relationship";
  contextVersionId: string;
  managed: true;
}
```

### Free elements

User sketches, annotations, arrows and notes.

They are not automatically governed semantic context.

## 15.3 Promotion

A user MAY choose to promote a free canvas element into semantic context.

Promotion creates either:

- a direct authorised human command; or
- a proposal for review.

## 15.4 Projection

The projection layer maps:

```text
Semantic model → visual nodes/edges → Excalidraw scene
```

It MUST preserve existing user layout wherever possible when the semantic model changes.

## 15.5 Layout

Automatic layout MAY use:

- ELK;
- Dagre;
- D3-force;
- custom deterministic layout.

Layout engines compute positions. They do not own semantic state.

---

# 16. Collaboration

## 16.1 Goals

Multiple users should be able to:

- view a workspace;
- edit free canvas content;
- review proposals;
- edit governed context under permissions;
- see agent activity;
- avoid silent overwrite.

## 16.2 Realtime transport

Use WebSocket-based realtime transport.

For full collaborative scene editing, use a CRDT or OT approach rather than last-write-wins JSON replacement.

Yjs is a suitable reference implementation, but the collaboration layer SHOULD remain isolated behind a service boundary.

## 16.3 Semantic concurrency

Semantic commands MUST use optimistic concurrency on ContextVersion.

If a proposal was generated against an older context version, Loom MUST:

- revalidate it;
- mark it stale; or
- request regeneration.

---

# 17. Architecture derivation workflow

```text
Accepted semantic context
        ↓
Select architecture scope
        ↓
Assemble context plan
        ↓
Architecture Designer agent
        ↓
1..N architecture proposals
        ↓
Deterministic schema + guardrail validation
        ↓
Architecture Critic agent
        ↓
Human comparison and decision
        ↓
Accepted architecture elements + ADRs
```

The architecture generator MUST NOT directly overwrite previously accepted architecture.

---

# 18. Artifact generation

## 18.1 Artifact contract

Every generated artifact MUST declare:

- input ContextVersion;
- relevant semantic elements;
- decisions;
- guardrails;
- generator identity/version;
- model/runtime;
- generation timestamp;
- validation result.

## 18.2 Generation modes

### Document generation

Examples:

- Markdown specification;
- architecture report;
- ADR;
- test plan.

### Contract generation

Examples:

- OpenAPI;
- JSON Schema;
- AsyncAPI;
- SQL schema.

### Repository generation

Examples:

- project skeleton;
- targeted implementation;
- tests;
- configuration;
- refactoring patch.

Repository generation MUST occur in an isolated branch/worktree or sandbox.

## 18.3 Code-as-execution-material principle

Generated code MAY optimise away conceptual structures.

Loom validates behaviour and contracts rather than requiring structural resemblance to the domain model.

For important mappings, maintain trace metadata from repository elements/tests back to context and artifact versions.

---

# 19. Repository integration

## 19.1 Git integration

Loom SHOULD support Git repositories as both sources and generation targets.

Core functions:

- register repository;
- select branch/commit;
- index code;
- link commit to Artifact;
- create controlled worktree/branch;
- run engineering agent;
- capture diff;
- run validations;
- propose merge output.

## 19.2 No direct main-branch mutation

Agent-generated changes MUST NOT be committed directly to protected branches.

## 19.3 Repository evidence

Loom SHOULD extract:

- directory structure;
- manifests;
- public APIs;
- type definitions;
- dependency graph;
- test structure;
- architecture-significant configuration.

---

# 20. Validation and drift

## 20.1 ValidationRun

```ts
interface ValidationRun {
  id: ValidationRunId;
  workspaceId: WorkspaceId;
  type: ValidationType;
  baselineContextVersionId: ContextVersionId;
  status: "queued" | "running" | "completed" | "failed";
  startedAt?: Instant;
  completedAt?: Instant;
}
```

## 20.2 ValidationFinding

```ts
interface ValidationFinding {
  id: ValidationFindingId;
  validationRunId: ValidationRunId;
  category: string;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  explanation: string;
  evidenceIds: EvidenceId[];
  relatedElementIds: SemanticElementId[];
  suggestedAction?: string;
  status: "open" | "accepted-risk" | "resolved" | "dismissed";
}
```

## 20.3 Drift categories

### Source drift

Source changed after the accepted context was derived.

### Semantic drift

Terminology, relationships or invariants conflict.

### Architecture drift

Architecture views and decisions no longer correspond to accepted semantic context.

### Artifact drift

Generated artifact predates relevant accepted changes.

### Code drift

Implementation no longer satisfies architecture, contracts or accepted requirements.

### Runtime drift

Observed runtime behaviour contradicts assumptions, quality attributes or constraints.

## 20.4 Incremental drift

Loom SHOULD calculate dependency impact and rerun only relevant validations where possible.

---

# 21. Guardrails

## 21.1 Evaluation points

Guardrails can run:

1. before context retrieval;
2. before model invocation;
3. before tool execution;
4. after tool result;
5. before proposal persistence;
6. before proposal acceptance;
7. before artifact publication;
8. before repository mutation;
9. during validation/drift scans.

## 21.2 Guardrail result

```ts
interface GuardrailResult {
  guardrailId: GuardrailId;
  outcome: "pass" | "warn" | "approval-required" | "block";
  explanation: string;
  evidence?: EvidenceId[];
}
```

## 21.3 Examples

- only approved model providers;
- PII cannot be submitted to external runtime;
- all source-derived semantic elements require evidence;
- protected repository branches are read-only;
- architecture changes affecting security boundary require approval;
- generated APIs must conform to organisation standard;
- code generation must pass test and lint gates.

---

# 22. User experience

## 22.1 Main layout

Reference desktop layout:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Workspace | Mode | Context Version | Agent activity | Share | User        │
├────────────────┬─────────────────────────────────────┬─────────────────────┤
│ Workspace      │                                     │ Inspector / Agent   │
│                │             Canvas                  │                     │
│ Sources        │                                     │ Selected element    │
│ Context        │        Excalidraw + overlays        │ Evidence            │
│ Decisions      │                                     │ Proposals           │
│ Guardrails     │                                     │ Actions             │
│ Artifacts      │                                     │                     │
│ Validations    │                                     │                     │
├────────────────┴─────────────────────────────────────┴─────────────────────┤
│ Activity | Agent Runs | Tool Calls | Validations | Changes | Usage        │
└────────────────────────────────────────────────────────────────────────────┘
```

## 22.2 Left workspace navigator

Sections:

- Sources;
- Context;
- Glossary;
- Decisions;
- Guardrails;
- Artifacts;
- Repositories;
- Validations;
- Integrations.

## 22.3 Right inspector

Context-sensitive views:

- semantic element;
- evidence;
- proposal;
- decision;
- guardrail;
- artifact;
- validation finding.

Agent panel supports contextual chat but MUST clearly distinguish conversational text from governed state.

## 22.4 Proposal review UI

Proposal review MUST show:

- proposed operation;
- before/after;
- rationale;
- evidence;
- affected elements;
- guardrails;
- accept/reject/edit controls.

---

# 23. Search and Ask Loom

## 23.1 Search

Global search across:

- source evidence;
- semantic model;
- decisions;
- guardrails;
- artifacts;
- repositories;
- validations.

## 23.2 Ask Loom

Conversational query over workspace context.

Answers SHOULD:

- cite evidence;
- identify accepted context versus inference;
- disclose uncertainty;
- avoid mutating state;
- offer explicit proposal actions where applicable.

Example:

```text
User: Which systems are affected if CustomerIdentity moves to the IAM context?

Loom:
- identifies current relationships;
- identifies affected architecture elements;
- identifies ADRs and artifacts;
- gives evidence;
- offers "Create impact analysis proposal".
```

---

# 24. API architecture

Use REST/JSON for commands and queries plus SSE/WebSocket for realtime events.

## 24.1 Representative REST resources

```text
/api/workspaces
/api/workspaces/:id/sources
/api/workspaces/:id/source-versions
/api/workspaces/:id/evidence
/api/workspaces/:id/context
/api/workspaces/:id/context/versions
/api/workspaces/:id/proposals
/api/workspaces/:id/decisions
/api/workspaces/:id/guardrails
/api/workspaces/:id/artifacts
/api/workspaces/:id/agent-runs
/api/workspaces/:id/validations
/api/workspaces/:id/repositories
/api/workspaces/:id/integrations
```

## 24.2 Command examples

```text
POST /sources
POST /sources/:id/ingest
POST /agent-runs
POST /proposals/:id/accept
POST /proposals/:id/reject
POST /context/commands
POST /architecture/proposals
POST /artifacts/generate
POST /validations
```

## 24.3 Realtime channels

Events include:

```text
agent.run.started
agent.run.event
agent.tool.requested
agent.tool.completed
proposal.created
proposal.updated
context.version.created
artifact.generated
validation.finding.created
canvas.presence.changed
```

---

# 25. Backend architecture

## 25.1 Reference stack

- Node.js 24 LTS or repository-pinned current LTS;
- TypeScript strict mode;
- Fastify;
- Zod for runtime schemas;
- PostgreSQL 17;
- `pgvector` optional;
- S3-compatible object storage;
- GitHub Copilot SDK;
- OpenTelemetry;
- WebSocket/SSE event delivery.

Exact package versions MUST be pinned.

## 25.2 Modular monolith first

Use a modular monolith before microservices.

Suggested modules:

```text
identity
workspace
source
evidence
context
proposal
agent-runtime
tool-registry
knowledge
canvas
domain-model
architecture
decision
guardrail
artifact
repository
validation
integration
audit
telemetry
```

Each module owns its domain logic and persistence access.

Cross-module calls use explicit application interfaces.

## 25.3 Background jobs

Long-running work MUST not block HTTP requests.

Initial implementation MAY use a PostgreSQL-backed job queue.

The queue abstraction SHOULD allow later replacement by Azure Service Bus, Redis-backed queues or another broker.

---

# 26. Frontend architecture

## 26.1 Reference stack

- React;
- TypeScript;
- Excalidraw;
- CodeMirror 6 for Markdown/spec editing;
- query/cache library for server state;
- lightweight local UI state;
- WebSocket/SSE event client.

## 26.2 Frontend rules

The frontend MUST NOT:

- infer accepted semantic state from canvas content;
- bypass backend proposal/command APIs;
- contain model-provider credentials;
- implement security-sensitive guardrails only in the browser.

## 26.3 Projection adapter

Maintain a dedicated package:

```text
semantic-model ↔ canvas-projection
```

It should be independently testable.

---

# 27. Persistence

## 27.1 PostgreSQL

Canonical relational data:

- users/workspaces;
- sources/source versions;
- evidence metadata;
- semantic elements/relationships;
- context versions;
- proposals/operations/reviews;
- decisions;
- guardrails;
- artifacts metadata;
- agent runs/tool invocations;
- validation runs/findings;
- audit events;
- integration configuration.

## 27.2 Object storage

Large or immutable content:

- uploaded source binaries;
- extracted document representations;
- generated reports;
- artifact bodies;
- repository bundles if required;
- agent trace exports.

## 27.3 Audit log

Every governed mutation MUST produce an append-only audit event.

---

# 28. Security

## 28.1 Authentication

Production reference: OIDC / Microsoft Entra ID.

Local development MAY use a development identity adapter.

## 28.2 Authorization

Minimum roles:

- Viewer;
- Contributor;
- Reviewer;
- Architect;
- WorkspaceAdmin.

Permissions are evaluated server-side.

## 28.3 Data classification

Sources and evidence MUST carry data classification.

Agent context assembly MUST enforce provider/data policy before submission.

## 28.4 Tool security

Tool execution requires:

- workspace scope;
- authenticated user/run identity;
- allow-listed tool;
- validated input;
- authorization;
- guardrail evaluation;
- audit record.

## 28.5 Secrets

Secrets MUST remain server-side and use environment/secret-store integration.

Never store secrets in semantic context, prompt templates, canvas customData or artifacts.

---

# 29. Observability

Use OpenTelemetry-compatible tracing.

## 29.1 Trace hierarchy

```text
user request
  → application command
    → context assembly
      → Copilot agent run
        → model turn
        → tool invocation
          → connector/database call
      → proposal/artifact
    → validation
```

## 29.2 Metrics

Track:

- agent-run count;
- completion/failure rate;
- latency;
- model usage;
- context-window utilisation;
- tool-call count;
- tool errors;
- proposal acceptance rate;
- human override rate;
- evidence coverage;
- guardrail blocks/warnings;
- validation findings;
- generation cost where available.

---

# 30. Evaluation

## 30.1 Agent evaluation

Evaluate:

- correct tool selection;
- grounding;
- evidence fidelity;
- semantic extraction accuracy;
- invalid proposal rate;
- guardrail adherence;
- robustness to adversarial/untrusted source text.

## 30.2 Product evaluation

Evaluate:

- task completion;
- reviewer effort;
- context coherence;
- traceability completeness;
- drift-detection precision;
- recovery from failed agent runs;
- reproducibility where expected.

## 30.3 Golden datasets

Maintain versioned evaluation workspaces with:

- source corpus;
- expected semantic elements;
- known ambiguities;
- accepted decisions;
- architecture baseline;
- code baseline;
- injected drift cases.

---

# 31. Scalability

## 31.1 Application tier

Backend instances SHOULD be stateless with respect to durable Loom state.

## 31.2 Copilot runtime

For server deployment, run Copilot runtime as managed headless capacity rather than spawning an unbounded CLI process per HTTP request.

Loom SHOULD implement:

- runtime health checks;
- session cleanup;
- session/run ownership;
- retry/reconnect;
- capacity limits;
- per-user/workspace isolation where required.

## 31.3 Session persistence

Copilot session persistence may be used for continuity, but Loom's own database remains authoritative.

Tool state MUST be persisted by Loom or the tool's target system.

## 31.4 Work partitioning

Agent runs SHOULD be distributable through a job queue.

A run must be resumable or safely restartable without duplicating governed state changes.

---

# 32. Deployment profiles

## 32.1 Local development

- React dev server;
- Node backend;
- PostgreSQL in Podman;
- optional MinIO in Podman;
- local or managed Copilot runtime;
- local filesystem Git repositories.

## 32.2 Shared development/test

- containerised frontend/backend;
- managed PostgreSQL;
- object storage;
- headless Copilot runtime;
- Entra ID test tenant;
- central telemetry.

## 32.3 Production target

Reference Azure topology:

- frontend static hosting or container;
- backend on AKS/App Service/Container Apps according to organisational standard;
- Azure Database for PostgreSQL;
- Blob Storage;
- Service Bus or equivalent job broker when scale justifies it;
- Entra ID;
- API Management where required;
- OpenTelemetry into approved observability stack;
- isolated Copilot runtime deployment according to organisational policy.

The product architecture MUST not depend on Azure-specific domain code.

---

# 33. Repository structure

Recommended monorepo:

```text
loom/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── contracts/
│   ├── semantic-model/
│   ├── context-engine/
│   ├── proposal-engine/
│   ├── agent-runtime/
│   ├── agent-tools/
│   ├── knowledge-connectors/
│   ├── canvas-projection/
│   ├── domain-modeling/
│   ├── architecture-modeling/
│   ├── guardrails/
│   ├── artifact-engine/
│   ├── repository-integration/
│   ├── validation/
│   ├── persistence/
│   ├── telemetry/
│   └── test-fixtures/
│
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── product/
│   └── operations/
│
├── infra/
├── scripts/
└── tests/
    ├── integration/
    ├── e2e/
    └── evaluation/
```

---

# 34. Core end-to-end workflows

## 34.1 Interpret a source

```text
User adds source
→ Loom ingests SourceVersion
→ evidence is indexed
→ user requests interpretation
→ Loom creates AgentRun
→ interpreter reads selected evidence
→ agent calls submit_semantic_proposal
→ deterministic validator checks proposal
→ proposal appears in review UI
→ user accepts
→ ContextVersion N+1 is created
→ semantic graph projection updates
```

## 34.2 Human edit with AI impact analysis

```text
User edits semantic element
→ deterministic direct command creates ContextVersion N+1
→ Loom computes dependency set
→ Impact Analyst agent reviews affected context
→ agent creates impact proposal
→ user reviews
→ accepted operations create ContextVersion N+2
```

## 34.3 Architecture derivation

```text
User selects scope + quality attributes
→ Loom builds ContextPlan
→ Architecture Designer creates alternatives
→ guardrails evaluate alternatives
→ Architecture Critic challenges them
→ user chooses/edits
→ accepted architecture + ADRs
```

## 34.4 Generate repository artifact

```text
User requests implementation artifact
→ Loom freezes ContextVersion
→ creates Artifact generation run
→ engineering agent receives bounded repository worktree
→ code/tests generated
→ build/test/lint
→ guardrails
→ diff + validation presented
→ user accepts artifact
```

## 34.5 Drift detection

```text
Source/repository/runtime changes
→ Loom identifies affected dependencies
→ validation run
→ deterministic comparisons
→ Drift Analyst for semantic interpretation where needed
→ findings
→ optional remediation proposal
```

---

# 35. Non-functional requirements

## 35.1 Reliability

- accepted context must survive agent/runtime failure;
- proposal acceptance must be transactional;
- repeated agent completion callbacks must not duplicate operations;
- background work must support retry policy.

## 35.2 Performance

Interactive read operations SHOULD normally respond in under 500 ms excluding large artifact download.

Agentic operations are asynchronous by default.

The UI MUST show progress rather than blocking.

## 35.3 Explainability

Every governed AI result SHOULD expose:

- task;
- evidence;
- agent/run;
- model where available;
- tool calls;
- rationale where useful;
- affected context;
- validation result.

## 35.4 Accessibility

The web application SHOULD target WCAG 2.1 AA.

## 35.5 Portability

Business/domain modules MUST not depend directly on cloud-specific SDKs.

---

# 36. Initial guardrails

The full implementation SHOULD ship with at least these platform guardrails:

1. AI cannot mutate accepted context directly.
2. AI cannot accept its own proposal.
3. Unknown tool calls are denied.
4. Repository protected branches are read-only.
5. Every accepted AI-derived semantic element requires evidence or explicit human override.
6. Source classification is checked before model submission.
7. Untrusted source text is treated as data, not instruction.
8. Generated code must pass configured engineering gates before artifact acceptance.
9. All governed mutations are audited.
10. Proposal operations generated against stale ContextVersion require revalidation.

---

# 37. MVP versus full product

## 37.1 Product MVP

The first coherent product release should support:

- one workspace;
- document upload;
- Markdown/PDF ingestion;
- semantic interpretation;
- proposal review;
- accepted semantic graph;
- Excalidraw projection;
- human semantic editing;
- impact analysis;
- glossary and bounded contexts;
- C4 proposal;
- ADRs;
- guardrails;
- one artifact-generation path;
- Git repository integration;
- drift detection between context and generated artifact/code;
- tracing and usage metrics.

## 37.2 Full product target

Adds:

- multiple workspaces;
- OIDC/Entra;
- realtime multi-user collaboration;
- rich source connectors;
- repository agents;
- runtime telemetry connectors;
- incremental validation;
- advanced search;
- policy packs;
- workspace templates;
- reusable skills;
- organisation-level standards;
- productised go-to-market templates;
- multi-provider/model policy;
- production scaling and HA.

---

# 38. Implementation sequence for the separate product

This sequence is product-driven, not workshop-driven.

## Phase A — Architectural spine

Build first:

1. monorepo;
2. PostgreSQL model;
3. workspace/source/evidence;
4. proposal/context versioning;
5. Copilot runtime integration;
6. tool registry;
7. audit and telemetry;
8. minimal React shell.

Exit criterion:

```text
source → agent → proposal → human acceptance → accepted context
```

## Phase B — Semantic workspace

Add:

- semantic graph;
- Excalidraw projection;
- evidence inspector;
- direct human commands;
- impact analysis;
- search.

Exit criterion:

A user can collaboratively maintain governed context with AI assistance.

## Phase C — Design intelligence

Add:

- glossary;
- bounded contexts;
- semantic validation;
- architecture proposals;
- C4 views;
- ADRs;
- guardrails.

Exit criterion:

Accepted domain context can produce and govern a reviewable architecture.

## Phase D — Engineering output

Add:

- artifact contracts;
- Git integration;
- engineering agent sandbox;
- specification/API/test/code generation;
- CI validation.

Exit criterion:

A generated artifact is traceable, testable and reviewable.

## Phase E — Continuous coherence

Add:

- source/repository change detection;
- drift engine;
- incremental validation;
- runtime evidence;
- dashboards/evaluation.

Exit criterion:

Loom detects and explains meaningful divergence across context, architecture and implementation.

## Phase F — Productisation

Add:

- identity;
- tenancy/workspaces;
- collaboration;
- administration;
- connector catalogue;
- scaling;
- HA;
- retention;
- policy packs.

---

# 39. Acceptance criteria for a “fully developed” Loom

A full implementation is not considered complete merely because all screens exist.

It must demonstrate all of the following.

## Context

- heterogeneous sources can be registered and versioned;
- evidence is traceable;
- semantic context is versioned and authoritative.

## Agency

- agents can interpret, critique and generate through bounded tools;
- agents cannot bypass state controls;
- sessions can fail without corrupting accepted state.

## Collaboration

- humans can edit and review;
- free canvas sketching and governed context are distinguishable;
- concurrent edits are handled safely.

## Design

- strategic domain model exists;
- C4 architecture is derivable and editable;
- significant decisions and guardrails are explicit.

## Engineering

- artifacts are generated from explicit context versions;
- repository changes occur in isolation;
- generated output is validated.

## Governance

- all governed changes are audited;
- permissions are enforced server-side;
- guardrails have explicit scope and enforcement points.

## Validation

- drift can be identified across at least source, context, architecture and code/artifact;
- findings retain evidence;
- remediation is proposed, not silently applied.

## Operations

- agent and tool activity is observable;
- usage/cost/latency is measurable;
- background runs can recover from failure;
- system health does not depend on a single transient Copilot session.

---

# 40. Explicit non-goals

The first full product SHOULD NOT attempt to become:

- a complete enterprise architecture repository;
- a general BPMN suite;
- a replacement for GitHub;
- a replacement for Jira/Confluence;
- a universal ontology editor;
- a generic autonomous-agent platform;
- a visual programming language for arbitrary applications;
- a mandatory microservice generator;
- a framework that forces code to mirror the semantic model.

Loom integrates these concerns where necessary but remains focused on **agentic solution engineering and continuous semantic/architectural coherence**.

---

# 41. Key architectural decisions to record immediately

Create ADRs for at least:

1. **Accepted semantic context is authoritative.**
2. **Excalidraw is a projection, not the semantic source of truth.**
3. **Loom owns durable workflow; Copilot owns bounded inner agent loops.**
4. **AI-originated governed mutations use proposals.**
5. **PostgreSQL is the canonical graph/state store initially.**
6. **Vector retrieval is an index, not memory authority.**
7. **Modular monolith before microservices.**
8. **Strategic DDD does not imply tactical DDD code structure.**
9. **Generated code is validated execution material, not the primary design model.**
10. **Repository mutation occurs only in isolated branches/worktrees/sandboxes.**

---

# 42. Open decisions

The following should remain explicit design decisions rather than being hidden in implementation:

- Yjs versus another collaboration mechanism;
- PostgreSQL job queue versus external broker;
- object-storage implementation;
- identity provider details;
- supported document extraction stack;
- semantic embedding provider/model;
- whether pgvector is enabled by default;
- repository-agent sandbox mechanism;
- runtime telemetry connectors;
- exact C4 textual representation;
- multi-provider support beyond Copilot;
- retention policies;
- tenant isolation model.

---

# 43. Definition of success

Loom succeeds when a team can answer, at any point:

- What do we believe this system is?
- What evidence supports that belief?
- Which parts are proposed versus accepted?
- Why is the architecture shaped this way?
- Which decisions and constraints govern it?
- What engineering artifacts were derived from it?
- Does the implementation still satisfy the accepted model?
- What changed, what is now inconsistent, and what should be reviewed?

The product is therefore not merely a generator.

**Loom is the governed semantic control surface connecting human intent, AI reasoning, architecture, implementation and continuous validation.**
