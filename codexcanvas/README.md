# Codex Canvas

A local graphical client for Codex. Every Codex thread has a persistent spatial canvas: a conversation alongside the viewed turn’s Plan, Changes, and Activity, plus results you choose to keep.

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

- Each turn creates at most **Plan**, **Changes**, and **Activity**, only as content arrives. Commands, web research, tools, images, and reviews collect as expandable Activity entries.
- **Keep on canvas** gives an individual result its own card. Kept cards stay visible across turns; **Unkeep from canvas** returns individual results to Activity. Summary cards can also be kept. Opening a file from Changes creates a kept File view.
- **Visible turn** browses earlier work. The default follows latest; **Go to latest** returns from history. Your selected turn survives reload, and background work does not pull you away from history or maximized artifact reading.
- **Review approval** indicates Codex is waiting for a decision; **Past failures** indicates recorded errors. Pending requests are also shown beside the composer. These controls and **Stop turn** remain accessible while maximized. **Review later** leaves a request pending.

- **Maximize** on any card opens a full-window reading view with larger, higher-contrast text. The toolbar Maximize button (or **M**) opens the selected card, or the conversation when no card is selected. Double-clicking a header also maximizes it. **Enter** maximizes a keyboard-focused card.
- In reading view, **A− / A+** adjusts text from 16–32 px (20 px by default); your preference is remembered. **Back to canvas** or **Escape** restores the original layout and zoom. Conversation input, streaming, approvals, and artifact links continue working while maximized.
- Drag a card header to move it; drag its lower-right corner to resize. Focused cards and resize handles also support arrow keys.
- Scroll the background to zoom around the pointer. Scroll inside cards to read their content; Ctrl/⌘ + scroll also zooms there.
- Space + drag, middle drag, or dragging the background pans the canvas.
- **0** fits the canvas; **1** focuses the conversation; **F** focuses the selected card; Escape clears selection. Double-click a header to maximize a card.
- Collapse cards with **−**, hide artifacts with **×**, and restore them with the toolbar's **◉** control.
- Turn links connect artifacts with their conversation. Search the loaded session with **⌘/Ctrl K**.
- **Send** starts a Codex turn. While running, **Add to current turn** steers it and **Stop** interrupts it.
- Model and reasoning selectors use Codex's model catalog. GPT-6 Astra is preferred when advertised, with the catalog default as fallback.
- Approval dialogs preserve the pending request and session, including after browser reload. Network approvals show their destination. Permissions, file changes, command approvals, MCP elicitation, and structured questions use Codex's corresponding response formats.

If Git reports that it cannot create a parent repository’s `.git/index.lock`, the selected workspace may not include the Git metadata in its write permissions. Codex must request approval for a scoped retry; this error is not evidence of a stale lock. Canvas keeps approval responses and Stop responsive while other requests are pending. Interrupted commands without a reported result show **outcome unconfirmed**. Missing message acknowledgements become **Delivery not confirmed** after 35 seconds, without automatic resubmission.

## Architecture and persistence

```text
Browser (DOM canvas) ← WebSocket → Bun host ← stdio JSONL → codex app-server
                                      │
                                SQLite geometry
```

The host starts one App Server process and performs `initialize` / `initialized`. It inherits Codex configuration, authentication, sandboxing, web search, and tool behavior. It never writes `~/.codex/config.toml`, runs its own agent loop, calls the Responses API, or reconstructs model context.

Codex owns thread history. The in-memory application state is a projection of Codex events; session restoration reads and resumes the original thread. Paginated Codex histories are hydrated with `thread/turns/list`. SQLite contains only workspace registrations, card identity/geometry, visibility, kept state, selected turn, and viewport settings. Layouts are keyed by thread, turn, and item IDs. File previews are read from the current filesystem, not saved as historical transcripts.

Older layouts are migrated automatically: manually moved/resized cards and explicit File views are kept, with their saved geometry and hidden state intact. Unarranged historical cards are represented through turn summaries.

The default database is `~/.codex-canvas/canvas.db`. Back up this directory to retain layout; Codex history remains in Codex's own storage. Missing Codex threads can have their orphaned local layouts removed from the sidebar.

Configuration through environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3030` | Local HTTP/WebSocket port |
| `CODEX_BIN` | `codex` | Path to the installed Codex CLI executable |
| `CODEX_CANVAS_DATA_DIR` | `~/.codex-canvas` | Canvas SQLite storage directory |

The server binds to `127.0.0.1`. The application protocol is an operation allowlist, with origin/host checks and an ephemeral same-origin browser token. There is no shell endpoint. File previews are restricted to files reported in a turn's diff and inside its workspace. Image previews require a Codex image item and a supported raster file. Markdown is sanitized, code is highlighted, and terminal control sequences are stripped safely.

## Development verification

Running Canvas does not require Playwright or downloaded browser binaries. The host supplies session instructions on both `thread/start` and `thread/resume` telling Codex to skip Playwright/browser E2E checks, browser installation, and Chromium troubleshooting, and continue the requested task using relevant non-browser validation. This applies with both `bun run dev` and `bun run start`; Bun's development server does not opt a user session into browser testing. Configured developer instructions are retained before this Canvas rule. This is agent guidance, not an OS-level executable block.

After updating a running installation, restart Canvas and reopen the session to apply the rule. A turn already waiting on a test can be stopped with **Stop**.

For developers validating this repository outside an interactive Canvas session:

```sh
bun test
bun run typecheck
bun run build
```

Optional browser regression testing, only when explicitly developing Canvas:

```sh
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
