# NotAVirus

A macOS menu bar sprite. No network. No extra permissions.

It follows the mouse. That is the entire product.

**Current build:** gatita is the default character, bundled as `gatita (Default)` and `gatita`. Paco remains available as a pixel-art character. gatita is a smooth animated tabby with play, roll, visual purr, bounding chase, sleep and stretch clips. Release acceptance and the remaining desktop checks are tracked in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Open the [Paco animation preview](art/paco/preview.html) to inspect the shipped clips without opening the desktop app. [Artwork provenance and rebuilding instructions](art/paco/README.md) include the generated source, prompts and asset compiler. The original JPEGs and [static pose studies](specs/pose-studies/README.md) are preserved.

## Build and run

Requires macOS 13 or later, Xcode Command Line Tools, and stable Rust (1.88 or newer; tested with 1.97.1). Mac only. On purpose. The build downloads Rust dependencies; the running app has no network client or telemetry.

```sh
cd not-a-virus
./scripts/bundle.sh
open dist/NotAVirus.app
```

The script builds the locked release workspace, assembles `NotAVirus.app`, ad-hoc signs it, and verifies the signature. Move the bundle anywhere, including Applications; resources are resolved inside the bundle. `cargo run -p notavirus-app` also works from the development checkout. The bundle identifier is the specification's local placeholder `app.notavirus.NotAVirus`; replace it with a controlled identifier before distribution. This local build is not Developer ID signed or notarized.

Click the **paw icon** in the menu bar. Choose Pause/Resume, Packs, Size, About, or Quit. Small/Medium/Large are 1×/1.5×/2×; the first launch uses Small. Click-through stays enabled. Scale changes artwork, not chase speed. The selected pack, size, and pause state persist in UserDefaults. Reopening the bundle brings attention to the existing menu instead of creating another pet.

Paco gets up, jogs after the pointer, sits with relief, wipes his brow, and dozes. His pack uses a transparent 16-frame atlas and slower acceleration. gatita accelerates quickly, crouches into a bounding chase, settles with a tail flick, plays and rolls while idle, and curls up to sleep. Her smooth 24-frame atlas uses linear filtering. [Preview gatita](art/gatita/preview.html) or see her [source, prompts and rebuilding instructions](art/gatita/README.md).

## Packs

Use **Packs → Open packs folder…** to open:

```text
~/Library/Application Support/NotAVirus/packs/
```

Place each folder containing `pack.toml` and its atlas there and restart the app. Or choose **Import .petpack…**, select a zip with `pack.toml` at its root or exactly one directory deep, and the validated pack is installed and selected immediately. Automatic watching/hot reload is deferred to v1.1.

Bundled packs have priority, followed by user folders in sorted order. The first valid pack with a given ID wins; duplicate and invalid candidates are disabled in the menu. Imports never overwrite an existing ID. A failed import or pack switch leaves the current character running. If the saved pack is unavailable on launch, the bundled gatita Default loads. Existing explicitly selected packs remain selected after an update.

Packs are data, never code. The loader accepts schema 1 TOML and a static 8-bit RGBA PNG, with an optional named-region JSON. APNG, GIF, rotated/trimmed regions, unsafe paths and escaped symlinks are rejected. Archives have a 32 MiB compressed and extracted limit, at most 4096 entries, and no symlinks or executable payloads. Atlases are at most 4096×4096. Smaller sheets reduce memory use.

See [PACK_AUTHORING.md](PACK_AUTHORING.md) for a minimal pack and the timing/role contract. Validate a folder without launching the app:

```sh
cargo run -p notavirus-app -- /absolute/path/to/pack
```

## Files and privacy

Preferences: `~/Library/Preferences/app.notavirus.NotAVirus.plist` (managed by macOS). Logs: `~/Library/Logs/NotAVirus/notavirus.log`, rotating at 2 MiB with one previous file. User packs stay in Application Support. The app never writes into its installed bundle.

To uninstall, quit from the menu, remove the app, then optionally remove those three NotAVirus-specific locations. There is no background service, login item, IPC endpoint, or updater.

## Is this a virus?

No. It is a transparent window and a PNG.
It does not see your keystrokes.
It does not touch the network.
It cannot click things for you.
Quit it from the menu bar extra.

The sprite stays in the pointer's display's visible area, avoiding the menu bar and Dock. It joins Spaces and is a fullscreen auxiliary window, but exclusive fullscreen games may cover it. Sound, physical orbiting/jumping, window climbing, and interactive petting are outside v1. No Accessibility, Screen Recording, or Input Monitoring permission is requested.

## Development and checks

```sh
cargo fmt --all -- --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
./scripts/bundle.sh
```

The workspace test command includes a main-thread AppKit integration executable and therefore needs access to the macOS window server. It checks native rendering and controls plus the production import path: valid archives, failure preservation, error recovery, startup reconstruction and removed-pack fallback. Its files and preferences are isolated; it does not change the app’s saved settings. File chooser interaction and physical desktop behavior remain manual checks. On a headless or sandboxed host, run the portable tests separately.

Run the opt-in native idle benchmark on a Mac with an awake display (add `--pack gatita` after `--benchmark` to measure gatita):

```sh
cargo test -p notavirus-app --test native --release --locked -- --benchmark
```

It warms up for three seconds, then measures 15 seconds of process CPU and peak RSS. It checks 60 Hz callbacks, stationary geometry, <1% CPU, and <80 MB peak RSS. The real clock, cursor polling, screen cache, renderer, and mouse monitors stay active; only the simulation input is held at the display center so normal mouse activity cannot start a chase. A temporary sprite appears during the run. It uses isolated preferences and cleans up afterward. This is a controlled native benchmark, not a substitute for physical click-through or mixed-display acceptance. Results and environment are recorded in the implementation plan.

Core and pack crates have no AppKit dependencies and can be checked on Linux:

```sh
cargo test --locked -p notavirus-core -p notavirus-pack
```

`notavirus-core` owns plain point geometry, validated pack types, the clip player, and behavior/movement. `notavirus-pack` owns untrusted TOML/JSON/PNG decoding and bounded zip installation. `notavirus-app` owns all AppKit objects on the main thread. The window display link targets 60 Hz on supported macOS versions; macOS 13 uses a main-run-loop timer. Each simulation tick is capped at 100 ms and subdivided to at most 1/120 s. Pausing invalidates the tick source.

`python3 scripts/generate-fixtures.py` regenerates diagnostic PNGs/manifests only under `tests/fixtures/`, so it cannot overwrite runtime artwork. Rebuilding instructions are in `art/paco/README.md` and `art/gatita/README.md`. `cargo test -p notavirus-app --test native --locked -- --capture` also writes offscreen native snapshots at all three sizes and both facings under `target/native-captures/`; it leaves no desktop overlay. Current checks and hardware/art gaps are recorded in the implementation plan.
