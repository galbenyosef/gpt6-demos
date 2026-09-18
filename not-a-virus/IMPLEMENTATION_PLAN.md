# NotAVirus implementation plan and progress

This file is the persistent execution record for the coding agent. Implement [the specification](specs/not-a-virus-spec.md) and keep this plan current throughout the work. The specification defines product behavior; this file defines implementation order, verification, and handoff state. Current user instructions take precedence over both. Record any necessary interpretation below instead of silently changing the product contract.

All paths below are relative to `not-a-virus/`. Keep the project in this directory; the spec's illustrative `notavirus/` tree does not require another nested project.

## 1. Current state — update at every handoff

| Field | Current value |
|---|---|
| Last updated | 2026-09-18 — implementation and automated verification complete; release gates explicitly pending |
| Specification baseline | Revision 0.3, pack `schema = 1` |
| Overall implementation | `in_progress` — software complete; release acceptance pending |
| Active task | None — available implementation work complete; acceptance tasks below are blocked on desktop/art evidence |
| Next task | T10 — remaining desktop/idle acceptance; then T11 — finished character art |
| Next concrete action | On a controlled Mac desktop, verify physical click-through, import chooser, menu Quit, mixed displays/Spaces/fullscreen and sustained idle CPU below 1%; obtain authored final character animation for T11. |
| Software prototype | `not_ready` for full acceptance — working implementation and signed bundle available; G02/G04 remain pending |
| v1 release | `not_ready` — finished default artwork and desktop acceptance remain pending |
| Character assets | Default, Paco and gatita have validated diagnostic manifests/transparent atlases/previews. Both supplied JPEG references are preserved. No finished character animation is claimed. |
| Blocker to starting software work | None; software is implemented. |
| Checks performed for this plan | 23 portable tests and main-thread native integration checks passed; formatting, strict Clippy, release bundle/signature/plist checks passed. Live sprite/menu observed. Full desktop/performance acceptance remains separate. |

Historical starting point (before implementation):

- `Cargo.toml` defines package `not-a-virus`, version `0.1.0`, edition `2024`, with no dependencies.
- `src/main.rs` only prints `Hello, world!`.
- The spec and both reference images exist. The runtime crates, application bundle, tests, and animation assets do not.
- At plan initialization, the parent repository reported `not-a-virus/` as untracked; project files have since been staged. Preserve existing files, staging, and unrelated workspace work.
- `.gitignore` now excludes `/target/`; no generated files under that directory are tracked. Workspace setup in T01 remains pending.
- Rust/Cargo were available during the readiness review. Recheck the selected toolchain and macOS SDK when beginning implementation rather than treating an earlier environment check as a build result.

## 2. How the coding agent maintains state

1. On every resume, read this state section, the task ledger, recent execution-log entries, and the spec sections relevant to the next task. Inspect the actual files and working-tree changes before editing. Reconcile stale state with evidence; do not restart completed work just because conversation context is missing.
2. The task ledger is authoritative for status. Use `not_started`, `in_progress`, `blocked`, or `done`. Keep at most one active task in this execution sequence. Check off individual deliverables as they are verified.
3. Before starting a task, set it to `in_progress`, record the active task and next concrete action, and identify its prerequisites. Work within the existing scope without requesting confirmation for routine implementation choices.
4. After each meaningful work unit, update its checklist, evidence, decisions, and next action. Do this before any handoff, interruption, or final response, even when the task is unfinished.
5. Mark a task `done` only when its exit criteria pass. Record actual commands/manual observations and their outcomes in the execution log; distinguish `passed`, `failed`, and `not_run`. Compilation alone does not prove desktop behavior or artwork quality.
6. If blocked, record the exact missing input or failing check, attempts made, affected tasks, and the smallest next action. Continue an independent ready task where possible. Missing final art does not block the core engine, pack loader, or placeholder-based app verification.
7. When a later change invalidates an earlier check, reopen the affected task or mark the corresponding validation evidence stale. Rerun relevant checks before restoring completion. Do not repeat unrelated checks without a reason.
8. Keep this file as the single progress record. Put implementation rationale in code/README where appropriate, but do not create a competing checklist elsewhere. Keep log entries concise and append new entries rather than erasing failures or unresolved limitations.

Implementation should continue through all available v1 software tasks. A working placeholder prototype is a useful milestone, but it is not a finished character pack or a v1 release. Final art and hardware-dependent checks must remain visibly pending if unavailable.

## 3. Task ledger

| ID | Task | Depends on | Status | Evidence / remaining work |
|---|---|---|---|---|
| T01 | Workspace and dependency boundaries | — | `done` | Workspace compiles; Rust 1.97.1 / SDK 27.0; target-scoped objc2 0.6.4 / frameworks 0.3.2; macOS floor 13.0 |
| T02 | Native macOS shell and early bundle smoke test | T01 | `blocked` | Implemented; native flags/lifecycle checks and live launch/reopen pass. Full manual click-through/Quit acceptance not established by CUA. |
| T03 | Pack schema, atlas loading, and validation | T01 | `done` | 9 loader/import tests pass; strict schema, static RGBA PNG, named/grid geometry and contained asset paths |
| T04 | Deterministic clip player | T03 | `done` | Runtime tests pass for exact boundaries, variable durations, chain carry, flip modes and pause |
| T05 | Movement and behavior state machine | T04 | `done` | 13 deterministic runtime tests pass, including full cycle, interruptions, edges, zero radius and 60/120 Hz |
| T06 | Default, Paco, and gatita diagnostic packs | T03 | `done` | Default/Paco/gatita diagnostic atlases and minimal/named fixtures pass real loader; generated original geometry |
| T07 | Renderer, cursor, and simulation integration | T02, T05, T06 | `blocked` | Renderer, main-thread 60 Hz display link/timer, monitors, display geometry and pause complete; native checks pass. Mixed-display and physical click-through checks pending. |
| T08 | Pack management, menu controls, persistence, and logs | T07 | `blocked` | Software and automated/native checks complete; manual import-dialog/restart acceptance remains pending. |
| T09 | Release bundle and documentation | T08 | `done` | Fresh staged 1.5 MiB relocatable bundle, icon/LICENSE/plist/PkgInfo, ad-hoc signing verified; README and PACK_AUTHORING.md written. |
| T10 | Automated, desktop, and performance verification | T09 | `blocked` | Automated checks passed; full desktop matrix and a controlled sustained-idle benchmark remain pending. |
| T11 | Finished default artwork and release acceptance | T10, final artwork | `blocked` | B01: final authored animation atlases absent; diagnostic assets explicitly not release art. Reference-only art direction preserved. |

Default execution order is T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11. If one task is blocked, the dependency column determines which other tasks can proceed. T06 can be completed before T04/T05 if fixtures are needed for their tests.

## 4. Scope and implementation decisions

### Fixed requirements

- macOS first, Rust, AppKit via `objc2`; macOS types and calls stay in the application crate and on the main thread.
- One small transparent `NSPanel`, one active pack, and click-through behavior. No desktop-sized overlay, extra permissions, network runtime, input injection, or inspection of other applications.
- Static transparent PNG atlases, TOML schema 1, optional named-region JSON, and `.petpack` zip import. No GIF/APNG playback, video, scripting, or executable pack extensions.
- Preserve the phase/clip separation, timing, chase hysteresis, interruption policies, coordinate conventions, and defaults in spec §§3.3 and 4.2–4.4. Do not replace them with pointer-speed-only idle/run switching or generic ordered rules.
- Character names are `Paco` / id `paco` and `gatita` / id `gatita`. Paco is exhausted but friendly and willing, not anxious or unhappy. gatita is sweet and playful; rolling and visual purring belong in her idle sequence. No audio in v1.
- v1.1 work stays out of the v1 completion path: hot reload, optional interactive petting/pixel hit-testing, and import/authoring conveniences. Physical orbiting/jumping paths and custom behavior rules are later extensions.

### Working decisions — revise only with a recorded reason

These resolve implementation details without adding user-facing scope. If the spec changes, reconcile this table before continuing.

| ID | Decision | Reason / source |
|---|---|---|
| D01 | `notavirus-core` owns plain pack/runtime types, playback, and simulation. `notavirus-pack` depends on core and handles serialization, files, PNG/JSON decoding, validation, and zip import. The app depends on both. | Makes spec §5's core/loader split concrete without a dependency cycle or AppKit in tests. |
| D02 | Keep Cargo package `notavirus-app` and explicitly name its executable `notavirus`. | Aligns spec §7's build command with `Contents/MacOS/notavirus`. |
| D03 | In v1, show Click-through checked and disabled; do not offer a toggle that makes the character intercept clicks. | Spec §3.5's chase-only requirement takes precedence over the menu sketch's apparent toggle. |
| D04 | Map Small/Medium/Large to 1.0/1.5/2.0; check the actual persisted selection. First launch uses 1.0 (Small). | Spec §§3.2 and 6.3 give these values; the menu sketch's Medium check is illustrative. |
| D05 | Use UserDefaults for active pack, scale, click-through, and pause. | One of spec §8's allowed persistence choices; no duplicate preferences store. |
| D06 | Bundle a pack with id `default` so the specified first-launch fallback resolves. Use separate Paco/gatita fixtures for behavior testing. Final default art may be based on either character. | Spec §§6.3 and 12 require a valid default but only one polished character to ship. |
| D07 | Start with the supported 60 Hz main-run-loop timer for the early native smoke test. Add the display-link path and retain the timer fallback before T07 completes. | Exposes AppKit lifecycle problems early without postponing spec §3.4. Display-link callbacks must schedule/coalesce work onto the main thread. |
| D08 | Resolve duplicate pack IDs deterministically in documented search order; first valid candidate wins. Reject an import that would silently replace an existing ID. | Spec §4.1 establishes discovery order but not collisions; keep the active/default pack safe and errors understandable. |
| D09 | Final animated artwork is not present. Use clearly identified diagnostic geometry for software tests and retain the original reference JPEGs. | The current art direction is reference/pose work; do not mistake renamed, resized, or bobbing JPEGs for authored animation clips. |

Select compatible crate versions using the installed toolchain, current official documentation, and downloaded crate sources when needed. Record significant API/version decisions and commit the application lockfile as part of normal repository work if commits are in scope. Do not invent API signatures from the illustrative spec or add an async runtime/GPU framework to work around a small integration issue.

## 5. Ordered work

### T01 — Workspace and dependency boundaries

Spec: §§5, 7, 9. Deliverables: workspace `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `crates/{notavirus-core,notavirus-pack,notavirus-app}/`, and appropriate build-output ignores.

- [x] Inspect applicable repository instructions and preserve the spec, reference images, and existing unrelated changes.
- [x] Convert the starter into a three-crate workspace with dependency direction D01; remove/replace the obsolete starter entry point after the new app entry point exists.
- [x] Keep native dependencies target-scoped to macOS. Core/pack libraries must build and test on Linux without compiling AppKit.
- [x] Add only dependencies needed by implemented steps; pin their resolved versions in `Cargo.lock`. Specify the app binary name per D02.
- [x] Establish plain coordinate, pack, frame, clip, role, screen-geometry, and tick input/output types; preserve separation of screen points and atlas pixels.

Exit: Cargo recognizes all three members; core/pack checks work independently; the macOS app entry point compiles. Record the actual Rust version, SDK/deployment-target choice, and dependency results.

### T02 — Native macOS shell and early bundle smoke test

Spec: §§3.1–3.2, 3.4, 3.6–3.7, 6.1–6.2, 7. Deliverables: app lifecycle, `panel.rs`, initial `status.rs`, `resources/Info.plist`, initial `scripts/bundle.sh`.

- [x] Create the accessory application, status item, About and Quit actions; keep native owners/delegates alive for the application's lifetime.
- [x] Create the borderless, nonactivating transparent panel with the exact click-through, shadow, level, collection, and activation behavior from §3.2. Use a simple diagnostic rectangle at this stage.
- [x] Implement single-instance detection for this app; a second launch returns attention to the existing menu-bar app and exits without creating another panel. Use the platform's application lifecycle facilities, not process/window inspection.
- [x] Add the provisional main-thread timer, cleanup on Quit, and an initial relocatable `.app` bundle with `LSUIElement`, executable name, resources, and deployment target.
- [ ] Smoke-test the bundle: no Dock icon, no TCC prompt, clicks reach the underlying app, Quit releases the panel and process, and a second launch does not duplicate it.

Exit: a local native app launches and quits cleanly with the required window behavior. Movement and character rendering can remain pending. Log any native test that could not be performed rather than assuming it passed.

### T03 — Pack schema, atlas loading, and validation

Spec: §§4.1–4.3, 4.6, 9, 10.1. Deliverables: loader modules in `notavirus-pack`, public validated core types, focused malformed/valid fixtures.

- [x] Parse schema 1 metadata, atlas, behavior, motion, and arbitrary `[states.<name>]` clip definitions with all specified defaults. Required roles are idle/moving, not fixed clip names.
- [x] Enforce role loop types, explicit missing references, optional-role behavior, finite numeric bounds, timing alternatives, and clip-chain validity. Reject `[[rules]]`, unknown behavior keys/enums, and unsupported schemas/presets.
- [x] Load a static RGBA PNG once; reject APNG, invalid dimensions, inconsistent grids, or missing/out-of-bounds frames. Support top-left row-major grid indices and untrimmed/unrotated named regions.
- [x] Convert atlas coordinates at a documented boundary; retain frame dimensions and anchor data so the renderer does not guess orientation or mirroring origin. Premultiply alpha exactly once at the rendering boundary.
- [x] Resolve all referenced files within the pack root; enforce file/dimension limits before expensive allocations and return useful structured errors.
- [x] Test the spec's complete minimum/Paco examples plus a complete gatita fixture. Include unequal frame durations, invalid clip graphs, and invalid paths/atlas geometry.

Exit: valid directory packs produce fully validated runtime data; invalid packs fail without partially replacing an active pack. Both grid and named-region paths have meaningful tests. Zip installation follows in T08.

### T04 — Deterministic clip player

Spec: §§4.2–4.4, 10.1. Deliverables: `notavirus-core/src/player.rs` and unit tests.

- [x] Implement frame sampling, fixed FPS and per-frame durations, loop wrapping, and all flip modes.
- [x] Represent clip completion separately from phase selection. Carry elapsed time through loop boundaries and `next` chains; reject cycles in the loader rather than hanging during playback.
- [x] Return control to the behavior engine when a one-shot chain ends. Do not hardcode `next = run` or restart an unchanged clip on each tick.
- [x] Expose enough state to test the current clip, frame, elapsed time, completion, and facing without AppKit or real-time sleeps.
- [x] Test time zero, exact boundaries, multiple frames per step, unequal durations, chained clips, completion, and pause preservation.

Exit: injected time produces deterministic frames and completion events, with no image decoding or allocation required each animation frame.

### T05 — Movement and behavior state machine

Spec: §§3.3, 4.3–4.4, 5.5, 10.1. Deliverables: `brain.rs`, `math.rs`, integrated pure-core tick, scenario tests.

- [x] Implement cursor speed, character speed, clamped target distance, arrival time, and rest time as separate signals. Use the requested scale for artwork/anchor only, not speed or chase distances.
- [x] Implement start/stop hysteresis, bounded velocity/acceleration and braking, radius intersection stopping, visible-frame clamping, and the specified bounded simulation time.
- [x] Implement all phases and optional transitions, with held position during idle/start/wake/stop/sleep and continued following during moving/turning.
- [x] Implement the exact precedence and `finish`/`on_move` behavior, including stop-chain interruption, current-demand reevaluation after completion, and wake replacing start.
- [x] Handle facing thresholds, vertical motion, direction changes within one-shots, pause/resume, display relocation, oversized tiles, and size changes without artificial speed/turn events.
- [x] Add deterministic tests for all core scenarios in §10.1. Include stationary pointer catch-up, jitter, simultaneous conditions, 60/120 Hz comparable trajectories, zero stop radius, and long-tick bounds.

Exit: full Paco and gatita behavior cycles can be exercised through pure data and simulated time. A distant stationary pointer does not make the character sit down prematurely; unreachable screen-edge targets cannot trap it in endless running.

### T06 — Default, Paco, and gatita diagnostic packs

Spec: §§4.2, 4.6–4.7, 12. Deliverables: `resources/packs/default/`, development/test Paco and gatita packs, asset-status updates below.

- [x] Supply a valid bundled `default` pack, preview, and transparent static atlas so first launch works without external files.
- [x] Supply complete Paco and gatita manifests using their different role mappings, timing, filters, and motion values from the spec. The gatita TOML in §4.7 is a fragment and must be completed.
- [x] Use visibly distinct diagnostic frames/poses for each role so wrong frame order, phase, anchor, or flip can be spotted. Include a numbered atlas test fixture for coordinate checks.
- [x] Cover a multi-clip one-shot sequence and unequal durations in at least one fixture. Exercise both a minimal two-clip pack and the richer personalities.
- [x] Keep diagnostic artwork clearly identified in development documentation and the asset table. Preserve source JPEGs; do not represent fixtures as finished Paco/gatita animations.

Exit: all fixtures pass the real loader and can drive player/behavior tests. This completes software fixtures only, not final artwork.

### T07 — Renderer, cursor, and simulation integration

Spec: §§3.2–3.7, 4.5, 5.3–5.5. Deliverables: `cursor.rs`, `tick.rs`, `bridge.rs`, application state wiring.

- [x] Load the atlas into the native image/layer once, select frames via `contentsRect`, convert the Y axis once, and mirror about the anchor with correct translation. Support nearest and linear filtering.
- [x] Poll `NSEvent.mouseLocation` each tick and add the specified local/global mouse monitors without adding forbidden APIs or permission requests.
- [x] Select the pointer's display, pass plain screen geometry to core, and apply `TickOutput` to the panel/layer on the main thread. Handle display changes, Retina scale, visible bounds, and monitor disconnection sensibly.
- [x] Integrate display-link timing with a supported 60 Hz timer fallback. Coalesce callbacks rather than queueing an unbounded backlog; own and release monitor/link resources correctly.
- [ ] Wire Pause/Resume to the same bounded simulation clock and halt the tick source while paused. Refresh cursor sampling before resuming.
- [ ] Verify actual transparent frames, facing/anchor stability, continuous chasing after the pointer stops, transitions, and clicks passing through both opaque and transparent sprite pixels.

Exit: the app runs a complete diagnostic character pack on the desktop, with bounded following and correct animation. Record native observations; passing pure-core tests is not a substitute for this check.

### T08 — Pack management, menu controls, persistence, and logs

Spec: §§2.6, 4.1–4.2, 6, 8–9, 10.2. Deliverables: complete status menu, pack store/importer, preferences and logging.

- [x] Discover bundled/user packs in the specified order. Show only actual installed names, useful disabled invalid-pack entries, and deterministic duplicate handling per D08.
- [x] Implement `.petpack` import with root/one-folder-deep manifest support, bounded extraction, path traversal/absolute-path rejection, and pack-root containment. Reject archive symlinks or otherwise prove they cannot escape; enforce the actual extracted-byte limit as well as archive metadata limits.
- [x] Validate in a temporary location, then install atomically under Application Support. Cleanup failed imports and preserve the existing/active pack on every failure.
- [x] Switch packs only after full validation/native resource preparation succeeds. Reset the new player's phase/timers as specified and preserve the requested user scale and pause state.
- [x] Implement Packs, Open packs folder, Import, Size, Pause/Resume, About, Quit, and the fixed checked Click-through indication. Keep UI selections consistent with stored settings.
- [x] Persist settings with UserDefaults; recover from stale active-pack IDs or invalid preferences using the bundled default and documented defaults.
- [x] Add rotating logs at the specified location/size and concise errors in the menu; never write into the installed `.app`.
- [ ] Test malformed/truncated/oversized/traversal archives and failed switches; manually verify import, restart persistence, and fallback behavior.

Exit: a user can import and select a valid new pack without rebuilding, and broken packs leave the last good character running.

### T09 — Release bundle and documentation

Spec: §§7–9, 11–13, 15. Deliverables: final `scripts/bundle.sh`, resources, README, pack-authoring instructions.

- [x] Make the release build/bundle reproducible with binary, Info.plist, resources, icon, and `PkgInfo`. Resource discovery must work when launched from Finder or outside the repository directory.
- [x] Ad-hoc sign and verify the local bundle. Keep Developer ID/notarization outside this v1 local-build task; record distribution limitations accurately.
- [x] Document prerequisites, build/run instructions, supported macOS behavior, controls, install/import paths, log locations, and the minimum viable pack.
- [x] Include the spec's concise “Is this a virus?” explanation and explain that sound, physical orbiting, and interactive petting are outside v1.
- [x] Describe diagnostic versus finished character assets and the remaining art work honestly. Ensure no runtime network access or developer-only absolute paths are required.

Exit: a fresh build produces a relocatable locally signed `NotAVirus.app`, and another developer can build it and add a pack from the documentation.

### T10 — Automated, desktop, and performance verification

Spec: all of §10 and §15. Deliverables: passing applicable checks, recorded native verification, measured performance, updated readiness gates.

- [x] Run formatting, core/pack tests, relevant app/integration tests, linting, release build, and bundle/signature checks using the commands below. Add Linux CI for the portable crates where repository CI permits; record whether a Linux run actually occurred.
- [ ] Complete the manual Mac checklist: launch/no Dock/no prompts, built-in/external display movement, Retina changes, clicks, pause/resume, pack switching/import failures, single-instance behavior, Spaces/fullscreen expectations, and clean Quit.
- [x] Record unavailable hardware/OS checks as pending with the specific environment needed. Do not claim a second-display test from a single-display run.
- [ ] Measure release-build idle CPU at 60 Hz and RSS after loading a representative pack, against the spec's <1% CPU and <80 MB targets. Record machine, OS, atlas size, sampling interval, and observed values. Verify no per-frame PNG decoding.
- [x] Investigate failures and add focused regression coverage where it verifies meaningful behavior. Reopen affected earlier tasks as necessary.

Exit: software readiness is supported by evidence. Set `Software prototype = ready` only when T01–T10 are complete and its required checks passed. If final artwork is absent, keep v1 release readiness pending and proceed with all other available work.

### T11 — Finished default artwork and release acceptance

Spec: §§4.6–4.7, 10.2–10.3, 12, 15. Deliverables: at least one finished bundled character, reviewed art integration, final state/README.

- [x] Record availability and provenance of final animation frames. Reference-only work remains reference-only until finished asset authoring is in scope or usable assets are supplied; continue software tasks meanwhile.
- [ ] Replace diagnostic artwork for at least the bundled default with a consistent transparent PNG atlas, preview, and complete clip mappings. Validate and render it through the same public pack path.
- [ ] Check stable silhouette, ground anchor, facing, frame transitions, clipping, filtering, and legibility at all supported sizes. Recheck resource/performance limits for the final atlas.
- [ ] Preserve Paco's friendly exhausted expression and visual identity, or gatita's tabby features, playful idle sequence, and visual purr, depending on the finished pack being integrated.
- [ ] Rerun affected desktop scenarios and bundle smoke checks with final artwork; update the asset table separately for both characters.
- [ ] Review every release gate and the four success criteria in spec §15; document any remaining second-character work without implying it shipped.

Exit: at least one polished original/licensed default pack satisfies the spec's minimum v1 shipping requirement, the release checks pass, and no diagnostic-only state is described as final. Both Paco and gatita are the broader two-pack target; report each pack's completion individually even if minimum v1 ships with only one.

## 6. Verification commands and evidence

Run from `not-a-virus/` after T01 establishes the workspace. These are planned commands, not evidence that they have already passed. Adapt only to the actual workspace/platform and record the reason.

```sh
cargo fmt --all -- --check
cargo test --locked -p notavirus-core -p notavirus-pack
```

On macOS, also run:

```sh
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build --release --locked -p notavirus-app
./scripts/bundle.sh
codesign --verify --deep --strict dist/NotAVirus.app
open dist/NotAVirus.app
```

Linux CI must explicitly select portable crates and avoid building the macOS app. Native checks, performance measurements, and artwork review require separate evidence. Reference actual test names/results in the execution log rather than copying entire terminal outputs into this document.

## 7. Readiness and asset tracking

| Gate | Required for | State | Evidence / next action |
|---|---|---|---|
| G01 — Core/loader behavior and failure tests | Software prototype | `not_ready` for full acceptance — working implementation and signed bundle available; G02/G04 remain pending |
| G02 — Native window, input, rendering, lifecycle | Software prototype | `not_ready` for full acceptance — working implementation and signed bundle available; G02/G04 remain pending |
| G03 — Reproducible relocatable bundle and docs | Software prototype | `not_ready` for full acceptance — working implementation and signed bundle available; G02/G04 remain pending |
| G04 — Full desktop checklist and performance | Verified software prototype / v1 | `pending_environment` | Full desktop matrix remains unverified; benchmark evidence appended below |
| G05 — Finished original/licensed bundled default | v1 release | `not_ready` — finished default artwork and desktop acceptance remain pending |
| G06 — Final-art regression checks and §15 success | v1 release | `not_ready` — finished default artwork and desktop acceptance remain pending |

Gate states: `not_run`, `passed`, `failed`, `pending_assets`, or `pending_environment`. Do not equate `pending_environment` with passed.

| Asset | Reference | Runtime manifest/atlas | Visual review | Next step |
|---|---|---|---|---|
| Default | To use a finished character for release | Valid diagnostic grid atlas, preview and manifest | Upright numbered sprite observed live | Replace with authored final character at T11 |
| Paco | [paco.jpeg](specs/example-character/paco.jpeg) | Valid diagnostic grid atlas, preview and full spec manifest | Native image/size/flip checks pass; not final character art | Authored stand/run/sit/wipe/turn/sleep clips remain |
| gatita | [gatita.jpeg](specs/example-character/gatita.jpeg) | Valid diagnostic grid atlas, preview, complete roles and chained stop | Pack selection persisted during live session; not final character art | Authored play/roll/purr/crouch/bound/settle/sleep/wake clips remain |

## 8. Blockers, risks, and open decisions

| ID | Item | Impact | State / next action |
|---|---|---|---|
| B01 | Finished animation atlases have not been created | Blocks final character/release gate, not software implementation | Open; use diagnostic packs and update asset status when final art work is in scope or assets arrive |
| R01 | Native API signatures and display-link availability depend on selected crate/SDK versions | Potential T02/T07 integration issue | Verify actual APIs early; keep the documented timer fallback and avoid changing deployment target casually |
| R02 | External-display, mixed-scale, or fullscreen test environment may be unavailable | May leave a specific manual check pending | Determine in T10; record real availability rather than assuming a blocker now |
| R03 | Large final atlases may exceed the RSS target despite meeting the 4096-side file limit | Performance/release risk | Measure representative and final packs; document supported budgets and resolve before claiming the performance gate passed |
| O01 | Which finished character becomes the bundled default | Does not block engine or fixtures | Use diagnostic `default` initially; select from available finished assets without changing user-selected pack IDs |

Add new items with a stable ID, affected task, concrete next step, and resolution evidence. Record routine technical decisions directly; seek user input only when a material unresolved product choice prevents correct progress.

## 9. Execution log

### 2026-09-18 — Plan initialization

- Scope: wrote this execution plan and linked it from spec §11; application implementation has not started.
- Observed: starter Rust package, one `Hello, world!` entry point, spec revision 0.3, and two character-reference JPEGs.
- Validation: inspected the plan's task/dependency references and local document links. No application checks run.
- Decisions: D01–D09 are the initial working interpretations; final artwork remains separately tracked.
- Next: T01 workspace setup, followed by the early native smoke test in T02.

### 2026-09-18 — Preparation: ignore Rust build output

- Work completed: added `/target/` to the project's `.gitignore` at the user's request.
- Checks: `git check-ignore -v not-a-virus/target/` passed from the repository root; `git ls-files 'not-a-virus/target/**'` returned no tracked build artifacts; the target directory no longer appears as untracked in Git status.
- Remaining: T01 workspace setup has not started. Existing staged files were left as they were.
- Next action: begin T01 when implementation is requested.

For each implementation session, append an entry using this shape:

```text
### YYYY-MM-DD — task ID(s): short outcome
- Work completed: concrete behavior/files changed.
- Checks: exact command or manual scenario; passed/failed/not_run; result or evidence path.
- Decisions/deviations: IDs and rationale, or none.
- Remaining/blockers: specific unfinished work and affected gates, or none.
- Next action: one concrete step another agent can resume.
```

Before handing back, update the current-state table, task ledger, completed checkboxes, readiness gates, asset statuses, and this log so the next agent can continue from the repository alone.

### 2026-09-18 — T01, T03–T06: workspace, engine and validated diagnostic packs
- Completed: portable core/pack crates and target-scoped native shell, strict TOML/PNG/JSON validation, deterministic player and movement, secure zip import, diagnostic packs with original numbered geometry. Reference JPEGs preserved.
- Passed: `cargo check --offline`; `cargo test --workspace --locked` (13 core + 9 pack integration tests).
- Environment: Rust 1.97.1, macOS SDK 27.0. Downloaded objc2 0.6.4 and framework bindings 0.3.2; runtime-gated AppKit CADisplayLink with 60 Hz NSTimer fallback keeps macOS 13 support.
- Sequence interpretation: implemented the portable prerequisites and integrated shell while dependencies resolved; T02 desktop exit remains pending, not presumed from compilation.
- Remaining: native visual/input lifecycle checks, final docs/bundle/performance, final artwork (B01).
- Next: signed bundle smoke test.

### 2026-09-18 — T02, T07–T10: complete native software and verification
- Implemented: transparent floating nonactivating click-through panel; single-instance bundle reopen; main-thread window CADisplayLink at 60 Hz with macOS 13 timer fallback; global/local mouse monitors; native CALayer atlas rendering, filtering and anchor mirroring; full menu, isolated/testable UserDefaults, discovery/import, failed-switch preservation and rotating log writer.
- Passed: `cargo test --workspace --locked` outside the sandbox (14 core + 9 pack tests and main-thread native integration executable). Native checks cover exact window flags/accessory policy, three packs at 1×/1.5×/2×, Retina layer scale, UV/flip transforms, actual Objective-C Pause/Resume/Size/selectPack selectors, stale settings fallback, persisted settings, failed-switch preservation, and the cleanup path used by Quit. Test preferences use an isolated suite and are removed afterward.
- Passed: `cargo fmt --all -- --check`; `cargo clippy --workspace --all-targets --locked -- -D warnings`; `./scripts/bundle.sh`; `codesign --verify --deep --strict dist/NotAVirus.app`; `plutil -lint`; `otool -l` confirms minos 13.0, SDK 27.0. Bundle is approximately 1.5 MiB with diagnostic resources. A GitHub Actions workflow was added for Linux portable checks and macOS build/lint; no CI run has occurred in this session.
- Native observation: CUA launched the bundle with no TCC dialog; an upright 128-point numbered sprite rendered, and native menu AX exposed all specified controls. Reopen showed one app instance; gatita selection persisted. CUA timing/state changes made detailed physical click-through, all live sizes, import chooser workflow and menu-Quit evidence inconclusive, so these are not claimed passed from automation alone.
- Failed/resolved checks: initial native test inside sandbox returned activation policy -1 (no window-server access); the same test outside sandbox passed. Initial Clippy formatting warnings were fixed. Final-art checks remain not_run.
- Performance investigation: initial renderer mutated the layer/window every tick, and sampling attributed most remaining callback work to repeated NSScreen dictionaries. The renderer now skips unchanged outputs; display rectangles/IDs/scales are cached as plain data, invalidated on display-change notifications and refreshed each second for Dock changes. Pointer/display selection still runs every tick. Source confirms no per-frame PNG decode or image allocation.
- D10: use runtime-gated AppKit window displayLinkWithTarget (callbacks already on main run loop) instead of a background CVDisplayLink, preserving macOS 13 through the documented timer fallback. D11: cache native screen metadata to meet idle budget; at most one second delay for Dock-only visibleFrame changes, immediate display-configuration invalidation.
- D12: new_scaled initializes the core with restored user scale, preventing double anchor offsets at launch/pack switch; a regression test verifies feet stay fixed across scale changes.
- Review: `.impeccable/review/finish-review.md` reports `ship` only for prototype code/interaction scope. No independent screenshot-based visual approval or final-art acceptance is claimed. Native documentation is complete in DESIGN.md, .impeccable/design.json and .impeccable/surfaces/native-companion.md; JSON parsing and source consistency were checked.
- Still pending: hardware/manual desktop acceptance (mixed Retina displays, actual input landing beneath opaque/transparent pixels, Spaces/Stage Manager/fullscreen, import dialog, live menu Quit), macOS 13 fallback on that OS, fresh-Mac install, final animation art and final-art regressions. These remain visible gates, not missing software implementation.

### 2026-09-18 — T10 handoff: final build, benchmark limits and readiness
- Final passed commands: `cargo test --workspace --locked` (23 portable tests plus native integration), `cargo fmt --all -- --check`, strict workspace/all-target Clippy, release bundling, codesign verification, plist lint, deployment-target inspection, and `git diff --check`. App was relaunched from the final bundle; exactly one final test process was observed. No commits or staging changes were made.
- Performance environment: MacBook Pro, Apple M4 Pro, 24 GB RAM, macOS 26.6.2 (25G83), 1024×512 RGBA diagnostic atlas, 128-point sprite, configured 60 Hz AppKit display link. Earlier 3-second `sample` showed a 24.9 MB physical footprint; initial RSS observations were approximately 44–66 MB, below the 80 MB target. Final relaunch RSS was 44,192 KiB; `top` reported approximately 18 MB physical footprint.
- Final `top -l 4 -s 5 -pid 77871 -stats pid,cpu,mem` sampled over 15 seconds at 18:32:14–18:32:29 local. Discarding its initial 0.0 sample, CPU was 7.4%, 7.5%, 1.9%. An earlier `ps` decayed snapshot was 0.9%. The desktop was interactive and no independently confirmed still-cursor interval was established; these values do NOT prove the <1% sustained idle gate. Keep performance acceptance pending and repeat with a stationary pointer after the pet has settled. Do not reinterpret the 0.9 snapshot as a passing benchmark.
- All available software tasks are implemented. T02/T07/T08/T10 retain blocked acceptance status where their checklists require physical/manual evidence that the desktop tool did not reliably establish. T11 is blocked by missing authored final character atlases. `Software prototype` remains `not_ready` under this plan's strict all-gates definition; the working signed diagnostic prototype is available at `dist/NotAVirus.app`.
- Design review disposition: `ship` at prototype code/interaction scope only. It did not independently inspect screenshots; documentation records that limit. Final art, motion/anchor appearance at every scale, mixed-display behavior and fresh-Mac acceptance remain unapproved.
- Handoff: README.md contains build/run, file/privacy, controls and artifact-status instructions; PACK_AUTHORING.md describes the supported format. Next action is the controlled desktop checklist/idle measurement above, followed by integration of finished original/licensed art. No generated JPEGs or reference-art adaptations were represented as runtime character animation.
