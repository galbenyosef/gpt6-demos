# Codex Canvas

A local graphical client for Codex. Every Codex thread has a persistent spatial canvas: a conversation alongside plans, commands, diffs, files, web research, images, tools, and reviews.

## Run

Requires **Bun 1.4+** and **Codex CLI** on your PATH. The integration is checked against `codex-cli 0.154.0` and its stable generated App Server protocol.

```sh
bun install
bun run dev
```

Open **http://127.0.0.1:3030**. Add a workspace using its absolute folder path, then open an existing Codex session or create one. Existing Codex authentication is reused. If signed out, choose **Sign in with ChatGPT** and follow Codex's login link.

```sh
bun run build
bun run start
```

The production build includes the Bun host and bundled browser assets. No separate frontend server is needed.

## Working on a canvas

- Drag a card header to move it; drag its lower-right corner to resize. Focused cards and resize handles also support arrow keys.
- Scroll the background to zoom around the pointer. Scroll inside cards to read their content; Ctrl/⌘ + scroll also zooms there.
- Space + drag, middle drag, or dragging the background pans the canvas.
- **0** fits the canvas; **1** focuses the conversation; **F** focuses the selected card; Escape clears selection. Double-click a header to focus a card.
- Collapse cards with **−**, hide artifacts with **×**, and restore them with the toolbar's **◉** control.
- Turn links connect artifacts with their conversation. Search the loaded session with **⌘/Ctrl K**.
- **Send** starts a Codex turn. While running, **Add to current turn** steers it and **Stop** interrupts it.
- Model and reasoning selectors use Codex's model catalog. GPT-6 Astra is preferred when advertised, with the catalog default as fallback.
- Approval dialogs preserve the pending request and session, including after browser reload. Network approvals show their destination. Permissions, file changes, command approvals, MCP elicitation, and structured questions use Codex's corresponding response formats.

## Architecture and persistence

```text
Browser (DOM canvas) ← WebSocket → Bun host ← stdio JSONL → codex app-server
                                      │
                                SQLite geometry
```

The host starts one App Server process and performs `initialize` / `initialized`. It inherits Codex configuration, authentication, sandboxing, web search, and tool behavior. It never writes `~/.codex/config.toml`, runs its own agent loop, calls the Responses API, or reconstructs model context.

Codex owns thread history. The in-memory application state is a projection of Codex events; session restoration reads and resumes the original thread. Paginated Codex histories are hydrated with `thread/turns/list`. SQLite contains only workspace registrations, card identity/geometry, visibility, and viewport settings. Layouts are keyed by thread, turn, and item IDs. File previews are read from the current filesystem, not saved as historical transcripts.

The default database is `~/.codex-canvas/canvas.db`. Back up this directory to retain layout; Codex history remains in Codex's own storage. Missing Codex threads can have their orphaned local layouts removed from the sidebar.

Configuration through environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3030` | Local HTTP/WebSocket port |
| `CODEX_BIN` | `codex` | Path to the installed Codex CLI executable |
| `CODEX_CANVAS_DATA_DIR` | `~/.codex-canvas` | Canvas SQLite storage directory |

The server binds to `127.0.0.1`. The application protocol is an operation allowlist, with origin/host checks and an ephemeral same-origin browser token. There is no shell endpoint. File previews are restricted to files reported in a turn's diff and inside its workspace. Image previews require a Codex image item and a supported raster file. Markdown is sanitized, code is highlighted, and terminal control sequences are stripped safely.

## Verification

```sh
bun test
bun run typecheck
bun run build
bunx playwright install chromium
bun run test:e2e
```

Unit tests cover RPC framing, request IDs, server requests, malformed input, timeouts/process exits, restart, session isolation, streaming, approvals, geometry, placement, and SQLite restoration. Browser tests launch a deterministic **test-only** App Server process and exercise streaming, steering, interruption, reload/restart, approvals, search, file previews, and canvas manipulation. They make no model calls and use a temporary data directory. To use an existing Chromium installation, set `CHROMIUM_PATH` to its executable. Set `CANVAS_E2E_PRODUCTION=1` after building to test the production bundle.

A read-only check against your installed Codex is also available:

```sh
bun scripts/smoke-codex.ts
```

It reads account type, model catalog, and thread metadata for the current directory without starting a model turn or printing credentials.

## MVP limits

Diffs support unified and file-list views. Side-by-side diffs, image attachments, external-editor launch, thread forking, archive/delete controls, and remote hosting are deferred. Unknown client-executed tools fail explicitly; normal Codex-managed tools remain with Codex. Restorable artifacts depend on the content Codex retains in thread history: live-only plan/diff notifications are not independently saved as a second transcript. Missing artifact content keeps its layout and displays an unavailable state.

Protocol reference: [Codex App Server](https://learn.chatgpt.com/docs/app-server).
