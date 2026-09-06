# InfiniCave

A single-player cave expedition game built with Bun, TypeScript, Three.js, and native HTML overlays. Pilot a small helicopter through a seeded underground world, activate its relays, and shut down its heart. Each expedition has its own stored world, progress, and ending.

## Run

```sh
bun install
bun run dev
```

Open **http://localhost:3000**. Set `PORT` to use another port.

```sh
bun run build
bun run preview
```

The production build is self-contained in `dist/`. Serve that directory over HTTP or HTTPS; there is no application server, account, external asset request, or database service in production. Fonts and their SIL Open Font Licenses are bundled locally. The development server rebuilds the generation worker on request.

## Controls

| Action   | Keyboard      | Gamepad            |
| -------- | ------------- | ------------------ |
| Fly      | WASD / arrows | Left stick / D-pad |
| Fire     | Space         | Right trigger      |
| Interact | E             | South button       |
| Map      | M             | North button       |
| Pause    | Escape        | Menu button        |

Keyboard bindings can be remapped. Gamepad dead zone, effects/ambient volume, reduced motion, reduced flashing, and lower effects are available in Settings. Menus use keyboard or mouse. Touch flight is outside the initial scope.

Release movement to hover. Walls have a soft visual contact margin and a 0.35-second grace period. Brief brushes and glancing slides are harmless; sustained inward pressure damages the hull and bounces the craft away. Faster impacts cause more damage once the grace period is exhausted. Repeated impacts can destroy the helicopter. Amber machinery marks timed crossings; wait for the open window. Green stations repair the craft and set a checkpoint. Death or Return to Checkpoint restores its gameplay snapshot, including enemies, relays, and discovery. Time and death totals remain cumulative.

## Saving

- IndexedDB stores each immutable world, current runtime, checkpoint, statistics, and the previous valid revision in one transactional record.
- Autosaves happen every 30 seconds of active simulation and after relays, checkpoints, and recovery. Completion also commits a save.
- Save & Exit returns to the expedition browser only after a successful commit. A failure keeps the game paused with retry, export, and explicit unsaved-exit actions.
- Resume initially pauses at Ready to Continue. Velocity, weapon cooldowns, projectiles, enemy AI, gameplay PRNG state, and machinery timing are restored.
- A context-scoped Web Lock prevents concurrent writers in different tabs. Use localhost or HTTPS in a browser supporting IndexedDB, Web Locks, WebGL, and Web Workers.
- Export creates self-contained JSON. Import validates schema, versions, checksums, geometry, references, entity limits, and state; it creates a fresh context identity. Imports over 25 MiB are rejected.
- Clearing site data removes local expeditions. Export backups before clearing browser storage.

## Architecture

| Module                         | Responsibility                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain.ts`                | Versioned serializable types and gameplay constants                                                                                      |
| `src/generation.ts`            | Seed normalization, independent PRNG streams, finite layout, collision carving, gates, validators, witnesses, retries, fallback, hashing |
| `src/generation.worker.ts`     | Generation progress and cancellation boundary                                                                                            |
| `src/physics.ts`               | Shared circle collision, swept movement, hazard geometry, line of sight                                                                  |
| `src/simulation.ts`            | Fixed 60 Hz flight, combat, AI, checkpoints, discovery, objectives, completion                                                           |
| `src/persistence.ts`           | IndexedDB transactions, ordered/coalesced saves, revision recovery, ownership, import/export                                             |
| `src/validation.ts`            | Bounded untrusted-save schemas and semantic validation                                                                                   |
| `src/rendering.ts`             | Three.js scene, instanced/cullable stone, helicopter, machinery, lighting, effects, resource disposal                                    |
| `src/main.ts`                  | Expedition browser, HUD, menus, map, save feedback, fixed-step loop                                                                      |
| `src/input.ts`, `src/audio.ts` | Focus-scoped input and synthesized positional sound                                                                                      |

Generation uses NFC-normalized, trimmed, case-preserving seeds; blank seeds come from `crypto.getRandomValues`. FNV-1a over UTF-16 seeds independent mulberry32-v1 streams. The geometry grid is one world unit per cell. The helicopter collider is a circle of radius 0.48; swept substeps are at most 0.45 radii. Required passages are 4–6 units wide. Navigation validation uses an additional 0.12-unit clearance margin.

The mission spine contains ordered relay stages and checkpoints. Optional branches, loops, and diagonal passages are restricted to the same progression stage. Validation checks physical reachability at every relay mask, checkpoint safety, enclosing bounds, references, and representative timed crossings in both directions using the real movement and hazard rules. Up to 32 deterministic candidates are allowed, followed by a verified versioned fallback.

Runtime time is `tick / 60`. Gate state derives from relay bits; hazard phase derives from the saved tick and immutable phase offsets. Neither wall time nor rendering drives gameplay. Schema and simulation version 2 add persisted wall-contact timing and impact strength. Version 1 saves migrate on a validated copy with these fields initialized to zero; worlds and existing progress stay intact, and the original revision is retained until a successful save. Future versions are rejected rather than regenerated.

## Verification

```sh
bun test
bun run typecheck
bun run build
bun run test:corpus
bun run test:playthrough
bun run test:browser
```

Browser tests use Playwright’s packaged CLI (which requires its Node runtime); development, builds, generation, and unit tests use Bun. Install Chromium with `bunx playwright install chromium` if needed. `CHROMIUM_PATH` can select an existing Chromium binary; the test wrapper also detects an installed Linux Playwright Chromium cache.

- `tests/core.test.ts`: determinism, physical/progression rejection fixtures, flight, exact controlled-step save round trips, checkpoint recovery, compatibility.
- `tests/persistence.test.ts`: save ordering, corrupt-revision recovery, quota failures, interrupted transactions, import limits, and persisted completion after a real simulated flight.
- `tests/browser/`: creation, controls, pause/focus, independent contexts, imports/exports, writer locks, worker parity, save-error UI, completion inspection, preferences, responsive menus, and GPU-resource stability.
- `tests/seed-corpus-report.json`: fixed corpus of 1,000 seeds for each size, plus all fallback layouts.
- `tests/playthrough-report.json`: three automated normal-control completions per size, each with a mid-expedition state round trip. These route-aware runs are automation, not human playtests.

See [the implementation checklist](specs/implementation.md) for release verification still requiring human playtesting and reference-device measurements. The expedition-length estimates are initial design targets, not measured completion times.
