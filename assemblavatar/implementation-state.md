# Assemblavatar implementation state

The authoritative requirements are in [specs/assemblavatar.md](specs/assemblavatar.md).
This file tracks implementation and evidence; it does not replace the specification.
OpenSpec is not required for this initial implementation.

## Delivery plan

- [x] A: Bun server, TypeScript editor, Three.js viewer, repositories, asset storage and CRUD.
- [x] B: Versioned procedural runtime, primitives, CSG, loft/lathe/extrusion, deformation, materials and sample programs.
- [x] C: Type checking, AST validation, isolated QuickJS worker, time/memory/geometry budgets and diagnostics.
- [x] D: Server-side GPT-6 Astra structured generation and bounded automatic repairs.
- [x] E: Deterministic seven-view rendering, Astra evaluation and bounded refinement.
- [x] F/G infrastructure: Photo/texture uploads, view roles and object/avatar profiles.
- [x] H: Selection, transform gizmos, material controls, persistent overrides, grouping, source editor, branching and revision preview comparison.
- [x] I: GLB/GLTF/PNG export and GLB reloading.

These checks cover the implemented MVP capabilities. The empirical photo-object and avatar-likeness success criteria in phases F/G are still open; they need real reference sets and human assessment.

## Architectural decisions

- Preserve Bun and local filesystem persistence. This repository is a local application, not a Cloudflare deployment.
- Use the section 46 `buildModel(ctx): ModelBuildOutput` contract.
- Canonical state consists of source, parameters and revision-scoped manual overrides.
- Execute untrusted programs only in QuickJS WASM inside a disposable worker. Do not use host eval, Node VM, or browser execution of generated code.
- Render and export trusted scene data in a separate headless Chromium context using Three.js.
- Keep `.env`, generated assets and local application data ignored by Git.
- GPT-6 Astra is the only generative model; examples are explicitly hand-written runtime fixtures.

## Verification — 2026-09-15

- TypeScript checking and production frontend/runtime bundle build pass.
- Unit/integration/geometry tests cover AST/type validation, forbidden APIs, compiler reference directives, budgets, timeouts, cancellation, synchronous/asynchronous builders, storage, concurrent reads and mutation locking, geometry, stable object identities, grouping, generation repairs, render-feedback refinement and rejection of major geometry issues.
- Real Chromium tests cover seven distinct PNG views, deterministic repeated renders, checked-in visual baselines, GLB/GLTF export and geometry-preserving GLB reload.
- The real-renderer API workflow passes: build → upload reference → manual transform → save revision → export → import → restore → duplicate. Invalid image data, external GLB resources and cross-assemblage revision access are rejected.
- **Live Astra house generation passed** using the existing ignored `.env`: 50 objects / 42 meshes / 504 triangles, 87,560-byte GLB, seven previews, accepted in the first iteration. Astra noted only a minor wall-seam issue. Local report: `data/benchmarks/house.json`.
- **Live multimodal Astra refinement passed**: supplied the source, previous renders and a clearly labelled synthetic reference; changed the roof to terracotta red, retained the geometry and saved revision 2. Astra accepted with no issues. Local report: `data/benchmarks/house-refinement.json`.
- `.env` is ignored and untracked; no credential values were printed or copied into source, tests or reports.

The handwritten examples and synthetic reference are labelled honestly. No real photograph or real-person likeness claim is inferred from these tests.

## Remaining specification work / limitations

- Run the six-item live benchmark with real reference sets; validate photo-guided object recognisability, stylised avatar identity and realistic likeness. Only house generation and house refinement have live evidence so far.
- Add standalone arbitrary-mesh bevel, bridge convenience APIs and automatic UV unwrapping if required beyond the provided bevelled extrusion/loft/primitive UV tools.
- Implement the specification's later items: rigging, animation, local vision/face landmarks, source-diff UI and collaboration. Preview comparison is implemented.
- Imported GLB is explicitly recorded as an imported artifact; it does not have a procedural builder. Source-driven editing/duplication requires generating or writing a procedural replacement.
- UI components compile, but a full interactive browser QA pass was not performed. Rendering/GLB tests use real headless Chromium. Optional WebMCP tools are feature-detected; no supported browser WebMCP context was available for verification.
- QuickJS execution has hard VM memory/time limits. TypeScript compiler and Chromium host memory are not subject to the VM heap quota. This is a single-user local application, not an independently audited multi-tenant execution service.
- The JSON repository supports one server process per data directory. A database/transactional store and deployment authentication are future operational work.

## Workflow decision

Continue maintaining this implementation-state file alongside the existing specification. Add OpenSpec only if a future change needs an explicit proposal/approval workflow; it is not a prerequisite to implementing or running Assemblavatar.

## Martest timeout investigation — 2026-09-15

- Original job failed at the hardcoded 180-second AI deadline, before producing source. All five uploaded photos survived refresh.
- Made the deadline configurable (600 seconds by default), added correlated failure metrics, and restored latest-job progress/error state when reopening an assemblage.
- Live retry generated source in 172 seconds, repaired a validation error, built 135 meshes / 130,192 triangles, and rendered all seven views. Evaluation requested refinement; the refinement request timed out after about 250 seconds, before the application deadline. No approved revision was committed.
- Switched Responses calls to background creation and status polling, with bounded retrieval retries and provider cancellation. Kept `store: false`; temporary provider retention for background polling is documented in README.
- Added recovery from a saved build attempt, retaining evaluation/acceptance checks. Recovery rebuilt the head, but the provider returned `credit_balance_exhausted`. Retrieved the response directly to verify that specific error and made it visible in the saved Martest job. Further paid retries stopped.
- Saved source: `data/attempts/attempt_250f9be4-26d2-4e85-9e1a-94c3a83a6afd.json`. Recovery request: `/private/tmp/assemblavatar-martest-recover.json`. These are local ignored data, not delivery fixtures.
- Headless browser check confirmed Martest's terminal status survives refresh with no uncaught page errors. Live active-job refresh was not captured before the job failed.
- No likeness success is claimed. Completing AI evaluation/refinement requires replenished API credits.

- Local draft rendering produced seven PNGs and an unapproved GLB under `data/diagnostics/martest-draft/`. The front view was inspected: geometry is present, but visibly approximate and still needs refinement. The worker emitted a QuickJS disposal assertion after returning the build; local rendering/export still completed. This cleanup warning needs follow-up.
- Targeted checks: 11 tests passed across Astra request lifecycle, job recovery, generation and HTTP API checks.

## Martest after credit replenishment — 2026-09-15

- Resumed the saved source in job `job_ebe62453-1207-4646-860e-3a6c25c5adae`, with all five original photographs and a two-pass limit. Credits are working: both evaluations, the refinement and the automatic code repair completed.
- Background refinement completed in about 263 seconds without the previous connection timeout. The complete run took about 470 seconds.
- Verified active progress before and after an actual Chromium page refresh; both showed the running evaluation and no uncaught page errors.
- Refined geometry built and rendered: 125 meshes, 75,744 vertices, 143,344 triangles. Saved attempt: `attempt_26571853-d913-422e-b4eb-fcbe171ba0ce`.
- Final evaluation rejected realistic anatomy and recognisable likeness (eye rims, pointed nose, thin mouth, blocky lower face, rigid hair). The two-pass limit was respected; no approved revision was committed and no further paid retries were started. The remaining problem is model quality, not credits or request handling.
- Preserved refined source and diagnostic previews under `data/diagnostics/martest-refined/`, explicitly unapproved. Recovery can use the refined attempt ID on a future run.
