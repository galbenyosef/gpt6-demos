# One More Match — Product and Technical Specification

Version: 1.0  
Date: 2026-09-15  
Status: Implementation specification; no application code accompanies this document.

## 1. Purpose

Build a high-resolution, fully playable 3D football game named **One More Match**. The player chooses a country and plays a standalone match against a computer-controlled country. After the final whistle, the player can immediately play again with the same team or return to country selection.

The primary experience is a native desktop window. A browser experience must use the same game client and Bun backend. Use Three.js and TypeScript, with Bun as the runtime, package manager, and application server. Persist data in files behind replaceable storage interfaces; do not introduce a database in this release.

Use the word **football** throughout the interface, documentation, and marketing.

### 1.1 Experience goals

- Fun within a minute: pick a country, see a brief controls prompt, start playing.
- Responsive arcade football with convincing 3D presentation and recognisable national colours.
- A complete match loop, including restarts, goalkeepers, half-time, results, and rematches.
- Computer teammates and opponents that maintain shape and create opportunities.
- Sharp graphics with stable performance, rather than photorealism at the expense of playability.
- Desktop installation and offline play without requiring a separately installed Bun runtime.

### 1.2 Scope decisions

The earlier proposal is adopted as the implementation baseline: **7 versus 7, including one goalkeeper per team**, five-minute matches, simplified rules, and desktop-first controls. These are product decisions for version one, not limitations imposed by Three.js.

Excluded: tournaments, groups, leagues, career progression, online multiplayer, accounts, real-player likenesses, transfers, commentary, video replay, offside, fouls, cards, penalties, extra time, substitutions, mobile touch controls, cloud saves, databases, and automatic updates. “Play again” means a new match, not playback of a recording.

## 2. Match and navigation flow

### 2.1 Screens

1. **Home:** title, Play, Settings, Controls, and desktop-only Quit.
2. **Country selection:** 20 country cards with name, flag, and a shirt preview. Remember the last selected country.
3. **Match setup:** selected country, opponent selector with Random option, difficulty, and Start match. Default opponent is uniformly random among the other 19 countries.
4. **Loading:** meaningful asset-loading progress; failures offer Retry and Back.
5. **Match:** gameplay, scoreboard, clock, controlled-player indicator, shot-power indicator, and compact controls reminder.
6. **Pause:** Resume, Controls, Settings, Restart match, and Return to menu. Restarting or abandoning an active match requires a simple confirmation because progress will be discarded.
7. **Results:** final score, Win/Draw/Loss, basic statistics, Play again, and Change team.

Settings and controls may be modal panels. Country names must remain visible; flags alone are insufficient.

### 2.2 Play again semantics

- Preserve the user's country, difficulty, and control/graphics/audio settings.
- Preserve the opponent selection mode. A manually selected opponent remains selected; Random draws another eligible opponent, which may coincidentally be the same country.
- Create a new match ID and random seed; reset score, clock, statistics, stamina, positions, and possession.
- Commit the prior result before creating the next match. Repeated clicks or retried requests must not duplicate results or start multiple matches.
- Change team returns to country selection with the current country highlighted.

### 2.3 Match duration and outcomes

- Two halves of 150 seconds of active play; display elapsed match time from 00:00 to 05:00.
- Stop the clock during pauses, goal celebrations, dead-ball placement, half-time, and connection recovery. A restart resumes the clock when the ball becomes live.
- Half-time presents the score and Continue; teams exchange physical ends.
- End the half at the first simulation tick at or after its limit. Resolve a goal crossing occurring within the final tick before the whistle using its time of impact; crossings after the limit do not count.
- Draws are valid. There is no added time or tie-breaker.
- Store completed-match statistics: score, shots, shots on target, completed/attempted passes, and possession time. Define a shot on target as a goal or a shot stopped by a goalkeeper that would otherwise enter the goal. Woodwork alone does not count. Pass completion requires the intended team to gain controlled possession after a deliberate pass, without intervening opposition possession. Possession percentages exclude loose-ball and dead-ball time.

## 3. Countries and kits

These are original interpretations of traditional national colours, not current official kit reproductions. Use generic squad members, original shirt patterns, and no federation or manufacturer logos. Record asset provenance and redistribution rights in an asset manifest.

| Country ID | Country | Primary shirt | Alternate shirt |
| --- | --- | --- | --- |
| ARG | Argentina | Sky-blue and white vertical stripes | Deep navy |
| BRA | Brazil | Yellow with green trim | Blue |
| FRA | France | Dark blue | White |
| GER | Germany | White with black details | Black |
| ESP | Spain | Red with yellow details | Pale blue |
| ENG | England | White with navy details | Red |
| POR | Portugal | Red with green details | White |
| ITA | Italy | Blue | White |
| NED | Netherlands | Orange | Dark navy |
| BEL | Belgium | Red with black and yellow details | Pale blue |
| CRO | Croatia | Red-and-white checks | Deep navy |
| URU | Uruguay | Sky blue | White |
| COL | Colombia | Yellow with blue/red details | Deep navy |
| MEX | Mexico | Green | White |
| USA | United States | White with navy/red details | Navy |
| JPN | Japan | Blue | White |
| KOR | South Korea | Red | Black |
| MAR | Morocco | Red with green details | White |
| SEN | Senegal | White with green/yellow/red details | Green |
| NGA | Nigeria | Green with white details | White |

Each kit definition includes primary/secondary/accent hex colours, pattern, shorts, socks, and readable number colours. Final hex values are art-direction choices captured in the catalogue during implementation. Use one shared player rig and material variants rather than separate models per country.

### 3.1 Visibility and fairness

- The user's primary kit is preferred. Select the opponent's primary or alternate for clear separation; permit changing the user's kit if neither pairing is readable.
- Use curated kit-pair overrides and verify all 190 unordered country pairings in both home/away assignments. Similar brightness or patterned shirts require visual inspection; a single colour-distance calculation is insufficient.
- Provide a shared emergency dark/light kit option if regular variants still clash. Goalkeepers and officials, if shown, must remain distinguishable from outfield teams.
- Player indicators, radar symbols, and shirt numbers supplement colour cues.
- All countries have equal gameplay attributes in version one. Country choice is cosmetic; difficulty controls the computer's decision quality.

## 4. Football gameplay

### 4.1 Pitch and squad

- Use a fictional 70 m × 45 m pitch, 5 m × 2 m goals, and consistent metre-based simulation units.
- Seven players per team: goalkeeper, two defenders, three midfielders, one forward. Formation anchors change with possession and ball position.
- One player is directly controlled at a time. Teammates and both goalkeepers operate automatically. Manual switching selects outfield players only.
- Kickoff belongs to the user in the first half, the opponent in the second, and the conceding team after a goal.

### 4.2 Default controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Move/aim | WASD or arrows | Left stick |
| Sprint | Left Shift | Right trigger |
| Pass / standing tackle when defending | J | A / south button |
| Hold and release to shoot | K | X / west button |
| Switch player | L | Left bumper |
| Pause | Escape | Menu/Start |

- Movement is camera-relative: pressing right always moves right on screen, including after half-time. Translate input into world space using the current camera orientation.
- Normalise diagonal movement and apply configurable stick dead zones. Remapping is required for keyboard; display controller labels appropriate to detected standard mapping where available.
- Passing chooses a teammate in the aim direction using angle, distance, and interception risk; without aim, prefer a safe forward or lateral option.
- Shooting charges up to a capped maximum, releases once, and uses aim direction with modest goal assistance. Holding longer cannot exceed the cap.
- Clear all held inputs on pause, focus loss, controller disconnect, and socket loss. Do not release an unintended charged shot when focus returns.
- Switch to a useful defender based on ball distance and interception opportunity, not merely the nearest Euclidean distance. Display an immediate selection marker.

### 4.3 Movement, possession, and physics

- Use assisted dribbling: the ball takes visible touches within a bounded control region. Opponents can intercept between touches. Avoid a permanently attached ball or uncontrolled rigid-body feet.
- Players use kinematic capsules/circles and constrained movement; the ball uses gravity, bounce, friction, and collision detection.
- Passing and shooting release the ball into free motion. Server-side sweep/continuous collision checks prevent fast shots crossing goalposts, players, or goal planes without detection.
- Define tuning constants in a versioned gameplay configuration: acceleration, running/sprint speed, turn rate, ball drag, bounce, pass speed, shot charge range, control radius, tackle reach, and cooldowns.
- Sprint consumes a bounded stamina meter that recovers when not sprinting. Match reset restores stamina.
- Standing tackles require proximity, facing, and a cooldown. No slide tackle or injury system is required.
- Resolve simultaneous claims using ball arrival time, distance, and stable player ID as a final tie-breaker. A ball may have at most one possessor.
- Goalkeepers position relative to ball and goal, intercept/catch/parry using bounded reach and reaction time, and distribute within four seconds. Avoid guaranteed saves and instant teleports.
- The match simulation is authoritative; visual animation follows its action timing. A kick must visibly meet the ball near the release instant.

### 4.4 Rules and restarts

- A goal occurs only when the whole ball crosses the goal plane between the inner posts and below the crossbar. Use ball radius in the test. Goal events are unique and scored once.
- Whole-ball touchline crossing produces a throw-in for the team opposite the last touch.
- Whole-ball goal-line crossing outside the goal produces a corner if the defending team touched last, otherwise a goal kick.
- Restart placement prevents immediate collisions and gives the taker room. Freeze the clock during setup; allow the user to choose a pass direction and trigger delivery. After five seconds without action, deliver an automatic safe restart to prevent deadlock.
- Computer restarts occur after a short, bounded preparation delay.
- Brief goal celebrations last at most three seconds and are skippable. No character cutscene is required.
- Track legal last-touch information through rebounds and tackles.
- If the ball leaves the bounded simulation space or becomes invalid, pause play and perform a documented recovery restart at the last valid location. Log the incident. Such recovery must not become the normal way to handle boundaries.

## 5. Computer intelligence

Use deterministic, rule-based team tactics and per-player state machines. Machine-learning services and external AI APIs are unnecessary.

Required player states include holding formation, supporting, receiving, carrying, pressing, covering, intercepting, shooting, recovering, and taking a restart. Goalkeepers have positioning, claiming, saving, holding, and distributing states.

- In possession: provide passing triangles, advance into space, prefer viable passes, and shoot when angle and distance justify it.
- Out of possession: one primary presser, one nearby support defender, other players protecting space and passing lanes. Avoid all players chasing the ball.
- On turnovers: transition roles promptly without teleporting or instantly reversing velocity.
- Teammates proactively offer options for the human; they must not stand still waiting for direct control.
- Evaluate tactical choices at approximately 10 Hz and execute movement/physics at 60 Hz. Stagger expensive decisions across players.
- Easy, Normal, and Hard change reaction delay, risk assessment, and action error. They do not increase physical speed, see future inputs, or alter scoring rules. Normal is the default.
- Store the random seed and current random-generator state in recoverable match state. Reproducibility is required on the same simulation build; cross-engine floating-point bit identity is not promised.

## 6. Visual, audio, and interface design

### 6.1 Art direction

Create a bright, polished arcade sports presentation: realistic proportions, readable silhouettes, saturated national kits, rich green pitch, restrained stadium detail, and smooth animation. Final players must be recognisable human figures with articulated limbs; primitive placeholders are allowed only during development.

- One complete stadium with stands, goals, nets, corner flags, pitch markings, and an inexpensive crowd treatment.
- Skinned glTF/GLB players with idle, jog, sprint, turn, pass, shot, tackle, keeper save, and celebration animations. Blend transitions and scale locomotion to movement speed.
- Elevated broadcast camera follows the ball and controlled player with damping and bounded zoom. Preserve attack direction on screen through a deliberate half-time camera transition.
- Include a small radar showing both teams and the ball, because off-screen passing options matter.
- Three.js lighting, antialiasing, shadow mapping, tone mapping, and lightweight post-processing. Avoid expensive effects that obscure the ball.
- Bundle all runtime assets and fonts locally; no CDN dependency for play.

### 6.2 Resolution and performance

- Default window: 1440 × 900 logical pixels, minimum supported layout 960 × 640. Support resizing, fullscreen, high-DPI screens, and ultrawide aspect ratios.
- Target 60 rendered frames per second at 1920 × 1080 on a representative midrange laptop/desktop; validate 2560 × 1440 high quality on a stronger reference machine. Record exact tested hardware and settings before claiming support.
- Provide Low, Medium, High, and Auto quality, adjusting render scale, shadows, crowd density, and post-processing. Never change simulation speed to compensate for graphics load.
- Cap device pixel ratio by quality setting; allow explicit render scale. 4K is optional, hardware dependent, and not a release promise.
- Initial engineering budgets: simulation p95 under 6 ms per 16.67 ms tick, client frame p95 under 20 ms at the 1080p reference setting, no steady-play stalls over 100 ms, fewer than 250 draw calls, and under 500k visible triangles at High. Profiling may revise draw/triangle budgets while preserving experience targets.
- Aim for under 100 MB compressed first-load game assets and under 10 seconds to match-ready from local cold launch on SSD. Measure desktop package size separately because its browser engine has its own cost.

### 6.3 Feedback and accessibility

- Audible kicks, whistle, goal reaction, menu sounds, and a subtle crowd loop. Separate master, effects, and crowd volume; persist mute.
- Unlock browser audio following a user gesture and handle unavailable output gracefully.
- Menus support keyboard/gamepad navigation, visible focus, readable contrast, and text scaling. Do not put essential instructions exclusively inside the 3D canvas.
- Provide reduced camera motion and optional camera shake, disabled by default. Never depend solely on sound or team colour to convey state.
- HUD shows score, country abbreviations, half, clock, controlled-player number, stamina, and contextual shot power. Keep it uncluttered.

## 7. Technology and native application strategy

### 7.1 Selected stack

| Concern | Decision |
| --- | --- |
| Language | TypeScript with strict checking across client, server, desktop, and shared packages |
| Runtime and package manager | Bun; pin and document the tested version and commit its lockfile |
| 3D | Three.js using WebGL2 as the required renderer baseline |
| Menus/HUD | React with lightweight CSS; keep per-frame objects outside React state |
| Frontend development/build | Vite invoked through Bun scripts; production assets served by Bun |
| Desktop host | Electrobun using its Bun main-process runtime |
| Physics | Rapier 3D WASM, initial choice subject to the Bun/desktop compatibility gate |
| HTTP/WebSocket | Bun.serve with explicit route and message validation |
| Validation | Zod for external messages, configuration, and persisted records |
| UI state | Zustand or a similarly small store for menus/settings/network status only |
| Unit/integration tests | Bun test |
| Browser end-to-end tests | Playwright; native host also requires real-window smoke testing |

These are design selections. Pin compatible stable releases during implementation; do not assume a version number from this document. Additional libraries must solve a concrete need and carry suitable redistribution terms.

### 7.2 Why Electrobun

Bun's documented built-in `Bun.WebView` is an experimental **headless automation** API; it is not the production desktop-window contract for this game. Electrobun supplies desktop windows and a Bun main process. Use its bundled CEF option as the initial rendering target for consistent WebGL behaviour, accepting a larger application package. Verify GPU acceleration and packaging on each supported OS before committing distribution support. Sources: [Bun WebView](https://bun.com/docs/runtime/webview), [Electrobun runtimes](https://framework.blackboard.sh/electrobun/guides/native-main-process/), [Electrobun CEF](https://framework.blackboard.sh/electrobun/apis/bundling-cef/).

### 7.3 Two launch modes, one app

**Desktop:** the Electrobun Bun process starts the application services and a loopback server on an available port, then opens the game URL in a native window. Window actions and OS paths use a small desktop-host adapter. Close shuts down sessions and flushes storage. End users do not open a terminal or install Bun.

**Browser:** a Bun process serves the production client and exactly the same APIs. A browser connects to that origin. Local browser use is in scope; public internet hosting, accounts, and operational hardening for an untrusted multiuser service are not release requirements.

Core gameplay must not import Electrobun. A HostCapabilities facade exposes fullscreen, quit availability, and host metadata without leaking native APIs into game logic. In browser mode, use browser fullscreen and hide Quit.

Desktop packaging priorities: validate Linux x64 in the development environment first, then Windows x64 and macOS arm64 using actual host-specific builds. Only advertise an OS as supported after its native acceptance tests pass; do not infer compatibility from a browser test. Signing/notarisation requirements belong in the distribution checklist when distributing publicly.

## 8. Architecture and state ownership

### 8.1 Components

1. **Client:** renders the scene, plays audio, captures input, predicts local movement, and shows menus/HUD.
2. **Bun application service:** owns sessions, match lifecycle, authoritative simulation, computer decisions, clock, scores, and statistics.
3. **Simulation package:** headless TypeScript football rules and Rapier integration; no DOM, renderer, filesystem, or HTTP imports.
4. **Storage facade:** interfaces for profile/settings, match checkpoints, and completed results.
5. **File storage adapter:** implements persistence using versioned JSON and atomic replacement.
6. **Desktop host:** creates the native window, starts/stops services, and supplies OS integration.

The server is the source of truth for all gameplay. The client cannot submit a score, set possession, advance time, or declare a result. Client state is limited to presentation and predictions corrected by the server.

### 8.2 Simulation and synchronisation

- Fixed 60 Hz server simulation using a monotonic clock and accumulator; render independently with requestAnimationFrame.
- Limit catch-up work to five ticks per scheduling turn. Sustained overload pauses the match with a recoverable performance message; never fast-forward through seconds of unseen play.
- Send full authoritative snapshots at 20 Hz initially. Fourteen players and one ball do not justify delta-compression complexity for version one.
- Snapshot fields: protocol/build version, match ID, snapshot sequence, server tick, phase, clock, score, controlled-player ID, transforms/velocities, possession, action states, stamina, and last processed input sequence. Send statistics when changed or requested.
- Inputs carry sequence, current match ID, movement/aim, button state and one-shot action IDs. Send on change and at up to 60 Hz while active; heartbeats keep the session alive.
- Queue one-shot actions until acknowledged; deduplicate them server-side. Reject stale match IDs, invalid values, impossible action rates, and excessive future/old sequence values.
- Predict controlled-player movement using shared movement rules; reconcile acknowledged input against server snapshots. Interpolate other players and ball, starting with a roughly 50 ms buffer tuned by measured jitter. Cosmetic local kick feedback may be immediate, but never predict score or ownership as committed fact.
- Clear movement if no input/heartbeat arrives for 250 ms; pause the match if the owning connection is lost. Reconnect obtains a full snapshot and resumes only on user action.
- Use server tick times for animation events, unique event IDs for goals/whistles, and bounded event history for reconnects. Never play duplicate goal audio on snapshot retransmission.
- Run simulation away from blocking persistence work. Begin with one match per session and a scheduler in Bun; move simulation into Bun workers if profiling shows HTTP or window lifecycle work harms tick timing.

### 8.3 Match lifecycle

Authoritative phases: `created → loading → kickoff → playing → stoppage → playing`, with explicit `goalCelebration`, `halfTime`, `paused`, `finished`, and `abandoned` states. The second half returns through kickoff. Persist the previous phase when paused so resume cannot skip a restart.

- The clock advances only in playing.
- A server-issued readiness handshake after client assets load starts kickoff; loading cannot consume match time.
- Finished and abandoned are terminal. Rematches create new IDs.
- Pause stores its reason: user, focus, connection, performance, or recovery.
- Refresh/reconnect to the same live session recovers the active match. Loading a recovered checkpoint starts paused with an explicit Resume action.
- A desktop or browser focus loss pauses its owned match. Returning to focus never silently resumes.
- One active match per profile in version one. A second tab may show menus but cannot take control without an explicit transfer action; the former controller becomes inactive and its input is rejected.

## 9. Backend contracts

All endpoints are versioned under `/api/v1`. Return structured errors with a stable code, safe message, request ID, and retryability. Validate incoming payloads and cap sizes. Use idempotency keys for match creation, restart/rematch, and result finalisation.

| Endpoint | Purpose |
| --- | --- |
| GET /health | Readiness and application/protocol version; no secrets |
| POST /session | Establish the local/browser session |
| GET /countries | Country catalogue and kit metadata |
| GET /profile | Selected country, settings, and resumable-match summary |
| PATCH /profile | Validate and persist preferences with expected revision |
| POST /matches | Create a match from country, opponent mode, and difficulty |
| GET /matches/:id | Owned match metadata and recovery status |
| POST /matches/:id/ready | Client asset readiness |
| POST /matches/:id/pause | Pause owned active match |
| POST /matches/:id/resume | Resume an eligible paused match |
| POST /matches/:id/abandon | Abandon without recording a completed result |
| POST /matches/:id/rematch | Idempotently create the next match |
| GET /results | Recent completed results with bounded pagination |
| WS /play | Authenticated input, snapshots, lifecycle events, and acknowledgements |

WebSocket handshake includes session ownership, match ID, and protocol version. Reject incompatible builds with an actionable reload/update message. HTTP remains responsible for lifecycle commands; WebSocket carries real-time input and notifications.

### 9.1 Local service security

- Bind desktop services to 127.0.0.1, not all network interfaces; verify Host and Origin for HTTP writes and WebSocket upgrades.
- Bootstrap the desktop session with a one-time random launch credential exchanged for an HttpOnly, SameSite session cookie. Do not keep credentials in logged URLs or persist them with results.
- Browser sessions use server-issued cookies and same-origin request protection. Local mode uses one profile and does not imply user authentication suitable for public hosting.
- Authorise every match operation by session/profile ownership. Bound message size, input frequency, result-list size, and idle-session lifetime.
- Serve only bundled assets and supported endpoints; prevent file-path traversal. The renderer never receives filesystem access or unrestricted native RPC.
- Remote deployment, if added later, requires HTTPS/WSS, real user isolation, and a separate security review of that expanded feature.

## 10. File persistence behind a facade

### 10.1 Interfaces and boundaries

Define `ProfileRepository`, `MatchRepository`, and `ResultRepository`, plus a `StorageProvider` that supplies them. Use domain records rather than file paths in application code. Required operations include read/update profile with revision, save/load/delete checkpoint, record/get result by match ID, and list recent results. A future database adapter must satisfy the same behavioural contract.

Repository methods are asynchronous and return validated records or typed errors. Neither HTTP handlers nor simulation code may call Bun.file, Bun.write, or filesystem APIs directly. In-memory adapters are permitted for tests only. File storage is the production implementation in version one.

### 10.2 Persisted records

- **Profile:** schema version, revision, profile ID, preferred country, opponent mode/selection, difficulty, keyboard bindings, graphics/audio/accessibility settings, and update timestamp.
- **Checkpoint:** schema/simulation version, match ID, revision, settings, phase and prior paused phase, half/clock/score, player/ball state, physics recovery data, AI states/timers, random-generator state, possession, restart/last-touch state, statistics, and last committed event IDs.
- **Result:** schema version, unique match ID, countries and chosen kits, difficulty, start/end timestamps, score, outcome, and statistics.
- Persist no raw held keys, socket credentials, or wall-clock timers that would advance play during downtime.

### 10.3 Layout and operating rules

Data root contains `profile.json`, `matches/<id>.json`, `results/<id>.json`, and a bounded `backups/` directory. A result index is optional and must be rebuildable from result files. Each envelope carries schema version and revision.

- Development/browser local mode uses a configurable `ONE_MORE_MATCH_DATA_DIR`, defaulting to an ignored application data directory under the project.
- Packaged desktop mode uses the OS user-data location, never the installation folder. Document the resolved location in diagnostics.
- One process owns a data root. Use exclusive lock acquisition with owner metadata and safe stale-lock recovery; a second instance focuses the existing app or reports that the data directory is in use.
- Serialise mutations per record and compare expected revisions to prevent lost updates. A revision conflict returns current state for retry.
- Write a temporary file in the same directory, flush as supported, then rename atomically over the destination. Preserve the last known-good version. Bun.write alone is not a transactional persistence design.
- Validate records on read and before commit. Quarantine corrupt files, try the last valid backup, and surface a recoverable warning without overwriting the corrupt evidence.
- Implement explicit version migrations and test fixture upgrades. Refuse unsupported future schemas; incompatible simulation checkpoints offer a fresh match while retaining preferences and completed results.
- Persist preferences on confirmed change, checkpoints every five seconds and at pauses/goals/half-time, and results immediately at completion. Snapshot copying must not block the simulation tick. Coalesce outdated pending checkpoints.
- Resume after a crash may lose at most the checkpoint interval of active play under normal storage operation. State this in recovery messaging; do not promise zero-loss saves.
- Completion order: atomically record the result keyed by match ID, then mark/delete the active checkpoint. Recovery checks for an existing result and treats that match as finished. This prevents duplicate results without requiring a multi-file transaction.
- Retain the most recent 100 completed results and bounded backups. Remove stale temporary files safely on startup; never delete the last valid checkpoint as part of housekeeping.
- If disk is full or writes fail, keep the current game playable in memory, show a persistent save-status warning, and retry with bounded backoff. Never claim a match is saved until persistence succeeds.

This boundary permits a later SQLite/PostgreSQL adapter without changing match rules, rendering, or public API contracts. No database driver, ORM, or database service is required now.

## 11. Suggested project organisation and commands

Use a Bun workspace with the following responsibility boundaries:

- `apps/client`: browser scene, input, audio, menus, HUD, assets, and network client.
- `apps/server`: Bun startup, HTTP/WebSocket adapters, session lifecycle, and dependency wiring.
- `apps/desktop`: Electrobun configuration, main entry, packaging, and HostCapabilities adapter.
- `packages/simulation`: headless movement, physics, rules, tactics, and match state machine.
- `packages/contracts`: shared IDs, schemas, protocol messages, and domain records.
- `packages/storage`: repository contracts, file adapter, migrations, and test memory adapter.
- `packages/catalogue`: countries, kits, and versioned gameplay tuning.
- `tests`: cross-package, browser, native smoke, and performance scenarios.
- `specs`: this document and later implementation decisions.

Provide documented Bun scripts for `dev` (native app and required services), `dev:web` (browser mode and backend), `build`, `start` (production browser server), `desktop:build` (current host package), `typecheck`, `lint`, `test`, and `test:e2e`. A single development command must start its full mode and clean up child processes on exit. Production desktop must start without Vite or source files.

## 12. Validation and release acceptance

### 12.1 Automated verification

- Rules: whole-ball goals, post/crossbar misses, boundary ownership, restart placement, kickoff ownership, final-tick scoring, half-time, draws, and rematch resets.
- Simulation: fixed-step behaviour, finite positions, one possessor, bounded action rates, stamina, goalkeeper distribution, and same-build seeded reproducibility.
- AI: bounded restart completion, role coverage, and no all-player ball chase in representative scenarios. Use invariant/scenario tests rather than brittle exact-coordinate scripts.
- Protocol: out-of-order/stale/duplicate inputs, duplicate events, invalid payloads, ownership failures, reconnect snapshot, controller transfer, and version mismatch.
- Storage contract: atomic replacement, failed write, disk-full simulation, corrupt record/backup recovery, revision conflict, migrations, exclusive ownership, and crash between result commit and checkpoint cleanup. Run the same contract against every adapter.
- End-to-end: select country, start, move/pass/shoot, score, concede, complete both halves, see result, play again, change team, pause, resize, refresh, and recover.
- Soak: at least 100 accelerated headless seeded matches and 20 consecutive rendered rematches without deadlock, duplicate score, increasing retained scene resources, or unbounded memory growth.

### 12.2 Manual acceptance

- A tester can finish a complete match using only the displayed keyboard controls.
- A standard gamepad can navigate menus and complete a match on each advertised desktop platform.
- AI can attack, defend, pass, shoot, and save; teammates make themselves available.
- Every out-of-bounds situation returns to playable football without developer intervention.
- Country/kit separation is verified across the full pairing matrix, including goalkeeper visibility.
- Ball, controlled player, and HUD stay readable at minimum size, 1080p, 1440p, and high DPI.
- The packaged native app launches into its own window, renders hardware-accelerated football, plays audio, enters/exits fullscreen, and closes without orphaned processes.
- The same gameplay runs in current stable Chrome, Edge, Firefox, and Safari where WebGL2 is available. Record tested versions; browser-specific failures remain release issues for any browser advertised as supported.
- Native and local browser play work without internet after installation/build.
- Quit/relaunch restores settings; crash recovery loads a valid checkpoint paused; storage failure never silently discards user feedback.
- The target hardware meets measured performance goals during regular play, goals, restarts, and repeated matches. Report any weaker platform with an appropriate default quality setting.

### 12.3 Definition of done

Version one is complete only when both native and browser launch paths, all 20 countries, the full match/replay loop, server-owned gameplay, file-backed persistence, and recovery behaviour work together. A rendered pitch, moving players, or a single goal demonstration is not a completed release.

Deliver source, locked dependencies, packaged build for each actually tested desktop target, local browser build, setup/run instructions, controls guide, asset manifest, and a concise validation report listing tested hardware/platforms and remaining limitations.

## 13. Implementation sequence

1. **Compatibility gate:** prove a packaged Electrobun/Bun window can render a Three.js WebGL2 scene, accept keyboard/gamepad input, play audio, exchange WebSocket snapshots, initialise Rapier WASM in Bun, and save/reload through the file facade. Confirm the same client in browser mode. If Rapier fails, assess a focused custom ball/kinematic-player solver and document the decision before building gameplay around it.
2. **Playable core:** pitch, two squads, movement, possession, passing, shooting, goalkeeper, goal detection, and basic AI. Use temporary art internally.
3. **Complete match:** rules/restarts, clock/half-time, results, replay, selection, all countries, and lifecycle/reconnect behaviour.
4. **Persistence and robustness:** checkpoint recovery, idempotent results, failure handling, revision/locking, and session control.
5. **Presentation:** final player assets/animation, stadium, camera, audio, menus, kit checks, and quality settings.
6. **Release verification:** automated scenarios, real-window tests, performance profiling, offline packaging, and documentation.

These are internal milestones within one full version-one delivery. Do not present an unfinished milestone as the requested playable release.

## 14. Primary technical references

References checked while preparing this specification; implementation must verify the exact pinned releases and their packaging requirements.

- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html): rendering capabilities and settings.
- [Three.js game-development guide](https://threejs.org/manual/en/game.html): rendering library versus game systems.
- [Bun WebSockets](https://bun.sh/docs/runtime/http/websockets): Bun server transport.
- [Bun File I/O](https://bun.com/docs/runtime/file-io): file access primitives; atomic commit/recovery remains application responsibility.
- [Bun WebView](https://bun.com/docs/runtime/webview): headless automation scope.
- [Electrobun main-process runtimes](https://framework.blackboard.sh/electrobun/guides/native-main-process/): Bun desktop runtime integration.
- [Electrobun CEF bundling](https://framework.blackboard.sh/electrobun/apis/bundling-cef/): packaged rendering-engine configuration.

