# Wyang

Wyang animates a photograph or AI-generated edit as soon as you open it. In the harbor scene, waves refract the reflections and moving highlights cross the water. For images without a detected water surface, two layers of colored lights drift through the scene. The camera also moves forward and back, and the pointer shifts foreground details. Choose **Apply to display** to play the animation on your desktop.

**Scene effect** defaults to **Automatic**. Water detection looks for broad, cool-colored patches with horizontal texture in the lower half of the image. Choose **Water ripples**, **Drifting lights**, or **Camera only** to set the effect yourself. All effects run locally on your existing images.

## Run the editor

From this directory, run:

```sh
./run-wayang.sh
```

An optional argument opens an image, a project directory or its `project.json`. Building on Ubuntu requires Rust, a C toolchain, pkg-config and the GTK 3 development headers used by the file chooser. Building on macOS requires Rust and the Xcode command line tools. Use the native host to build each package.

Enter a prompt and choose one to four variations. Generate submits one edit at a time. The editor keeps completed choices if a call fails or you cancel. **Retry unfinished edits** reuses the original batch's source and prompt. A submitted request can incur usage even when its response is lost.

Select a thumbnail and choose a target display. Hold **View original** with the pointer or focus it and hold Space. In the preview, move the pointer or focus the canvas and use the arrow keys. Home centers the keyboard position. **Motion strength** adjusts the movement. Turning off **Animate at rest** keeps only pointer parallax. **Actual size** lets you scroll through the crop at source-pixel scale. **Framing** controls the focal point and **Depth** places the horizon in the artwork. **Pause** holds a frame. Still mode, zero strength and reduced motion use the centered pose.

**Save project** writes an editable directory. Move the whole directory to reopen it offline. **Export still** writes the centered crop at the target's physical pixel dimensions. **Apply to display** snapshots the selected artwork and its settings. You can continue editing or close the editor while that scene plays.

## OpenAI configuration

Set `OPENAI_API_KEY` in the environment or in a `.env` file in the editor's working directory. For a development launch from `wayang/`, create that file with:

```sh
cp -n example.env .env
```

Process variables take precedence, including an explicitly blank key. The default model is `gpt-image-2.5-flare`. Set `OPENAI_IMAGE_MODEL` to override it. Restart the editor after changing configuration. The ignored local file stays out of packages. [Blank example configuration](example.env)

Generate sends a metadata-stripped, sRGB copy of the source and the effective prompt to the OpenAI image edits endpoint. Projects retain the original bytes and record the prompt, framing guidance, model, image dimensions and source digest for each candidate. Preview, export and playback run locally. [Image edits API](https://developers.openai.com/api/reference/resources/images/methods/edit)

## Desktop playback and installation

Build the platform package in `dist/` with:

```sh
bash scripts/package.sh
```

- **Ubuntu 26.04, GNOME Shell 50 on Wayland.** Extract the Linux tarball and run the included `./install-linux.sh`. It installs the editor, launcher and matching per-user Shell extension. If GNOME first discovers the extension at the next login, run `gnome-extensions enable wyang@local` then. Select a display and apply. The Wyang panel menu pauses playback and stops an individual display with the editor closed.
- **macOS.** Unzip the package and launch `Wyang.app`. Its AppKit helper places a click-through window between the desktop background and Finder icons. Each applied display has a Wyang menu-bar control for opening the editor, pausing and stopping playback. Development bundles are ad-hoc signed.
- **Other Linux sessions.** The editor identifies the session or extension requirement beside Apply. Import, generation, preview, save and PNG export remain available.

Playback snapshots live under `$XDG_DATA_HOME/wyang/scenes` (normally `~/.local/share/wyang/scenes`) on Linux and `~/Library/Application Support/wyang/scenes` on macOS. A snapshot contains lossless artwork and scene parameters. Stop removes the playback surface and reveals the existing system wallpaper.

## Verification

```sh
cargo test --locked
cargo clippy --all-targets --locked -- -D warnings
```

To try the generation workflow offline, create three deterministic color studies and launch the fixture provider with a dummy credential:

```sh
cargo run --example make_fixtures -- /tmp/wyang-fixtures
OPENAI_API_KEY=fixture cargo run -- --fixtures /tmp/wyang-fixtures
```

On Ubuntu, `scripts/check-gnome.sh` exercises the packaged extension and Rust player in an isolated Wayland session. It requires GNOME Shell's test tool, the desktop extensions, zip and Python Pillow. `scripts/benchmark-gnome.sh` measures a 60-second 1080p run.

On macOS, `bash scripts/check-macos.sh` temporarily applies the harbor on the main display, opens the packaged editor, checks player replacement and then stops playback. With Screen Recording access it also compares the wallpaper window with the exported PNG. Set `WYANG_BENCHMARK=1` to measure 60 seconds at the display's native backing resolution. The script prints the directory containing its captures and timings.

Both desktop checks accept an optional saved harbor project directory. Pass the same directory on both machines to exercise the same selected candidate offline.

To record the selected artwork with the default animation and a stationary pointer, run `cargo run --release --locked --example record_loop -- PROJECT NEW_VIDEO.mp4`. This verification tool uses the wallpaper renderer and requires ffmpeg.

To measure the renderer at exactly 1920 × 1080 on a different-sized monitor, run `WYANG_PROFILE_DIR=/path/to/existing/output cargo run --release --locked --example benchmark_1080p -- /path/to/project`. This offscreen measurement excludes the window compositor.

For the live generation acceptance check, `cargo run --release --example check_edits -- --live OUTPUT_DIRECTORY` submits up to two billable harbor edits and reopens the saved project. The command requires a credential and a new output directory.

The bundled photograph is *Ships in the Harbor, Hamburg, Germany* from the Library of Congress Photochrom Print Collection. [Photograph and collection record](https://www.loc.gov/resource/ppmsca.00419/)

[Acceptance record](tests/ACCEPTANCE.md) · [Implementation specification](specs/001-spec-animated-wallpaper-gen.md)
