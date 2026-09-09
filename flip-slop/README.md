# Flip-slop

A local-first canvas and stop-motion studio built with Bun, TypeScript, Canvas 2D, and IndexedDB. Create an image, revise it without losing the original, then generate controlled edits as animation frames.

## Run

For first-time setup, copy [example.env](example.env) to `.env`:

```sh
cp -n example.env .env
```

The `-n` option preserves an existing `.env`. Edit `.env` and replace the
`OPENAI_API_KEY` placeholder with your actual key, then start the app:

```sh
bun install
bun run dev
```

Open **http://127.0.0.1:3000**. The server binds to loopback only.

Bun automatically reads the local `.env`. Keep the actual OpenAI credential **only in `.env`**. That file and all `.env.*` files are ignored by Git; no credentials are bundled into the browser, stored in projects, or logged.

`example.env` contains demonstration values only and can be committed to Git.
Never replace its placeholder with a real key. Leave `OPENAI_PLANNER_MODEL`
empty to use the local motion planner, or set it in `.env` to enable the optional
API planner.

Server configuration:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI credential, in `.env` only |
| `OPENAI_IMAGE_FAST_MODEL` | Model used by Flare; configure `gpt-image-2.5-flare` |
| `OPENAI_IMAGE_PRECISE_MODEL` | Model used by Sunburst; configure `gpt-image-2.5-sunburst` |
| `OPENAI_PLANNER_MODEL` | Optional Responses API model for structured motion planning |
| `MAX_BATCH_SIZE` | Maximum new frames per operation, default 24, capped at 24 |
| `PORT` | Local server port, default 3000 |

Model identifiers are isolated in environment configuration. The application does not silently substitute another model. Without a planner model, a validated incremental motion plan is built locally; start, canonical, previous, and target images still guide image editing. The adapter follows the [OpenAI image editing API](https://developers.openai.com/api/reference/resources/images/methods/edit).

## Studio workflow

- **Create:** describe an idea, import/drop a PNG, JPEG or WebP, draw a sketch, or attach up to three references. Choose canvas dimensions before the first image.
- **Edit:** select a rectangle or lasso, paint a mask, draw, add anchored comments or motion paths, and describe a change. Each successful generation creates a revision. Undo/redo follows revision ancestry; thumbnails expose branches. Eraser removes annotations. “Save drawing revision” commits paint while keeping the source. Crop reframes into the stable project dimensions.
- **Animate:** the active image becomes frame 1. Add or duplicate frames, reorder by dragging or with arrow buttons, mark keyframes, and set individual holds. Draw a motion path, enter a direction and choose how many **new frames** to generate. Requests run sequentially and save each completed result.
- **Correct:** Repair uses Precise with the current pose, previous frame, canonical reference and scene notes. Dependent frames become stale. Regenerate forward replaces following non-keyframes, stopping at the next keyframe; all old revisions remain available.
- **Generate Between:** select a keyframe with a later keyframe. Existing intermediate slots are regenerated; if the keyframes are adjacent, the selected number of new slots is inserted. Endpoint images are retained.
- **Review:** set FPS, frame holds, loop/once/ping-pong playback, and previous/next onion skin opacity. Playback is local and generates no API requests.
- **Save:** autosave uses IndexedDB metadata and separate image Blobs. Projects opens earlier local projects. Export/import `.Flip-slop` archives to move or back up the full editable project.
- **Export:** original image, flattened PNG/JPEG/WebP, PNG sequence ZIP, GIF, WebM and contact sheet. Frame exports use project resolution. GIF encoding runs in a worker. WebM requires browser MediaRecorder support.

The server must remain running to serve the app. Existing projects and local tools work when the OpenAI API is unavailable. Browser storage is tied to the browser profile and origin, so export projects before clearing browser data or changing the port. Canvas re-encoding may strip embedded metadata; untouched original binaries and generation records are retained in project archives.

Keyboard: V select, L lasso, B brush, M mask, E eraser, S sketch, A motion arrow, C comment, X crop, H hand, Z zoom. Hold Space to pan; Space in the timeline plays/pauses. `+`/`−` zoom, arrows step frames, Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo.

## Build and verify

```sh
bun test
bun run typecheck
bun run build
bun run start
```

The production build writes browser assets to `dist`; the small Bun server serves them alongside the API. No frontend framework or Node.js server is used. Bun's browser environment injection is disabled in both `bunfig.toml` and build configuration.

Browser regression tests use mocked image responses and cover create, edit, mask composition, branches, motion, repair, stale descendants, keyframes, frame operations, playback, exports, archive round-trip, reload and responsive layout:

```sh
bunx playwright install chromium
bun run dev
bun run test:browser
```

Set `CHROMIUM_PATH` to use an existing Chromium executable. Normal automated tests make no paid API calls.

Explicit real API checks, using `.env` on the server:

```sh
bun run test:live
bun scripts/live-browser.ts
```

The first makes one Fast generation and one Fast edit. The second requires the app running and makes four image requests: Fast creation, Precise edit, then two sequential Fast frames. These consume API usage. They save image/project/export artifacts under ignored `test-results/`; they do not save credentials or provider request logs.

## Structure

- `server/` — request validation, bounded retry, normalized errors, OpenAI adapter and optional planner.
- `src/project.ts` — shared asset → revision → frame model, branches, migration and stale dependency traversal.
- `src/canvas.ts`, `src/geometry.ts` — one visible canvas, normalized annotations, camera and compositing.
- `src/generation.ts` — serial cancellable queue and reference-aware request composition.
- `src/storage.ts` — IndexedDB persistence and bounded decoded bitmap cache.
- `src/export.ts`, `src/gif.worker.ts` — portable archives and source-resolution exports.
- `src/app.ts` — studio controls, timeline and workflow coordination.

Automatic drift scoring, advanced camera planning, collaboration, and the other post-MVP features in the spec are not implemented. Local region edits are model guidance rather than guaranteed pixel-exact boundaries.
