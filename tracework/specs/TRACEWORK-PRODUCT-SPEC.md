# Tracework — Product Specification

**Status:** v1.1 — implementation contract, Bun runtime revision

**Date:** 2026-09-18

**Product:** Tracework — an AI solution-engineering workbench

**Deployment:** Local application, one operator, multiple saved workspaces

**Core technologies:** Bun, `Bun.serve`, SQLite through `bun:sqlite`, OpenAI Agents SDK for TypeScript, GPT-6 Astra, React, Excalidraw

---

## 0. Authority and intended outcome

This document specifies a complete, usable local application. It is the authoritative implementation contract for Tracework.

[LOOM-FULL-PRODUCT-SPEC.md](LOOM-FULL-PRODUCT-SPEC.md) is retained unchanged as the original reference. Tracework adopts its central product concepts while deliberately changing the runtime, persistence, deployment assumptions, and implementation breadth. Requirements from that reference do not implicitly become Tracework requirements. Appendix A records the principal differences.

MUST and MUST NOT are acceptance requirements. SHOULD permits a documented alternative with equivalent behavior. MAY is optional and is not a completion requirement. Features explicitly deferred in section 2 are not required by this release.

Tracework turns heterogeneous project information into a reviewed, traceable, evolving model of a software solution:

```text
Sources and immutable evidence
        ↓
AI interpretation and critique
        ↓
Reviewable proposals
        ↓
Human acceptance
        ↓
Versioned solution model
        ↓
Architecture alternatives, decisions, and constraints
        ↓
Engineering artifacts and a bounded implementation path
        ↓
Validation, change impact, and remediation proposals
```

The accepted solution model is authoritative. A diagram, conversation, generated file, or agent memory is a view or derivative of that model.

The result MUST support real uploads, real model calls, persistent edits, restart recovery, and exports. Seed data and test doubles are additional facilities; they MUST NOT substitute for working product flows.

## 1. Product principles

1. **Human authority.** AI may interpret, propose, critique, and generate. It cannot accept its own proposals or silently alter accepted meaning.
2. **Evidence and uncertainty.** Source-derived claims retain precise evidence. Inferences, assumptions, unresolved questions, and contradictions remain distinguishable.
3. **Application-owned workflow.** Application code owns persistence, validation, approval, job state, and authorization. The Agents SDK owns bounded reasoning and tool loops.
4. **Versioned meaning.** Accepted semantic changes create a new immutable context version. Historical versions remain readable.
5. **Canvas as projection.** Layout and free sketches are visual state. Changes to managed concepts require explicit semantic commands.
6. **Local storage.** SQLite is the only required database. Original files and generated content reside on the local filesystem.
7. **Explicit external inference.** AI features call OpenAI. Local storage does not imply offline inference or that submitted content remains on the machine.
8. **Deterministic enforcement.** Schemas, ownership, referential integrity, version checks, tool permissions, and state transitions are enforced by application code.
9. **Useful engineering output.** Generated outputs carry provenance and validation results and can be used outside Tracework.
10. **Honest validation.** Deterministic failures, AI concerns, unperformed checks, and successful executions have different labels.

## 2. Release scope

### 2.1 Required core application

The application MUST include:

- local workspace creation, opening, renaming, archiving, and backup/restore;
- file ingestion, source versions, evidence browsing, and full-text search;
- interpretation, critique, and evidence-grounded questions;
- proposal review, revision, partial selection, rejection, and acceptance;
- a versioned semantic graph with explicit human editing;
- glossary, bounded contexts, events, policies, invariants, and open questions;
- an Excalidraw canvas with managed projections and free sketches;
- architecture alternatives, C4 context/container views, and decision records;
- deterministic guardrails and clearly identified advisory AI reviews;
- specification, contract, test-plan, and implementation-package generation;
- read-only local Git repository integration at pinned commits;
- bounded TypeScript module generation and code/diff inspection;
- source, model, artifact, and supported repository change analysis;
- durable jobs, run history, cancellation, retry, and progress streaming;
- repeatable example workspaces and saved demonstration checkpoints;
- a complete browser interface, including accessible table/list alternatives to canvas operations.

All core functionality MUST start without PostgreSQL, Redis, S3, MinIO, a vector database, Docker, GitHub Copilot, or a hosted agent service. Git-dependent actions may require a local Git executable; AI actions require an OpenAI API key and network access. Missing optional prerequisites disable the affected action with an explanation, not the whole application.

### 2.2 Optional execution environment, required integration

Tracework MUST implement an optional Docker execution profile for the bounded generated module described in section 14. This integration is part of the release; installing Docker is not a prerequisite for the core application.

Without that environment, users can generate, inspect, and export code, but execution checks MUST read **Not run** and code remains unverified. With it, users can build, test, inspect results, and accept a verified artifact after the required gates pass.

The execution profile MUST NOT introduce PostgreSQL. Its generated sample module also runs on Bun and uses `bun:sqlite`.

### 2.3 Deferred from this release

- simultaneous multi-user editing, presence, CRDTs, and shared cloud workspaces;
- enterprise identity, organization management, role administration, and SaaS tenancy;
- live Jira, Confluence, cloud-drive, database, telemetry, or arbitrary website connectors;
- OCR, audio/video ingestion, and exhaustive diagram understanding;
- mandatory embeddings, vector extensions, and semantic vector search;
- unrestricted coding agents operating on arbitrary repositories or stacks;
- automatic commits, pushes, pull requests, merges, or deployment;
- production runtime monitoring and general proof of implementation correctness;
- distributed workers, high availability, cloud infrastructure, and provider marketplaces;
- user-supplied executable plugins, arbitrary SQL tools, or executable policy scripts.

The UI MUST NOT present placeholders for these as working features.

## 3. Users and primary workflows

The primary user is a solution engineer, architect, analyst, or developer working on a local machine. One operator can have several workspaces and browser tabs. Workspace isolation and conflict handling are still required; this is not a multi-tenant security boundary.

The five product modes are **Discover, Model, Design, Generate, and Validate**. Proposal review and run history are available across modes.

### 3.1 Discover

Add a customer brief, existing technical descriptions, constraints, and repository evidence. Inspect extraction, classify sources, and select an interpretation scope. Review proposed concepts and unresolved issues with citations.

### 3.2 Model

Accept or edit proposals, establish vocabulary and boundaries, inspect relationships, and make explicit human changes. Compare accepted versions and inspect the origin of each claim.

### 3.3 Design

Select accepted requirements and constraints, request two architecture alternatives, inspect critique, and accept an alternative together with its decision record. Existing architecture is never silently overwritten.

### 3.4 Generate

Freeze an accepted context version, generate engineering artifacts, inspect provenance and validations, and export a package usable by a coding agent. Optionally execute the supported generated module in the isolated execution environment.

### 3.5 Validate

Introduce a changed source, compare repository commits, or inspect an artifact against newer accepted context. Show affected dependencies, deterministic failures, and advisory findings. Propose remediation without automatically applying it.

## 4. Architecture and installation

### 4.1 Reference stack

| Concern | Required choice |
| --- | --- |
| Runtime | Bun, with an exact tested stable release and package versions pinned during implementation |
| Package management | Bun workspaces, committed `bun.lock`, and frozen-lockfile installation |
| Language | TypeScript with strict checking |
| Backend | `Bun.serve`, modular HTTP routing, and Zod runtime schemas |
| AI orchestration | Official `@openai/agents` TypeScript SDK |
| Model | Explicit `gpt-6-astra` default; no silent model substitution |
| Database | Built-in `bun:sqlite`, with migrations and FTS5 available |
| Frontend | React, TypeScript, Vite, Excalidraw |
| Structured/code inspection | CodeMirror or an equivalent accessible editor |
| Progress | Server-sent events, with ordinary HTTP commands |
| Content storage | Application-managed local files, addressed by SHA-256 |
| Optional code execution | Docker with a pinned Bun image and reviewed Bun/TypeScript/SQLite service template |
| Tests | `bun test` for unit/integration tests, Playwright for browser tests, and separate TypeScript checking |

Use a modular monolith. Domain modules MUST NOT import the Agents SDK or execute SQL directly across module boundaries. An AI adapter invokes the SDK; repositories implement persistence. Logical modules do not require separate packages or services.

Bun MUST run the server, Agents SDK adapter, background jobs, and database access. Using Bun only to install packages or launch a Node.js backend does not satisfy this contract. Preserve the API schemas, validation, request limits, uploads, error handling, local-session controls, and SSE behavior when implementing the HTTP layer with `Bun.serve`; these responsibilities do not disappear with the framework change.

Suggested repository layout:

```text
tracework/
  README.md
  IMPLEMENTATION_PLAN.md             # created and maintained during implementation
  specs/
    TRACEWORK-PRODUCT-SPEC.md
    LOOM-FULL-PRODUCT-SPEC.md         # preserved reference
  apps/
    web/
    server/
      src/modules/
        workspace/ source/ evidence/ context/ proposal/
        agent-runtime/ knowledge/ canvas/ architecture/
        decision/ guardrail/ artifact/ repository/
        validation/ jobs/ audit/
  packages/
    contracts/                      # shared schemas and transport types
  fixtures/
    service-desk/                   # synthetic example sources and expected checks
  templates/
    bun-service/                    # trusted Bun/TypeScript/SQLite template
  tests/
  package.json
  bun.lock
```

### 4.2 Process and data layout

Development MAY use a Vite process alongside the Bun backend. The production local build MUST serve the frontend and API from one local origin through `Bun.serve` in one backend process. A bounded job worker runs in that backend process. React and Excalidraw remain browser components.

Scripts explicitly select the Bun runtime. Vite development/build commands use `bunx --bun vite` and `bunx --bun vite build`, or an equivalent pinned local CLI invocation that forces Bun. A Node-targeting executable header must not silently select the backend or frontend build runtime. Playwright or another development-only utility may require Node.js if its tested version needs it; document that exception and exact version separately. Such a utility exception does not authorize moving the application, SDK runtime, jobs, or generated service to Node.js.

The server MUST bind to loopback by default. Remote hosting is outside this release.

`TRACEWORK_DATA_DIR` selects a local data directory. The default is `.tracework-data/` inside the application directory and MUST be ignored by Git. It contains:

```text
tracework.sqlite
blobs/<sha256>
exports/
execution/<run-id>/
backups/
```

The SQLite file MUST reside on local storage, not a shared network filesystem. Temporary execution and extraction files MUST stay under application-owned directories.

Required commands, documented in the implemented README:

- `bun install --frozen-lockfile`: install the committed dependency versions;
- `bun run dev`: start the development application with a Bun backend;
- `bun run build` and `bun run start`: build and run the local production application;
- `bun run typecheck`: run the pinned TypeScript compiler with `--noEmit` through Bun;
- `bun test`: deterministic unit and integration checks without an API key;
- `bun run test:e2e`: browser tests using explicitly identified test fixtures;
- `bun run test:live`: opt-in bounded OpenAI Agents SDK checks running under Bun;
- `bun run test:execution`: opt-in Docker execution checks for the generated Bun service;
- `bun run demo:seed`: create the example workspace;
- `bun run demo:reset --workspace <id>`: reset only an identified example workspace.

Pin the Bun version in project metadata and CI/development setup, and record the actual runtime in diagnostics. Keep one authoritative Bun lockfile for the application workspace; generated export packages carry their own trusted template lockfile. Bun's TypeScript execution/transpilation does not replace `typecheck`, which is a separate required build/verification gate. Configure test discovery so `bun test` excludes Playwright, live-API, and Docker-only suites.

Starting without an API key MUST still allow ingestion, browsing, manual modelling, review of existing proposals, search, deterministic validation, and export. AI controls explain the missing prerequisite. Keys are loaded server-side from environment configuration and are never included in exports or browser state.

### 4.3 Early Bun compatibility verification

Before broad feature implementation, verify the selected runtime/dependency combination with a small working integration. Record versions, platform, commands, outcomes, and unrun checks in the implementation plan:

- the actual Agents SDK under Bun: typed tool calls, structured results, streamed events, cancellation, session persistence, and serialized approval resumption after process restart;
- `bun:sqlite`: FTS5, foreign keys, transactions/rollback, WAL behavior, migrations, and consistent backup/restore on the supported macOS host and Linux execution environment;
- `Bun.serve`: multipart upload limits, local-session controls, SSE heartbeat/reconnect, and orderly shutdown without losing durable job state;
- the chosen PDF/DOCX extraction libraries, including their worker/process dependencies, running under Bun;
- React/Vite/Excalidraw development and production builds, separate type checking, and the selected Playwright launcher;
- the pinned Bun container and fixed generated-service checks when Docker is available.

These are compatibility checks, not a second application prototype or a reason to replace the runtime. Use Bun-compatible dependency versions and keep platform-specific code behind adapters. If a live key or Docker is unavailable, mark the corresponding checks unrun, continue independent implementation, and do not claim that integration verified. A blocker must be reported explicitly; silently falling back to a Node application is not permitted.

## 5. Canonical model and versioning

### 5.1 Common rules

Every persisted entity has a stable application-generated ID. Dates are UTC. Every workspace-owned record carries `workspaceId`. APIs and repositories MUST validate workspace ownership, including references supplied by tools. Names are editable labels and never identifiers.

Original bytes, extracted source versions, evidence, accepted revisions, artifact content, and audit events are immutable. An update creates a new revision or version. Soft lifecycle changes do not erase history.

### 5.2 Required entities

| Entity | Required information |
| --- | --- |
| Workspace | ID, name, description, active/archived status, settings, current context version, timestamps |
| Source | ID, workspace, kind, name, authority, classification, active/archived status, latest ready source version |
| SourceVersion | Source ID, ordinal, original hash/blob, extraction state, extractor version, extracted hash/blob, observation time, metadata |
| Evidence | Source version, locator, excerpt, excerpt hash, extraction identity |
| ContextVersion | Workspace, monotonic sequence, parent, timestamp, actor, reason, accepted proposal/command ID, snapshot hash |
| SemanticElement | Stable ID, revision ID, type, name, description, typed attributes, evidence links, assertion kind, lifecycle |
| SemanticRelationship | Stable ID, revision ID, type, source/target element IDs, attributes, evidence links, lifecycle |
| Proposal | Workspace, kind, base context version, operations, evidence, rationale, originating run, review state, derived-from ID, timestamps |
| DecisionRecord | Stable ID/revision, title, context, alternatives, selected decision, consequences, related elements, evidence, lifecycle |
| Guardrail | Stable ID/revision, evaluator key, parameters, severity, scope, enabled state |
| ArtifactVersion | Stable artifact ID, version, kind, immutable content hash, input manifest, validation state, review state |
| RepositorySnapshot | Registration ID, commit SHA, permitted file inventory, content hashes, observation time |
| AgentRun | Kind, frozen input references, runtime/model/prompt versions, state, attempts, usage, limits, timestamps |
| Job | Kind, payload reference, status, lease owner/token/expiry, attempt count, retry time |
| ToolInvocation | Run and attempt IDs, call ID, tool, redacted arguments/result references, status, duration |
| ValidationRun/Finding | Baseline and comparison references, check identity, result, evidence, affected objects, review disposition |
| CanvasScene | Workspace, view ID, scene revision, layout, free content, projection metadata |
| AuditEvent | Workspace, actor, action, subject IDs, before/after version references, time, command/idempotency ID |

Runtime schemas MUST define the concrete representation and discriminated unions before UI or agent integration is built.

### 5.3 Accepted snapshots

For this release, use immutable object revisions with explicit membership tables for each context version. A version references the exact element, relationship, decision, and guardrail revisions it contains. Copying membership rows for these small workspaces is acceptable and preferable to ambiguous historical queries.

The initial workspace has an empty version 0. Each accepted semantic command creates sequence N+1 and advances the workspace head atomically. Read-only historical views MUST resolve names, relationships, evidence, decisions, and policies as they existed at that version.

Source ingestion and artifact generation do not themselves advance the context version. Accepting meaning, architecture, a decision, or a governed guardrail does. Accepting an output artifact changes its review record, not the context it was generated from.

### 5.4 Types and assertions

The initial element registry MUST include:

```text
actor, capability, requirement, user-story, domain-concept,
domain-event, policy, invariant, bounded-context, quality-attribute,
constraint, software-system, container, component, interface,
risk, assumption, open-question
```

Initial relationships include `contains`, `depends-on`, `uses`, `realizes`, `constrains`, `communicates-with`, `produces`, `consumes`, and `conflicts-with`. Each relationship type has permitted endpoint types and attribute schemas. Unknown types or attributes fail validation. Extending the registry in code is supported; a runtime ontology editor is deferred.

Each assertion is `source-stated`, `inferred`, or `human-assumed`. AI-derived elements and substantive relationships MUST have resolvable evidence, or a human must explicitly accept an evidence exception with a recorded reason. Supporting evidence for an inference does not turn that inference into a directly quoted fact.

Glossary aliases and definitions are typed concept attributes. Bounded contexts describe semantic ownership; they MUST NOT automatically become microservices. Events, policies, and invariants have explicit relationships to their applicable concepts and boundaries.

## 6. SQLite, durability, and concurrency

SQLite is the required primary store for every core flow, including jobs and session persistence. There MUST NOT be a PostgreSQL compatibility mode, PostgreSQL-only migration, hidden service dependency, or PostgreSQL requirement in tests.

Configure WAL mode, foreign keys on every connection, a bounded busy timeout, and explicit schema migrations. Fail startup with a useful diagnostic if the required SQLite/FTS5 capabilities are unavailable.

Use `bun:sqlite` with strict parameter binding and explicit conversions between database values and validated application types. Its API is not an interchangeable import for another SQLite driver. Persistence repositories and the SDK session adapter MUST use Bun-supported query, transaction, and snapshot operations; do not depend on `better-sqlite3` native bindings or driver-specific backup APIs. Verify actual SQLite capabilities per platform instead of assuming the macOS host and Linux container ship identical builds.

Required constraints include unique workspace/version sequences, unique source/version ordinals, unique artifact/version ordinals, unique idempotency keys within their scope, and valid workspace-scoped references. Index reference and lookup columns used by graph, proposal, job, and evidence queries.

All governed mutations use short database transactions. No model call, document extraction, filesystem copy, container command, or user wait may occur inside a database transaction.

Semantic commands carry `expectedContextVersionId`. A stale request returns a conflict with the current version and does not partially apply. Scene writes separately carry `expectedSceneRevision`. Two browser tabs cannot silently overwrite each other's semantic edits or canvas layouts.

An acceptance transaction MUST commit proposal state, revised objects, new snapshot membership, workspace head, audit events, and durable follow-up jobs together. Either all commit or none do.

Content blobs are written to a temporary path, hashed, and atomically installed before a referencing database transaction commits. Failed transactions may leave unreferenced blobs; garbage collection must use reachability across all historical references, not just the current workspace head. Automatic history deletion is outside this release.

Backups MUST use a SQLite-consistent backup mechanism and include all referenced blobs plus a versioned manifest. Copying only the live `.sqlite` file while WAL is active is not a backup implementation. Backup creation serializes blob reachability with its database snapshot. Restore validates hashes/schema versions into a separate data directory and never silently overwrites active data.

Workspace archive is reversible. Physical deletion of user workspaces is not required. Example reset and checkpoint restore have the narrower rules in section 19.

## 7. Source ingestion and evidence

### 7.1 Required formats

| Format | Extraction and citation contract |
| --- | --- |
| Markdown/plain text | Preserve normalized text with line ranges and original bytes |
| Text-based PDF | Extract text per page; cite page and extracted text range; retain original PDF |
| DOCX | Extract headings/paragraphs/tables in document order; cite extraction block IDs |
| JSON/YAML/OpenAPI | Preserve parsed structure and text; cite JSON pointers and source lines where available |
| CSV | Preserve headers and row numbers; cite row/column locators |
| Uploaded HTML | Extract inert readable content; cite extraction blocks; never execute scripts or load external resources |
| Local Git snapshot | Cite repository registration, commit SHA, relative file path, and line range |

PDFs with no usable text are marked unsupported for interpretation with an OCR explanation. DOCX/PDF extraction MUST NOT pretend to understand images or recover formatting that the extractor does not preserve. Evidence opens the relevant extracted passage and offers the original document separately.

Default limits: 25 MiB per uploaded document, 200 PDF pages, 2 MiB per repository text file, and a bounded extraction timeout. These are configurable server-side limits. Archive expansion and parser resource use are bounded; unsupported, encrypted, malformed, or oversized files fail without crashing the worker.

### 7.2 Ingestion lifecycle

```text
Upload → store original → queued → extracting → indexing → ready
                                                  ↘ failed
```

The source points to its latest ready version only after successful extraction and indexing. A failed replacement does not displace the prior usable version. Reimporting identical bytes with the same extractor version reuses the existing extraction; a new extractor result has a new extraction identity.

Operational extraction status may advance while ingestion is in progress. Once ready, the extracted content and evidence basis are immutable. A failed extraction retry has a new attempt record; replacing a ready extraction creates a new extraction identity rather than mutating existing citations.

Evidence always points to an immutable source version and extraction. Updating a source never relocates old evidence to the new text. Citation validation checks that the locator resolves and the stored excerpt hash matches. The model may select supplied evidence IDs; it cannot manufacture valid citations by inventing identifiers or page numbers.

The source viewer MUST show source authority, classification, version, extraction warnings, cited passages, and links to dependent accepted concepts.

### 7.3 Source authority and classification

Authority values are `authoritative`, `supporting`, and `informal`. Authority assists interpretation but does not automatically resolve contradictions.

Classification values are `public`, `internal`, and `restricted`. New user uploads default to `internal`; synthetic example sources are explicitly `public`.

- Public sources may be used for AI requests.
- Internal sources require an explicit workspace setting allowing their submission to OpenAI, recorded as a human configuration action.
- Restricted sources are available for local browsing/manual modelling but cannot be submitted to the model in this release.

Human-authored concepts and assumptions also carry a classification, defaulting to `internal`; absence of documentary evidence does not erase that explicit human provenance. Free-form user questions are classified under the same workspace submission setting.

Derived excerpts, model objects, tool results, and generated context inherit the most restrictive contributing classification. Unknown provenance fails closed for model submission. A user may explicitly reclassify a source with an audit reason; an agent cannot. Model-context assembly and every model-facing tool result apply the current policy, including when older snapshots or caches are used.

Source text is untrusted data. Prompt text found in documents never grants tools, changes policies, approves proposals, or supplies application instructions.

## 8. Search and context assembly

Use FTS5 for lexical search over permitted extracted text, evidence, glossary entries, and accepted descriptions. Search results retain workspace, source-version, and context-version references. FTS5 is a derived index and can be rebuilt from canonical records; it is not semantic memory or vector search.

Context assembly MUST produce a stored `ContextPlan` containing:

- task, workspace, frozen context version, and selected source versions;
- selected elements, evidence, decisions, guardrails, and repository snapshots;
- bounded graph expansion and search results;
- evidence IDs available for citation;
- classification decisions, estimated size, exclusions, and truncation notices;
- prompt, schema, and context-assembly version identifiers.

Default assembly selects explicit user scope, relevant lexical matches, and one relationship hop. It MUST NOT send an entire workspace by default. Size limits apply before a model request, and omissions must be visible. Larger tasks require explicit scope expansion or several bounded runs.

An evidence-grounded question uses the same assembly path. Answers distinguish accepted facts, source claims, inference, and unresolved issues, with clickable evidence. Asking a question is read-only. A proposed change becomes a separate reviewable proposal through an explicit action.

Cache keys include content hashes, context version, task/prompt/schema versions, model configuration, and applicable data policy. A cached result never bypasses current policy checks or becomes accepted context automatically.

## 9. OpenAI Agents SDK runtime

### 9.1 Runtime boundary

The official TypeScript Agents SDK is the required agent runtime. Tracework MUST NOT implement its main reasoning loop as a collection of direct Responses calls, substitute the GitHub Copilot SDK, or require a hosted Agents API service.

The SDK normally invokes OpenAI through the Responses API underneath. This is compatible with the requirement: Tracework delegates agent-loop behavior to the SDK while owning application lifecycle and data.

Use explicit `gpt-6-astra` model configuration. The operator MAY configure another compatible OpenAI model; record the actual model on every run and never silently downgrade after an error. Pin SDK versions and maintain one adapter around language-specific SDK APIs.

The runtime interface exposes start, cancel, inspect, and resume operations using application IDs. Domain modules depend on this interface, not SDK run objects. Test implementations can return fixtures; the production runtime must call the SDK.

### 9.2 Specialist roles

| Role | Input | Output | Allowed capabilities |
| --- | --- | --- | --- |
| Interpreter/modeller | Selected sources and accepted model scope | Concepts, relationships, glossary, boundaries, questions | Read/search evidence; submit semantic proposal |
| Critic | Evidence and a draft proposal or design | Contradictions, weak claims, missing information | Read/search; submit advisory findings |
| Architect | Accepted scope, constraints, and decisions | Two alternatives, trade-offs, proposed ADRs | Read/search; submit architecture proposal |
| Generator | Frozen accepted scope and artifact contract | Structured draft artifact or bounded file set | Read evidence/model; write draft artifact files |
| Change analyst | Deterministic dependency report and selected versions | Explained impacts and remediation proposals | Read comparison/evidence; submit findings/proposal |
| Workspace assistant | User question and bounded context | Answer with citations, optional suggested next action | Read/search only |

Role definitions can share code and model configuration. They do not require separate processes. Add specialist calls only where input/output contracts or tool permissions differ.

The backend orchestrates the major stages. Inside a stage, the SDK MAY call a bounded specialist as a tool. Handoffs are not required for the main workflow. A free-running manager agent MUST NOT decide when to accept, publish, execute, or move the workspace to another product stage.

Interpretation and architecture workflows include one critic pass before human review. A critic may flag or recommend revision but cannot approve an output. Additional revision is an explicit bounded job, not an unbounded self-improvement loop.

### 9.3 Tool contracts

Every tool has a name, description, Zod input/output schema, role allowlist, workspace scope, side-effect classification, and idempotency policy. Workspace identity and the frozen context version are injected by trusted application code, not selected by the model.

Initial tools:

```text
search_evidence, read_evidence, read_source_excerpt,
read_context_elements, read_relationships, read_decisions,
read_guardrails, read_repository_file, read_change_report,
request_evidence_access, submit_proposal,
submit_advisory_findings, write_draft_artifact
```

Tools MUST return bounded results and explicit errors. They enforce classification on data leaving the application and validate IDs against the run's permitted scope. Additional source access beyond that scope requires a new user-authorized scope, not a guessed ID.

`request_evidence_access` is the concrete SDK approval flow: an agent may request access to additional source versions from the workspace's policy-permitted source catalog, explaining their relevance. Catalog visibility exposes only permitted metadata, not unapproved document contents. The tool requires SDK human approval and grants nothing before the operator approves the exact version list. Approval appends a stored scope extension to the context plan; it does not change the frozen accepted model version. Data-policy checks still apply, denial remains effective, and a changed workspace head prevents stale resumption. The ordinary workflow should begin with sufficient user-selected scope so this is an exception rather than a repeated confirmation step.

No model-facing tool may accept proposals, advance the workspace head, alter classification, disable guardrails, write arbitrary host files, execute arbitrary SQL, perform arbitrary HTTP requests, or start an unrestricted shell.

Proposal and artifact writes create drafts only. Model output must satisfy the application schema and referential checks before persistence. Malformed output is an unsuccessful attempt; one schema-repair attempt is allowed within the same run budget.

SDK input/output guardrails are supplementary. Required checks also run at the application tool and command boundaries, including nested specialist calls. They MUST NOT depend solely on an initial agent guardrail.

### 9.4 Sessions, paused runs, and accepted state

Use application-controlled local conversation history. Implement a `bun:sqlite`-backed session adapter for the pinned TypeScript SDK's session interface. Do not assume that a Python `SQLiteSession` example is a TypeScript API. A memory-only session is insufficient for persisted conversations. Verify history and resumable state round-trips in a real Bun process, including after restart.

Store session history, serialized resumable run state, and accepted semantic state separately. History is not replayed into accepted tables. Required task facts are reassembled from a specific accepted snapshot and permitted evidence for each run.

Use SDK interruptions for tool-level human review when needed. A paused tool call records its precise action, arguments, input versions, and SDK state. The user approves or rejects through an application endpoint; the backend rechecks policy and context before resuming. An approval of old arguments must not authorize revised arguments.

Semantic proposal review normally occurs after an agent has completed and persisted a draft. It does not require keeping an SDK run paused for days. Acceptance is a separate human application command.

Serialized state records SDK/schema versions and a hash. Resume uses stored, trusted state only. If a software upgrade prevents deserialization, mark the run as requiring a new attempt; retain the draft, logs, and accepted model. Sessions and paused tool approvals do not provide crash-safe jobs or exactly-once execution by themselves.

### 9.5 Budgets, tracing, and errors

Default per top-level task: 12 model turns, 40 application tool calls, one nested specialist level, and a ten-minute deadline. Nested calls and schema-repair attempts count toward shared limits. Administrators of the local process may configure smaller or larger ceilings; agents cannot.

Record model, runtime, prompt version, context plan, calls, outputs, duration, actual available token usage, and errors. Unknown usage is shown as unknown. Do not invent cost totals or embed an unmaintained pricing table.

The UI shows task summaries, tool activity, evidence, rationales, and results. It does not require or claim to expose private model reasoning.

Application run history is local and durable. External SDK trace export MUST be explicitly configured and disabled by default until the operator opts in to transmitting permitted trace data. Sensitive arguments and document contents are redacted from ordinary logs.

Handle missing credentials, unavailable models, network errors, rate limits, refusals, invalid structured output, turn limits, and tool failures as distinct visible outcomes. Retrying a failed run must not duplicate accepted changes or previously completed draft writes.

## 10. Durable jobs and recovery

### 10.1 States

Agent runs use:

```text
queued → running → completed
            ├── awaiting-approval → queued → running
            ├── failed
            ├── interrupted
            └── cancelled
```

`completed` means a valid task result or draft was persisted, not that a proposal or artifact was accepted. Awaiting approval is a durable paused state. Retrying creates a new numbered attempt linked to the same task; previous attempt records remain immutable.

Extraction, validation, generation, and execution use the same job service but need not all be agent runs.

### 10.2 Queue behavior

Store the queue in SQLite. Claim work in a short atomic transaction using a lease owner, expiry, and monotonically increasing fencing token. Default worker concurrency is two jobs, including at most one code-execution job. Heartbeat every ten seconds with a sixty-second lease; defaults are configurable and tested.

Every completion or side-effecting tool submission checks the current attempt, lease token, cancellation state, and idempotency key before persistence. An expired worker cannot commit late results over a replacement attempt.

Idempotency keys include run, attempt-independent logical operation identity, and tool call/action identity as appropriate. Replayed callbacks return the original result. Explicitly regenerated outputs get a new generation identity; they are not mistaken for callback replays.

Model requests and external execution cannot be made exactly-once by a database transaction. If a crash leaves their outcome uncertain, mark the attempt interrupted. Do not automatically repeat a potentially costly or side-effecting operation without either a known replay-safe result or an explicit retry decision. A retry may incur another inference charge and must be visible as another attempt.

Automatic retry is limited to at most two retries for classified transient, replay-safe failures, with backoff. Validation failures, refusals, policy blocks, and approval waits are not transient retries.

### 10.3 Restart and cancellation

At startup, reconcile expired leases and persisted run states. Resume supported saved state or show an interrupted task with retry available. Never present an unknown outcome as completed.

Cancellation records intent durably, aborts supported SDK/network calls, terminates the corresponding execution container, and prevents late proposal/artifact publication. Already persisted drafts remain inspectable and are labelled with their originating run state. Accepted state remains intact.

Progress events have monotonic sequence IDs stored with the run. SSE reconnect uses the last event ID or returns a current-state snapshot with a continuation cursor. A disconnected browser does not cancel a job. Progress streaming is separate from database acceptance transactions.

## 11. Proposal review and semantic commands

### 11.1 Proposal representation

A proposal contains a base context version and an ordered list of typed operations. It records supporting evidence, assumptions, rationale, deterministic validation results, critic findings, originating run, and immutable revision identity.

Supported operations:

```text
create-element, update-element, supersede-element,
create-relationship, update-relationship, supersede-relationship,
create-decision, supersede-decision,
create-guardrail, update-guardrail
```

Updates specify changed fields; arbitrary database patches and executable code are forbidden. Operation IDs are unique within a proposal. References to newly created objects use explicit local references resolved during acceptance; other references are stable accepted IDs. Every operation is validated against the type registry and the proposed resulting graph.

Superseding an element requires explicit treatment of its active relationships. The application MUST NOT leave dangling edges or silently remove dependent concepts.

Review status is `pending`, `accepted`, `rejected`, or `superseded`. Freshness is a separate `current` or `stale` property computed against the workspace head. No proposal expires solely because time passes.

### 11.2 Required review interface

Users can:

- compare the proposed result with its base version;
- inspect evidence, assumptions, affected objects, and critic findings;
- accept all, reject with a comment, edit into a derived revision, or request AI revision;
- select a dependency-complete subset for acceptance;
- add an explicit evidence exception with a reason;
- inspect previous proposal revisions and their review history.

Partial acceptance MUST validate operation dependencies. It creates a derived proposal for selected operations; it does not mutate the original payload. Acceptance of the child supersedes the original and creates a pending remainder proposal when operations remain. Rebase and validate that remainder against the resulting context; unresolved dependencies keep it unacceptably stale or invalid until revised. The user sees what was accepted and what remains.

### 11.3 Acceptance contract

The human command includes proposal revision, expected context version, review decisions/overrides, and an idempotency key.

Before committing, revalidate all references, evidence, type schemas, dependencies, classifications where applicable, and blocking guardrails. The acceptance transaction performs the atomic changes described in section 6 and records stable IDs assigned to proposal-local references.

If the proposal base is stale, acceptance returns a conflict. Revalidation creates a derived proposal against the current head with a new visible diff and impact report. It requires a fresh user acceptance, even if the server judges the operations still applicable.

Repeated submission of the same acceptance returns the original result. Reuse of that key with a different command payload is a conflict. Rejecting or editing a proposal that has already been accepted also fails as a conflict.

### 11.4 Direct human editing

Explicit create, rename, edit attributes, create relationship, and supersede actions are permitted without an AI proposal. Each carries expected context version, a reason, validation, and audit metadata and creates a new accepted version.

Human assumptions without documentary evidence remain labelled as such. An agent-suggested follow-up to a human edit becomes a proposal and cannot be included invisibly in the human command.

## 12. Canvas, domain modelling, and architecture

### 12.1 Excalidraw projection

Managed shapes and connectors carry `traceworkObjectId`, object kind, projected context version, and `managed: true` in their metadata. Free sketches have no semantic identity.

Positions, dimensions, colors, and grouping are scene state. The adapter preserves them when regenerating managed labels and edges. Removing a shape from a view hides it in that view; it does not delete the underlying model.

Managed text and connector endpoints cannot be silently edited into new accepted meaning through Excalidraw callbacks. Such actions open an explicit semantic edit or are restored from the model with an explanation. A free sketch can be promoted through a reviewed human command specifying its semantic type and relationships.

Auto-layout is an explicit command and does not run over a user's arrangement after every semantic change. A deterministic layout implementation is sufficient. Historical context views are read-only and can use an available saved layout without showing current names as historical facts.

Scene persistence uses its own revision checks. On conflict, preserve the local unsaved draft and offer reload or save-as-view. No last-write-wins overwrite and no CRDT dependency are required.

### 12.2 Required views

- semantic model view with filters by type and bounded context;
- glossary table, aliases, definitions, evidence, and unresolved conflicts;
- bounded-context map with relationships;
- C4 system-context view;
- C4 container view;
- proposal overlay/preview visibly distinguished from accepted content;
- version comparison and affected-dependency highlighting;
- accessible object/relationship tables supporting the same governed edits.

Component records may be modelled and inspected. Full component, deployment, sequence, and state-diagram editors are deferred. Export required views as SVG or PNG and include the context version in export metadata or caption.

### 12.3 Architecture alternatives

Architecture generation uses accepted scope, quality attributes, constraints, current decisions, and permitted evidence. The designer produces two meaningfully different alternatives with assumptions, benefits, costs, risks, and proposed C4 elements. If two viable alternatives cannot be justified, it must explain that limitation rather than invent a false comparison.

Alternative objects remain draft proposal data. A critic evaluates them against the selected constraints and evidence. Deterministic validation separately checks schemas, references, and required relationships.

Selecting an alternative leads to a reviewable proposal that includes architecture objects and its ADR. Acceptance records the choice and consequences together. Replacing an accepted decision creates a successor; it does not rewrite the old rationale.

An ADR includes context, alternatives considered, chosen option, rationale, consequences, affected elements, evidence, unresolved risks, author, and accepted version. Architecture may remain a modular monolith even when the domain has several bounded contexts.

## 13. Artifact generation and exports

### 13.1 Required artifact types

- Markdown solution specification;
- architecture report and ADR collection;
- OpenAPI 3.1 contract;
- JSON Schema definitions;
- test plan with requirement-to-test mapping;
- implementation package containing the selected artifacts, relevant model/evidence summaries, constraints, and a coding-agent brief;
- bounded TypeScript service module, tests, and generation diff as described in section 14;
- validation/change-impact report.

Artifacts MUST have working preview and download actions. Generating an artifact never silently changes accepted source meaning or decisions. Proposed semantic changes discovered during generation are separate proposals.

### 13.2 Provenance manifest

Every artifact version records:

```text
artifact ID, artifact version, content hash, kind
workspace ID and input context version
selected element and relationship revision IDs
decision and guardrail revision IDs
source-version and evidence IDs, relevant hashes
repository commit/file references, when used
input artifact IDs, versions, and hashes, including accepted API contracts
dependency scope: selected objects, selected subgraph, or whole workspace
generator/template/prompt/schema versions
agent run, model, SDK version, Bun/runtime version, generation time
validation runs/results and missing checks
classification and acceptance history
```

The manifest is generated from actual run inputs and validated references. Model-supplied provenance is not trusted without reconciliation. Whole-workspace outputs explicitly declare that broader dependency scope.

Artifacts retain immutable content versions. Editing generated content creates a new version with a human-edit record and reruns applicable checks. Its manifest retains original lineage and records the edit.

### 13.3 Review, validation, and export

Artifact review state is `draft`, `reviewed`, `accepted`, or `superseded`. Freshness and validation state are independent: an accepted artifact can later become stale, and a draft can pass syntax checks.

Required validation includes parse/schema checks, resolvable provenance, valid internal references, and type-specific gates. OpenAPI/JSON Schema artifacts must pass the selected validators. Test plans must map cases to accepted requirements, including recorded omissions. Markdown lint alone is not evidence of semantic correctness.

Use JSON Schema 2020-12 for standalone definitions and OpenAPI 3.1-compatible schemas for contracts. Validation resolves references only within the supplied artifact package or an application-approved local schema catalog. It must not fetch arbitrary remote URLs or read host paths named in a generated `$ref`.

Export may include unaccepted artifacts if their status is clearly recorded. Verified source-code acceptance requires the execution gates in section 14. No unperformed gate may be represented as passed.

The implementation package contains readable files and a machine-readable manifest. Its brief states accepted scope, unresolved questions, constraints, expected behavior, required checks, and permitted implementation flexibility. It must be usable without a running Tracework instance.

Downloads are inert file responses. Artifact preview sanitizes rendered content; generated HTML or script is never executed in the application's own origin.

## 14. Repository integration and bounded code generation

### 14.1 Repository sources

The user registers an existing local Git repository path and selects a commit. Resolve branches/tags to a commit SHA when creating a snapshot. Working-tree changes are excluded from that snapshot and are visibly reported rather than silently included.

Import permitted text files using Git object reads without checkout, hooks, submodule initialization, LFS downloads, or execution. Skip binary files, credential files, build outputs, dependency directories, and files outside configured limits. Resolve real paths and reject escapes through symlinks. File inventory and exclusions remain visible.

The repository source provides manifests, selected code, tests, and configuration as evidence. It does not claim to derive a complete or accurate architecture automatically. Updating to another commit creates a new snapshot and an explicit file comparison.

Source repositories are read-only throughout this release. Tracework does not modify their worktrees, indexes, branches, or remotes. Users can export a patch or generated package for application through their normal development workflow.

### 14.2 Supported generated target

The required generation target is a small **Bun/TypeScript HTTP service module using `Bun.serve` and `bun:sqlite`**, embedded in a reviewed template. It supports one selected bounded-context slice, its API contract, migrations, application logic, and tests. The exported package includes a pinned Bun version, `bun.lock`, Bun start/test commands, and a separate TypeScript checking command; it must run outside Tracework using the same declared runtime.

The user selects accepted requirements, domain concepts, an accepted API contract, decisions, and invariants. Scope is frozen before generation. The UI shows included and excluded requirements. Requests beyond the target contract return a scope explanation rather than a pretend complete application.

The agent may create or revise files only under the template's declared generated-source, migration, and generated-test directories. Paths are validated, size/count limits are enforced, and package manifests, lockfiles, execution scripts, and container definitions are immutable trusted inputs. Dependencies are fixed by the template; dependency changes require a future template revision by the application developer.

The Agents SDK generator uses typed draft-file tools. It is not given an unrestricted host shell. A generated package and unified diff against the template or previous generated artifact are inspectable and exportable without executing them.

### 14.3 Optional isolated execution

Use an application-controlled Docker runner with fixed argument arrays and commands. Core SDK agent/tool APIs are sufficient; beta SDK sandbox-agent APIs are not a required dependency.

Build the runner image from a pinned Bun image, the reviewed template, and frozen-lockfile dependencies before executing generated code. Pin the image digest and target architecture and keep its Bun version aligned with the qualified generated-service template. This trusted preparation may require network access. Generated commands run under Bun without network access and cannot install dependencies or switch runtimes.

Each execution uses a fresh disposable container with:

- no host credentials, OpenAI key, Tracework database, or Docker socket mounted;
- non-root execution, dropped capabilities, no privileged mode, resource limits, and a wall-clock timeout;
- a read-only root filesystem with explicitly bounded scratch/output locations;
- immutable inputs for the reviewed contract, template, and acceptance harness;
- generated code copied into the execution area, never mounted over trusted harness files;
- no published host ports in this release.

A Git worktree or directory boundary alone is not execution isolation. If Docker or the expected isolation settings are unavailable, execution remains disabled; do not fall back to running untrusted generated commands on the host.

The runner performs fixed steps: TypeScript checking through Bun, static checks, a fresh `bun:sqlite` migration test, immutable contract/acceptance checks, and generated unit tests using `bun test`. Capture exact input hash, Bun/SQLite versions, runner image digest, commands, exit codes, bounded logs, duration, and result artifacts. A user may rerun after generating a new version; reports from an old hash cannot validate new code.

Generated tests supplement the independent harness. Passing tests establishes only the checked behaviors and contracts, not universal correctness. Failed gates keep the artifact unverified. At most one explicit user-requested repair run is launched at a time, within normal budgets; there is no endless automatic repair loop.

### 14.4 Acceptance and cleanup

The user inspects the diff and execution report before accepting verified code. All configured mandatory gates must pass for the exact artifact hash. Without execution, code may be exported as an unverified draft but cannot receive the verified acceptance label.

Cancellation stops the associated container. Cleanup deletes only execution resources recorded as owned by that run; it must not remove arbitrary containers or user directories. Preserve reports and immutable generated artifacts after ephemeral execution cleanup.

No commit, push, merge, deployment, or protected-branch mutation is included.

## 15. Validation and change analysis

### 15.1 Three different outcomes

Tracework MUST distinguish:

1. **Staleness:** a referenced input or dependency changed since an output was produced.
2. **Deterministic failure:** a specific schema, contract, invariant, reference, or execution check failed.
3. **Advisory concern:** an agent identified a possible semantic inconsistency that needs human review.

A changed hash is not proof of incorrect behavior. A plausible AI explanation is not an executed test. The UI and exported reports preserve these distinctions.

### 15.2 Dependency tracking

Maintain queryable dependencies from source versions/evidence to accepted object revisions, from model objects to decisions/architecture, from these objects to artifact manifests, and between dependent artifact versions. An accepted successor API contract can therefore make generated code and tests stale even when the semantic context version is unchanged. Unaccepted draft alternatives do not silently replace accepted artifact inputs. Record whole-workspace and selected-subgraph dependencies explicitly.

When an input changes, calculate direct dependents and transitive reachability over declared dependency edges. Display the paths explaining each impact. The graph traversal is deterministic and can run without an API key.

For a selected-object artifact, a new context version with no changed referenced revisions does not alone make the artifact stale. Changes to selected-subgraph membership invalidate an artifact that declared dependency on that subgraph. A whole-workspace artifact becomes stale after any accepted semantic change. Unknown dependency coverage is reported as uncertain and conservatively requires review.

Replacing a source marks evidence-backed claims as based on an older source version; it does not silently modify or reject those claims. Reinterpretation produces a new proposal. Changing an unrelated source does not invalidate every artifact.

### 15.3 Required checks

| Check | Method | Result boundary |
| --- | --- | --- |
| Evidence validity | Resolve source/extraction locator and hash | Confirms citation integrity, not truth |
| Model integrity | Type, endpoint, required-field, and lifecycle validation | Confirms structural consistency |
| Proposal freshness | Compare base and current accepted versions | Blocks stale acceptance |
| Architecture constraints | Evaluate declared graph/contract rules | Confirms only configured rules |
| Artifact freshness | Compare declared dependencies and hashes | Identifies stale or uncertain outputs |
| Contract validity | OpenAPI/JSON Schema validators | Confirms supported schema constraints |
| Repository comparison | Commit/file inventory and selected contract changes | Identifies observable source changes |
| Supported generated code | Section 14 execution gates | Reports exact executed checks |
| Semantic consistency | SDK critic/change analyst with cited evidence | Advisory findings |

General code understanding, arbitrary architecture conformance, and production runtime drift are outside the release. Imported repositories receive evidence/change reports; a green general-correctness badge is forbidden.

### 15.4 Findings and remediation

Each finding has a stable ID, check/version, deterministic/advisory origin, severity, baseline/comparison IDs, affected objects, evidence or observed execution data, explanation, and proposed action.

Dispositions are `open`, `resolved`, `dismissed`, and `accepted-risk`. Human dismissal/risk acceptance requires a comment. Resolving a deterministic failure requires a successful replacement check against the relevant current inputs; dismissing it must not turn that failed check into a pass. A superseding run does not delete old findings.

A user can request a remediation proposal from selected findings. The proposal identifies the findings it addresses and follows normal acceptance rules. After acceptance, rerun affected checks; agent claims that a fix worked are insufficient to mark deterministic findings resolved.

## 16. Guardrails and local security

### 16.1 Mandatory platform checks

These cannot be disabled through workspace configuration or agent tools:

- AI has no proposal-acceptance or accepted-state mutation tool;
- unknown tools and out-of-scope workspace references are rejected;
- stale semantic commands do not commit;
- source policy is enforced before model submission and on tool results;
- source content is data and cannot override runtime instructions;
- citations, types, references, and generated file paths are validated;
- governed mutations and human overrides are audited;
- repository sources and protected branches remain unmodified;
- generated commands require the isolated execution profile;
- accepted code verification requires passing checks for the current hash.

### 16.2 Workspace guardrails

Ship a fixed registry of declarative evaluators with validated parameters:

- `require-evidence`: source-derived concepts need evidence or a reasoned human exception;
- `interface-change-needs-decision`: specified interface changes require an accompanying or referenced accepted decision;
- `require-requirement-mapping`: implementation packages/tests cover selected requirements or list approved omissions;
- `forbid-context-dependency`: disallow specified declared dependency edges between bounded contexts;
- `require-quality-attribute`: selected architecture scopes must address configured quality attributes;
- `advisory-architecture-review`: model-assisted review, always labelled advisory.

Results are `pass`, `warn`, `approval-required`, or `block`. Only evaluators explicitly supporting an override can return `approval-required`. Mandatory platform blocks cannot be overridden. An advisory finding cannot masquerade as a deterministic pass or block.

Governed changes to workspace guardrails create accepted context versions. Workspace source-transmission settings are separately versioned human configuration with audit events; current restrictions apply even when working with older model versions.

### 16.3 Local application boundary

The local server validates allowed Host and Origin values, does not use wildcard CORS, and protects state-changing endpoints with a local session and CSRF controls. Local identity is not an enterprise authentication system. Binding to a public interface is unsupported by default.

Enforce upload/extraction limits, path containment, inert previews, safe archive handling, and output escaping. Document and artifact names never become unsanitized filesystem paths or shell command strings.

Application credentials are never model context, tool results, browser bundles, workspace records, logs, backups, or generated packages. Source content and trace data are submitted only under the configured policy. Tracework MUST NOT claim complete PII detection from a heuristic or model scan.

No cloud account beyond the configured OpenAI API account is required for core AI flows. Optional external trace export and Docker image preparation have clearly documented network behavior.

## 17. User experience and application API

### 17.1 Workspace layout

The header shows workspace, active mode, accepted version, and pending review count. The main navigation exposes Sources, Model, Decisions, Guardrails, Artifacts, Repositories, Validation, and Runs without requiring knowledge of internal package names.

The main pane hosts a source viewer, model canvas/table, comparison, or artifact preview. A contextual inspector shows evidence, attributes, lineage, and review actions. Run progress remains available without covering the user's work.

Required states include first launch, empty workspace, absent key, missing optional execution environment, uploading, extraction failure, running task, pending review, stale proposal, conflict, cancellation, interrupted job, and recoverable error.

The user can navigate from an artifact to its input model version, from a concept to its evidence, and from a changed source to affected artifacts. These are real links to persisted objects, not generated prose suggesting where to look.

Agent/model/runtime details belong in expandable run details. The main flow uses terms such as source, proposal, accepted version, decision, and artifact. User actions must not require choosing database IDs or editing tool JSON.

### 17.2 Editing and accessibility

Save indicators distinguish visual drafts, pending proposals, and accepted changes. Persisted state survives refresh; unsaved text is preserved or clearly warned about before navigation.

Keyboard-accessible lists and forms cover every governed action. Canvas-only gestures are not the sole route to creating/editing concepts or relationships. Provide visible focus, labelled controls, sufficient contrast, non-color-only statuses, reduced-motion support, and accessible error messages. Target WCAG 2.2 AA for the implemented interface and record any remaining gaps.

Large evidence excerpts and graph lists use pagination or virtualization. Long tasks show meaningful current activity and cancellation rather than a single indefinite spinner.

### 17.3 HTTP contracts

Use `/api` routes with shared runtime schemas. Required endpoint families:

| Resource | Required actions |
| --- | --- |
| `/workspaces` | List, create, inspect, rename, archive; inspect/update permitted settings |
| `/workspaces/:id/sources` | Upload, list versions, inspect extraction, replace, archive, reclassify |
| `/workspaces/:id/evidence` | Search, fetch cited passage, inspect dependents |
| `/workspaces/:id/context` | Get current or historical snapshot, diff versions, submit explicit human command |
| `/workspaces/:id/proposals` | List, inspect, derive/edit, validate, accept, reject, request revision |
| `/workspaces/:id/views` | Load/save scenes with revision checks; export projection |
| `/workspaces/:id/decisions` | Inspect current/historical ADRs; propose changes through semantic commands |
| `/workspaces/:id/guardrails` | Inspect, evaluate, and propose governed updates |
| `/workspaces/:id/artifacts` | Generate, inspect versions/manifests, validate, review, accept, export |
| `/workspaces/:id/repositories` | Register local path, inspect commit inventory, import snapshot, compare |
| `/workspaces/:id/validation-runs` | Start, inspect findings, record disposition, request remediation |
| `/workspaces/:id/agent-runs` | Start scoped task/question, inspect, cancel, retry, resolve permitted SDK approval |
| `/runs/:id/events` | Reconnectable SSE progress |
| `/backups` | Create/list local backups; validate a restore into a separate data directory |
| `/demo` | Create example, list checkpoints, clone checkpoint, reset identified example |
| `/health` | Process/storage/migration status and optional capability availability; never secrets |

The implementation defines precise methods and payloads in shared schemas and generated API documentation before wiring clients. Semantic writes include `expectedContextVersionId`; scene writes include `expectedSceneRevision`; replayable commands include an idempotency key.

Asynchronous starts return an accepted response and persisted run/job ID. Conflicts, validation failures, missing prerequisites, policy blocks, and internal errors have stable machine-readable codes and useful user messages. Errors never include keys or raw stack traces in the ordinary UI.

No generic table-edit endpoint, arbitrary SQL endpoint, or direct model-to-database bridge is permitted.

## 18. Performance, observability, and quality envelope

The reference demonstration envelope is 100 source documents, 500 active semantic elements, 1,500 active relationships, and 100 context versions in a workspace. This is a verification dataset, not a SQLite capacity limit. The implementation documents tested hardware and actual measurements.

For this dataset, target local indexed reads below 500 ms at the 95th percentile and cached page interactions within one second, excluding large downloads and external model latency. Measure these targets; do not claim success from an empty database. Graph rendering may filter by scope to keep the interface usable.

Ingestion, model calls, generation, backup, and execution are asynchronous. Large parsing work MUST run outside the request/event-loop hot path using a Bun-compatible worker or bounded subprocess. `bun:sqlite` calls are synchronous: keep queries and transactions short, batch bulk work, and avoid monopolizing the HTTP event loop. SQLite connection objects must not be shared across worker boundaries; each database-owning worker configures its own connection and follows the same transaction/lease rules.

Local diagnostics include queue depth, running/interrupted attempts, extraction failures, proposal outcomes, validation failures, tool durations, and known usage. Export a redacted diagnostic bundle with versions and operation IDs; it excludes document contents by default.

No essential action depends on hosted telemetry. Ordinary restart, model failure, browser disconnection, or optional integration failure must not corrupt accepted context.

## 19. Repeatable demonstration and recording

### 19.1 Example project

Ship a fictional **neighborhood repair-service scheduling system** with synthetic public data. Its source pack contains:

1. a customer brief describing appointment requests, technician assignment, and customer notifications;
2. an existing OpenAPI contract requiring a registered customer account;
3. stakeholder notes explicitly asking for guest appointment requests;
4. engineering constraints covering privacy, auditability, and a small local deployment;
5. a changed brief requiring a suitably certified technician for certain repairs;
6. a small repository snapshot/example contract for comparison.

The conflict between mandatory accounts and guest requests is intentional. The later certification requirement affects technician selection, scheduling rules, the API contract, and related tests. An unrelated glossary definition is included to verify that change analysis is selective.

The example domain is fixture data, not hard-coded application behavior. A separate small fixture from another domain verifies that the type registry and workflows are generic.

### 19.2 Demonstration sequence

1. Open or create the example workspace and inspect its source versions.
2. Interpret selected documents and inspect citations and the account/guest conflict.
3. Review/edit proposals, record the chosen resolution, and accept the model.
4. Inspect glossary and bounded contexts in the table and canvas.
5. Generate architecture alternatives, inspect critique, and accept one with an ADR.
6. Generate a specification, OpenAPI contract, test plan, and implementation package.
7. Generate the bounded scheduling service module and inspect its diff.
8. If Docker is available, run the fixed checks and inspect actual results.
9. Import the changed certification requirement.
10. Show affected concepts, decisions, contracts, and tests; verify unrelated items remain unaffected.
11. Review a remediation proposal and regenerate selected artifacts.

Each step is a normal product operation and remains usable with user-supplied inputs.

### 19.3 Checkpoints and replay

Provide checkpoints for imported sources, accepted model, accepted architecture, generated artifacts, and introduced requirement change. Checkpoints are versioned, validated workspace exports containing the necessary immutable data and provenance. A checkpoint can clone into a new workspace with remapped IDs and preserved origin metadata. It does not overwrite history in an existing workspace.

Cloning or restoring never resumes imported queued jobs, agent sessions, SDK approvals, or execution containers. Preserve those records as historical/imported where included, and require fresh runs and authorizations. Example code-verification results remain labelled recorded; they do not certify a new local execution environment.

`demo:reset` requires an explicit workspace ID and refuses non-example workspaces. It archives the identified example workspace and creates a fresh seeded workspace, returning its new ID. No unrelated workspace or registered repository is changed.

Prepopulated checkpoints and recorded runs are visibly labelled **Example checkpoint** or **Recorded run**. They are never presented as a fresh model response. Live execution remains separately available and records real usage and outcomes.

Saved run events support inspecting or replaying progress for recording. Replaying events is read-only and does not call tools, charge inference, or apply commands again. Fresh runs may vary in timing and wording; acceptance checks focus on meaningful outcomes.

A recording guide in the implemented README states prerequisites, checkpoint choices, expected observable outcomes, and how to restore the example without losing real work.

## 20. Acceptance criteria and verification

### 20.1 Core acceptance

| ID | Required observable outcome |
| --- | --- |
| C01 | A frozen-lockfile install starts the server, Agents SDK runtime, jobs, and SQLite access under the pinned Bun version, without a Node backend, PostgreSQL, or another database service. |
| C02 | Without a key, manual modelling, source browsing, deterministic validation, and exports work; AI actions explain the missing prerequisite. |
| C03 | Multiple saved workspaces survive restart and cannot reference each other's private object IDs through API or tool calls. |
| C04 | Every supported source format produces resolvable evidence; failed replacement extraction preserves the previous ready version. |
| C05 | Real Agents SDK interpretation running under Bun creates a schema-valid, evidence-linked proposal; it cannot modify accepted context. |
| C06 | Accept/reject/edit/revise/partial-selection paths retain review history and never leave dangling references. |
| C07 | Acceptance is atomic and idempotent; a forced mid-transaction failure leaves the prior head and all accepted data intact. |
| C08 | Concurrent commands against the same version produce one valid successor and a conflict for the stale command. |
| C09 | Historical model, decision, and guardrail views resolve the original revisions after later edits. |
| C10 | Managed canvas layout persists across projections; visual edits cannot silently rename, delete, or reconnect accepted concepts. |
| C11 | Architecture generation produces reviewable alternatives and critique; the chosen objects and ADR are accepted together. |
| C12 | Every required document/contract/package artifact has usable content, provenance, preview, download, and actual applicable validation. |
| C13 | An implementation package can be read and used independently of Tracework and explicitly lists unresolved scope. |
| C14 | Repository import is pinned to a commit, cites exact files, and leaves the user's repository unchanged. |
| C15 | Supported code generation produces inspectable/exportable template-bounded files; absent Docker is reported as Not run. |
| C16 | Source changes produce explainable dependency impacts; unrelated objects do not become stale solely because the workspace version advanced. |
| C17 | Deterministic failures, staleness, and advisory concerns remain distinguishable in UI and exports. |
| C18 | Restricted content and disallowed internal content cannot reach the model through assembly, tools, caches, old snapshots, or nested agents. |
| C19 | Restart, cancellation, expired leases, and duplicate callbacks do not duplicate mutations or convert unknown outcomes into success. |
| C20 | SDK approval state can survive restart and resume for unchanged authorized arguments; changed/stale actions require renewed review. |
| C21 | Full-text search and evidence-grounded questions navigate to real objects; the question path has no mutation tools. |
| C22 | Backup and restore recover the database and referenced blobs consistently, with hashes checked and active data preserved. |
| C23 | Example checkpoints clone correctly; reset refuses non-example workspaces; replay never performs side effects. |
| C24 | Required governed actions are available by keyboard and through forms/tables, with documented accessibility verification. |
| C25 | The reference workload is measured, long tasks remain asynchronous, and omissions against performance targets are reported. |
| C26 | A second-domain fixture works without domain-specific application code. |
| C27 | The Bun compatibility checks in section 4.3 have recorded outcomes, actual versions, and explicit unrun checks; type checking and test discovery are verified independently of runtime transpilation. |

### 20.2 Execution integration acceptance

| ID | Required observable outcome when the execution environment is enabled |
| --- | --- |
| E01 | A generated Bun/TypeScript/SQLite module is checked under the pinned Bun image and can pass the defined valid example; the exported package includes its runtime, lockfile, and runnable Bun commands. |
| E02 | A deliberately broken migration, contract violation, or implementation fails the appropriate gate and cannot be accepted as verified. |
| E03 | Changing artifact bytes invalidates prior execution results. |
| E04 | Generated code cannot read host application data/keys, use network access, or replace the immutable acceptance harness. |
| E05 | Timeout/cancellation terminates the owned execution and preserves a truthful report; unrelated containers/resources remain untouched. |
| E06 | Missing Docker or failed isolation checks never trigger host-shell execution. |

The integration must have real implementation and automated tests. If Docker is unavailable during development, report execution checks as unrun and keep verified-code acceptance disabled until these checks have been performed. This does not excuse leaving a fake execution button or success response.

### 20.3 Test strategy

Required deterministic tests cover:

- schema/type registries and graph referential integrity;
- evidence locator/hash validation and supported extraction failure modes;
- snapshot reconstruction, transactional rollback, idempotency, and two-tab conflicts;
- proposal dependency selection, stale revalidation, and human evidence exceptions;
- source policy inheritance, adversarial document instructions, and tool allowlists;
- lease fencing, duplicate completions, interrupted attempts, cancellation, and saved approval state;
- projection round-trips, scene conflicts, and separation of visual/semantic edits;
- artifact manifests, selective dependency invalidation, and report dispositions;
- repository path containment and read-only import;
- generated-file containment, immutable execution inputs, and execution-result hash binding;
- SQLite backup/restore, migration compatibility, checkpoint remapping, and example reset boundaries.

Unit and integration tests run with `bun test`; strict TypeScript checking runs separately. Browser tests use Playwright and cover the normal source-to-artifact workflow, review conflicts, evidence navigation, restart persistence, and the changed-requirement demonstration against the Bun server. Verify the chosen browser-test launcher under Bun or document its development-only runtime exception. Tests may use a labelled fixture runtime; production configuration may not silently enable it.

An opt-in live suite MUST exercise the actual pinned Agents SDK under Bun and the configured model through interpretation, critique, architecture generation, structured artifacts, citation validation, and a bounded change-analysis task. Include the streaming, cancellation, session, and approval-resumption checks from section 4.3. Grade expected concepts, resolvable evidence, explicit uncertainty, and structural invariants rather than exact prose. Record Bun/SQLite/model/SDK/prompt versions and actual outcomes. No API key is required for the ordinary deterministic test suite.

Maintain a small evaluation corpus containing clear requirements, contradictions, missing evidence, stale proposals, invalid citations, and prompt-injection attempts. A plausible answer is not sufficient if it bypasses review or produces broken references.

## 21. Implementation sequence and completion rules

Implementation proceeds in the following order within one spec-to-implementation effort:

1. **Foundations:** qualify and pin the Bun stack through section 4.3; establish Bun workspace/scripts/lockfile, `Bun.serve`, schemas, `bun:sqlite` migrations, workspace storage, snapshots, source/evidence persistence, application startup, and job recovery.
2. **Governed model:** proposal commands, direct human edits, transactional acceptance, audit, concurrency, and historical queries.
3. **Discovery:** supported extraction, FTS5, context plans, Agents SDK adapter, specialist contracts, sessions, and interpretation/review UI.
4. **Modelling and design:** canvas projection, glossary/context views, architecture alternatives, critique, decisions, and guardrails.
5. **Engineering output:** artifact generation/validation, manifests, exports, read-only repository import, bounded code generation, and optional isolated execution.
6. **Continuous change:** dependency analysis, validation findings, remediation, regeneration, and selective staleness checks.
7. **Demonstration and verification:** fixtures, checkpoints/replay, backups, accessibility, performance measurements, live SDK checks, and execution-profile checks.

The coding agent MUST create and maintain `IMPLEMENTATION_PLAN.md` in the Tracework directory. Each item records its requirement IDs, state (`not started`, `in progress`, `blocked`, `implemented`, or `verified`), relevant files, verification evidence, and remaining limitations. Update this state as work proceeds; do not use a final checklist to retroactively claim unperformed validation.

The agent may resolve routine library and implementation details within this contract, pin compatible versions, and document those choices. It must not silently replace Bun as the application runtime, SQLite, the Agents SDK, evidence-backed proposals, or the accepted-model authority to simplify implementation.

Completion requires functioning workflows, passing relevant deterministic checks, documented live/execution verification status, and an accurate README. Screens with fixture-only behavior, in-memory substitutes for required persistence, unsupported success badges, and undocumented required services do not satisfy the contract.

The final implementation report distinguishes completed and verified core functionality, implemented but externally unverified integrations, and explicitly deferred features. It links to the maintained plan and does not call a missing required flow complete.

## Appendix A. Comparison with the preserved Loom specification

This table explains intentional changes. The original file remains the reference for its own broader target; this Tracework document is sufficient to implement the local product.

| Original Loom area | Tracework decision | Consequence |
| --- | --- | --- |
| Product principles and accepted semantic context (§§0, 2) | Preserved | Evidence, proposals, human authority, and versioned meaning remain central. |
| Product positioning and relationship section (§1) | Replaced with standalone product definition | No external programme or instructional system is a product/runtime dependency. |
| Roles and modes (§§3–4) | Five modes retained; one local operator | No enterprise role administration or multi-tenant deployment. |
| Canonical graph and review (§§6–7) | Preserved and made concrete | Immutable revisions, snapshot membership, stale rejection, and explicit partial acceptance. |
| GitHub Copilot SDK (§8) | OpenAI Agents SDK for TypeScript | SDK runs specialist/tool loops; Tracework owns durable workflow. |
| Model runtime | Explicit GPT-6 Astra default | OpenAI API credentials required for AI; actual model/version recorded. |
| Node.js/Fastify backend (§25) | Bun and `Bun.serve` | Bun runs the application, Agents SDK, jobs, and generated service; Bun manages dependencies and unit/integration tests. |
| PostgreSQL (§§8, 11, 25, 27) | SQLite through `bun:sqlite` throughout | No PostgreSQL in runtime, development, tests, queues, or the generated sample module. |
| Optional pgvector (§11) | FTS5 plus graph retrieval | No mandatory embeddings/vector extension; lexical and semantic capabilities remain distinct. |
| Broad connectors and formats (§§11–12) | Local document upload and pinned local Git sources | Several useful formats remain; live SaaS, database, telemetry, and OCR integrations are deferred. |
| Strategic modelling (§13) | Preserved | Glossary, bounded contexts, events, policies, and invariants remain available. |
| Architecture views (§14) | C4 context/container required | Component objects are supported; dedicated advanced diagram editors are deferred. |
| Excalidraw (§15) | Preserved with explicit projection controls | Layout remains independent of meaning; accessible forms/tables support governed operations. |
| Realtime collaboration (§16) | Single operator, multiple tabs | SSE progress and optimistic conflicts; no multiplayer CRDT system. |
| Architecture derivation (§17) | Preserved | Alternatives, critique, human choice, and ADR acceptance form a complete workflow. |
| Artifact generation (§18) | Multiple real output types | Specifications, contracts, test plans, and coding-agent packages are required. |
| Repository engineering (§19) | Read-only source import plus one generated target | Useful code generation/checks without unrestricted repository automation or publishing. |
| Validation and drift (§20) | Retained with precise evidence boundaries | Selective staleness, deterministic checks, and advisory semantic review; runtime telemetry deferred. |
| Guardrails (§21) | Built-in rules and declarative workspace policies | Deterministic enforcement remains; arbitrary executable policy plugins are deferred. |
| S3-compatible object storage (§§25, 27) | Local content-addressed files | No object-storage service required; consistent backup includes database and blobs. |
| PostgreSQL jobs (§25) | SQLite leases and bounded local workers | Durable background tasks without Redis, a broker, or distributed workers. |
| Identity/deployment (§§28, 31–32) | Loopback local application | No OIDC/Entra, Kubernetes, or cloud provisioning in the core installation. |
| Observability/evaluations (§§29–30) | Local run history, opt-in external tracing, deterministic/live suites | Real behavior remains inspectable without required hosted telemetry. |
| Broad package structure (§33) | Small monorepo with logical backend modules | Preserve boundaries without building many deployable services. |
| Reliability and performance (§35) | Preserved with explicit local verification envelope | Restart, atomicity, idempotency, accessibility, and measured performance remain requirements. |
| MVP/full distinction (§37) | One explicit local release and an optional execution environment | Required behaviors, external prerequisites, and deferred breadth are unambiguous. |
| Implementation sequence and acceptance (§§38–39) | Tracework-specific sequence and acceptance IDs | A coding agent can maintain implementation and verification state against this contract. |

## Appendix B. Documentation basis

These official references were reviewed while adapting the specification. They explain runtime capabilities; application requirements above remain explicit and package versions must be pinned and verified at implementation time.

- [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk): application-owned tools, storage, and deployment with SDK-owned agent loops.
- [Models and providers](https://developers.openai.com/api/docs/guides/agents/models): explicit model configuration and the OpenAI Responses transport.
- [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents): loops, sessions, streaming, and continuation strategies.
- [Orchestration and handoffs](https://developers.openai.com/api/docs/guides/agents/orchestration): bounded specialists and agents as tools.
- [Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals): tool checks, approval interruptions, and serialized resumption.
- [Results and state](https://developers.openai.com/api/docs/guides/agents/results): result/history/state distinctions.
- [Sandbox agents](https://developers.openai.com/api/docs/guides/agents/sandboxes): optional SDK execution facilities; beta sandbox APIs are not required by this release.
- [OpenAI Agents SDK integration testing](https://developers.openai.com/blog/skills-agents-sdk): published JavaScript SDK packages are tested across runtimes including Bun; Tracework still verifies its pinned feature set.
- [Bun runtime](https://bun.sh/docs/runtime): Bun execution and explicit runtime selection for scripts and CLIs.
- [Bun SQLite](https://bun.sh/docs/runtime/sqlite): native driver, synchronous transactions, WAL, binding behavior, and platform differences.
- [Vite with Bun](https://bun.sh/guides/ecosystem/vite): frontend development/build commands and explicit Bun runtime selection.
- [SQLite appropriate uses](https://sqlite.org/whentouse.html): local application storage.
- [SQLite WAL](https://sqlite.org/wal.html): concurrent readers, serialized writers, and local storage constraints.
- [SQLite FTS5](https://sqlite.org/fts5.html): full-text indexes and query behavior.
