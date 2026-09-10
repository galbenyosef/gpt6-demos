# Codex Canvas

## A Local Graphical Client for Codex

## 1. Product Definition

**Codex Canvas** is a local graphical client for Codex.

It is not a new coding agent, an alternative harness, an IDE, or a wrapper around the OpenAI Responses API. It uses **Codex App Server** as the underlying runtime and exposes Codex capabilities through a visual, spatial interface.

OpenAI explicitly describes `codex app-server` as the interface Codex uses to power rich clients such as the VS Code extension. It already provides authentication, conversation history, approvals and streamed agent events.

The application introduces one significant user-interface idea:

> **Every Codex session is represented as a persistent canvas.**

The conversation is part of that canvas, but it is not the whole canvas.

As Codex works, relevant artifacts produced during the session — plans, commands, terminal output, file changes, diffs, web searches, images and other tool activity — become graphical objects associated with the conversation.

The user can spatially arrange these objects and return to the same session later. Codex restores the conversational context; Codex Canvas restores the graphical state.

The resulting relationship is:

```text
Codex Thread
     │
     │ owns conversation and agent context
     │
     ▼
Canvas Session
     │
     ├── Conversation
     ├── Plans
     ├── Commands
     ├── Diffs
     ├── Files
     ├── Web searches
     ├── Images
     └── Other Codex artifacts
```

The product should feel like **Codex made spatial**.

---

# 2. Fundamental Scope Boundary

The most important architectural decision is what Codex Canvas does **not** implement.

Codex remains responsible for:

```text
model interaction
reasoning
agent loop
conversation history
session context
context compaction
tool invocation
shell execution
filesystem modification
web search
MCP
skills
permissions
sandboxing
approval requests
authentication
model availability
reasoning effort
turn lifecycle
```

Codex Canvas is responsible for:

```text
graphical presentation
workspace selection
session navigation
canvas layout
canvas persistence
rendering Codex events
rendering artifacts
user interaction with approvals
session switching
pan / zoom / positioning
local graphical metadata
```

There must be no second agent loop.

There must be no custom conversational-memory system.

There must be no client-side reconstruction of Codex context.

There must be no parallel implementation of shell tools or web search.

There must be no separate OpenAI Responses API integration for normal operation.

The product is a **Codex client**.

---

# 3. The Canvas Principle

The conversation is one persistent object on a spatial working surface. The default canvas shows the selected turn's work, plus artifacts the user explicitly keeps.

```text
Turn navigation: Turn 14       Following latest turn

Conversation       Plan          Activity
                                 ▸ Command: bun test
                   Changes       ▸ Web search
                                 ▸ Tool result
```

The canvas is a working view of the session. Its visible card count must not grow automatically with every command or every completed turn. Historical work remains accessible through turn navigation and session search.

Users may move, resize, collapse, maximize, or keep artifacts. Saved geometry remains attached to each artifact when it is shown again.

---

# 4. Canvas Is Not HTML `<canvas>`

The application should **not** implement the complete interface using the HTML Canvas graphics element.

Most content is textual and interactive:

```text
Markdown
code
diffs
terminal output
buttons
links
forms
approval controls
```

These are better represented by normal DOM elements.

Implement the canvas as a spatial DOM world:

```html
<div class="viewport">
  <div class="world">
    <!-- positioned cards -->
  </div>
</div>
```

The world receives a transform such as:

```css
transform:
  translate(var(--pan-x), var(--pan-y))
  scale(var(--zoom));
```

Each artifact is an absolutely positioned DOM card inside the world.

This provides:

```text
native text selection
accessible controls
Markdown rendering
syntax highlighting
scrollable content
normal links
good browser layout
```

while retaining infinite-canvas behaviour.

---

# 5. Technical Baseline

Use:

```text
Bun
TypeScript
HTML
CSS
DOM APIs
WebSocket
SQLite
Codex CLI / App Server
```

Avoid React, Angular and Vue for the initial implementation.

The application is sufficiently focused that framework complexity is unnecessary.

Recommended commands:

```bash
bun install
bun run dev
bun test
bun run build
```

The application runs locally:

```text
http://127.0.0.1:3030
```

It should bind to loopback only by default.

---

# 6. Runtime Architecture

Use three processes/layers.

```text
┌────────────────────────────────────────────────────────────┐
│                       Browser                              │
│                                                            │
│  Canvas UI                                                 │
│  Workspace selector                                       │
│  Session selector                                         │
│  Chat                                                     │
│  Artifact cards                                           │
│  Approval UI                                              │
│                                                            │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       │ local WebSocket
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│                      Bun Host                              │
│                                                            │
│  HTTP server                                               │
│  static files                                              │
│  WebSocket bridge                                         │
│  workspace registry                                       │
│  Canvas SQLite store                                      │
│  Codex process manager                                    │
│                                                            │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       │ stdin / stdout JSONL
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│                  codex app-server                         │
│                                                            │
│  threads                                                   │
│  turns                                                     │
│  models                                                    │
│  context                                                   │
│  authentication                                           │
│  tools                                                     │
│  sandbox                                                   │
│  approvals                                                 │
│  web search                                                │
│  file changes                                              │
│                                                            │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
                OpenAI / ChatGPT
```

---

# 7. App Server Transport

The Bun host should spawn:

```bash
codex app-server
```

using normal process pipes.

OpenAI documents stdio as App Server's default transport, using newline-delimited JSON. WebSocket transport exists, but is explicitly described as experimental and unsupported.

Therefore use:

```text
Browser
   ↓ WebSocket
Bun
   ↓ stdio JSONL
Codex App Server
```

Do not connect the browser directly to an experimental App Server WebSocket endpoint.

The Browser-to-Bun WebSocket is our own simple local application protocol.

---

# 8. Codex Process Lifecycle

Start one App Server process when Codex Canvas starts.

Do not create one process for every session.

Conceptually:

```ts
const process = Bun.spawn(
  ["codex", "app-server"],
  {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit"
  }
);
```

The host maintains one JSON-RPC connection.

Immediately perform the required App Server handshake:

```text
initialize
initialized
```

App Server requires initialization before other requests are accepted.

Example conceptual initialization:

```json
{
  "method": "initialize",
  "id": 1,
  "params": {
    "clientInfo": {
      "name": "codex_canvas",
      "title": "Codex Canvas",
      "version": "0.1.0"
    }
  }
}
```

Stay on the stable App Server API surface initially.

Do not set:

```text
experimentalApi = true
```

unless a specific required feature cannot be implemented otherwise.

---

# 9. Core Domain Concepts

Codex Canvas has four principal concepts:

```text
Workspace
Session
Turn
Canvas Object
```

Their relationships are:

```text
Workspace
   │
   ├── Session A
   │      │
   │      ├── Turn 1
   │      ├── Turn 2
   │      └── Turn 3
   │
   └── Session B
          │
          ├── Turn 1
          └── Turn 2
```

Each session has:

```text
one Codex thread
+
one Canvas layout
```

---

# 10. Workspace

A workspace is simply a local filesystem root.

Example:

```ts
interface Workspace {
  id: string;
  name: string;
  path: string;
}
```

Example configuration:

```json
{
  "workspaces": [
    {
      "id": "gpt6-demos",
      "name": "GPT-6 Demos",
      "path": "/Users/iwan/projects/gpt6-demos"
    },
    {
      "id": "flip",
      "name": "Flip",
      "path": "/Users/iwan/projects/flip"
    }
  ]
}
```

The path becomes the Codex working directory.

App Server exposes `cwd` when starting a thread and can filter persisted threads using `cwd`, making this a natural mapping rather than an invented abstraction.

---

# 11. Adding Workspaces

Because a normal browser cannot reliably provide a native absolute filesystem path through `showDirectoryPicker()`, do not attempt to base Codex workspaces on browser directory handles.

For the MVP use:

```text
Add Workspace
Name: __________
Path: /Users/...________________
```

The Bun host validates:

```text
path exists
path is directory
path is readable
```

Recent workspaces are stored locally.

A native desktop shell could provide a filesystem picker later, but that is outside the initial scope.

---

# 12. Sessions

A user-visible **Session** maps directly to a Codex **Thread**.

This is critical.

Do not create a separate conversation database.

OpenAI defines a thread as a conversation between a user and the Codex agent. Threads contain turns and can be started, read, resumed, listed, forked, archived and deleted.

Therefore:

```ts
interface Session {
  threadId: string;
  workspaceId: string;
}
```

is sufficient for the Codex side of the session.

---

# 13. Session Memory

The requested **memory per session** should be provided by Codex itself.

Codex persists its thread history and allows stored sessions to be resumed using:

```text
thread/resume
```

A stored thread can also be read with its turns via:

```text
thread/read
includeTurns = true
```

Codex exposes context compaction as part of the thread lifecycle as well.

Therefore Codex Canvas must **not** create:

```text
vector memory
summary memory
conversation embeddings
custom context reconstruction
hidden session prompts
```

merely to support continued sessions.

Session context is Codex's responsibility.

---

# 14. Two Forms of Session Persistence

There are intentionally two persistence domains.

### Codex persistence

Codex owns:

```text
messages
turns
tool activity
model-visible history
context compaction
agent state
```

### Canvas persistence

Codex Canvas owns:

```text
card positions
card dimensions
collapsed state
canvas viewport
selected cards
canvas labels
visual grouping
```

The two systems are joined by:

```text
threadId
```

and where possible:

```text
turnId
itemId
```

This boundary must remain strict.

---

# 15. Session Restoration

When the application starts:

```text
1. choose workspace

2. thread/list(cwd = workspace.path)

3. show available Codex threads

4. user selects session

5. thread/read(includeTurns = true)

6. thread/resume(threadId)

7. load Canvas layout from local SQLite

8. reconcile Canvas objects against Codex items

9. render session
```

`thread/list` can filter directly by `cwd`, and `thread/read` can return stored turn history.

The conversation itself must therefore be reconstructed from Codex data, not from a duplicate local transcript.

---

# 16. New Session

Creating a session invokes:

```text
thread/start
```

with at minimum:

```text
cwd
model
```

For example:

```json
{
  "method": "thread/start",
  "id": 21,
  "params": {
    "cwd": "/Users/iwan/projects/gpt6-demos",
    "model": "gpt-6-astra"
  }
}
```

App Server supports `cwd`, model, sandbox and approval configuration directly at thread creation.

After creation:

```text
threadId
```

becomes the persistent Canvas session identifier.

---

# 17. Models

Do not hard-code the available model list.

At startup call:

```text
model/list
```

App Server explicitly recommends using this method to discover models and their supported reasoning efforts before presenting model selectors.

Codex Canvas should prefer:

```text
gpt-6-astra
```

when App Server reports that it is available.

GPT-6 Astra is currently OpenAI's flagship model for complex reasoning and coding.

If Astra is unavailable for the authenticated account, use the App Server model marked:

```text
isDefault = true
```

Do not fail merely because Astra is not present.

---

# 18. Model Selector

Provide a compact session control:

```text
GPT-6 Astra
Reasoning: High
```

Both values come from `model/list`.

Do not invent unsupported reasoning levels.

A model change should use the normal Codex turn/session configuration rather than creating a new independent model connection.

---

# 19. Primary UI Layout

Initial screen:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ CODEX CANVAS        GPT-6 Astra · High          Workspace: Flip       │
├──────────────┬──────────────────────────────────────────────────────────┤
│              │                                                          │
│ WORKSPACES   │                                                          │
│              │                                                          │
│ ● Flip       │                    CANVAS                                │
│ ○ Loom       │                                                          │
│ ○ Demos      │                                                          │
│              │                                                          │
│ SESSIONS     │                                                          │
│              │                                                          │
│ ● Animation  │                                                          │
│   bug        │                                                          │
│              │                                                          │
│   Refactor   │                                                          │
│              │                                                          │
│ + Session    │                                                          │
│              │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

The left sidebar is navigation.

Everything to its right is the active Session Canvas.

---

# 20. Session Canvas Initial State

A new session begins with one object:

```text
Conversation
```

Example:

```text
                     ┌──────────────────────────────────────┐
                     │ CONVERSATION                         │
                     │                                      │
                     │ What do you want Codex to do?        │
                     │                                      │
                     │                                      │
                     │                                      │
                     ├──────────────────────────────────────┤
                     │ Ask Codex...                    Send │
                     └──────────────────────────────────────┘
```

The conversation card should initially be approximately:

```text
700–800 px wide
700 px high
```

and placed around:

```text
x = 100
y = 100
```

in world coordinates.

---

# 21. Conversation Is a Canvas Object

Every card, including Conversation and Activity, supports **Maximize**. Open a full-window reading dialog outside the scaled canvas with adjustable 16–32 px text (20 px default), keyboard focus handling, and remembered text-size preference. Escape or **Back to canvas** restores the same geometry, collapse state, camera, draft, and live content. Provide an explicit Maximize button plus keyboard access. Reading must not require zooming the entire canvas. Pending attention remains accessible from the reader toolbar.

The Conversation card must use the same spatial system as other Canvas objects.

It can:

```text
move
resize
collapse
focus
dock
```

The user may reposition it.

Provide:

```text
Dock left
```

as a convenience, but docking is a view state — not a different application mode.

This matters because the conceptual model remains:

> Chat is an object on the Canvas.

---

# 22. Conversation Rendering

Each turn has at most one reference to each of its Plan, Changes, and Activity summaries. The Activity reference displays its action count and updates in place.

The Conversation card groups events by turn.

Example:

```text
YOU

Find why the animation export is corrupt.


CODEX

I'll inspect the export path and reproduce the failure.

  ▸ Plan

  ▸ Activity · 2 actions

  ▸ Changes

I found two problems...
```

Do not dump every JSON-RPC event directly into the conversation.

Render Codex activity semantically.

---

# 23. Turns

A user message initiates:

```text
turn/start
```

using the active `threadId`.

App Server defines a turn as one user request and the Codex work that follows.

Example:

```json
{
  "method": "turn/start",
  "id": 92,
  "params": {
    "threadId": "thr_123",
    "input": [
      {
        "type": "text",
        "text": "Find and fix the rendering problem."
      }
    ]
  }
}
```

The Conversation card creates a local provisional user message immediately. Display Sending only until the host acknowledges it or Codex publishes the authoritative user item. An acknowledgement changes the provisional label to Sent. If acknowledgement is missing for 35 seconds, or the connection fails, show Delivery not confirmed and release the composer. Never automatically resend an uncertain message; the user must check the conversation before retrying.

It is reconciled with the authoritative Codex turn when App Server responds.

---

# 24. Streaming Responses

App Server emits:

```text
item/agentMessage/delta
```

for incremental agent text and `item/completed` for authoritative final item state.

Render text continuously.

Do not wait for the complete response.

The interface should visibly feel as responsive as Codex CLI.

---

# 25. Stop

While a turn is active:

```text
Send
```

becomes:

```text
Stop
```

Clicking it calls:

```text
turn/interrupt
```

App Server explicitly supports interruption and terminates the turn with status `interrupted`.

The partial session state remains visible.

---

# 26. Mid-Turn Steering

A useful Codex capability is:

```text
turn/steer
```

which allows additional instructions to be appended while the current turn is still running.

Support this with a simple behaviour:

While Codex works, the input remains enabled.

Submitting another message asks:

```text
Add to current turn
```

rather than necessarily starting another turn.

Example:

```text
Actually, don't change the API. Fix it in the client.
```

This is a Codex capability, not custom agent behaviour.

---

# 27. Canvas Artifact Model

Each graphical object has stable identity and presentation metadata:

```ts
interface CanvasObject {
  id: string;
  threadId: string;
  turnId?: string;
  itemId?: string;
  type: CanvasObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  hidden: boolean;
  pinned: boolean; // “Keep on canvas” in the UI
  manuallyPositioned: boolean;
  zIndex: number;
}

type CanvasObjectType =
  | "conversation" | "plan" | "diff" | "activity"
  | "command" | "file" | "web-search" | "image" | "tool" | "review";
```

The user-facing name for `diff` is **Changes**. Summary objects use a stable thread/turn/type identity. An individually kept artifact uses its original thread/turn/item identity. These are presentation objects, not new agent capabilities.

---

# 28. Artifact Creation and Visibility

Every session starts with exactly one Conversation card. Each turn may create at most three automatic summary cards, only when corresponding content arrives:

| Codex output | Presentation |
| --- | --- |
| Plan or plan revision | Create or update the turn's Plan card |
| File change or aggregate turn diff | Create or update the turn's Changes card |
| Command start, output, or completion | Entry in the turn's Activity card |
| Web search, page open, or find | Entry in Activity |
| Tool call, image, or review | Entry in Activity |
| User/assistant messages and progress | Conversation |
| Approval or failure | Needs attention indicator; no automatic modal or camera movement |

Activity entries show a readable label and status. Details expand on demand. Command output streams inside its entry; completion updates the same entry. The Activity header shows the total number of actions and its body summarizes categories. There is no output-length or inferred-importance threshold for creating an individual card.

**Keep on canvas** explicitly creates a separate view of an Activity item. It does not remove that item from Activity. Plan, Changes, and Activity can also be kept using their headers. Opening a file from Changes is another explicit action and creates a kept File view. Repeated keeping reuses the same identity. **Unkeep from canvas** removes persistence across turns; an individual view disappears, while a summary remains visible if it belongs to the selected turn. Neither operation deletes Codex content or saved geometry.

Default visibility is exactly: Conversation + non-hidden summaries for the viewed turn + non-hidden kept objects. Historical unkept objects are excluded from the visible canvas, minimap, connectors, and Fit bounds.

A readable turn selector outside the scaled canvas provides access to earlier turns. By default it follows the latest turn. Selecting a turn, following a historical artifact link, or choosing a search result fixes the viewed turn until **Go to latest** is selected or the user explicitly starts a new turn. Background events must not switch a history view or pan the camera. If a new turn arrives while an artifact is maximized, retain the turn being read. Conversation reading may continue following latest.

The selector identifies the viewed turn, the UI distinguishes following latest from browsing history, and a visible latest-turn action supports return. Conversation retains the full chronological thread, with one reference per Plan, Changes, or Activity summary per turn.

---

# 29. Turn Grouping and Placement

Reuse predictable positions relative to Conversation: Plan beside it, Changes below Plan, and Activity in the next column. New turns reuse these positions instead of extending the canvas indefinitely.

Only visible kept objects and the new turn's summaries obstruct initial placement. Historical and hidden cards reserve no space. Collapsed cards reserve only their header height. Placement must avoid these visible obstacles without moving existing objects.

Manual positions and dimensions remain intact when switching turns or restoring sessions. Moving or resizing a new card does not implicitly keep it; **Keep on canvas** is the explicit visibility choice. Legacy arranged cards are preserved by the migration in section 45.

---

# 30. Provenance Connectors

Use subtle visual lines from Conversation to visible summary and kept cards. Each artifact retains its original turn link, including when kept across turns. Hidden and historical unkept cards have no connectors.

Selecting an artifact reference reveals its turn and focuses its summary or kept view. Selecting an Activity search result also expands the matching entry. In maximized reading, these links open the relevant card in the same reading view. These relationships show provenance, not arbitrary diagram connections.

---

# 31. Plan Card

App Server emits plan updates through:

```text
turn/plan/updated
```

with plan steps and states such as:

```text
pending
inProgress
completed
```

Render:

```text
┌────────────────────────────────┐
│ PLAN                    Turn 12 │
├────────────────────────────────┤
│ ✓ Inspect export pipeline      │
│ ✓ Reproduce failure            │
│ ◉ Fix timestamp logic          │
│ ○ Run complete tests           │
└────────────────────────────────┘
```

Update this card in place while the turn runs.

Do not create a new Plan card for every plan revision.

---

# 32. Command Entries and Kept Cards

Commands appear as expandable Activity entries by default. Show the command, working directory, authoritative status, output, exit code, and duration when available. Long terminal output is scrollable.

Expanding an entry does not create a floating card. **Keep on canvas** creates a standalone Command view using the same renderer and original item identity. Its output remains live. A nonzero exit code is a failure even if the item lifecycle is completed.

---

# 33. Command Output Streaming

Use `item/commandExecution/outputDelta` to append output to the in-memory Codex projection. Update the affected expanded Activity entry and any kept Command view. Collapsed entries defer rendering their output until opened.

Preserve entry expansion and the reader's scroll position during deltas; follow output only when already near its end. On `item/completed`, replace accumulated state with the authoritative item. Do not create another entry or card on completion.

---

# 34. Changes Card

App Server sends the current aggregated unified diff through:

```text
turn/diff/updated
```

and file changes through `fileChange` items.

Maintain one Changes card per turn. File changes and aggregate diff updates share that identity; explicit file previews are separate kept views.

Example:

```diff
src/export/video.ts

- const timestamp = index / fps;
+ const timestamp = (index * 1000) / fps;
```

Provide:

```text
Unified
Files
```

view modes.

The card is read-only.

Codex itself owns the actual modifications.

---

# 35. File Changes

A `fileChange` item includes:

```text
path
kind
diff
```

Render changed files inside the Diff card:

```text
3 files changed

src/export/video.ts       +14 -3
src/export/clock.ts       +7  -2
tests/export.test.ts      +22 -0
```

Clicking a file focuses its diff.

Do not implement a full source editor.

---

# 36. File Card

A File card is a **view**, not an editor.

It can be created when:

```text
Codex explicitly views a file
the user opens a file from a diff
the user chooses "Open on Canvas"
```

Render:

```text
path
syntax-highlighted contents
line numbers
```

Provide:

```text
Open in configured editor
Copy path
```

but no complex editing.

Editing belongs to Codex or the user's normal IDE.

---

# 37. Web Search Activity

App Server `webSearch` items describe search, page opening, and finding content. Render each as an expandable entry in the turn's Activity card, including its query, action, and safe source link when available.

**Keep on canvas** creates a standalone Web Search view only on explicit request. This is a view of Codex's own web activity; do not implement an independent search engine.

---

# 38. Internet Access

There are two relevant mechanisms.

Codex has configurable web search, with modes including live search. Codex configuration also separately controls outbound network access for commands executed in the workspace-write sandbox.

Codex Canvas should expose the distinction clearly:

```text
Internet

Web search          Enabled
Shell network       Enabled
```

Do not represent these as a single ambiguous “Internet” permission internally.

---

# 39. Preserve Codex Configuration

By default, Codex Canvas should inherit the user's existing Codex configuration.

Canvas adds a narrow session behavior rule through App Server's `developerInstructions` on both `thread/start` and `thread/resume`: do not execute Playwright via CLI, APIs, package scripts, or MCP; do not run browser/E2E suites, install browser binaries, search for Chromium, or repair browser-test dependencies. Earlier development context and repository testing guidance must not make an interactive task wait for these checks. Continue the task using relevant source inspection, type checking, or non-browser tests, and accurately report browser checks as not run.

Append this rule to configured developer instructions without modifying the user's base instructions, global configuration, sandbox, or approval policy. Apply it again after an App Server restart and when reopening historical threads. Do not inject it as a fabricated user message or replay conversation content. This is agent guidance rather than an operating-system executable denylist.

The rule applies to interactive sessions regardless of whether Bun serves the app in development or production mode. Playwright remains an explicit repository development test dependency; startup, session creation, and session restoration must not run it or require installed browser binaries. Restarting Canvas and reopening the session applies updated guidance; an already active turn can be stopped through the existing Stop control.

App Server supports configuration overrides for new and resumed threads; the installed CLI's generated `ThreadStartParams` and `ThreadResumeParams` provide `developerInstructions`. See [official App Server documentation](https://learn.chatgpt.com/docs/app-server#start-or-resume-a-thread).


Do not silently rewrite:

```text
~/.codex/config.toml
```

Canvas may show the effective state.

If the user explicitly changes a session permission, pass the appropriate override to `thread/start` or `turn/start`.

For example App Server accepts workspace-write sandbox configuration with explicit network access.

---

# 40. Approval and Attention UI

App Server can request command, file-change, network, permissions, and MCP approvals or structured user input. Keep all decisions authoritative to the original App Server request.

An attention button outside the scaled canvas distinguishes **Review approval** for pending requests from **Past failures** for recorded command failures in the latest or viewed turn. It is also available in maximized reading. A failure is an explicitly failed item/turn or a command with a nonzero exit code; do not treat ordinary success as failure.

Incoming requests or failures must not automatically open a modal, maximize a card, switch the viewed turn, or pan the camera. Selecting the indicator opens a list. A pending request also displays “Codex is waiting for your approval” beside the composer with a Review approval action. Stop remains accessible outside the canvas and in maximized reading. Selecting a request opens its approval dialog with command/action details, working directory, reason, requested network destination, and the decisions App Server supports. Selecting a failure reveals its originating turn and matching Activity entry or artifact.

For command and file-change approvals, preserve the supported `accept`, `acceptForSession`, `decline`, and `cancel` decisions. **Review later** or Escape closes the dialog without answering or dropping the request. Pending requests survive browser reconnection while the host request is outstanding. After a response or server resolution, remove the indicator entry. This does not authorize automatic approval.

---

# 41. Network Approval

When the request contains a `networkApprovalContext`, render a network-specific question.

Example:

```text
Codex wants network access to:

registry.npmjs.org
HTTPS : 443

[Decline] [Allow]
```

Do not show a meaningless shell command if the underlying approval is specifically for a network destination.

OpenAI explicitly recommends distinguishing this case.

---

# 42. Authentication

Use Codex authentication.

Do not implement another OpenAI account system.

At startup call:

```text
account/read
```

App Server supports ChatGPT-managed authentication where Codex owns the OAuth flow, persists tokens and refreshes them.

If already authenticated:

```text
Codex Canvas opens normally.
```

If authentication is required:

```text
┌────────────────────────────────┐
│ Codex authentication required  │
│                                │
│ [Sign in with ChatGPT]         │
└────────────────────────────────┘
```

Use:

```text
account/login/start
```

for the Codex-managed login.

---

# 43. No API Key in Browser

Under normal ChatGPT-authenticated use:

```text
browser
```

must never contain or request:

```text
OPENAI_API_KEY
```

Authentication remains between Codex App Server and OpenAI.

This is another reason not to bypass App Server.

---

# 44. Local Canvas Persistence

Use SQLite through Bun for graphical state.

Suggested path:

```text
~/.codex-canvas/canvas.db
```

Use Bun's SQLite support.

Suggested tables:

```sql
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_opened_at INTEGER
);

CREATE TABLE canvases (
    thread_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    pan_x REAL NOT NULL DEFAULT 0,
    pan_y REAL NOT NULL DEFAULT 0,
    zoom REAL NOT NULL DEFAULT 1,
    viewport_initialized INTEGER NOT NULL DEFAULT 0,
    selected_turn_id TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE canvas_objects (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,

    turn_id TEXT,
    item_id TEXT,

    type TEXT NOT NULL,

    x REAL NOT NULL,
    y REAL NOT NULL,

    width REAL NOT NULL,
    height REAL NOT NULL,

    collapsed INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    z_index INTEGER NOT NULL DEFAULT 0,

    manually_positioned INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

Do not store complete Codex conversations in these tables.

---

# 45. Canvas Object Reconciliation and Migration

Codex provides content; SQLite provides presentation metadata. Reconcile Plan, Changes, and Activity by stable thread/turn/type identity. Revisions and item lifecycle updates reuse the same objects. Reconcile explicitly kept individual views by their original thread/turn/item identities.

Schema version 3 adds `canvas_objects.pinned` and `canvases.selected_turn_id`. A null selected turn means follow latest; a stored turn ID restores history browsing.

When migrating older layouts, keep legacy non-conversation cards that were manually positioned, resized from their original default dimensions, or explicitly opened File views. Preserve their coordinates, sizes, collapse, and hidden state. Unarranged legacy individual cards remain metadata but are excluded from default visibility; their content remains available through Activity. Unarranged Plan/Changes summaries may move into the compact reusable slots during this migration only.

Do not delete legacy object records, Codex history, or duplicate transcripts into SQLite. If Codex no longer retains content for a saved object, retain its metadata and show an unavailable state.

---

# 46. Missing Canvas State

When opening a Codex thread without local canvas metadata, create Conversation and reconcile summaries from its available history. Select latest by default. Show only that turn's summaries, with prior turns available in the selector and search.

Do not create a standalone floating card for each historical command, search, tool, image, or review. This rule also applies to sessions originally created by another Codex client.

---

# 47. Missing Codex Thread

If Canvas metadata references a thread that Codex no longer has:

```text
mark Canvas metadata orphaned
```

Do not fabricate the missing conversation.

Provide:

```text
Remove local Canvas metadata
```

The Codex thread remains the authoritative source for session existence.

---

# 48. Canvas Navigation

Required controls:

```text
pan
zoom
zoom to fit
zoom to selection
reset view
```

Mouse behaviour:

```text
wheel            zoom
space + drag     pan
middle drag      pan
drag card header move card
```

Keyboard:

```text
0       fit Canvas
1       focus Conversation
Escape  clear selection
```

---

# 49. Zoom Levels

Suggested:

```text
25%
33%
50%
67%
80%
100%
125%
150%
200%
```

At very low zoom levels, cards should render simplified headers rather than every line of content.

Example:

```text
100%

┌─────────────────────────┐
│ COMMAND                 │
│ bun test                │
│ 47 passed, 1 failed     │
└─────────────────────────┘
```

At 25%:

```text
┌──────────────┐
│ ✓ bun test   │
└──────────────┘
```

This keeps large sessions navigable.

---

# 50. Canvas Minimap

A small minimap is useful once sessions become spatially large.

Example:

```text
┌─────────────────┐
│ ▓               │
│       ▪ ▪       │
│       ▪         │
│            ▪    │
└─────────────────┘
```

It should show:

```text
Conversation
artifact groups
current viewport
```

No textual details.

This is a Canvas navigation feature rather than a new Codex capability.

---

# 51. Focus

Clicking a card selects it.

Double-clicking focuses it.

Focus means:

```text
pan/zoom until the object occupies a useful portion of the viewport
```

Provide browser-like navigation:

```text
Back
Forward
```

through previously focused Canvas objects.

---

# 52. Artifact Collapse

All artifact cards support:

```text
expanded
collapsed
```

Collapsed example:

```text
┌────────────────────────────┐
│ ✓ COMMAND  bun test   1.4s │
└────────────────────────────┘
```

The state persists.

---

# 53. Hide, Restore, and Keep

**Hide from canvas** records `hidden = true` without deleting the object or Codex item. It is separate from keeping: a kept card may be hidden and later restored.

**Restore hidden artifacts** restores hidden summaries for the viewed turn and hidden kept cards. It must not reveal every unkept historical object. An explicit conversation/search link may reveal its targeted hidden object.

Keeping controls visibility across turns; hiding controls whether an otherwise eligible card is shown. Collapsing reduces a visible card to its header. All three states persist independently. Activity entry expansion is ephemeral.

---

# 54. Conversation Cannot Be Deleted

Every Session Canvas has exactly one Conversation object.

It may be:

```text
collapsed
docked
moved
resized
```

but not deleted.

It is the primary projection of the Codex thread.

---

# 55. Linking Conversation and Artifacts

Each turn should have a subtle marker:

```text
Turn 12
```

Hovering it highlights artifacts originating from that turn.

Likewise hovering a Diff card highlights the associated turn.

This provides a bidirectional relationship between chronological history and spatial artifacts.

---

# 56. Canvas Object Headers

Standardize card headers.

Example:

```text
┌────────────────────────────────────┐
│ DIFF        Turn 12         ✓  ⋯  │
├────────────────────────────────────┤
```

Header fields:

```text
object type
turn number
status
menu
```

Status:

```text
running
completed
failed
declined
interrupted
```

---

# 57. Status Semantics

A command's last item status must be interpreted alongside its turn lifecycle. If a completed, failed, or interrupted turn still contains an in-progress command without an authoritative outcome, display “Turn interrupted/failed/completed · outcome unconfirmed” rather than Running. Keep the original Codex item intact; do not infer that the command succeeded, failed, or was killed. A later authoritative item result replaces the unconfirmed display.

A Git `index.lock` error with “Operation not permitted” or “Permission denied” must explain that repository metadata can be outside the selected workspace, particularly for a project within a parent Git repository. It does not establish a stale lock. Do not remove lock files or broaden permissions automatically. Retry through Codex's ordinary approval flow when supported; if permission cannot be requested, explain the blocker.

Never derive success from visual assumptions.

Use App Server item and turn status.

App Server emits authoritative `item/completed` events and turn statuses including:

```text
completed
interrupted
failed
```

Temporary streaming state is provisional.

Completed events replace it.

---

# 58. Tool Activity

Render Codex MCP and other tool calls as expandable Activity entries, including available name, status, arguments, result, and error details. Explicit keeping creates a generic Tool card. Do not create automatic per-tool cards or plugin-specific custom UIs for the MVP.

---

# 59. Image Activity

Codex image inspection and generation items appear in Activity. Expanding an entry shows its supported image preview and path, with an unavailable state if the file cannot be loaded safely. **Keep on canvas** creates an Image card. Activity and kept Image cards can be maximized for reading.

---

# 60. Reviews

Review items appear as expandable Activity entries. Render the available Codex review text and status without inventing severity counts. Explicit keeping creates a Review view. This remains an ordinary representation of Codex output.

---

# 61. Search Inside Session

Provide local UI search across currently loaded Codex session content.

This is not model search.

Search:

```text
conversation text
command strings
command output
file paths
diff text
web search query text
```

Selecting a result reveals its original turn, focuses its summary or kept card, and expands the matching Activity entry. Conversation matches navigate to their original turn. Preserve maximized reading when following results.

Do not create embeddings for this.

Simple indexed text search is enough.

---

# 62. Referencing a Canvas Artifact in Chat

The Canvas must not silently inject selected objects into Codex context.

That would create hidden client-side context semantics.

Instead offer explicit actions such as:

```text
Copy path
Quote selection
Insert reference
```

Example:

Click:

```text
Insert reference
```

on:

```text
src/export/video.ts
```

and the chat input receives:

```text
Look at `src/export/video.ts`:
```

Codex then accesses the workspace normally.

This keeps context explicit.

---

# 63. Session Naming

Prefer names provided by Codex thread metadata if available.

If absent, use:

```text
first user message preview
```

as a temporary UI label.

Do not call another model solely to generate a title.

---

# 64. Session Sidebar

Example:

```text
SESSIONS

● Fix video export
  4m

○ Canvas rendering
  2h

○ Implement WebSocket
  Yesterday

○ Initial architecture
  Sep 8

+ New Session
```

Load these using `thread/list` for the selected `cwd`.

Do not maintain a duplicate session catalogue independently.

---

# 65. Archive and Delete

If exposed, map directly to:

```text
thread/archive
thread/delete
```

App Server persists thread logs and provides both lifecycle operations.

Canvas metadata should follow the result:

```text
archive
→ keep Canvas metadata

delete
→ delete Canvas metadata after Codex deletion succeeds
```

Never delete Canvas state first.

---

# 66. Forking

Codex supports:

```text
thread/fork
```

for branching a conversation.

This would conceptually fit Codex Canvas extremely well.

But it should be deferred until after the core client works.

When eventually implemented, the fork can begin as a copy of the parent's visual Canvas but acquire independent layout afterwards.

---

# 67. Error Handling

Differentiate:

```text
Codex process failure
RPC failure
turn failure
tool failure
authentication failure
workspace failure
Canvas persistence failure
browser connection failure
```

Do not collapse them into:

```text
Something went wrong.
```

Example:

```text
Codex disconnected

The local `codex app-server` process exited.

[Restart Codex]
```

---

# 68. Codex Restart

If App Server exits:

```text
1. preserve Canvas UI
2. mark Codex disconnected
3. disable Send
4. offer Restart
5. start app-server
6. initialize
7. account/read
8. resume active thread
9. reconcile state
```

No Canvas positions should be lost.

---

# 69. Browser Reconnection

If the browser reloads:

```text
Bun remains running
```

where possible.

After reconnect:

```text
browser requests current application state
Bun reports active thread and running turn
Canvas DB restores geometry
Codex thread restores logical history
```

A browser reload must not create a new session.

---

# 70. RPC Bridge

Keep ordinary browser requests ordered, but dispatch `approval.respond` and `turn.stop` independently of that queue. They must not wait behind a request whose completion needs an approval or interruption. The host still validates the opened thread and workspace for these controls. Return request errors with their original client ID so the composer can recover, and keep later requests usable after a failure.

Create a dedicated App Server RPC client.

Example:

```ts
class CodexRpcClient {
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  request<T>(
    method: string,
    params?: unknown
  ): Promise<T>;

  notify(
    method: string,
    params?: unknown
  ): void;

  onNotification(
    handler: (notification: CodexNotification) => void
  ): void;

  onServerRequest(
    handler: (request: CodexServerRequest) => void
  ): void;
}
```

Do not spread raw stdout parsing throughout application code.

---

# 71. Message Categories

App Server messages have three important forms:

```text
response to our RPC request

notification from App Server

server-initiated request requiring our response
```

The third is essential for approvals.

The RPC bridge must distinguish all three.

---

# 72. Browser Protocol

Do not forward arbitrary JSON-RPC directly to browser JavaScript.

Create a small application protocol.

Browser → Bun:

```ts
type ClientMessage =
  | { type: "workspace.open"; workspaceId: string }
  | { type: "session.open"; threadId: string }
  | { type: "session.create" }
  | { type: "turn.start"; text: string }
  | { type: "turn.steer"; text: string }
  | { type: "turn.stop" }
  | { type: "approval.respond"; requestId: number; decision: string }
  | { type: "canvas.keep"; threadId: string; turnId: string; itemId: string }
  | { type: "canvas.turn"; threadId: string; turnId: string | null }
  | { type: "canvas.update"; threadId: string; objectId: string; patch: ObjectPatch };
```

Bun → Browser:

```ts
type ServerMessage =
  | { type: "workspace.state"; ... }
  | { type: "session.state"; ... }
  | { type: "codex.event"; event: ... }
  | { type: "canvas.state"; ... }
  | { type: "approval.request"; ... }
  | { type: "connection.state"; ... };
```

Validate kept item and selected turn IDs against the opened session and workspace. These are local metadata operations and must not invoke agent tools.

This isolates App Server protocol evolution from the visual application.

---

# 73. State Architecture

The browser should maintain three stores conceptually:

```text
CodexState

CanvasState

UiState
```

### CodexState

Derived from App Server:

```text
threads
turns
items
active turn
models
auth
approvals
```

### CanvasState

Derived from SQLite:

```text
positions
sizes
viewport
collapsed states
hidden states
kept states
selected turn (null means follow latest)
```

### UiState

Ephemeral:

```text
selection
hover
drag state
search query
menus
```

Never persist UiState unless necessary.

---

# 74. Rendering Strategy

Update affected DOM nodes instead of rebuilding the complete canvas for every token delta. Assistant deltas update the current message. Command deltas update the corresponding expanded Activity entry and any kept Command view.

Maintain stable Activity entry nodes keyed by item ID so streaming and lifecycle updates preserve expansion. Render detail content on demand. Keep existing card DOM when maximizing so drafts, live output, and reading state survive. Conversation references are keyed by summary identity to avoid one reference per command.

---

# 75. Canvas Performance

Ordinary DOM positioning is sufficient for the MVP. Automatic visible objects are bounded by Conversation plus up to three turn summaries; additional visible objects require explicit keeping.

A turn with at least 80 commands must stay inside a single Activity card. Collapsed entries defer heavy detail rendering. Historical cards are hidden from layout, connectors, minimap, and Fit bounds. Do not reserve space based on the total historical object count.

Retain the target of handling 100 explicitly kept objects without meaningful slowdown. More advanced viewport culling may be introduced when needed.

---

# 76. Markdown

Agent messages should support:

```text
Markdown
tables
lists
code blocks
links
```

Use a small Markdown renderer.

Sanitize generated HTML.

Do not enable arbitrary embedded HTML from model responses.

---

# 77. Syntax Highlighting

Support language-aware syntax highlighting in:

```text
code blocks
File cards
Diff cards
```

Use a focused library such as:

```text
Shiki
```

or a comparably lightweight highlighter.

Avoid a full code editor.

---

# 78. Diff Rendering

Use a unified-diff parser.

Render:

```text
file headers
hunks
line numbers
added lines
removed lines
context
```

Support:

```text
Unified
Side-by-side
```

Side-by-side may be deferred if necessary.

Do not attempt to implement Git history management.

---

# 79. Terminal Rendering

For completed output a `<pre>` element is sufficient.

If ANSI formatting is present, parse it safely.

Do not introduce a full interactive terminal unless Codex App Server behaviour actually requires one for the target demo.

This is a graphical Codex client, not a terminal emulator.

---

# 80. Canvas Visual Style

The visual design should be minimal and technical.

Recommended characteristics:

```text
dark or light neutral background
subtle grid
thin artifact borders
compact card headers
high-quality typography
limited accent colours
clear execution states
```

Avoid:

```text
neon agent graphics
AI gradients
chat bubbles everywhere
excessive animations
large decorative icons
```

The spatial structure itself should provide the visual interest.

---

# 81. Suggested Visual Language

Object types should be immediately recognizable through icon and header styling:

```text
Conversation    speech
Plan            checklist
Command         terminal
Diff            change
File            document
Web             globe
Image           image
Tool            tool
Review          inspection
```

Colour should supplement these distinctions, not replace them.

---

# 82. Canvas Background

Use a very subtle dot grid.

For example:

```css
background-image:
  radial-gradient(
    currentColor 1px,
    transparent 1px
  );

background-size:
  24px 24px;
```

The grid moves and scales with the world.

It communicates that this is a spatial surface rather than an ordinary page.

---

# 83. Workspace Identity

Display the current workspace persistently:

```text
Flip
/Users/iwan/projects/flip
```

The absolute path may be de-emphasized but available.

This is essential because Codex's filesystem actions are scoped around the working directory.

---

# 84. Session Header

At the top of the Canvas:

```text
Fix animation exporter

GPT-6 Astra · High
Workspace Write · Internet
```

The header should indicate current Codex execution context without dominating the screen.

---

# 85. No IDE Sidebar

Do not add a permanent project file explorer to the MVP.

Codex can inspect files itself, and the user likely has an IDE already.

Adding:

```text
tree view
tabs
editor
source control panel
debugger
```

would turn Codex Canvas into an inferior IDE rather than a distinctive graphical Codex client.

The product should resist that drift.

---

# 86. No Custom Agent Controls

Avoid UI controls such as:

```text
Maximum iterations
Tool budget
Agent temperature
System prompt
Custom planning algorithm
Memory size
```

unless they correspond directly to supported Codex configuration.

The client should feel like Codex, not like an agent-development console.

---

# 87. Session Compaction

When App Server emits:

```text
contextCompaction
```

render a subtle event in Conversation:

```text
Context compacted
```

App Server exposes this as a regular item.

Do not attempt to reproduce or display hidden internal context.

---

# 88. Reasoning

App Server can emit reasoning summary events and, under some model/configuration combinations, additional reasoning-related data.

Codex Canvas should default to the same visible level that Codex normally exposes.

Do not build a UI intended to reveal hidden reasoning.

Readable progress/summary information may appear inline as Codex provides it.

---

# 89. Local Image Input

App Server supports text, remote images and local image paths as turn inputs.

Optionally provide:

```text
Attach Image
```

The browser uploads the image to the local Bun host.

Bun stores it temporarily under:

```text
~/.codex-canvas/tmp/
```

and passes it to Codex as:

```text
localImage
```

This should only be enabled when the selected model advertises image input capability.

---

# 90. Security

The server should bind by default only to:

```text
127.0.0.1
```

Do not bind:

```text
0.0.0.0
```

without explicit configuration.

Codex itself remains responsible for command sandboxing and approvals.

The Bun host must not create unrestricted shell endpoints.

---

# 91. User-Initiated Shell Commands

App Server has APIs for explicit user-originated shell commands, but these can operate differently from normal agent sandbox execution.

Do not expose a standalone command prompt in the MVP.

Commands should come from normal Codex agent operation.

This keeps the product boundary simple.

---

# 92. Project Structure

Recommended structure:

```text
codex-canvas/
│
├── package.json
├── tsconfig.json
│
├── src/
│   │
│   ├── server/
│   │   ├── index.ts
│   │   │
│   │   ├── codex/
│   │   │   ├── CodexProcess.ts
│   │   │   ├── CodexRpcClient.ts
│   │   │   ├── CodexProtocol.ts
│   │   │   └── CodexEventRouter.ts
│   │   │
│   │   ├── websocket/
│   │   │   ├── BrowserSocket.ts
│   │   │   └── BrowserProtocol.ts
│   │   │
│   │   ├── workspace/
│   │   │   └── WorkspaceRepository.ts
│   │   │
│   │   └── persistence/
│   │       ├── Database.ts
│   │       ├── CanvasRepository.ts
│   │       └── migrations.ts
│   │
│   └── web/
│       │
│       ├── index.html
│       ├── main.ts
│       ├── styles.css
│       │
│       ├── app/
│       │   ├── Application.ts
│       │   ├── CodexState.ts
│       │   ├── CanvasState.ts
│       │   └── UiState.ts
│       │
│       ├── canvas/
│       │   ├── CanvasWorld.ts
│       │   ├── Viewport.ts
│       │   ├── Camera.ts
│       │   ├── Selection.ts
│       │   ├── AutoLayout.ts
│       │   └── Connectors.ts
│       │
│       ├── objects/
│       │   ├── CanvasObject.ts
│       │   ├── ConversationCard.ts
│       │   ├── PlanCard.ts
│       │   ├── CommandCard.ts
│       │   ├── DiffCard.ts
│       │   ├── FileCard.ts
│       │   ├── WebSearchCard.ts
│       │   ├── ImageCard.ts
│       │   ├── ToolCard.ts
│       │   └── ReviewCard.ts
│       │
│       ├── conversation/
│       │   ├── Conversation.ts
│       │   ├── TurnView.ts
│       │   ├── MessageView.ts
│       │   └── Composer.ts
│       │
│       ├── sidebar/
│       │   ├── WorkspaceList.ts
│       │   └── SessionList.ts
│       │
│       └── ui/
│           ├── ApprovalDialog.ts
│           ├── ModelSelector.ts
│           ├── StatusBar.ts
│           ├── Minimap.ts
│           └── Search.ts
│
└── tests/
```

---

# 93. Automated Tests

Regression coverage must include an approval and Stop arriving while another browser request remains unresolved; interrupted turns containing unfinished command items; acknowledgement timeout and late acknowledgement; and Git metadata permission errors. These tests must not require a browser or real Git writes.

Verify that new sessions, restored sessions, and restoration after process restart all receive the no-Playwright session rule while preserving configured developer instructions and the original user input. Check that repeated composition does not duplicate the rule. Browser regression tests are an explicit development workflow and must not be a runtime prerequisite.

Use:

```bash
bun test
```

Critical tests should not require live model calls.

Mock the App Server protocol.

---

# 94. RPC Tests

Test:

```text
request ID matching
notification routing
server-initiated requests
malformed JSONL
App Server process exit
request timeout
reconnection
```

---

# 95. Session Tests

Verify:

```text
new session → thread/start

existing session → thread/resume

workspace sessions → thread/list with cwd

restoration does not duplicate turns

Canvas metadata attaches to correct thread

one workspace cannot accidentally use another cwd
```

---

# 96. Streaming Tests

Simulate:

```text
item/started
agent message deltas
command output deltas
item/completed
turn/completed
```

Ensure temporary streaming state is replaced correctly by authoritative completed state.

---

# 97. Approval Tests

Simulate App Server server requests for:

```text
command approval
file approval
network approval
```

Verify:

```text
correct session receives dialog
decision returns correct request ID
other sessions remain unaffected
resolved request disappears
```

---

# 98. Canvas Tests

Verify that 80 commands remain one Activity card, summary references are deduplicated, kept results remain visible across turns, unkeeping preserves Activity content, and prior turns reuse placement slots. Test history selection across reload and background updates; hidden/history/collapsed layout footprints; legacy migration; and workspace-scoped keep/turn operations. Verify that failures and approvals signal attention without interrupting maximized reading.

Verify:

```text
pan
zoom
screen-to-world transform
world-to-screen transform
card drag
card resize
manual-position flag
viewport save/restore
automatic placement
collapsed state persistence
```

---

# 99. Persistence Tests

Scenario:

```text
open session
move Diff card
zoom to 70%
close browser
reopen
```

Expected:

```text
Codex restores thread
Canvas restores Diff position
Canvas restores 70% zoom
Conversation remains intact
```

---

# 100. MVP

The first usable version should include only the capabilities necessary to prove the idea.

Required:

```text
local Bun host

codex app-server integration

ChatGPT authentication through Codex

workspace registry

workspace switching

thread listing per workspace

new session

resume session

GPT-6 Astra when available

reasoning effort selector

streaming conversation

Stop

mid-turn steering

plan rendering

command rendering

command output streaming

diff rendering

file-change rendering

web-search rendering

approval dialogs

Canvas pan

Canvas zoom

move cards

resize cards

collapse cards

bounded automatic Plan/Changes/Activity creation

expandable Activity entries

explicit Keep on canvas

readable turn navigation and history restoration

non-interrupting attention indicator

maximized reading with adjustable text

automatic artifact placement

provenance links

Canvas persistence by threadId

session restoration

basic session search
```

Nothing substantially beyond that is necessary for the first version.

---

# 101. Explicitly Out of Scope for MVP

Do not implement:

```text
custom AI agent

custom memory

RAG

embeddings

vector database

Responses API client

custom shell harness

custom web search

full IDE

source-code editor

Git client

debugger

multi-user server

remote hosting

cloud persistence

collaboration

general whiteboard tools

freehand drawing

arbitrary connectors

sticky notes

presentation mode

workflow automation

agent orchestration
```

These features would obscure the actual point of the application.

---

# 102. Demonstration Scenario

Start `bun run dev`, open `http://127.0.0.1:3030`, choose a workspace, and create a session. The canvas contains only Conversation.

Ask Codex to inspect and fix an animation export bug and run tests. A Plan appears when planning content arrives. Shell commands collect inside Activity, with expandable streaming output. File changes produce one Changes card. Web research adds Activity entries.

A network approval displays **Review approval** while the user's current reading view stays in place. The user opens the indicator, reviews the request, and allows it. Tests finish and Conversation explains the result.

The default final canvas is Conversation, Plan, Changes, and Activity. Running dozens more commands does not add floating cards. The user expands the test command and chooses **Keep on canvas**, producing one additional Command view. They maximize it and adjust text size, then return to the original layout.

The user starts a follow-up turn. Its summaries occupy the reusable area while the kept test result remains visible. The previous turn can be selected from the readable navigator; new events do not pull the user out of that historical view. **Go to latest** returns to the newest work.

After browser reload, Codex supplies the original conversation and artifacts. SQLite restores geometry, hidden/collapsed/kept states, camera, and selected turn. No new conversational memory mechanism is introduced.

---

# 103. Why the Canvas Matters

Without the Canvas model the application would merely reproduce an existing chat client:

```text
message
message
tool
message
tool
message
```

That representation becomes difficult to navigate during substantial coding work.

The Canvas changes the temporal log into a persistent spatial workspace.

Conversation remains chronological.

Artifacts become spatial.

This creates two complementary ways to understand the same Codex session:

```text
TIME
Conversation history

SPACE
Canvas artifacts
```

The application is therefore not trying to make Codex more capable.

It is trying to make Codex's work **more inspectable**.

---

# 104. Architectural Invariants

The implementation should treat the following rules as non-negotiable.

**One user-visible session corresponds to one Codex thread.**

**Codex owns conversational memory.**

**Canvas persistence never substitutes for Codex history.**

**Canvas objects are projections of Codex activity, not independent agent state.**

**The conversation itself is a Canvas object.**

**The Canvas survives application restart.**

**The Codex thread survives application restart through Codex's own persistence.**

**No hidden Canvas content is injected into Codex context automatically.**

**Codex App Server is the sole agent interface.**

**App Server stdio JSONL is the host integration transport.**

**GPT-6 Astra is preferred when App Server advertises it, but models are discovered dynamically.**

**Automatic canvas growth is bounded to the viewed turn's Plan, Changes, and Activity summaries. Individual floating artifacts require explicit keeping.**

**New work must not interrupt history browsing or maximized artifact reading.**

**Keeping, hiding, or unkeeping never changes Codex history or model context.**

These invariants are more important than individual UI details.

---

# 105. Definition of Done

Codex Canvas is complete when a user can:

1. start the application locally with Bun;
2. authenticate using normal Codex/ChatGPT authentication;
3. configure multiple local workspaces;
4. switch between those workspaces;
5. see the real Codex sessions associated with each workspace;
6. create a new Codex session;
7. reopen an existing Codex session;
8. continue a previous conversation with its Codex-managed context intact;
9. use GPT-6 Astra when the authenticated Codex environment exposes it;
10. change supported reasoning effort;
11. send messages to Codex;
12. receive streamed Codex responses;
13. stop an active Codex turn;
14. steer a running turn;
15. see Codex plans graphically;
16. see command executions graphically;
17. watch command output stream;
18. inspect file changes and diffs;
19. see Codex web-search activity;
20. approve or reject Codex operations;
21. see image/tool/review artifacts when Codex produces them;
22. pan over a spatial Session Canvas;
23. zoom that Canvas;
24. move and resize artifacts;
25. collapse artifacts;
26. see which conversation turn produced each artifact;
27. close the application;
28. reopen the same Codex session;
29. recover the conversation from Codex;
30. recover the Canvas layout from local persistence;
31. continue working without creating a new memory/context mechanism;
32. inspect a busy turn without accumulating per-command floating cards;
33. keep selected results across turns and unkeep them without losing history;
34. browse prior turns and restore that selection after reload;
35. maximize any card and adjust text size without changing its canvas geometry;
36. review pending approvals and failures on demand without automatic focus or camera changes.

At that point the application has achieved its purpose.

It is not a new agent platform.

It is not another IDE.

It is not another general-purpose Canvas product.

It is a **graphical Codex client in which the Codex session itself becomes a persistent spatial workspace**.

That is the defining idea of **Codex Canvas**.
