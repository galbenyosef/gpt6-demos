# Validation report

Date: 2026-09-15. Implementation remains on branch `one-more-match`; the original specification was not edited.

## Verified

| Area               | Result                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript         | Client, server, contracts, simulation, storage and tests pass strict type checking                                                           |
| Native TypeScript  | Desktop entry checked against the prepared Electrobun 2.0.1 SDK                                                                              |
| Formatting         | Prettier check passes                                                                                                                        |
| Dependency lock    | `bun install --frozen-lockfile` succeeds without changes                                                                                     |
| Production build   | Bun HTML production build succeeds; all gameplay assets are local                                                                            |
| Development mode   | Bun HTML-import server opens the game without browser errors                                                                                 |
| Simulation         | 100 complete seeded matches finish; finite positions and bounded restarts checked                                                            |
| Rules              | Whole-ball goals, overbar misses, corners, throw-ins, half-time, final whistle, passing and pause tests pass                                 |
| Storage            | Revision conflicts, exclusive ownership, corrupt-save backup recovery, record validation, future-version refusal and idempotent results pass |
| Server             | Session protection, origin/host rejection, idempotent creation/rematches, WebSocket input, stale sequence handling and disconnect pause pass |
| Browser flow       | Country selection, movement, passing, switching, pause, settings, reload recovery and half-time pass                                         |
| Replay             | 20 rendered rematches retain the selected country/opponent and reset the score; 20 distinct results are persisted                            |
| Responsive layout  | 960 × 640 selection screen has no horizontal overflow; 1440 × 900 browser screenshots inspected                                              |
| Native window      | Original GLB players, pitch, movement, input and pause verified in an actual CEF window                                                      |
| Native shutdown    | Graceful quit closes CEF and the Bun service cleanly                                                                                         |
| Linux distribution | Stable installer and update archive built; installer successfully installed the app and desktop entry                                        |

The automated suite contains seven simulation/catalogue tests, six storage tests, three backend integration tests, and one multi-step browser test. The full simulation soak executes over 13,000 assertions. Browser end-to-end checks use isolated temporary data and advance only the test fixture clock when reaching results/half-time; production has no test endpoints.

## Environment and performance

- Linux x64; AMD Ryzen 7 8845HS; Radeon 780M integrated graphics.
- Bun 1.4.0; Three.js 0.186.0; Rapier 0.20.0; Electrobun 2.0.1.
- Native CEF reports Chrome 147 and `ANGLE (AMD, AMD Radeon 780M Graphics (radeonsi phoenix ACO), OpenGL 4.6)`.
- Native smoke sample: 120 animation frames, p95 interval **8.5 ms** at a 934 × 564 logical viewport with device pixel ratio 2, default medium graphics. This is a short sample, not a 1440p/4K benchmark.
- A 20,000-tick simulation sample measured p95 **0.026 ms**, p99 **0.043 ms**, maximum **2.10 ms** on this host. Tick timing includes some stopped/terminal states; it is an engineering smoke measurement rather than a worst-case benchmark.
- The production Linux installer is approximately **185 MB compressed**; the bundled browser/runtime account for most of this. The game client JavaScript is approximately **1.3 MB** uncompressed and the original animated player GLB is **127 KB**.

The initial native render failed because Electrobun disables GPU rendering by default. The committed configuration explicitly enables it; subsequent tests verified the hardware renderer. Linux window sizing accounts for the reported display scale factor.

## Remaining verification and scope limits

- Windows and macOS builds, signing/notarisation, and their actual native-window behaviour have not been tested on this Linux host.
- Firefox and Safari browser compatibility has not been verified. Chromium browser and Linux CEF were exercised.
- A physical gamepad, audible output through different audio devices, and long-duration 1080p/1440p performance runs still need manual hardware testing. Standard gamepad handling is implemented.
- Country pairing tests cover the full catalogue for identical-colour collisions. All 190 pairings have not individually undergone human visual review; patterns, alternates, emergency contrast kits and team indicators provide separation.
- Disk-full and abrupt power-loss fault injection are not part of the completed test run. Atomic-file operations and save-warning paths are implemented, but those environmental failure modes need additional testing.
- The first schema is version one. Unsupported future versions are refused; version-to-version data migrations should be added with the first actual schema change.
- The game uses original stylised articulated players, procedural stadium detail and synthesized audio. It does not include photorealistic players, licensed kits, commentary or video replay.

These limits are listed explicitly so successful local tests are not mistaken for verification on hardware or operating systems that were unavailable.

## Follow-up: delayed Linux helper crash

A user reported `stack smashing detected` after approximately three minutes in a normal `bun run dev` session. The previous short native smoke tests did not cover this delay. Running helpers had Chromium's per-fork stack-canary change enabled, matching the upstream CEF compatibility issue documented in `DECISIONS.md`.

The Linux configuration now sets `change-stack-guard-on-fork=disable`. An isolated native build using this setting ran for **311 seconds** with **11 successful backend/WebGL probes**, no stack-smashing messages, and a **clean exit code 0**. The test verified a **1440 × 900 logical viewport** and hardware rendering through **ANGLE / AMD Radeon 780M / OpenGL 4.6**. Type checks and formatting also pass. This is a verified compatibility workaround, not a claim that every possible native crash has been eliminated.

Use `bun run test:native` to repeat the test. Existing development windows must be closed and relaunched with `bun run dev`; previously packaged installers need rebuilding to include the fix.
