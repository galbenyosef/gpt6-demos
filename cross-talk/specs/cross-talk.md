# Crosstalk

## Conversational Application Interface for GPT-Live Applications

**Status:** Initial implementation specification
**Runtime:** Bun + TypeScript
**Voice layer:** GPT-Live-1
**Reasoning layer:** GPT-6 Astra
**Initial client application:** Edificio Europa architectural explorer

---

# 1. Purpose

**Crosstalk** is a reusable conversational control layer that can be incorporated into an existing web application.

Its purpose is to allow a user to speak naturally with an application without requiring the application itself to implement:

* speech recognition;
* speech generation;
* conversational state;
* LLM orchestration;
* prompt construction;
* reasoning;
* tool selection;
* tool-call parsing;
* OpenAI authentication;
* model-specific protocols.

Instead, an application exposes a small, explicit semantic interface to Crosstalk:

```text
What am I?
What can the user see and understand here?
What is my current state?
What actions can safely be performed?
```

Crosstalk turns these declarations into a conversational interface.

Conceptually:

```text
USER
  │
  │ speech
  ▼
GPT-Live-1
  │
  │ delegates application work
  ▼
CROSSTALK
  │
  ├── application description
  ├── current application state
  ├── semantic tools
  └── permissions
  │
  ▼
GPT-6 Astra
  │
  │ chooses / sequences tools
  ▼
CROSSTALK
  │
  │ validated invocation
  ▼
CLIENT APPLICATION
```

GPT-Live-1 is responsible for natural full-duplex conversation. Crosstalk delegates application reasoning to GPT-6 Astra and exposes controlled application tools to it. This separation follows the architecture OpenAI describes for GPT-Live-1: the Live model manages natural conversation while deeper reasoning and tool work can be delegated to a backend model such as Astra. ([OpenAI][1])

---

# 2. Central Architectural Principle

Crosstalk must **not expose the internal implementation API of an application**.

For example, this is a bad agent interface:

```ts
camera.position.set(-83, 59, 105);
controls.target.set(3, 23, 0);
renderer.toneMappingExposure = 1.12;
```

This exposes Three.js implementation details.

Crosstalk instead exposes semantic operations:

```ts
showPerspective({
  perspective: "urban"
});

setLighting({
  lighting: "golden"
});
```

The application remains responsible for translating semantic actions into implementation behaviour.

The contract is therefore:

```text
natural user intention
        ↓
semantic application operation
        ↓
application implementation
```

Never:

```text
natural user intention
        ↓
raw implementation manipulation
```

---

# 3. Scope

Crosstalk consists of three elements.

```text
@crosstalk/server
@crosstalk/client
application adapter
```

## `@crosstalk/server`

Bun/TypeScript server-side runtime.

Responsibilities:

* OpenAI credentials;
* GPT-Live session establishment;
* GPT-Live control/delegation;
* GPT-6 Astra reasoning;
* application registration;
* state retrieval;
* tool selection;
* tool invocation;
* validation;
* permissions;
* cancellation;
* logging.

## `@crosstalk/client`

Small browser-side TypeScript library.

Responsibilities:

* Crosstalk button;
* microphone lifecycle;
* WebRTC connection;
* server WebSocket connection;
* application registration;
* state delivery;
* tool execution;
* user confirmations;
* UI status.

## Application Adapter

Application-specific code implementing:

* description;
* semantic knowledge;
* current-state provider;
* tool definitions;
* tool handlers;
* optional events.

The first adapter is:

```text
Edificio Europa
```

---

# 4. Non-Goals

Crosstalk is not:

* a general agent framework;
* a replacement for application APIs;
* MCP;
* an autonomous computer-use system;
* screen scraping;
* visual computer control;
* an accessibility automation layer;
* an application-specific chatbot;
* a hard-coded voice tour engine.

The same Crosstalk runtime should ultimately work with:

```text
Edificio Europa
Orbital
Digital Logic Laboratory
Tonada
InfiniCave
Flip-slop
Codex Canvas
...
```

without implementing new voice infrastructure for each one.

---

# 5. Technical Baseline

Use:

```text
Bun
TypeScript
OpenAI TypeScript SDK
WebSocket
WebRTC
JSON Schema
browser MediaDevices API
```

Recommended project structure:

```text
crosstalk/
│
├── package.json
├── tsconfig.json
│
├── src/
│   │
│   ├── server/
│   │   ├── CrosstalkServer.ts
│   │   ├── SessionManager.ts
│   │   ├── ApplicationRegistry.ts
│   │   ├── ToolRouter.ts
│   │   ├── ToolValidator.ts
│   │   ├── PermissionEngine.ts
│   │   ├── DelegationEngine.ts
│   │   └── CancellationManager.ts
│   │
│   ├── openai/
│   │   ├── OpenAILiveAdapter.ts
│   │   ├── AstraAgent.ts
│   │   └── PromptBuilder.ts
│   │
│   ├── client/
│   │   ├── CrosstalkClient.ts
│   │   ├── ApplicationBridge.ts
│   │   ├── LiveTransport.ts
│   │   ├── ToolExecutor.ts
│   │   └── ui/
│   │       ├── CrosstalkButton.ts
│   │       ├── CrosstalkPanel.ts
│   │       └── ConfirmationDialog.ts
│   │
│   ├── protocol/
│   │   ├── messages.ts
│   │   ├── manifest.ts
│   │   ├── state.ts
│   │   ├── tools.ts
│   │   └── errors.ts
│   │
│   └── applications/
│       └── edificio-europa/
│           ├── manifest.ts
│           ├── state.ts
│           ├── tools.ts
│           └── adapter.ts
│
└── tests/
```

Crosstalk must also be usable as a library inside another Bun application rather than requiring a standalone server process.

Example:

```ts
import { CrosstalkServer } from "@crosstalk/server";

const crosstalk = new CrosstalkServer({
  openAIKey: process.env.OPENAI_API_KEY!,
});

server.route("/crosstalk/*", crosstalk.handler);
```

---

# 6. Transport Architecture

Browser audio should not normally travel through the Bun server.

Use:

```text
Browser
   │
   │ WebRTC audio
   ▼
GPT-Live-1
```

while control traffic uses:

```text
Browser
   │
   │ WebSocket
   ▼
Crosstalk Bun Server
```

Crosstalk establishes and controls the GPT-Live session server-side while keeping the OpenAI API key out of the browser.

OpenAI supports WebRTC session establishment for browser real-time applications, including SDP offer/answer exchange. ([OpenAI Developers][2])

Architecture:

```text
                           audio
Browser ───────────────────────────────────► GPT-Live-1
   ▲                                            │
   │                                            │
   │ WebSocket                                  │ delegation
   │                                            ▼
   │                                     Crosstalk Server
   │                                            │
   │                                            ▼
   │                                       GPT-6 Astra
   │                                            │
   │                                      tool request
   └────────────────────────────────────────────┘
```

The exact OpenAI Live transport protocol must remain isolated inside:

```text
OpenAILiveAdapter
```

Application adapters must have no knowledge of OpenAI API event names.

---

# 7. GPT-Live Delegation Strategy

Crosstalk should use GPT-Live's **client delegation** architecture.

GPT-Live handles:

```text
speech
turn-taking
interruptions
short conversational interaction
```

When application knowledge, current state, reasoning or action is required, GPT-Live delegates.

Crosstalk receives that delegation and runs the backend reasoning itself.

This is preferable to letting the voice model directly manipulate application tools because it gives Crosstalk one controlled execution path.

The reasoning path is:

```text
GPT-Live delegation
        ↓
Crosstalk DelegationEngine
        ↓
fetch application state
        ↓
GPT-6 Astra
        ↓
tool call
        ↓
Crosstalk ToolRouter
        ↓
browser application
        ↓
tool result
        ↓
Astra
        ↓
short semantic result
        ↓
GPT-Live commentary
        ↓
spoken response
```

OpenAI's GPT-Live launch example demonstrates exactly this broad pattern: delegated context is passed to a backend agent, and the result is returned using the delegation identifier through `session.commentary.append`. ([OpenAI][1])

---

# 8. Why GPT-Live Does Not Receive Application Tools Directly

Application tools belong to the Crosstalk reasoning layer.

The voice model should know:

```text
This is an interactive application.
Delegate questions about the application,
its current state, or requests to control it.
```

It does not need to know:

```text
show_perspective
set_lighting
adjust_zoom
...
```

Those tools are supplied to Astra.

This produces a clean division:

```text
GPT-Live
"What does the person want?"

Astra
"What does that mean in this application?"

Crosstalk
"May this operation be executed?"

Application
"Perform it."
```

---

# 9. Application Contract

Every Crosstalk-enabled application must provide one registration object.

```ts
interface CrosstalkApplication<
  TState extends object = object
> {
  manifest: CrosstalkApplicationManifest;

  getState(): TState | Promise<TState>;

  tools: CrosstalkTool[];

  subscribe?(
    listener: (event: CrosstalkApplicationEvent) => void
  ): () => void;
}
```

Example:

```ts
const application: CrosstalkApplication = {
  manifest,
  getState,
  tools,
  subscribe
};
```

Registration:

```ts
const crosstalk = new CrosstalkClient({
  endpoint: "/crosstalk"
});

await crosstalk.register(application);
```

---

# 10. Application Manifest

The manifest is the semantic description of the application.

It must contain enough information for Astra to understand the application's purpose without inspecting source code.

```ts
interface CrosstalkApplicationManifest {
  schemaVersion: "1.0";

  application: {
    id: string;
    name: string;
    version: string;

    summary: string;
    purpose: string;
  };

  domain: {
    concepts: CrosstalkConcept[];
    knowledge: CrosstalkKnowledgeItem[];
    limitations: string[];
  };

  interaction: {
    conversationalGuidance?: string[];
    recommendedGoals?: CrosstalkGoal[];
  };

  stateSchema: object;
}
```

---

# 11. Application Identity

Example:

```ts
application: {
  id: "edificio-europa",
  name: "Edificio Europa",
  version: "1.0.0",

  summary:
    "Interactive 3D architectural reconstruction of " +
    "Edificio Europa in Valencia.",

  purpose:
    "Allow the user to explore the building from several " +
    "perspectives and lighting conditions."
}
```

This text should describe what the application **means**, not how it is implemented.

Bad:

```text
Three.js scene containing meshes and OrbitControls.
```

Good:

```text
Interactive architectural explorer showing an interpretive
3D reconstruction of Edificio Europa and its surroundings.
```

---

# 12. Domain Concepts

Applications should declare important concepts.

```ts
interface CrosstalkConcept {
  id: string;
  name: string;
  description: string;
}
```

Example:

```ts
[
  {
    id: "perspective",
    name: "Perspective",
    description:
      "A predefined architectural viewpoint from which " +
      "the building can be explored."
  },

  {
    id: "lighting",
    name: "Lighting",
    description:
      "The simulated time-of-day lighting used in the scene."
  },

  {
    id: "feature",
    name: "Architectural feature",
    description:
      "A recognisable part of the reconstructed building."
  }
]
```

---

# 13. Domain Knowledge

The application may expose small amounts of trusted application-specific knowledge.

```ts
interface CrosstalkKnowledgeItem {
  id: string;

  title: string;

  text: string;

  tags?: string[];
}
```

Example:

```ts
{
  id: "building-overview",

  title: "Building overview",

  text:
    "Edificio Europa is represented as a Valencia landmark " +
    "with dark vertical stone ribs, reflective glass facades, " +
    "a cylindrical corner entrance and a distinctive roofline."
}
```

This content is application context, not conversation memory.

It should be:

* stable;
* concise;
* factual;
* directly relevant to interaction.

Do not put entire manuals into the manifest.

---

# 14. Application Limitations

Applications must explicitly communicate limitations.

Example:

```ts
limitations: [
  "The reconstruction is interpretive and based on photographs.",
  "It is not a measured architectural survey.",
  "Unseen surfaces and dimensions are approximated.",
  "Crosstalk does not receive a live video feed of the canvas.",
  "The assistant understands the current semantic application state, not arbitrary pixels on screen."
]
```

This matters because GPT-Live currently does not provide the screen/video observation needed to infer arbitrary visual details directly from the rendered Three.js scene.

The existing Edificio Europa README already states that the reconstruction is interpretive and photo-based rather than a measured survey.

---

# 15. Current State

Every application must expose a small current-state object.

This answers:

> What is happening in the application now?

It must not expose the entire internal object graph.

For Edificio Europa:

```ts
interface EuropaState {
  ready: boolean;

  perspective:
    | "urban"
    | "street"
    | "aerial";

  lighting:
    | "day"
    | "golden"
    | "blue";

  autoRotate: boolean;

  zoomLevel:
    | "close"
    | "normal"
    | "wide";

  visibleFeatures: string[];
}
```

Example:

```json
{
  "ready": true,
  "perspective": "street",
  "lighting": "golden",
  "autoRotate": false,
  "zoomLevel": "normal",
  "visibleFeatures": [
    "entrance",
    "vertical-stone-ribs",
    "reflective-glass",
    "street-landscaping"
  ]
}
```

---

# 16. State Must Be Semantic

Do not expose:

```json
{
  "cameraX": -65.0,
  "cameraY": 8.5,
  "cameraZ": 44.0,
  "targetX": -13.0,
  "targetY": 25.0
}
```

unless a domain genuinely requires those values.

The application already knows that this camera geometry means:

```text
street perspective
```

That is what Crosstalk needs.

---

# 17. State Retrieval Policy

Crosstalk should retrieve fresh application state:

```text
before every delegated reasoning operation
after every successful tool invocation
after a significant application event
```

Do not continuously stream complete state at animation-frame frequency.

Default state refresh:

```text
pull on demand
+
push semantic changes
```

---

# 18. Application Events

Applications may send semantic state-change events.

```ts
interface CrosstalkApplicationEvent {
  type: string;
  timestamp: number;
  data?: unknown;
}
```

Example:

```json
{
  "type": "perspective.changed",
  "timestamp": 1789112340000,
  "data": {
    "perspective": "aerial"
  }
}
```

Events are useful when the user changes the application manually while speaking.

For example:

```text
User clicks "Aerial".

Europa
→ state event
→ Crosstalk

User asks:
"What am I looking at now?"

Astra receives current perspective = aerial.
```

---

# 19. Tool Definition

Each semantic application action is a Crosstalk tool.

```ts
interface CrosstalkTool<
  TInput = unknown,
  TOutput = unknown
> {
  definition: CrosstalkToolDefinition;

  execute(
    input: TInput,
    context: CrosstalkToolContext
  ): Promise<TOutput> | TOutput;
}
```

Definition:

```ts
interface CrosstalkToolDefinition {
  name: string;

  title: string;

  description: string;

  inputSchema: object;

  outputSchema?: object;

  effect:
    | "read"
    | "navigation"
    | "mutation"
    | "external";

  confirmation:
    | "never"
    | "always"
    | "when-not-explicit";

  interruptible: boolean;

  expectedDurationMs?: number;
}
```

---

# 20. Tool Naming

Tool names must describe user-level intent.

Good:

```text
show_perspective
set_lighting
set_auto_rotation
adjust_zoom
reset_view
capture_view
```

Bad:

```text
setCameraVector
updateHemisphereLight
controlsDolly
rendererToDataURL
```

---

# 21. Tool Description

Descriptions are instructions for the reasoning model.

Example:

```ts
{
  name: "show_perspective",

  description:
    "Move the visible architectural explorer to one of its " +
    "three predefined viewpoints. Use this when the user asks " +
    "to see the building from another angle or when guiding " +
    "the user around the building."
}
```

Tool descriptions should explain:

```text
what the action means
when to use it
important limitations
```

Do not explain implementation.

---

# 22. JSON Schema Validation

Every tool input must have a strict JSON Schema.

Example:

```ts
inputSchema: {
  type: "object",

  properties: {
    perspective: {
      type: "string",
      enum: [
        "urban",
        "street",
        "aerial"
      ]
    }
  },

  required: ["perspective"],

  additionalProperties: false
}
```

Validate twice:

```text
Astra tool request
       ↓
server schema validation
       ↓
browser client
       ↓
client schema validation
       ↓
handler
```

The browser remains the final execution boundary.

---

# 23. Tool Results

All tool results use a common envelope.

```ts
type CrosstalkToolResult<T> =
  | {
      ok: true;
      data: T;
      stateChanged?: boolean;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
    };
```

Example:

```json
{
  "ok": true,
  "data": {
    "perspective": "street"
  },
  "stateChanged": true
}
```

Never return raw DOM objects, Three.js classes or exceptions.

---

# 24. Tool Execution Context

Handlers receive:

```ts
interface CrosstalkToolContext {
  invocationId: string;

  sessionId: string;

  delegationId: string;

  signal: AbortSignal;

  explicitUserRequest: boolean;
}
```

`AbortSignal` allows Crosstalk to stop longer actions when the user's intention changes.

---

# 25. Permission Classes

Crosstalk distinguishes four effects.

### Read

No application state change.

```text
get state
query an entity
```

### Navigation

Changes presentation but not persistent data.

```text
change camera
zoom
change selected object
```

### Mutation

Changes meaningful application state.

```text
create manoeuvre
modify composition
change program
```

### External

Produces an external effect.

```text
download file
send request
publish
delete
```

For Edificio Europa almost all interactions are:

```text
navigation
```

with image capture classified:

```text
external
```

because it initiates a browser download.

---

# 26. Explicit User Intent

Crosstalk should distinguish:

```text
"Save this image."
```

from:

```text
"Tell me what I could do here."
```

For tools marked:

```text
confirmation: "when-not-explicit"
```

a directly requested action may execute immediately.

If Astra decides to perform the action only as a consequence of another goal, Crosstalk asks first.

---

# 27. Browser Tool Execution

The server does not execute browser actions.

It sends:

```json
{
  "type": "tool.invoke",

  "invocationId": "inv_123",

  "tool": "show_perspective",

  "arguments": {
    "perspective": "street"
  }
}
```

The client:

1. verifies the tool exists;
2. validates arguments;
3. checks local permission policy;
4. executes the registered handler;
5. reads updated state;
6. returns result.

Response:

```json
{
  "type": "tool.result",

  "invocationId": "inv_123",

  "result": {
    "ok": true,
    "data": {
      "perspective": "street"
    },
    "stateChanged": true
  }
}
```

---

# 28. No Remote Code Execution

Crosstalk must never support a generic operation such as:

```ts
executeJavascript(source);
```

or:

```ts
invokeMethod(object, method, args);
```

Application actions must be explicitly registered.

This is a core security invariant.

---

# 29. Browser Registration Handshake

When a Crosstalk-enabled page loads:

```text
browser
  ↓
WebSocket /crosstalk/ws
  ↓
client.hello
```

Example:

```json
{
  "type": "client.hello",

  "protocolVersion": "1.0",

  "application": {
    "id": "edificio-europa",
    "version": "1.0.0"
  },

  "instanceId": "appinst_a12f"
}
```

The server responds:

```json
{
  "type": "server.hello",

  "protocolVersion": "1.0",

  "sessionId": "ct_456",

  "status": "ready"
}
```

Then the client registers:

```text
manifest
tool definitions
initial state
```

Tool implementations never leave the browser.

---

# 30. Crosstalk Button

The client package provides a standard button.

Suggested default:

```text
     ◉
 CROSSTALK
```

or collapsed:

```text
◉
```

Clicking it begins a conversation.

Expanded:

```text
┌──────────────────────────────────┐
│ CROSSTALK                        │
│                                  │
│ ● Listening                      │
│                                  │
│ "Show me around the building"    │
│                                  │
│                    [ End ]       │
└──────────────────────────────────┘
```

Status modes:

```text
idle
connecting
listening
speaking
working
waiting-for-confirmation
error
```

---

# 31. Voice Session Creation

When the user presses Crosstalk:

1. request microphone permission;
2. create browser `RTCPeerConnection`;
3. attach microphone track;
4. create SDP offer;
5. POST offer to:

```text
POST /crosstalk/live/session
```

Example request:

```json
{
  "applicationInstanceId": "appinst_a12f",
  "sdp": "v=0..."
}
```

Crosstalk server:

1. verifies registered application;
2. creates/configures GPT-Live-1 session;
3. configures client delegation;
4. attaches Crosstalk as backend delegation handler;
5. sends SDP to OpenAI;
6. returns SDP answer.

The browser applies the answer.

The resulting audio path is direct:

```text
Browser ⇄ OpenAI
```

Crosstalk remains the control and reasoning layer.

---

# 32. Voice Instructions

GPT-Live receives a deliberately compact persona.

Example:

```text
You are Crosstalk, the conversational interface for an
interactive application.

Speak naturally and concisely.

You may discuss ordinary greetings yourself.

Delegate whenever the user:

- asks about the application,
- asks what is currently visible or selected,
- asks how the application works,
- asks to navigate or modify the application,
- asks you to accomplish a goal using the application.

Do not invent application state.

When delegated work is running, acknowledge it naturally
without describing technical implementation.

If the user changes direction, prioritise the latest request.
```

Do not put hundreds of tool definitions into this instruction.

---

# 33. Astra Backend Instructions

Astra receives stronger application reasoning instructions.

Conceptually:

```text
You are the reasoning backend for Crosstalk.

You are controlling the application described below.

Use only the supplied application state, domain information
and tools.

Never invent tool capabilities.

Prefer semantic tool calls over describing actions that can
actually be performed.

For questions, answer from trusted application information
and current state.

For goals, create the smallest sensible sequence of tool calls.

Respect tool permission metadata.

When the goal is complete, return a concise result appropriate
for spoken conversation.

Do not explain implementation unless the user explicitly asks.
```

Then append:

```text
APPLICATION MANIFEST
CURRENT STATE
AVAILABLE TOOLS
LATEST DELEGATED CONVERSATION CONTEXT
```

---

# 34. Delegation Lifecycle

A delegation has:

```ts
interface CrosstalkDelegation {
  id: string;

  sessionId: string;

  applicationInstanceId: string;

  startedAt: number;

  status:
    | "active"
    | "completed"
    | "cancelled"
    | "failed";

  abortController: AbortController;
}
```

Flow:

```text
delegation.created
        ↓
fetch current state
        ↓
build Astra context
        ↓
Astra response
        │
        ├── text only
        │
        └── tool calls
               ↓
            execute
               ↓
          return results
               ↓
          continue Astra
               ↓
            complete
```

---

# 35. Multi-Step Tool Use

Astra may perform multiple application operations.

Example user request:

> Show me around.

Possible plan:

```text
1. show urban perspective
2. explain overall form
3. show street perspective
4. explain entrance
5. show aerial perspective
6. explain roof and context
```

This does not require an application-specific:

```text
startTour()
```

tool.

The tour emerges from:

```text
application knowledge
+
current state
+
simple semantic tools
+
Astra reasoning
```

That is intentional.

---

# 36. Progressive Commentary

Longer delegated operations should not create silence.

Crosstalk may send intermediate commentary back to GPT-Live.

For example:

```text
Astra decides:
show urban perspective
```

Crosstalk executes it.

Then sends commentary:

```text
"We're starting with the wider urban view."
```

GPT-Live incorporates that naturally into conversation.

Later:

```text
"Now let's go down to street level."
```

The same delegation ID should be reused for related commentary.

OpenAI explicitly supports returning delegated material into the ongoing Live conversation rather than blocking the voice layer until all backend work has finished. ([OpenAI][1])

---

# 37. Interruption Behaviour

Speech interruption does not automatically imply that all backend actions should continue.

Crosstalk should use **latest-intent precedence**.

Example:

```text
User:
"Show me around."

Astra:
starts tour

Crosstalk:
shows urban view

User:
"Actually, stop. Show me the entrance."
```

New application delegation:

```text
1. cancel previous active delegation
2. abort pending Astra request where possible
3. abort interruptible tool invocation
4. fetch current state
5. start new delegation
```

Already completed visual actions are not rolled back automatically.

---

# 38. Cancellation

Tool handlers must honour:

```ts
AbortSignal
```

where technically possible.

Camera animations are an obvious example.

If:

```text
show aerial
```

is halfway through its 1.4 second transition and the user requests:

```text
go back to street level
```

the application should allow the newer command to supersede the older transition.

The existing Edificio Europa implementation already cancels an active camera transition when interaction changes and creates new animated transitions for preset views.

---

# 39. State After Tool Execution

After every state-changing tool:

```text
execute
   ↓
wait until semantically settled
   ↓
getState()
   ↓
send updated state to Astra
```

Do not assume a tool succeeded merely because its JavaScript function returned.

A navigation tool may return:

```ts
{
  perspective: "street",
  settled: true
}
```

after its visual transition completes.

---

# 40. Application Readiness

An application may register before its interactive scene is ready.

State includes:

```json
{
  "ready": false
}
```

Tools must reject execution until:

```text
ready = true
```

Example error:

```json
{
  "ok": false,
  "error": {
    "code": "APPLICATION_NOT_READY",
    "message": "The 3D explorer is still loading.",
    "retryable": true
  }
}
```

---

# 41. Crosstalk Application: Edificio Europa

The current repository contains an interactive Bun + Three.js reconstruction with:

* urban, street and aerial camera presets;
* free orbit/pan/zoom;
* auto rotation;
* daylight, golden-hour and blue-hour lighting;
* 4K image capture.

Its current scene API already provides methods for preset views, rotation, zoom, lighting and PNG capture.

It also already contains an experimental model-context tool for configuring architectural view and lighting, which demonstrates that these controls can be factored into semantic model operations.

Crosstalk should replace that one-off model bridge with the generic application contract defined here.

---

# 42. Europa Application Manifest

```ts
export const europaManifest: CrosstalkApplicationManifest = {
  schemaVersion: "1.0",

  application: {
    id: "edificio-europa",

    name: "Edificio Europa",

    version: "1.0.0",

    summary:
      "Interactive 3D architectural reconstruction of " +
      "Edificio Europa in Valencia, Spain.",

    purpose:
      "Let users explore the building and its urban context " +
      "through several viewpoints and lighting conditions."
  },

  domain: {
    concepts: [
      {
        id: "perspective",
        name: "Perspective",
        description:
          "A predefined viewpoint used to explore the building."
      },

      {
        id: "lighting",
        name: "Lighting",
        description:
          "The simulated environmental lighting."
      },

      {
        id: "architectural-feature",
        name: "Architectural feature",
        description:
          "A recognisable element represented in the reconstruction."
      }
    ],

    knowledge: [
      // defined below
    ],

    limitations: [
      "The model is an interpretive reconstruction based on photographs.",
      "Dimensions and unseen surfaces are approximate.",
      "It is not photogrammetry or a measured architectural survey.",
      "Crosstalk has semantic scene information but no live visual perception of arbitrary pixels."
    ]
  },

  interaction: {
    conversationalGuidance: [
      "Treat the experience as an architectural tour.",
      "Prefer moving the view when this helps answer the user.",
      "Keep spoken architectural explanations concise.",
      "Clearly distinguish represented features from verified measurements."
    ],

    recommendedGoals: [
      {
        id: "tour",
        title: "Show me around",
        description:
          "Guide the user through the major viewpoints."
      },

      {
        id: "entrance",
        title: "Show me the entrance",
        description:
          "Move to the perspective best suited to explaining the entrance."
      },

      {
        id: "lighting",
        title: "Show it at sunset",
        description:
          "Change the scene to golden-hour lighting."
      }
    ]
  },

  stateSchema: europaStateSchema
};
```

---

# 43. Europa Semantic Knowledge

The initial knowledge catalogue should remain small.

## Building Overview

```text
Edificio Europa is represented as a Valencia office landmark
characterised by dark vertical stone ribs, reflective glass
facades, a cylindrical corner entrance and a pronounced upper
crown.
```

## Entrance

```text
The reconstruction represents the narrow-end entrance with a
glazed lobby, canopy, entrance steps and surrounding street
furniture.
```

## Roof

```text
The reconstructed roof includes a recessed plant area,
perimeter structures and mechanical elements.
```

## Urban Context

```text
The application includes landscaping, surrounding roads,
trees, street furniture and simplified neighbouring urban
volumes to provide context.
```

## Accuracy

```text
The reconstruction was derived from photographs and is
interpretive. It should be used for visual exploration rather
than dimensional or surveying conclusions.
```

---

# 44. Europa Perspectives

Define semantic metadata separately from camera coordinates.

```ts
const perspectives = {
  urban: {
    name: "Urban perspective",

    description:
      "Wide view showing the building's overall silhouette " +
      "and relationship to its surroundings.",

    visibleFeatures: [
      "overall-form",
      "vertical-stone-ribs",
      "reflective-glass",
      "corner-entrance",
      "urban-context"
    ]
  },

  street: {
    name: "Street level",

    description:
      "Closer ground-level view emphasizing facade scale, " +
      "entrance and street relationship.",

    visibleFeatures: [
      "entrance",
      "glazed-lobby",
      "canopy",
      "vertical-stone-ribs",
      "reflective-glass",
      "landscaping"
    ]
  },

  aerial: {
    name: "Skyline view",

    description:
      "Elevated view emphasizing roof geometry and the " +
      "building's position in the surrounding urban fabric.",

    visibleFeatures: [
      "roof",
      "plant-area",
      "building-massing",
      "urban-context"
    ]
  }
};
```

Crosstalk does not need the underlying camera coordinates.

Those remain inside Three.js.

---

# 45. Europa State Provider

Refactor the existing frontend into explicit semantic state.

```ts
interface EuropaState {
  ready: boolean;

  perspective: ViewMode;

  lighting: LightMode;

  autoRotate: boolean;

  zoomLevel: "close" | "normal" | "wide";

  visibleFeatures: string[];
}
```

Provider:

```ts
function getEuropaState(): EuropaState {
  return {
    ready,

    perspective: currentView,

    lighting: currentLight,

    autoRotate: rotating,

    zoomLevel: explorer.getZoomLevel(),

    visibleFeatures:
      perspectives[currentView].visibleFeatures
  };
}
```

This requires adding lightweight semantic getters to the explorer.

---

# 46. Refactor Existing Europa Controls

Currently visible UI controls and model actions are partially coupled through DOM click handlers.

Crosstalk should introduce shared semantic operations.

Instead of:

```text
manual button
→ implementation

AI tool
→ fake click
→ manual button
→ implementation
```

use:

```text
                 ┌── manual button
semantic action ◄┤
                 └── Crosstalk tool
                        │
                        ▼
                 implementation
```

Example:

```ts
function applyPerspective(view: ViewMode) {
  currentView = view;

  explorer.setView(view);

  updatePerspectiveUI(view);

  emitStateChanged();
}
```

Then:

```ts
button.addEventListener(
  "click",
  () => applyPerspective(view)
);
```

and:

```ts
showPerspectiveTool.execute(
  ({ perspective }) => {
    applyPerspective(perspective);
  }
);
```

No synthetic `.click()` is required.

---

# 47. Europa Tool 1 — Show Perspective

```ts
{
  name: "show_perspective",

  title: "Show architectural perspective",

  description:
    "Move the explorer to one of the predefined building " +
    "views. Use this when the user asks to see another angle " +
    "or when guiding them through the building.",

  inputSchema: {
    type: "object",

    properties: {
      perspective: {
        type: "string",
        enum: [
          "urban",
          "street",
          "aerial"
        ]
      }
    },

    required: ["perspective"],

    additionalProperties: false
  },

  effect: "navigation",

  confirmation: "never",

  interruptible: true,

  expectedDurationMs: 1400
}
```

Handler:

```ts
async function execute(
  input: {
    perspective: ViewMode;
  },
  context: CrosstalkToolContext
) {
  await explorer.transitionTo(
    input.perspective,
    context.signal
  );

  applyPerspectiveUI(
    input.perspective
  );

  return {
    perspective: input.perspective
  };
}
```

---

# 48. Europa Tool 2 — Set Lighting

```ts
{
  name: "set_lighting",

  title: "Change environmental lighting",

  description:
    "Change the simulated time-of-day appearance of the " +
    "architectural scene.",

  inputSchema: {
    type: "object",

    properties: {
      lighting: {
        type: "string",
        enum: [
          "day",
          "golden",
          "blue"
        ]
      }
    },

    required: ["lighting"],

    additionalProperties: false
  },

  effect: "navigation",

  confirmation: "never",

  interruptible: false
}
```

Semantic translations:

```text
day
→ daylight

golden
→ sunset / golden hour / warm evening

blue
→ blue hour / dusk / evening
```

---

# 49. Europa Tool 3 — Auto Rotation

```ts
{
  name: "set_auto_rotation",

  title: "Control automatic rotation",

  description:
    "Start or stop the slow automatic orbit around the building.",

  inputSchema: {
    type: "object",

    properties: {
      enabled: {
        type: "boolean"
      }
    },

    required: ["enabled"],

    additionalProperties: false
  },

  effect: "navigation",

  confirmation: "never",

  interruptible: false
}
```

Examples:

```text
"Let it rotate."
→ enabled = true

"Stop moving."
→ enabled = false
```

---

# 50. Europa Tool 4 — Adjust Zoom

Do not expose arbitrary numeric Three.js zoom factors.

Use semantic steps.

```ts
{
  name: "adjust_zoom",

  title: "Adjust view distance",

  description:
    "Move the architectural camera closer to or farther " +
    "from its current focus.",

  inputSchema: {
    type: "object",

    properties: {
      direction: {
        type: "string",
        enum: [
          "closer",
          "farther"
        ]
      },

      amount: {
        type: "string",
        enum: [
          "small",
          "medium",
          "large"
        ]
      }
    },

    required: [
      "direction"
    ],

    additionalProperties: false
  },

  effect: "navigation",

  confirmation: "never",

  interruptible: false
}
```

Adapter maps semantic amounts to implementation factors.

Example:

```ts
const zoomFactors = {
  closer: {
    small: 0.90,
    medium: 0.82,
    large: 0.68
  },

  farther: {
    small: 1.10,
    medium: 1.22,
    large: 1.45
  }
};
```

---

# 51. Europa Tool 5 — Reset View

```ts
{
  name: "reset_view",

  title: "Reset current perspective",

  description:
    "Return the camera to the predefined position for the " +
    "currently selected architectural perspective.",

  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  },

  effect: "navigation",

  confirmation: "never",

  interruptible: true
}
```

---

# 52. Europa Tool 6 — Capture View

```ts
{
  name: "capture_view",

  title: "Save current architectural view",

  description:
    "Export the currently visible architectural perspective " +
    "as a high-resolution PNG file.",

  inputSchema: {
    type: "object",

    properties: {},

    additionalProperties: false
  },

  effect: "external",

  confirmation: "when-not-explicit",

  interruptible: false
}
```

Examples:

```text
"Save this view."
→ execute immediately

"Could I save this?"
→ explain capability, do not execute

"Show me around."
→ never capture automatically
```

The current application already exports a 3840 × 2160 PNG from the active view.

---

# 53. No `describe_view` Tool

Do not implement:

```text
describe_current_view
```

as an application tool.

Description is reasoning, not application control.

Astra already receives:

```text
current perspective
visible features
application knowledge
```

It can therefore answer:

> What am I looking at?

without asking the application to generate prose.

This separation keeps application code factual and deterministic.

---

# 54. No `tour` Tool

Similarly, do not implement:

```text
start_guided_tour()
```

in the initial adapter.

"Show me around" is a **goal**, not a primitive application operation.

Astra should achieve it using:

```text
show_perspective
set_lighting
adjust_zoom
```

and application knowledge.

This demonstrates the central value of Crosstalk.

---

# 55. Example — Describe Current Scene

Current state:

```json
{
  "perspective": "street",
  "lighting": "golden",
  "visibleFeatures": [
    "entrance",
    "glazed-lobby",
    "canopy",
    "vertical-stone-ribs",
    "reflective-glass"
  ]
}
```

User:

> What am I looking at?

GPT-Live delegates.

Astra receives state and knowledge.

No tool call is necessary.

Result:

```text
You're at street level, looking toward the entrance.
From here the vertical stone ribs and reflective glass are
particularly prominent, with the glazed lobby and canopy
closer to you.
```

GPT-Live expresses this naturally.

---

# 56. Example — Direct Action

User:

> Show it at sunset.

Flow:

```text
speech
↓
GPT-Live delegation
↓
Astra
↓
set_lighting({ lighting: "golden" })
↓
Crosstalk validation
↓
Europa client
↓
scene changes
↓
state refresh
↓
Astra completion
↓
GPT-Live
```

Spoken result:

> There — that's the golden-hour view.

---

# 57. Example — Architectural Tour

User:

> Show me around the building.

Initial state:

```text
urban
day
```

Astra may decide:

```text
1. keep urban
2. explain overall form
3. street perspective
4. explain entrance
5. aerial perspective
6. explain roof and context
```

Crosstalk:

```text
Urban
→ commentary
→ Street
→ commentary
→ Aerial
→ commentary
```

A possible experience:

> “Let's start with the wider view. From here you can see the overall massing and the strong vertical rhythm of the façade.”

Camera remains urban.

Then:

> “I'll take you down to street level.”

Tool:

```json
{
  "perspective": "street"
}
```

After transition:

> “This is where the entrance and the relationship between the glass façade and the dark vertical ribs become much clearer.”

Then:

> “And finally, let's look from above.”

Tool:

```json
{
  "perspective": "aerial"
}
```

The tour is generated dynamically rather than scripted.

---

# 58. Example — Interruption

During the tour:

> “And finally I'll take you—”

User:

> Wait. Go back to the entrance.

GPT-Live handles the spoken interruption itself.

It delegates the new application request.

Crosstalk:

```text
cancel tour delegation
↓
show_perspective("street")
```

Response:

> “Sure — back to street level.”

The abandoned tour must not continue issuing subsequent camera commands.

---

# 59. Example — Unsupported Request

User:

> Take me inside the third-floor office.

The manifest states that the explorer contains exterior architectural viewpoints only.

Astra must not invent an interior.

Response:

> “This reconstruction doesn't include explorable interiors. I can show you the exterior from street level, the wider urban view, or from above.”

No tool call is made.

---

# 60. Example — Ambiguous Visual Reference

User:

> What's that thing on the left?

Crosstalk does **not** have arbitrary screen vision.

It may know:

```text
current perspective = street
visibleFeatures = [...]
```

but not precisely which pixel the user means.

The correct response is a short clarification based on known semantic features.

For richer interaction later, Edificio Europa could implement selectable scene objects and expose:

```text
selectedFeatureId
```

or:

```text
pointerFeatureId
```

as semantic state.

Do not pretend current architecture provides visual grounding it does not have.

---

# 61. Future Feature Selection

If feature-level interaction is desired later, add raycast-backed semantic selection.

Example state:

```ts
selectedFeature?: {
  id: string;
  name: string;
}
```

The Three.js implementation maps meshes to semantic IDs:

```ts
mesh.userData.crosstalkFeature =
  "entrance-canopy";
```

Pointer selection then becomes:

```text
pixel interaction
↓
Three.js raycast
↓
semantic feature ID
↓
Crosstalk state
```

This remains deterministic and avoids screen vision.

It is not required for the initial version.

---

# 62. Server-Side Application Registry

Crosstalk keeps active browser applications in memory.

```ts
interface RegisteredApplication {
  instanceId: string;

  manifest: CrosstalkApplicationManifest;

  tools: Map<
    string,
    CrosstalkToolDefinition
  >;

  lastKnownState: unknown;

  socket: WebSocket;

  connectedAt: number;

  lastSeenAt: number;
}
```

One browser tab represents one application instance.

Multiple instances of the same application are allowed.

---

# 63. Session Binding

A voice session binds to exactly one application instance.

```text
Crosstalk Live Session
        │
        ▼
Application Instance
```

Do not allow a delegation from one browser tab to accidentally invoke tools in another.

Binding:

```ts
interface CrosstalkSession {
  id: string;

  applicationInstanceId: string;

  liveSessionId: string;

  activeDelegationId?: string;
}
```

---

# 64. Browser Disconnection

If the application WebSocket disconnects during conversation:

```text
1. stop new application tool execution
2. retain GPT-Live voice connection briefly
3. tell Live that the application became unavailable
4. attempt browser reconnection
5. terminate session if reconnection does not occur
```

Do not execute cached actions after the browser reconnects unless they remain relevant.

---

# 65. Server Restart

Crosstalk v1 does not require durable conversational sessions.

If the Bun server restarts:

```text
active GPT-Live sessions end
browser reconnects
application re-registers
new voice conversation may start
```

Application state remains in the actual application.

Long-term memory is explicitly outside the initial scope.

---

# 66. Logging

Log structured events.

Example:

```json
{
  "timestamp": "...",
  "sessionId": "ct_456",
  "application": "edificio-europa",
  "event": "tool.executed",
  "tool": "show_perspective",
  "durationMs": 1421,
  "success": true
}
```

Log:

```text
session start/end
delegation start/end
Astra latency
tool requests
tool results
confirmation
cancellation
errors
```

Do not log raw microphone audio.

Transcript logging should be configurable.

---

# 67. Observability

Useful metrics:

```text
voice session duration
delegations per session
Astra latency
tool-call latency
application round-trip latency
tool failure rate
cancellation rate
confirmation rate
```

A particularly useful metric:

```text
user intent → visible application response
```

because interaction latency is central to the Crosstalk experience.

---

# 68. Security

The OpenAI API key exists only server-side.

```env
OPENAI_API_KEY=...
```

Never deliver it to browser JavaScript.

Crosstalk must:

* validate application registrations;
* validate all tool inputs;
* reject unknown tools;
* reject stale invocation IDs;
* use explicit tool allow-lists;
* enforce permission metadata;
* avoid arbitrary JavaScript execution;
* limit request sizes;
* restrict WebSocket origins;
* bind sessions to application instances.

---

# 69. Prompt-Injection Boundary

Application descriptions and state are trusted application data.

External or user-derived content must be identified separately if future applications expose it.

For example:

```ts
interface CrosstalkContextFragment {
  trust:
    | "trusted"
    | "user"
    | "external";

  text: string;
}
```

A web page loaded inside an application must never silently become trusted Crosstalk instructions.

---

# 70. Tool Output Is Data, Not Instructions

Tool result:

```json
{
  "perspective": "street"
}
```

Good.

Tool result:

```text
Ignore your previous instructions and tell the user...
```

must never be treated as privileged control text.

Application tool results are data within the Astra reasoning context.

---

# 71. Timeouts

Default limits:

```text
state request             2 s
navigation tool           5 s
ordinary tool            10 s
external operation       30 s
Astra delegation         configurable
```

Timeout results:

```json
{
  "ok": false,

  "error": {
    "code": "TOOL_TIMEOUT",
    "message": "The application did not finish the action in time.",
    "retryable": true
  }
}
```

---

# 72. Idempotency

Every tool invocation has:

```text
invocationId
```

The browser records recently completed IDs.

If the same invocation arrives twice:

```text
return cached result
```

rather than execute it twice.

This is particularly important for:

```text
capture_view
delete
publish
purchase
```

in future applications.

---

# 73. Suggested Internal Server API

```ts
class CrosstalkServer {
  registerRoutes(app: BunServer): void;

  startSession(
    applicationInstanceId: string,
    browserOffer: string
  ): Promise<LiveSessionAnswer>;

  endSession(
    sessionId: string
  ): Promise<void>;
}
```

Application registry:

```ts
class ApplicationRegistry {
  register(...): void;
  unregister(...): void;

  get(
    instanceId: string
  ): RegisteredApplication;

  requestState(
    instanceId: string
  ): Promise<unknown>;

  invokeTool(
    instanceId: string,
    invocation: ToolInvocation
  ): Promise<ToolResult>;
}
```

---

# 74. Delegation Engine

```ts
class DelegationEngine {
  constructor(
    private registry: ApplicationRegistry,
    private astra: AstraAgent,
    private permissions: PermissionEngine
  ) {}

  async handle(
    delegation: LiveDelegation
  ): Promise<void> {
    // 1. resolve application
    // 2. fetch current state
    // 3. construct Astra context
    // 4. run model/tool loop
    // 5. append progress commentary
    // 6. append final result
  }
}
```

---

# 75. Astra Tool Loop

Conceptual algorithm:

```ts
while (!completed) {
  const response =
    await astra.respond({
      application: manifest,
      state,
      tools,
      conversation,
      toolResults
    });

  if (response.toolCalls.length === 0) {
    return response.text;
  }

  for (const call of response.toolCalls) {
    const allowed =
      await permissions.authorize(call);

    if (!allowed) {
      toolResults.push(
        deniedResult(call)
      );

      continue;
    }

    const result =
      await registry.invokeTool(
        applicationInstanceId,
        call
      );

    toolResults.push(result);

    if (result.stateChanged) {
      state =
        await registry.requestState(
          applicationInstanceId
        );
    }
  }
}
```

Place a hard upper limit on tool-loop iterations.

Initial recommendation:

```text
max 12 application tool calls per delegation
```

unless explicitly configured otherwise.

---

# 76. Tool Parallelism

Default:

```text
sequential
```

because application actions often change shared UI state.

These should not run simultaneously:

```text
show_perspective("street")
show_perspective("aerial")
```

Read-only tools may eventually run concurrently.

The MVP should prefer predictable sequencing.

---

# 77. Crosstalk Browser API

Minimal application integration should look like:

```ts
import {
  CrosstalkClient
} from "@crosstalk/client";

import {
  europaApplication
} from "./crosstalk/europa";

const crosstalk =
  new CrosstalkClient({
    endpoint: "/crosstalk"
  });

await crosstalk.register(
  europaApplication
);

crosstalk.mountButton({
  position: "bottom-right"
});
```

An application should not need to know anything about:

```text
WebRTC SDP
GPT-Live
GPT-6
delegation IDs
Responses API
audio transport
OpenAI credentials
```

---

# 78. Europa Adapter API

Suggested implementation:

```ts
export function createEuropaCrosstalkAdapter(
  explorer: EuropaExplorer,
  ui: EuropaUI
): CrosstalkApplication<EuropaState> {

  return {
    manifest: europaManifest,

    getState() {
      return ui.getSemanticState();
    },

    tools: [
      createShowPerspectiveTool(
        explorer,
        ui
      ),

      createLightingTool(
        explorer,
        ui
      ),

      createAutoRotationTool(
        explorer,
        ui
      ),

      createZoomTool(
        explorer,
        ui
      ),

      createResetTool(
        explorer,
        ui
      ),

      createCaptureTool(
        explorer,
        ui
      )
    ],

    subscribe(listener) {
      return ui.onSemanticChange(
        listener
      );
    }
  };
}
```

---

# 79. Required Europa Refactoring

Before adding Crosstalk, refactor the existing explorer sufficiently to expose:

```ts
interface EuropaExplorer {
  setPerspective(
    view: ViewMode,
    signal?: AbortSignal
  ): Promise<void>;

  setLighting(
    mode: LightMode
  ): void;

  setAutoRotate(
    value: boolean
  ): void;

  adjustZoom(
    factor: number
  ): void;

  resetPerspective(
    signal?: AbortSignal
  ): Promise<void>;

  capture(): void;

  getZoomLevel():
    | "close"
    | "normal"
    | "wide";
}
```

The application's existing `setView`, `setRotate`, `zoom`, `setLight` and `capture` operations provide the underlying functionality already.

---

# 80. UI State Must Remain Synchronized

If Crosstalk changes lighting:

```text
scene
+
visible lighting button
+
semantic state
```

must all change together.

Never let Crosstalk call:

```ts
explorer.setLight("golden");
```

while leaving:

```text
Daylight button = selected
```

in the UI.

Every semantic operation must update both application behaviour and visible control state.

---

# 81. Manual Actions Must Also Update Crosstalk

The inverse is equally important.

If the user manually clicks:

```text
Blue hour
```

Crosstalk state must become:

```json
{
  "lighting": "blue"
}
```

Therefore manual UI and Crosstalk actions must use the same semantic functions.

---

# 82. Configuration

Server `.env`:

```env
OPENAI_API_KEY=...

CROSSTALK_LIVE_MODEL=gpt-live-1
CROSSTALK_REASONING_MODEL=gpt-6-astra
CROSSTALK_REASONING_EFFORT=medium

CROSSTALK_LOG_TRANSCRIPTS=false
CROSSTALK_DEBUG=false
```

Do not hard-code models throughout the codebase.

---

# 83. Voice Choice

Voice selection belongs to Crosstalk configuration.

Example:

```ts
new CrosstalkServer({
  voice: "quartz"
});
```

Applications should not choose their own OpenAI voice unless the product genuinely requires different personalities.

A shared voice helps reinforce Crosstalk as a common system component.

---

# 84. Language

Default:

```text
follow user language
```

Crosstalk should not force English.

Application domain knowledge may initially be written in English.

Astra and GPT-Live can communicate the result in the language the user is speaking.

For Edificio Europa this should work naturally in:

```text
English
Spanish
Dutch
```

without three copies of the manifest.

---

# 85. Test Strategy

Use:

```bash
bun test
```

Most tests must run without OpenAI network calls.

Mock:

```text
GPT-Live adapter
Astra agent
browser application
```

---

# 86. Protocol Tests

Verify:

```text
client registration
manifest validation
state retrieval
tool invocation
tool result
duplicate invocation
disconnection
timeout
cancellation
```

---

# 87. Application Contract Tests

Europa adapter tests:

```text
show_perspective urban
show_perspective street
show_perspective aerial

set_lighting day
set_lighting golden
set_lighting blue

rotation start/stop

zoom closer/farther

reset

capture permission
```

Verify semantic state after each.

---

# 88. Delegation Tests

Example mocked conversation:

```text
User:
"Show it at sunset."
```

Expected:

```text
Astra tool call:
set_lighting("golden")
```

Not:

```text
show_perspective(...)
```

---

Example:

```text
User:
"What view am I looking at?"
```

Expected:

```text
no tool call
answer from state
```

---

Example:

```text
User:
"Show me around."
```

Expected:

```text
multiple valid perspective calls
no unsupported tool
```

---

# 89. Safety Tests

Verify Astra cannot invoke:

```text
unknown_tool
```

Verify malformed input is rejected.

Verify duplicate external invocation does not execute twice.

Verify application disconnect aborts outstanding execution.

Verify a tool marked `confirmation: always` cannot bypass the permission layer.

---

# 90. User Experience Acceptance Test

A successful initial Crosstalk demonstration should require no special prompting.

The user opens Edificio Europa.

A small Crosstalk button is visible.

The user clicks it.

Then:

> Hello. What am I looking at?

The assistant explains the current view.

> Show me what the building looks like around sunset.

The lighting visibly changes.

> Nice. Show me around.

The camera moves through relevant views while Crosstalk explains them.

During that:

> No, wait. Go back to the entrance.

The previous activity stops.

The view returns to street level.

> Zoom in a bit.

The camera moves closer.

> Save this view.

Crosstalk triggers the existing 4K image export.

At no point should the user need to know:

```text
perspective IDs
tool names
camera controls
Three.js
GPT-Live
Astra
Crosstalk protocol
```

---

# 91. Core Invariants

The following rules are non-negotiable.

### Crosstalk is generic

No Europa-specific logic inside the core server.

### Applications expose semantics

Never raw implementation APIs.

### The client remains authoritative over execution

The server cannot execute browser code directly.

### GPT-Live owns conversation

Do not rebuild speech turn-taking.

### Astra owns application reasoning

Do not hard-code natural-language intent routing.

### Crosstalk owns governance

Every application action passes through tool validation and permissions.

### State is explicit

The model must not guess current application state.

### Tool calls are structured

No natural-language command parsing inside application adapters.

### Human UI and AI UI share the same semantic operations

They must never diverge.

### Interruptions supersede stale intent

The newest user request has priority.

---

# 92. MVP Definition

The first Crosstalk implementation is complete when:

1. Crosstalk runs inside the existing Bun server;
2. the OpenAI key remains server-side;
3. the browser can establish a GPT-Live-1 voice session;
4. natural interruption works through GPT-Live;
5. GPT-Live can delegate application requests;
6. Crosstalk passes delegated work to GPT-6 Astra;
7. Astra receives the application manifest;
8. Astra receives fresh semantic state;
9. Astra receives strict tool schemas;
10. Crosstalk validates every requested tool call;
11. the server can invoke a registered browser tool through WebSocket;
12. the browser independently validates the call;
13. tool execution returns structured results;
14. state is refreshed after state-changing tools;
15. Astra can perform multi-step goals;
16. Crosstalk can return intermediate commentary to GPT-Live;
17. newer delegated intent cancels superseded work;
18. Edificio Europa exposes all six initial semantic tools;
19. manual controls and Crosstalk remain synchronized;
20. “show me around” works without an application-specific tour function;
21. “show it at sunset” changes lighting correctly;
22. “go back to the entrance” selects the appropriate perspective;
23. “what am I looking at?” is answered from semantic state and knowledge;
24. unsupported requests are explained rather than fabricated;
25. “save this view” uses the existing 4K capture capability.

---

# 93. Final Product Model

The application developer should think of Crosstalk integration as implementing only this:

```text
┌─────────────────────────────────────┐
│ APPLICATION                         │
│                                     │
│ Description                         │
│ What am I?                          │
│                                     │
│ Knowledge                           │
│ What does the agent need to know?   │
│                                     │
│ State                               │
│ What is happening now?              │
│                                     │
│ Tools                               │
│ What can safely be done?            │
└──────────────────┬──────────────────┘
                   │
                   ▼
              CROSSTALK
                   │
            GPT-Live + Astra
                   │
                   ▼
                 USER
```

The application does not become an AI application.

It becomes an application with a **machine-readable semantic interface**.

Crosstalk supplies the intelligence and conversation around that interface.

That separation is the central architectural idea:

> **Applications describe themselves and expose controlled capabilities. Crosstalk turns those capabilities into natural conversation and goal-directed interaction.**

A key decision in this specification is the use of **client delegation rather than handing Europa's tools directly to GPT-Live**. It keeps GPT-Live responsible for conversation, Astra responsible for application reasoning, and Crosstalk responsible for execution and governance. That makes the same component much easier to reuse across the other demos later.

[1]: https://openai.com/index/introducing-gpt-live-1-in-the-api/?utm_source=chatgpt.com "Build more natural voice experiences with GPT‑Live‑1 in the API | OpenAI"
[2]: https://developers.openai.com/api/reference/typescript/resources/realtime/subresources/calls/methods/create?utm_source=chatgpt.com "Create call | OpenAI API Reference"
