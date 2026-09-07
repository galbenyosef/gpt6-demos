# Tonada

A local composition desk built with TypeScript, Three.js and Web Audio. No account, backend, uploaded audio, external fonts, or runtime CDN is required. The first visit creates and saves a playable four-bar sketch.

## Run

```sh
bun install
bunx playwright install chromium
bun run build
bun run dev
```

Open **http://localhost:3000**. Set `PORT` to change the development port. If Chromium is already installed elsewhere, set `CHROMIUM_PATH` to its executable when building or testing.

`bun run build` regenerates the pack samples using a headless browser's `OfflineAudioContext`, then writes self-contained static assets to `dist/`. Serve that directory over HTTP/HTTPS; opening `index.html` via `file://` is unsupported. Microphone capture requires HTTPS or localhost. `bun run dev` discovers packs on each catalog request; rerun `bun run generate:packs` after changing sample generators.

## Use

- Press **Space** to play. Click the piano roll or drum grid to add/remove notes. **Shift-click** or **Shift-Enter** selects a note for velocity, length and harmony edits.
- Scale lock hides out-of-scale rows. Turning it back on preserves existing chromatic notes, marked with `!`. Drum rows identify unpitched instruments.
- In **Compose**, choose **Ambient**, **House**, **Hip-hop**, **Synthwave**, or **Minimal** from **Start from a template**, then select **Add pattern**. Each four-bar arrangement follows the current key, mode, tempo and meter and includes coordinated notes, chords, instruments and track mix settings. Existing patterns retain their notes and sound; applying a template is undoable and autosaved. Use the pattern selector to return to an earlier sketch. Append the new pattern to the song when ready.
- Template projects save instruments and track mixes per pattern. Editing a selected pattern's sound changes that pattern; the project master, tempo, swing and humanization remain shared. Pattern sounds travel with JSON exports and are used for both playback and offline song rendering.
- Select **Step entry** (`R`), then play the `Z–M` and `Q–P` rows. Without step entry, musical keys audition the selected voice; `R`, `L`, `K`, `M`, and `S` retain their transport/mix shortcuts. Comma/period changes octave.
- Arrow keys move the grid cursor; Enter toggles it. Shift-up/down changes velocity. Tab/Shift-Tab from the grid changes tracks; Escape returns to workspace navigation. Other controls use normal browser keyboard navigation.
- Edit chords below the grid. Snap to harmony, Fit rhythm and scale transposition affect the focused note, or the current track when no note is focused.
- Use **Instrument** for synthesis, FM, or local file/microphone sampling. **Mixer** provides ordinary sliders and a Three.js room: horizontal position is pan, height is reverb send; depth separates track labels.
- Patterns support 1–8 bars and a 64-slot song chain. Shortening refuses to discard notes in later bars. Duplicate a pattern to make a variation; append the active pattern to build the song.
- **Projects** provides create/open/rename/duplicate/delete/import/export. JSON contains resolved presets and sample PCM. **Export audio** renders a pattern or song silently to 16/24-bit WAV at 44.1/48 kHz, or exports type-1 MIDI at 960 PPQ.
- `Ctrl/Cmd+S` saves; `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z` undo/redo. Autosave runs every 30 seconds while dirty and after structural/sample changes. Playback is not saved.

## Verification

```sh
bun run typecheck
bun run test
bun run test:browser
bun run verify:corpus
```

Browser tests use a separate server on **4317**, with hot reload disabled. Tests cover the model, assistance, audio reproducibility, pitch, ADSR, filter response, overload, voice stealing, project export/import, sample capacity, independent projects, revision recovery, quota/transaction failures, cross-tab locks, keyboard editing, WAV download, local samples, and WebGL fallback. `docs/verification/` holds the measured browser-specific audio and corpus reports. See [verification notes](docs/verification.md) for limits and outstanding human work.

## Packs

Add `public/packs/<lowercase-slug>/pack.json`; no registry change is necessary. [The essentials pack](public/packs/essentials/pack.json) is a complete example. Display names, descriptions and preset names require `en` and `es`. Each voice stores every parameter; sampler presets additionally specify a generator. Currently `pluck` accepts frequency 30–4000 Hz and duration 0.1–10 seconds. Its triangle oscillator is enveloped in an `OfflineAudioContext` at 22,050 Hz and encoded as 16-bit PCM. Generated WAVs and the catalog are build outputs, not recorded source assets.

Invalid packs are omitted with a warning. Resolved voice parameters and imported/generated sample PCM are copied into projects, so removing a pack does not change saved sound.

## Architecture

- `theory.ts`, `document.ts`: pure music data, scale-degree transformations, progression grammar, document operations and 64-level history.
- `engine.ts`: shared realtime/offline graph, synthesis and sampler voices, ordered floating-point summation, deterministic voice stealing, sends and protected master chain.
- `scheduler.ts`: 960-PPQ timing, swing, seeded humanization, 25 ms lookahead pump with a 200 ms scheduling window.
- `render.ts`: offline audio, WAV and MIDI; `sampler.ts`: local decoding, trim/normalization, autocorrelation root estimate and bounded capture.
- `persistence.ts`, `validation.ts`: IndexedDB transactional revisions, SHA-256 checksums, project-scoped Web Locks and bounded import validation.
- `packs.ts`, `scripts/`: data-driven discovery, validation, build-time sample generation and static build.
- `visual.ts`, `ui/`: optional Three.js mixer/spectrum, two-dimensional editing, English/Spanish interface and comfort settings.

API references: [OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext), [Web Audio specification](https://webaudio.github.io/web-audio-api/), [Three.js documentation](https://threejs.org/docs/).
