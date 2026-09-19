# Tracework implementation plan

Authority: `specs/TRACEWORK-PRODUCT-SPEC.md` v1.1 only. The Loom reference is not read or used.

## Qualification ledger

- Host: Linux x86_64, Bun 1.4.0 (34cbb9a40). macOS checks: not run (host unavailable).
- Dependencies installed and pinned in package.json / bun.lock. React 18 selected to match Excalidraw's peer contract.
- Initially no key or Docker was present. The user later supplied a working key in ignored, untracked `.env`. Actual API qualification now ran with that key and `gpt-6-astra`; Docker remains unavailable. No runtime/model fallback was used.
- The spec explicitly selects Vite; this takes precedence over the starter AGENTS.md preference for HTML imports. Vite is invoked through Bun, and production remains one Bun server.

| Work | Requirements | State | Files / evidence | Remaining limitations |
|---|---|---|---|---|
| Runtime, schemas, storage, local security | C01–C03, C07–C09, C27 | verified | `bun run typecheck`, production build; SQLite WAL/FTS/FK, HTTP Host/Origin/session/CSRF tests; pinned workspace manifests/lock | Linux qualified; macOS not run |
| Governed model and proposals | C06–C09, C18 | verified | Immutable snapshot, forced rollback, idempotency, stale-head, partial selection, derived/rejected draft tests; browser acceptance | Verification covers named tests, not exhaustive UI combinations |
| Extraction, evidence, search | C04, C21 | verified | Original/failed replacement tests; text/JSON/YAML/CSV/HTML/DOCX and actual PDF subprocess; locator/text/hash tampering; browser citations | No OCR; complex layout extraction is explicitly limited |
| SDK, sessions, approvals, jobs | C05, C18–C20, C27 | verified | Actual SDK tests under Bun; fresh-process approval roundtrip; live streaming/tool/structured output/session reopening/approval/cancellation, interpretation and critic | Live cases are synthetic; arbitrary provider failures cannot all be induced. Production approval endpoint and process-restart SDK primitive are tested at separate layers |
| Canvas, architecture, decisions, guardrails | C10–C11, C24 | implemented | Real Excalidraw projections, saved layouts and conflict drafts, proposal overlays, historical forms; browser C4 load; two live architecture proposals with critique pass structural checks | Every canvas gesture/overlay combination has not been browser-automated; tables/forms are the governed alternative |
| Artifacts, repository, bounded generation | C12–C15 | implemented | Actual OpenAPI/AJV/mapping validators, immutable provenance/exports, readonly pinned Git fixture test; live specification/OpenAPI/test-plan checks pass | Live bounded code generation and standalone export passed; execution is externally unverified |
| Isolated execution | E01–E06 | implemented | Pinned Docker adapter, read-only package/contract/harness, independent HTTP observer, bounded logs/resources/deadline; opt-in qualification script | Docker absent: all container outcomes **not run**. Verified-code acceptance remains unavailable. Initial HTTP profile is named-record collection GET/POST |
| Change analysis and validation | C16–C17 | verified | Selective dependency paths and staleness; strict live certification remediation passes after extraction-race correction | Semantic/advisory conclusions require human review; automated disposition coverage is narrower than the complete UI |
| Backups, example checkpoints, replay | C22–C23, C26 | verified | Consistent SQLite/blob restore, hash checks, remapped checkpoint clone, example reset boundary; second-domain browser flow | Later-change checkpoint is user-saved; recording guide explains steps |
| Browser, performance, docs | C24–C25, C27 | verified | Four browser workflows pass; extra modal-focus/capture run 2/2; tested Sources mobile axe has zero violations; finish reviewer resolved six findings; README/API/DEMO/design docs | Screen-reader and macOS verification not run; automated accessibility verdict is scoped to tested surface |

States describe evidence, not intent. Each row is updated as checks complete. Unperformed gates never count as verified.

## Recorded outcomes

- Final deterministic run: **31 passed, 0 failed, 129 assertions**, three files. Strict TypeScript checking and production build pass independently.
- Browser launcher: pinned Playwright 1.63.0 under **Bun**, Chromium 151.0.7922.34 (explicit installed executable). No Node application/runtime substitution. The native browser connector was unavailable; Playwright performed verification.
- Reference workload: 100 sources, 500 elements, 1,500 relationships, 100 context versions. Snapshot p95 **5.90 ms**, FTS p95 **0.36 ms**, rendered model-filter interaction p95 **33.94 ms** over 25 samples including Playwright transport. Host and exact numbers are in `benchmark-results.json`.
- Live sequence: initial sandbox network timeout; retry reached OpenAI. A coarse first suite missed invalid structured artifact formats. Strict validator assertions exposed that gap; format-specific generation instructions and a bounded one-shot repair were added. The strict rerun passed SDK compatibility, interpretation/critique, read-only question, two architecture alternatives, specification, OpenAPI and mapped test plan. A duplicate extraction in the live test setup then failed closed during remediation; the fixture now waits for its durable extraction job and ready extraction reuse is idempotent. The targeted remediation rerun passed. These prior failures are preserved in the local reports, not counted as passes.
- Live reports: `/tmp/tracework-live-hQ1bWH/live-report.json` (successful phases plus resolved remediation failure), `/tmp/tracework-live-hQ1bWH/live-remediation-report.json` (corrected remediation). Sanitized durable summary: `docs/verification.json`.
- Bounded code generation/export: **passed**, actual configured model, synthetic catalog scope, protected template and generated-file validation. Report `/tmp/tracework-live-code-eRuY2k/live-code-report.json`. No generated code was executed on the host.
- `.env` is ignored and untracked. Credential value is not printed or placed in documentation, build configuration or source control.

## Explicit boundaries

Execution qualification is unrun, not a simulated pass. The optional runner implements a narrow collection API profile; general APIs require a reviewed extension. The product does not include OCR, collaborative hosting, arbitrary shell execution, automatic history deletion, vector search, or general application correctness proofs. Required external integrations are implemented; the unavailable Docker environment prevents verifying E01–E06 here. Detailed canvas gesture coverage and assistive-technology coverage remain narrower than the complete interface.
