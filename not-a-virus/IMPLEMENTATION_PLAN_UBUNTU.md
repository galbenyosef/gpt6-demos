# NotAVirus — Ubuntu GNOME Wayland implementation plan

Prepared: 2026-09-20
Target project: `/home/iwk/src/gpt6-demos-fun-ubuntu/not-a-virus`
Target desktop: Ubuntu 26.04.1 LTS, GNOME Shell 50.1, Mutter, Wayland.
Status: implemented and packaged; automated acceptance passed. Physical desktop gates remain pending. The 1% CPU target is waived for now by the user.

## 1. Scope and authority

Implement the existing pointer-following pet for this specific GNOME desktop. Preserve gatita as the default, the four characters, schema-1 packs, chase/idle/sleep behavior, click-through, size selection, pause, and pack import. This is a GNOME 50 implementation, not a commitment to all Linux desktops or Ubuntu 24.04/GNOME 46. Supporting those versions requires separate compatibility work.

This `IMPLEMENTATION_PLAN_UBUNTU.md` is the Ubuntu execution record. `IMPLEMENTATION_PLAN_MACOS.md` preserves the historical macOS record. The supplied extensionless `IMPLEMENTATION_PLAN` is retained as the original Ubuntu brief. For Ubuntu work, this plan supersedes its macOS-only scope and platform-specific requirements; existing pack and behavioral specifications still apply. Preserve the macOS implementation and unrelated repository changes.

Observed evidence:

- The host reports Ubuntu 26.04.1 LTS and GNOME Shell 50.1. Wayland is the user-described session; confirm the actual execution session during U01.
- The target checkout contains the existing three-crate Rust workspace and macOS frontend.
- In the source checkout at `/home/iwk/src/gpt6-demos/not-a-virus`, the 14 core and 13 pack tests passed on this host during feasibility review. This is not a test result for the target checkout; rerun there.
- No GNOME sprite, input handling, mixed-monitor behavior, or performance has yet been demonstrated.

## 2. Architecture decision

Use a JavaScript GNOME Shell extension for desktop integration and a private Rust subprocess for simulation and pack handling.

Ordinary Wayland clients cannot reproduce the current global cursor polling and arbitrary floating-panel movement through the standard application-window interfaces. GNOME also does not support the Layer Shell route commonly used by other Wayland desktops. The extension instead draws a Clutter/St actor inside Shell and samples `global.get_pointer()`. These APIs exist on the desktop side of the boundary. See [Wayland](https://wayland.freedesktop.org/docs/html/apa.html), [Layer Shell compatibility](https://github.com/wmww/gtk4-layer-shell#supported-desktops), and [Shell architecture](https://gjs.guide/extensions/overview/architecture.html).

Responsibilities:

| Component | Owns |
|---|---|
| `notavirus-core` | Existing deterministic motion, phases, facing, frame selection, and geometry |
| `notavirus-pack` | Existing TOML/JSON/PNG validation, discovery, and bounded archive installation |
| New `notavirus-gnome` Rust crate | Private protocol, runtime instance, pack operations, and validated rendering data |
| GNOME extension | Cursor sampling, monitor/work-area adaptation, actor rendering, panel menu, settings, and helper lifetime |
| Separate preferences process | GTK preferences and native file chooser; never import GTK/GDK into Shell |

Retaining the Rust engine prevents two independent implementations of the character behavior. Do not load a custom native Rust library into the compositor or introduce a second animation state machine in JavaScript. The helper needs no window, display-server connection, root privileges, input devices, socket listener, or permanent background service.

Only the extension and its child communicate over inherited stdin/stdout pipes. This deliberately changes the original no-IPC implementation detail, without introducing a public endpoint. Runtime remains offline. Describe installation honestly: an enabled Shell extension has broad desktop access, even though this implementation uses only the capabilities required by the pet.

## 3. Proposed file layout

Paths are relative to the target project's `not-a-virus/` directory.

```text
crates/notavirus-gnome/
  Cargo.toml
  src/{main,protocol,runtime,assets}.rs
  tests/{protocol,runtime_adapter}.rs
gnome/
  metadata.json
  extension.js
  {controller,bridge,sprite,geometry,indicator}.js
  prefs.js
  schemas/org.gnome.shell.extensions.notavirus.gschema.xml
  icons/notavirus-symbolic.svg
tests/gnome/
  fixtures/
  desktop-smoke.js
scripts/
  build-gnome.sh
  install-gnome.sh
  uninstall-gnome.sh
```

Use the local extension UUID `notavirus@local`, with `shell-version: ["50"]` and normal user-session mode only. Record the UUID once and share it across metadata, scripts, and documentation. A future public release can choose an owned namespace separately.

Build a versioned local artifact containing the extension, executable helper, schemas, icon, and bundled packs. Resolve helper/resources relative to the installed extension, not the developer checkout. Detect the build architecture; do not label a native binary architecture-independent.

## 4. Runtime contract

### Extension lifecycle

`enable()` creates the controller, non-interactive sprite, panel indicator, settings listeners, helper, and asynchronous readers. Sample pointer position through Shell; do not capture keyboard input or install an input grab. Only the menu is interactive.

`disable()` first stops scheduling and disconnects signals, then cancels pending reads/writes, closes helper input, terminates the owned child if needed, removes chrome/actors/menu, and releases textures. Never synchronously wait for a process on the Shell main thread. The helper exits on stdin EOF. Outstanding callbacks must not access destroyed actors; dispose the previous controller and use an explicit connection generation to discard late replies after restart.

Screen lock disables the user-session extension through normal Shell behavior. Do not request the unlock-dialog mode. Resume with fresh pointer/timing state after unlock. Follow [GNOME lifecycle guidance](https://gjs.guide/extensions/review-guidelines/review-guidelines.html).

### Private protocol

Specify version 1 before implementing both sides. Use bounded newline-delimited JSON for control and frame metadata; send no image bytes on the recurring frame path. Use asynchronous Gio pipe operations in JavaScript and a simple request loop in Rust. No shell command strings or shell interpolation.

Required messages:

- `hello`: protocol/build version, startup preferences, resource locations; mismatch produces a visible error and stops startup.
- `sample`: request sequence, elapsed monotonic time, pointer, monitor generation, work rectangle, logical/device scale, and visibility state.
- `frame`: matching sequence, pack generation, sprite rectangle, normalized frame crop, facing/filter, and phase for diagnostics.
- `list_packs`, `select_pack`, `set_size`, `set_paused`, `reload_packs`, and `shutdown` with explicit success/error acknowledgments.
- `asset_ready` and `commit_pack`: stage and acknowledge a new texture before replacing the currently displayed pack.

Cap each control message at 64 KiB and bound parsing before allocating large buffers. Paginate pack lists within that limit. Validate types, finite coordinates, accepted scales, lengths, sequence/generation fields, and frame bounds. Malformed output must stop the bridge safely rather than enter Shell rendering code.

Allow at most one outstanding simulation request, plus one replaceable latest pointer sample. Preserve the order of control operations; coalesce repeated size/selection requests where appropriate. Never accumulate one queued operation per display frame. Drop stale frame responses after a pack, monitor, or lifecycle generation change.

One Shell clock supplies elapsed time. Measure time between submitted simulation samples, cap it at 100 ms, and let the existing engine subdivide it to at most 1/120 second. Reset elapsed-time and velocity samples after suspension, pause, or monitor relocation. Do not interpolate by inventing a second movement model.

Start with a maximum 60 Hz GLib timeout and nonblocking pipe round trips. Reuse the current image when only position changes, and upload image content only on pack changes. Frame metadata should cause no texture re-upload. U06 measures whether scheduling/IPC latency is acceptable; if it is not, revise the bridge or scheduling at that gate before adding features.

### Image transport and pack switching

Keep untrusted pack validation in Rust. Export the decoded, validated RGBA atlas once to a private per-session directory under `$XDG_RUNTIME_DIR/notavirus/`, using unique session directories with mode 0700 and files with mode 0600. Require a valid user runtime directory; report an actionable error if unavailable.

Send a relative asset token, width, height, byte length, and pack generation. The extension accepts only its own session directory and bounded filenames; it never follows arbitrary paths received in frame messages. Validate byte length against checked `width * height * 4` and the existing 4096×4096 limit. Read asynchronously and upload through the Clutter image API verified on installed GNOME 50.1. Match alpha format and row stride explicitly. Remove staging files when acknowledged; clean the session directory on shutdown and safely reclaim only stale owned sessions.

Prepare the candidate pack and texture, acknowledge successful rendering preparation, then commit the helper's runtime and saved pack ID. Failed validation or upload leaves the previous pet running. Keep at most old/new atlases during switching and release the old texture immediately after commit. Test the temporary peak memory for maximum-size accepted packs.

### Coordinates and rendering

GNOME desktop geometry uses logical coordinates with a top-left origin. The existing engine and frame UVs contain bottom-left conventions. Isolate all conversion in adapters; do not change pack data or globally flip the core's conventions.

For a selected monitor with top-left `(mx, my)` and height `mh`, transform a pointer to core coordinates as `(x - mx, my + mh - y)`. For a work rectangle `(wx, wy, ww, wh)`, transform its origin to `(wx - mx, my + mh - (wy + wh))`. Convert the resulting sprite rectangle back using `shell_y = my + mh - (core_y + sprite_height)` and `shell_x = mx + core_x`. Account for anchor and mirrored facing through the existing runtime outputs. Convert atlas UVs separately; verify them against asymmetrical diagnostic frames.

Obtain monitors and the current workspace's work areas through installed Shell/Mutter APIs. Support negative monitor origins, vertical arrangements, hotplug, and differing scales. Keep speed/distances in logical units. User size is 1×/1.5×/2×; output device scale affects rendering sharpness, not speed. Do not assume a scale value is an integer or multiply logical positions by it.

Use one sprite-sized non-reactive actor hierarchy, without a focusable or reactive covering parent. Prototype `Main.layoutManager.addChrome()` with no reserved work area and no added input region; verify the exact GNOME 50 options from local source. Confirm transparency and picking behavior physically. Use an atlas texture with clipping/cropping, preserve nearest filtering for Paco and linear filtering for smooth packs, and avoid per-frame decoding or giant transparent windows.

Selected behavior for Ubuntu v1:

- Display above ordinary application content on the active workspace, independent of which application has focus.
- Keep the sprite inside the pointer monitor's usable area; refresh on display/work-area changes. Handle Ubuntu Dock fixed and autohide settings explicitly.
- Hide and suspend simulation in Activities overview, while the screen is locked, and when the pointer's monitor is fullscreen. This is a deliberate Ubuntu policy, differing from the macOS fullscreen-auxiliary behavior.
- Preserve the user's pause preference independently of temporary hiding. Hidden-state exit reinitializes timing and geometry without fast-forwarding.
- When the pointer crosses monitors, relocate/clamp/reset velocity using existing behavior. Define stable monitor identity within a layout generation; invalidate it when the layout changes.

## 5. Controls, preferences, and pack installation

The paw menu contains Pause/Resume, Packs, Size, Open Packs Folder, Import Pack, About, and Quit. Use native Shell panel/menu components. All four characters and the existing default alias remain discoverable. Show current selection and disable invalid/duplicate candidates with understandable failure text.

Use GSettings for selected pack ID, size, paused, and a separate running preference. Quit sets running=false and removes the pet/stops the helper; retain a small indicator with Start and a route to extension settings. Explain this behavior in About. Disabling the extension removes everything. Do not programmatically rewrite GNOME's entire enabled-extensions list to implement Quit.

Store user packs in `$XDG_DATA_HOME/notavirus/packs` (default `~/.local/share/notavirus/packs`). Use bundled packs first, then sorted user folders, preserving the existing first-valid-ID and import-no-overwrite policies. An unavailable saved selection falls back to default gatita without crashing. Persist only successfully committed selections.

Import opens the extension preferences window, where GTK may display a file chooser. That process invokes a one-shot helper import command using the existing `notavirus_pack::install` path. Preserve all current archive limits, path containment, symlink restrictions, PNG validation, and failure rollback. Serialize imports with an application-specific lock to prevent concurrent duplicate-ID races. Cancellation creates no partial installed pack.

On successful import, publish an import revision and requested pack ID through application GSettings; the active extension reloads and stages selection. If disabled or stopped, the installed pack is discovered on the next start. Do not add filesystem watching or network dependencies.

Use concise journal logging for startup, failure, pack changes, and shutdown. Never log every frame or record pointer history. Helper stdout is protocol only; drain/rate-limit stderr asynchronously. A helper crash hides the sprite and shows one recoverable menu error with Restart. Avoid automatic crash loops.

## 6. Ordered implementation tasks

Statuses describe exit criteria, not merely code presence. Physical observations remain explicit under U06.

| ID | Task | Depends on | Status | Exit criterion |
|---|---|---|---|---|
| U01 | Verify host, target checkout, and API availability | — | `done` | Environment record and portable baseline tests |
| U02 | Prove the Shell integration with one static sprite | U01 | `blocked` | Actual global follow, transparency, click-through, cleanup |
| U03 | Add Rust helper and bounded protocol | U02 | `done` | Deterministic core reuse and robust process/pipe behavior |
| U04 | Integrate artwork, geometry, animation, and visibility | U03 | `done` | Four packs, correct crops/facing/scales and transitions |
| U05 | Add menu, persistence, discovery, and import | U04 | `done` | Complete functional controls and failure preservation |
| U06 | Verify lifecycle, desktop behavior, and performance | U05 | `blocked` | Automated suite passed; physical desktop/hardware observations pending. CPU target waived by user. |
| U07 | Package, install/uninstall, and document | U06 | `blocked` | Artifact/scripts/docs complete; isolated installation passed. Active-desktop update/logout/uninstall acceptance awaits U06. |

### U01 — Baseline

- Inspect repository instructions and working-tree state. Record Ubuntu, Shell, Mutter, GJS, Rust, architecture, GPU, session type, monitor layout, refresh rates, scale factors, and enabled Ubuntu Dock configuration. Do not dump unrelated environment variables.
- Run locked core/pack tests in this target checkout. Check current native test guards before invoking the whole workspace on Linux.
- Inspect installed Shell resources and introspection data for pointer, actor, texture/filter, chrome, work-area, and visibility APIs. Online latest API documentation can describe GNOME 51; do not assume those signatures match 50.1.
- Check `gnome-shell-test-tool` and isolated test-session availability. Prefer a disposable/nested session for failure and lifecycle testing; do not restart the user's active Wayland shell.

### U02 — First feasibility gate

- Build a minimal extension that renders a bundled diagnostic image and samples the pointer, with a temporary fixed offset. This is the only stage allowed to omit the Rust movement engine.
- Prove clicks, scrolls, text selection, and window dragging reach underlying native Wayland applications when the pet overlaps them. Include an XWayland application when available.
- Verify monitor traversal, focus preservation, panel/dock interaction, fullscreen/overview hiding, and extension enable/disable cleanup.
- If global tracking, positioning, or click-through fails, record the precise issue and resolve this gate before expanding the implementation. A preview inside a normal application window does not pass.

### U03–U04 — Engine and rendering

- Implement protocol fixtures and boundary tests: oversized/truncated messages, NaN/nonfinite coordinates, incompatible versions, EOF, stalled child, cancelled operations, stale generations, and rapid settings changes.
- Reuse `notavirus-core` for every production simulation update. Compare helper outputs against direct core execution for identical input sequences.
- Verify geometry conversion with negative/vertical monitor layouts and work areas. Verify crops, transparency, mirrored anchors, nearest/linear filtering, and all three sizes with diagnostic imagery and the four real characters.
- Confirm sleep/wake, held transitions, hysteresis, pause, and long-tick handling match existing pack behavior. Replace the U02 demonstration motion completely.

### U05 — Product completion

- Implement all listed controls and persisted preferences. Test fresh installation, restart, default alias, removed saved pack, invalid settings, duplicate IDs, and unavailable helper/resources.
- Test valid and invalid imports, cancellation, concurrent requests, failure rollback, and texture-upload failure. The existing pet must survive a failed switch/import.
- Ensure stopped, paused, temporarily hidden, crashed, and disabled states remain distinct and recoverable.

### U06 — Acceptance

Record each item as passed, failed, or not_run with environment and evidence. Missing hardware checks remain pending, not inferred from unit tests.

| Area | Required observations |
|---|---|
| Input | Click, double-click, drag, scroll, selection; no focus steal or accidental keyboard interception |
| Desktop | App switching, workspaces, Activities, fullscreen enter/exit, fixed/autohide Dock, panel menus |
| Monitors | Single display; mixed scale; negative/vertical layout; hotplug; pointer crossing; oversized sprite clamping |
| Lifecycle | Lock/unlock, suspend/resume, logout/login, 20 enable/disable cycles, quit/start, helper crash/stall |
| Packs | All four characters at each size and facing; import errors; removed/duplicate packs; switch rollback |
| Installation | Launch outside checkout; restart after installation; update; uninstall; preserved user data |

Performance targets are new measurements, not inherited macOS benchmark results:

- On a 60 Hz awake desktop, chase updates should approach the 60 Hz cap without visible stalls; record achieved update rate and response latency distribution. Target p95 sample-to-applied-frame latency below 33 ms under ordinary desktop load, and report misses.
- Compare the desktop baseline against extension+helper enabled over repeated 60-second idle and chase runs. Report incremental Shell CPU, helper CPU, memory, refresh rate, and pack. The original <1% incremental idle CPU target is waived for now by the user (2026-09-20). Retain measurements for information; CPU usage above 1% does not block delivery.
- Measure Shell memory increment as well as helper RSS. Initial bundled-pack budget: combined increment below 80 MiB; separately report maximum accepted atlas and two-texture switch peaks.
- Paused/hidden states produce no animation or simulation requests. Paused visible pet remains static. Temporary-hidden state may retain only minimal visibility/monitor tracking needed for resumption. Disabled/stopped state has no helper. Enable/disable and repeated switches must not grow retained actors, textures, timers, descriptors, or processes.

If IPC overhead is material, profile and optimize batching/scheduling first. Record an explicit design revision if a different bridge is needed; do not quietly duplicate the Rust simulation in JavaScript.

### U07 — Delivery

- Add the Linux crate to the workspace with Linux-specific dependencies correctly scoped. Run formatting, locked workspace tests, and appropriate strict Clippy checks; keep macOS-only desktop tests clearly identified as not run on Ubuntu.
- Build scripts compile the release helper, schemas, and extension artifact; verify executable permissions and bundled resources. Installation is per-user under `~/.local/share/gnome-shell/extensions/notavirus@local/`, with no root or shell patching.
- Follow GNOME 50's actual extension installation/discovery process. If a logout/login is required, explain it; never kill or replace the active compositor to reload JavaScript. GNOME 50 has no X11-style shell restart. [GNOME 50 porting guide](https://gjs.guide/extensions/upgrading/gnome-shell-50.html)
- Uninstall disables the extension and removes only its installed files. Preserve packs/preferences by default; document a separate explicit data-removal option.
- Document GNOME 50-only support, local build/installation, extension trust, fullscreen hiding, Quit/Start semantics, pack paths, diagnostics, and recovery. Public extension-store submission, signing, automatic updates, Ubuntu 24.04 compatibility, and other compositors are outside this plan.

## 7. Progress and handoff record

| Field | Current value |
|---|---|
| Active task | None — software implementation and automated verification complete |
| Next task | User installation/live review and remaining physical U02/U06/U07 acceptance |
| Next concrete action | Run scripts/install-gnome.sh, log out/in if required, then review the pet and remaining desktop checklist |
| Implementation readiness | Helper, renderer, controls, import and packaging implemented |
| Release readiness | Not ready |
| Known blocker | Physical desktop/hardware observations remain unverified. CPU usage is accepted for now and is not a blocker. |

For each completed work unit, append date, task, changed files, checks/results, unresolved issues, and next action. Mark tasks done only when their exit criteria pass. Keep failures and unavailable hardware checks visible. This planning request does not itself authorize installing/enabling an extension, restarting the desktop, or publishing a release.

### 2026-09-20 — U01 baseline and U02 isolated feasibility
- Filename reconciliation: the requested Ubuntu filename held the historical macOS record; preserved it byte-for-byte as IMPLEMENTATION_PLAN_MACOS.md and copied the actual extensionless Ubuntu brief into this execution record. Original brief and pre-existing deletion remain untouched.
- Host: Ubuntu 26.04.1, Shell/Mutter 50.1, GJS 1.88.0, Rust 1.98.1, x86_64, Wayland, AMD Cezanne/amdgpu. Two 1920×1080 60 Hz displays at logical (0,0) and (1920,140), both scale 1. Ubuntu Dock enabled, dock-fixed=true, autohide=true.
- Passed target-checkout locked tests: 14 core + 13 pack. AppKit test executable is guarded on Linux.
- Inspected installed libshell-18 resources and introspection: addChrome supports affectsStruts/trackFullscreen; no affectsInputRegion option remains. Non-reactive actor picking supplies click-through. GNOME 50 removed Clutter.Image; use St.ImageContent.set_bytes with Cogl context and RGBA_8888.
- Passed isolated headless GNOME Shell test (real Mutter Wayland compositor): global pointer placement, non-reactive picking through the sprite, overview hiding/resumption, disable actor cleanup. Probe source retained in tests/gnome. No active-desktop extension installation or compositor restart.
- U01 done. U02 automated feasibility passed; physical click/scroll/drag/native and XWayland acceptance remains not_run. Interpretation: this missing human observation is retained under U06, while demonstrated actor feasibility permits U03–U05 implementation; it is not claimed as a physical input pass.

### 2026-09-20 — U03–U05 implementation and U07 packaging
- Added notavirus-gnome crate reusing unchanged Brain/player/pack loader, bounded version-1 NDJSON framing, exact request sequence/type validation, paginated discovery, staged RGBA upload/commit/discard, private leased session directories, and serialized one-shot atomic imports. Dependency lock updated offline using existing dependencies.
- Added GNOME50 extension with one non-reactive sprite hierarchy, St.ImageContent RGBA upload, crop/anchor mirroring, nearest/linear filtering, logical-coordinate adapter, monitor/work-area/overview/fullscreen handling, native paw menu, GSettings, separate GTK preferences/chooser, crash/stall Restart and complete enable/disable ownership. At most one bridge request and one latest operation per control; no frame queue.
- First full Shell test caught an incorrect Cogl-context accessor; corrected to global.stage.get_context().get_backend().get_cogl_context(). Screenshot test API also needed a Gio.OutputStream on GNOME50. Both failures were resolved before passing the full isolated test.
- Passed: initial full real-Mutter headless test across four characters and three sizes, failed pack switch preservation/recovery, paused no-request behavior, overview hide/resume, focus preservation, Quit/Start persistence, child crash recovery, 20 enable/disable cycles with stable chrome actor count. Expanded rerun passed preferences process launch, coalesced rapid settings, stalled child deadline/Restart, and the same lifecycle cycles. Physical gestures are not inferred from non-reactive picking.
- Passed: 33 Rust tests (14 existing core, 13 existing pack, 6 helper); 3 JS boundary tests; 3 packaged-process tests covering isolated install paths, import success/duplicate/concurrent lock/failure preservation, truncated/oversized/EOF shutdown, private cleanup, and missing runtime diagnostics. Strict workspace Clippy, formatting and shell syntax pass. Rust 1.98 introduced a lint in four old artwork compiler loops; equivalent as_chunks_mut loops fix it without changing assets. macOS native checks explicitly skip on Linux.
- Versioned x86_64 archive, relocatable installed helper/resources, compiled schemas, symbolic paw, license and all bundled packs implemented. Per-user GNOME install/uninstall scripts preserve user data and explain logout/login after discovery/update. README, protocol contract and Linux CI updated; no active-user extension installation, publication, commit or staging performed.
- Native UI independent review inspected desktop/menu and preferences screenshots. Fixed settings Size synchronization and visible non-cancellation chooser errors; reviewer scored both resolved and approved the inspected UI finish for acceptance testing only. Historical macOS design records preserved; GNOME surface and bounded review recorded under .impeccable/.
- The test tool's Shell uses a temporary keyfile backend; DBus-activated preferences initially inherited the parent bus environment. Final harness explicitly propagates only its isolated XDG/settings environment before preferences activation so screenshots do not confuse production settings with the test profile.

### 2026-09-20 — U06 initial performance failure and fix
- Controlled 60-second baseline/idle/chase on headless 1280×720 GNOME50.1, amdgpu, gatita Small: baseline Shell 0.317%; idle Shell 6.600% + helper 0.233% (6.516% incremental combined); chase Shell 9.867% + helper 0.233%. Idle/chase throughput ~57.6 Hz; p95 sample-to-applied latency 0.576/0.578 ms. Idle combined memory increment about 22.9 MiB. This misses the <1% idle CPU target.
- Identified redundant actor setters and scaling-filter invalidation on unchanged frame responses. Cache the last rendered state and update position, crop, size, facing and filtering only when changed. No engine or animation behavior changed. First optimized idle measurement: Shell 4.300% + helper 0.233%, baseline 0.300%; CPU target remains unpassed. Complete repeated measurements pending.
- An attempted second headless compositor conflicted with the test tool's fixed Wayland socket while the first benchmark was still running. Stopped only the owned test compositor, then reran the desktop suite successfully; active desktop remained untouched.

### 2026-09-20 — U06 pixel, memory and scheduling verification
- Passed all 432 actual GNOME-rendered frame/size/facing comparisons. Smooth packs have worst mean RGB errors <=0.105/255 and max per-channel error <=4/255 against independent Pillow sampling. Paco is exact at integer scales; Medium admits only adjacent texels at exact nearest-sampling ties, matching GPU floating-point texture interpolation. Wrong-frame, vertical-flip and wrong-facing controls fail. Initial captures reused the previous framebuffer; a paint wait fixed the harness. Production rendering was not changed to match reference tolerances.
- Maximum accepted 4096×4096 atlases imported and switched successfully, including two live textures at preparation. Observed high temporary RSS, so no bundled-budget claim applies to maximum-sized user packs. Explicit disposal now releases superseded/cancelled image contents instead of waiting for GJS collection; repeat stress data pending.
- Completed two 60-second baseline/idle/chase rounds after setter caching: combined incremental idle CPU 4.23%/4.72%; helper 0.23%/0.27%; chase 57.68/57.73 Hz; p95 applied-frame latency 0.645/0.600 ms. Bundled combined RSS increment stayed under 25 MiB. Raw JSON saved; the Shell test tool's unrelated perf-window helper expired before final teardown, producing a nonzero harness exit after all measurements. Corrected by disabling that helper's automatic exit path; a subsequent short profiling harness exited cleanly.
- A 15-second ablation without any sprite rendering still used ~5.53% Shell CPU, versus ~5.33% with rendering, locating the material cost in scheduling/round trips rather than texture uploads. Recorded design refinement: Rust now returns a rest-only hint bounded by the current clip frame and 75 ms. Shell continues pointer checks at 17 ms and bypasses the hint immediately for pointer/control/layout changes; the existing core remains the only phase/animation clock. Repeated measurements and full regression rerun are pending for this refinement.

### 2026-09-20 — final functional verification
- Passed full isolated GNOME50.1 suite with rest scheduling and explicit texture disposal, clean harness exit: four characters × three sizes; 432 frame/facing/size captures; failed switch and recovery; pause/hidden states send no periodic requests; rapid controls coalesce; preferences uses the same isolated settings backend; Quit/Start; crash/stall recovery; maximum-atlas imports; 20 enable/disable cycles with stable actor/descriptor counts and every owned helper confirmed exited. Final native pixel comparison and negative controls passed.
- Final Rust suite has 34 tests (14 core, 13 pack, 7 GNOME), plus 3 JS and 3 packaged-process tests. Formatting, strict workspace/all-target Clippy, schema compilation, Python/shell syntax, and diff whitespace checks pass. Linux does not execute AppKit tests.
- Artifact verified for native executable permissions, compiled schema, license, exact extension sources and byte-identical copies of all five source pack folders. Test-only virtual input and fixtures are excluded. Built archive is approximately 1.9 MiB.
- Resource-location interpretation: hello carries startup preferences and returns the private asset-session token; trusted bundled/user resource roots resolve beside the executable and via XDG, rather than accepting arbitrary root paths through the protocol. This preserves relocatability and narrows the Shell/helper boundary.
- Final stress observation (KiB): bundled Shell RSS 307160 / helper 6220; first 4096-square prepared atlas with old texture retained Shell RSS 521204 / peak 585528, helper 71776; second maximum atlas with old texture retained Shell RSS 535380 / peak 599544, helper 71808. These process-RSS values do not separately measure GPU VRAM. Maximum user atlas switching is intentionally reported separately from the bundled <80 MiB increment target.
- Retained screenshots and stress evidence under .impeccable/review/ubuntu-evidence/. Historical macOS design metadata remains untouched; its pre-existing schema/sidecar drift can be refreshed separately with impeccable init/document.

### 2026-09-20 — user direction and handoff
- User explicitly accepted increased CPU usage and instructed ignoring the 1% CPU target for now. This overrides the original numeric gate. No further CPU optimization is required for this implementation; historical measurements and failures above are retained as evidence, not active blockers.
- Software implementation, packaging and all available automated functional checks are complete. The user’s live desktop has not been installed into or restarted. Built artifact: dist/notavirus-0.1.0-gnome50-x86_64.zip (1,918,125 bytes), SHA256 61e02ef6f163ceb605aed64324a83ee0afdc582a9b47f9306de53429095b05d5.

| Acceptance area | Result | Evidence / remaining scope |
|---|---|---|
| Core, protocol and import | passed | 34 Rust, 3 JS, 3 packaged-process tests; atomic import/failure/locking, strict framing and core-equivalent geometry |
| Native rendering | passed | 432 compositor captures; four characters, every authored pose, three sizes, both facings; negative controls |
| Automated lifecycle | passed | 20 cycles, stable actors/descriptors, owned helpers exit, crash/stall recovery, Quit/Start, pause/overview behavior |
| Native preferences | passed | Separate GTK process launch and captured layout; source fixes for size sync and chooser failure recovery |
| Latency and bundled memory | passed (isolated scope) | Repeated headless measurements below 33 ms p95 and 80 MiB incremental RSS; see retained measurements |
| CPU <1% | waived for now | Explicit user direction; measurements remain informational |
| Maximum user atlas | passed (isolated scope) | Two 4096-square atlases switch successfully; large transient RSS measured separately |
| Physical input | not_run | Click/double-click/drag/scroll/text selection through opaque and transparent pixels in native Wayland and XWayland apps |
| Physical desktop/monitors | not_run | Actual app/workspace/fullscreen/Dock interaction; mixed scale, negative/vertical layout, hotplug and pointer traversal. Adapter geometry tests passed. |
| Session/hardware lifecycle | not_run | Physical lock/unlock, suspend/resume and logout/login |
| User installation/update/uninstall | not_run | Isolated install from archive passed; user-session discovery, update/login and uninstall remain manual |

No commits or staging changes were made. Pre-existing plan-file changes were preserved; the historical macOS plan was copied to IMPLEMENTATION_PLAN_MACOS.md when reconciling the supplied filenames.

Final repeated benchmark completed with clean harness exit. Environment: GNOME50.1 headless 1280×720 virtual 60 Hz, amdgpu/Cezanne, gatita Small; each baseline/idle/chase segment lasted 60 seconds. The native frontend sampled the pointer at 17 ms throughout and used Rust rest hints to reduce idle round trips. No physical-desktop performance claim. Raw results: `.impeccable/review/ubuntu-evidence/benchmark.json`.

| Round | Incremental combined idle CPU (informational) | Helper idle CPU | Idle requests/s | Chase updates/s | Chase p95 applied-frame latency | Combined idle RSS increment |
|---|---|---|---|---|---|---|
| 1 | 2.10% | 0.067% | 11.90 | 57.67 | 0.632 ms | 6.19 MiB |
| 2 | 2.67% | 0.083% | 11.93 | 57.72 | 0.558 ms | 7.50 MiB |
