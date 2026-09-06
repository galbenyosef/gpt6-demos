# Implementation and release verification

The product specification remains `specs/infinicave.md`. This checklist records implementation coverage and verification evidence without changing its requirements.

## Implemented

- [x] Bun development and self-contained static production builds, pinned dependencies.
- [x] Three.js side view, original helicopter and cave scenery, stone instancing/chunk culling, camera, particles, positional synthesized sound.
- [x] Fixed 60 Hz flight, circular swept collision, hover damping, simultaneous fire/movement/interaction, finite seeded enemies.
- [x] Keyboard remapping, gamepad flight, configurable dead zone, focus/visibility pause, cleared held input, comfort settings.
- [x] Three finite map sizes, ordered relay gates, checkpoints, optional branches/loops/diagonals, a final heart.
- [x] Separate seeded streams, canonical SHA-256 world documents, bounded attempts and versioned validated fallback layouts.
- [x] Physical clearance/progression search and representative timed crossings using the runtime movement model.
- [x] Retracting barriers, beams, and blocks sliding on bounded tracks, with visible crossing feedback.
- [x] Checkpoint snapshot rollback with cumulative statistics, discovery map, persisted completion.
- [x] Multiple independent contexts, rename/delete confirmation, new-generation cancellation, initial save before play.
- [x] IndexedDB transactions, previous valid revisions, ordered/coalesced snapshots, commit-based save feedback, safe Save & Exit, retry/export on failure.
- [x] Exact paused resume, context-scoped browser locks, bounded validated import, new identity on import, portable JSON export.
- [x] Accessible HTML menus, keyboard navigation, local fonts and font licenses.

## Automated evidence

- Fixed 3,000-seed corpus validates all accepted geometry/progression and all three fallbacks.
- Normal-control flight automation completes three seeds per size, without invulnerability or teleporting, and checks a save round trip midway.
- Unit tests exercise malformed geometry/progression, exact next-tick equality after save/load, state rollback, compatibility, queued save ordering, quota failure, aborted transactions, recovery from corrupt latest saves, import limits, and completion persistence.
- Chromium integration tests cover the end-to-end menus and storage workflows, worker/nonworker hashes, failure feedback, completed-context inspection, preference persistence, and stable GPU resource counts across repeated world rebuilds.

Reports describe the environment in which they were measured. Automated pilots know their route and are not evidence for human discovery time or readability.

## Release checks still needing external validation

- [ ] Human completion of three unfamiliar seeds per size, with no debug controls or external map; assess navigation, difficulty, scenery readability, and target expedition lengths.
- [ ] Agree on an integrated-GPU reference laptop and measure 60 FPS at 1080p, including enemy/hazard-heavy rooms and lower-effects mode.
- [ ] Run interactive browser checks on Firefox and Safari as well as Chromium; validate physical gamepad behavior on target hardware.
- [ ] Exercise real disk-pressure/quota behavior on target browser profiles in addition to injected transaction failures.

Initial design targets remain 10–15, 20–30, and 35–50 minutes for first human completion. Route-aware automation is much faster, so the UI estimates must be recalibrated after playtesting. No reference-laptop performance result is claimed by this implementation.
