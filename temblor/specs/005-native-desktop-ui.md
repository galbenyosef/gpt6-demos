# 005 — Native desktop UI

**Status** Draft for discussion.

Temblor has two launch paths. The browser interface is the default. A player opens Temblor through the demos portal and clicks **Play** as they do today. A player who chooses the desktop version runs a command that opens a native Rust application window. Both play the same game on the same maps.

## Launch

| Player chooses | Entry point | Expected result |
| --- | --- | --- |
| Browser | Open Temblor in the portal, or use the existing `./play` script in `temblor/`. | The existing browser lobby and controls. The portal continues to serve the checked-in web release independently of the desktop build. |
| Desktop | From `temblor/`, run `cargo run --locked --release -p temblor-desktop`. After building, launch the `temblor-desktop` executable directly. | A native window opens to the Temblor lobby. **Play** starts *Trial by Error* using the bundled arena and actor packs. |

Target Linux and macOS for the first desktop release. The built executable must find its bundled assets when launched from any working directory and run offline with the portal and local servers stopped. It owns its window, renders directly to the GPU, and reads input and plays audio through desktop APIs. Document the build prerequisites and launch command in Temblor’s README when the desktop target ships.

## One engine, two frontends

Add a desktop binary crate alongside the existing Rust library. Share map loading, assets, movement, collision, weapons, bot difficulty, scoring and rematch logic. The desktop event loop feeds keyboard and relative mouse input into the same fixed 8 ms simulation steps as the browser. [Existing game loop](../src/game.rs) · [Native match replay](../examples/replay.rs)

Separate the browser canvas setup from the common `wgpu` renderer. Give the desktop host a native window surface and reuse the arena shaders, texture batches, models and effects. Keep window events, menus, HUD drawing, file selection and audio output in the appropriate frontend. Desktop-only dependencies belong to the desktop build. [Renderer](../src/renderer.rs) · [Browser host](../web/host.js) · [Texture batching requirements](004-texture-batching.md)

## Desktop player experience

- **Play a duel.** Offer the bundled arena, first-to-five scoring, HUD, positional sound and rematch. Use the familiar mouse and keyboard bindings. Escape or loss of focus pauses the match and releases the mouse. Resume clears stale input before recapturing it.
- **Select a bot level.** Show **Bot level** in the lobby and at the top of Controls. Start at **3 · Standard**, offer levels 0–5, and carry the selection through rematches and map imports.
- **Peek at the map.** Press **P** to open the semi-transparent 3D map with player and bot markers. Reuse the Rust map geometry. Support orbit and zoom, show the controls, and return to the prior play or pause state on the second **P**. [Level and Peek behavior](<003 Level and Peek Options.md>)
- **Load local game files.** A native file picker accepts the same supported PK3s and map choices as the browser importer. Canceling or rejecting an import leaves the current arena playable.

## GitHub Actions builds

Create `.github/workflows/temblor.yml` alongside the desktop crate. Use the same release trigger as NotAVirus so pushing a repository tag matching `v[0-9]+.[0-9]+.[0-9]+` starts the build. Give the workflow read-only access to repository contents and run Cargo commands from `temblor/`. [Reference workflow](../../.github/workflows/notavirus.yml)

- **Build on each operating system.** Use separate GitHub-hosted jobs for Linux x86-64 and macOS Apple Silicon. Install the project’s Rust toolchain and required native build dependencies. Check formatting, run the shared engine tests and Clippy, and compile `cargo build --locked --release -p temblor-desktop` on each platform. Use the checked-in lockfile for tests and linting as well.
- **Package a playable build.** Each job produces an archive containing its native executable, the bundled arena and actor packs (embedded or alongside the executable), and the applicable license notices. Preserve executable permissions. Include the release tag, OS and architecture in the archive name so players can pick the right download.
- **Make both downloads available.** Verify each archive contains its expected executable and assets, then upload it as a GitHub Actions artifact. A successful workflow run must offer both archives for download from its summary. Document how to download, extract and launch each build in Temblor’s README.

## Verification

1. Start the portal through its usual launcher and enter a browser match through the Temblor card. Verify this path works on a checkout where the desktop binary has never been built.
2. On Linux and macOS, launch the built executable from outside the project directory with the servers stopped. Play a level 3 match to five frags, hear positional audio, start a rematch and close the window cleanly.
3. Exercise mouse capture, focus loss, resume and window resizing. Switch to level 0, open Peek, locate both actors and close it. Confirm that the match clock, position and aim were preserved while inspecting the map. Repeat Peek after importing the bundled arena through the file picker.
4. Feed the same seed and recorded commands to both builds. Compare pickups, weapon use, frags and final score to catch differences in how the hosts advance the shared simulation.
5. For a tagged build, download both artifacts from the same workflow run. On each matching platform, extract its archive in a clean directory outside the checkout and launch the packaged executable. Verify that **Play** loads the bundled arena with the portal stopped.
