# Assemblavatar —  Full Specification

## 1. Purpose

Assemblavatar is a web application for:

* viewing 3D models;
* creating 3D models;
* modifying 3D models;
* generating 3D models from photographs and text instructions.

The primary use case is creation of **avatars** from facial photographs.
The architecture must not be avatar-specific. The same system must support arbitrary 3D objects and scenes.

Examples:

* human avatar heads;
* stylised characters;
* robots;
* busts;
* furniture;
* houses;
* abstract objects;
* small scenes.

The application uses:

* **Bun** as runtime and server platform;
* **TypeScript** on frontend and backend;
* **Three.js** as 3D runtime and rendering engine;
* **GPT-6 Astra** as the sole AI model for model reasoning and code generation.

The defining architectural principle is:

> Assemblavatar generates 3D models by having GPT-6 Astra produce procedural Three.js model-construction code, validate it, execute it safely, render the result, compare against references, and iteratively refine it.

This is a fundamental capability, not an optional feature.

---

# 2. Core concept

Assemblavatar distinguishes three layers:

```text
Intent
  ↓
AI modelling program
  ↓
Runtime 3D artifact
```

Concretely:

```text
User prompt + photos
        ↓
GPT-6 Astra
        ↓
TypeScript model program
        ↓
safe execution
        ↓
THREE.Object3D / THREE.Scene
        ↓
preview / export / save
```

The application does not ask Astra for a raw mesh dump.
It asks Astra to **write a procedural model-builder**.

That builder is then executed and refined.

---

# 3. Product modes

Assemblavatar has two main modes.

## 3.1 Run / View Mode

Purpose:

* browse saved models;
* load a selected model;
* view it in 3D;
* rotate, pan, zoom;
* inspect metadata;
* open model in edit mode.

## 3.2 Edit / Assemblage Mode

Purpose:

* create a new model or assemblage;
* upload reference photographs;
* talk to the AI;
* generate a model from references;
* inspect and edit object hierarchy;
* apply transformations;
* regenerate/refine model;
* save/export final result.

---

# 4. Fundamental generation model

Assemblavatar SHALL use the following generation mechanism.

## 4.1 Input

Inputs may include:

* user photographs;
* text instructions;
* prior model source code;
* current model render snapshots;
* selected object context;
* current scene metadata.

## 4.2 GPT-6 Astra output

GPT-6 Astra generates:

* procedural Three.js model-building TypeScript;
* structured metadata;
* optional improvement rationale;
* optional requested follow-up operations.

The essential output is a module implementing a fixed contract such as:

```ts
export function buildModel(ctx: BuildContext): THREE.Object3D;
```

or

```ts
export function buildScene(ctx: BuildContext): THREE.Scene;
```

Assemblavatar SHALL NOT accept arbitrary free-form code outside this contract.

## 4.3 Execution

The generated code is:

* type-checked;
* statically validated;
* executed in a constrained sandbox;
* rendered offscreen;
* reviewed by the application and optionally by Astra itself.

## 4.4 Iteration

The process repeats until:

* quality threshold is met;
* user approves;
* iteration limit is reached;
* execution fails irrecoverably.

---

# 5. Why this architecture

Assemblavatar is not a general-purpose mesh reconstruction lab.
It is an **AI-driven procedural modelling system**.

That means:

* the AI works in a symbolic, programmable medium;
* the application remains auditable;
* models remain reproducible;
* editing is easier than on raw vertices;
* the same approach works for avatars and non-avatars.

This avoids a weak architecture where the model emits uncontrolled geometry or opaque binary blobs with no editable provenance.

---

# 6. Canonical representation

Assemblavatar maintains two persistent representations.

## 6.1 Source representation

The authoritative editable source is:

* model program;
* build parameters;
* generation prompts;
* references;
* render history;
* revisions.

This is the **true source of truth**.

## 6.2 Runtime representation

The runtime representation is the generated scene/model artifact:

* in-memory `THREE.Object3D` / `THREE.Scene`;
* optionally exported `glb` / `gltf`;
* thumbnails / preview renders.

Important rule:

> The source program is canonical. Exported GLB is a build artifact.

That is the inverse of traditional 3D pipelines.

---

# 7. Domain model

## 7.1 Assemblage

An Assemblage is the editable workspace.

```ts
interface Assemblage {
  id: string;
  name: string;
  kind: "avatar" | "object" | "scene" | "other";
  status: "draft" | "generating" | "ready" | "failed";
  description?: string;

  references: ReferenceAsset[];
  conversationId?: string;

  sourceProgramId?: string;
  currentModelId?: string;

  currentRevision: number;

  createdAt: string;
  updatedAt: string;
}
```

## 7.2 SourceProgram

The procedural model definition generated and refined by Astra.

```ts
interface SourceProgram {
  id: string;
  assemblageId: string;
  language: "typescript";
  target: "threejs-build-module";

  code: string;

  entryPoint: "buildModel" | "buildScene";

  version: number;
  createdAt: string;
}
```

## 7.3 ModelArtifact

Represents the generated model.

```ts
interface ModelArtifact {
  id: string;
  assemblageId: string;
  sourceProgramId: string;

  format: "internal-scene" | "glb" | "gltf";
  assetId?: string;

  thumbnailAssetId?: string;
  previewAssetIds?: string[];

  metadata: Record<string, unknown>;

  createdAt: string;
}
```

## 7.4 ReferenceAsset

```ts
interface ReferenceAsset {
  id: string;
  assemblageId: string;
  assetId: string;

  type: "photo" | "image" | "model" | "other";
  role?: "front" | "left" | "right" | "profile" | "detail" | "reference";

  description?: string;
  createdAt: string;
}
```

## 7.5 GenerationJob

```ts
interface GenerationJob {
  id: string;
  assemblageId: string;

  status: "queued" | "running" | "review" | "completed" | "failed";
  iteration: number;
  maxIterations: number;

  currentSourceProgramId?: string;
  currentModelArtifactId?: string;

  error?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

# 8. Functional architecture

## 8.1 Major components

```text
Frontend
  ├─ Viewer
  ├─ Editor
  ├─ AI Chat Panel
  └─ Asset/Reference Manager

Backend
  ├─ API Layer
  ├─ Assemblage Service
  ├─ Generation Service
  ├─ Source Program Service
  ├─ Sandbox Execution Service
  ├─ Render Review Service
  ├─ Export Service
  └─ Asset Store
```

## 8.2 Critical internal services

```text
AstraModellingService
ProgramValidator
ProgramSandbox
SceneBuilder
RenderEvaluator
RevisionManager
```

---

# 9. Astra as core modelling engine

## 9.1 Principle

GPT-6 Astra is the **core modeller**.

It does not merely answer questions.
It does not merely label images.
It generates the actual procedural instructions that define the model.

## 9.2 Inputs passed to Astra

Assemblavatar SHALL provide Astra with:

* the user prompt;
* selected mode;
* uploaded reference images;
* current revision summary;
* prior source program if refining;
* prior rendered preview images;
* available geometry DSL / toolkit;
* coding contract;
* safety constraints;
* token budget and complexity constraints.

## 9.3 Outputs required from Astra

Astra SHALL return:

* valid TypeScript code;
* code conforming to the Assemblavatar build contract;
* no external imports except approved internal APIs;
* no filesystem access;
* no network access;
* no dynamic evaluation;
* no side effects outside the build context.

Optional additional outputs:

* rationale;
* expected object hierarchy;
* notes on limitations;
* suggested next iteration prompts.

---

# 10. Procedural modelling contract

Assemblavatar SHALL not allow Astra to emit arbitrary low-level Three.js code with unrestricted freedom.

Instead, Astra should write against a controlled modelling toolkit.

Example contract:

```ts
import {
  group,
  primitive,
  deform,
  mirror,
  smooth,
  extrude,
  loft,
  lathe,
  merge,
  subtract,
  material,
  transform,
  setName,
  projectTexture
} from "@assemblavatar/runtime";
```

A simple generated model might look like:

```ts
export function buildModel(ctx: BuildContext): THREE.Object3D {
  const root = group("avatar");

  const head = primitive.ellipsoid({
    width: 1.0,
    height: 1.25,
    depth: 1.02,
    segments: 64
  });

  deform.scaleRegion(head, {
    region: "jaw",
    x: 1.08,
    y: 0.94,
    z: 1.03
  });

  const nose = loft.fromProfiles({
    profiles: ctx.profiles.nose
  });

  transform.translate(nose, [0, 0.02, 0.45]);

  merge.into(head, nose);

  material.apply(head, material.standardSkin({
    roughness: 0.72
  }));

  setName(head, "Head");
  root.add(head);

  return root;
}
```

The runtime library SHALL expose only approved operations.

---

# 11. Geometry toolkit

The internal modelling toolkit should support:

## 11.1 Primitives

* box;
* sphere;
* ellipsoid;
* capsule;
* cylinder;
* cone;
* torus;
* plane.

## 11.2 Constructive operations

* merge / union;
* subtract;
* intersect;
* bevel;
* extrude;
* loft;
* lathe;
* bridge;
* mirror;
* duplicate.

## 11.3 Deformation operations

* scale region;
* taper;
* bend;
* twist;
* smooth;
* inflate;
* shrink;
* displace;
* warp by curve.

## 11.4 Utility operations

* transform;
* group;
* rename;
* attach metadata;
* assign materials;
* assign textures;
* generate UVs;
* centre object;
* compute bounds.

This library is essential.
Without it Astra would either generate weak toy geometry or extremely verbose raw vertex logic.

---

# 12. Generation pipeline

## 12.1 First-pass generation

Initial generation flow:

```text
User creates Assemblage
      ↓
Uploads photos
      ↓
Writes prompt
      ↓
Astra receives prompt + references + toolkit contract
      ↓
Astra writes build program
      ↓
Program validated
      ↓
Program executed
      ↓
Scene rendered
      ↓
Preview shown
```

## 12.2 Iterative refinement

If preview quality is insufficient:

```text
Generated scene
      ↓
Render multiple viewpoints
      ↓
Compare with reference photos
      ↓
Pass renders + original photos + source program back to Astra
      ↓
Astra revises code
      ↓
Repeat
```

This refinement loop is a core system feature.

---

# 13. Multi-view review loop

The review loop is central to model quality.

Assemblavatar SHALL produce standard preview angles:

* front;
* 45° left;
* left profile;
* 45° right;
* right profile;
* back;
* top if relevant.

The generated renders are passed back to Astra with instructions such as:

* identify mismatches;
* refine facial proportions;
* refine silhouette;
* improve materials;
* simplify geometry if unstable.

This makes Astra function as:

* modeller;
* critic;
* corrector.

---

# 14. View mode specification

The View mode shall provide:

* model list;
* search/filter;
* 3D viewport;
* model metadata panel;
* camera controls;
* full-screen mode;
* reload/reset;
* open-in-editor;
* export access.

## 14.1 Viewport features

* rotate;
* zoom;
* pan;
* fit-to-model;
* reset camera;
* switch background;
* toggle wireframe;
* toggle bounds;
* show hierarchy;
* show object metadata.

Three.js `OrbitControls` should handle navigation.

---

# 15. Edit mode specification

Edit mode shall provide:

* Assemblage hierarchy;
* asset/reference panel;
* central 3D viewport;
* AI chat panel;
* source program panel;
* generation controls;
* revision panel.

## 15.1 Editing actions

The user can:

* create Assemblage;
* rename Assemblage;
* duplicate Assemblage;
* delete Assemblage;
* upload photos;
* upload supporting textures;
* inspect generated object tree;
* select object;
* hide/show object;
* delete object;
* transform object;
* group/ungroup;
* edit material properties;
* chat with AI;
* regenerate;
* branch from earlier revision.

## 15.2 Source visibility

This is important: the user should be able to see the generated program.

Modes:

* visual only;
* source preview;
* source edit;
* expert mode.

The application is stronger if the procedural code is transparent.

---

# 16. AI chat behaviour

The AI panel is not a general chat window.
It is a **modelling command interface**.

Examples:

* “Create a realistic head from these three photos.”
* “Make the jaw wider.”
* “The nose is too long in profile.”
* “Turn this into a stylised bronze bust.”
* “Add glasses.”
* “Reduce polygon complexity.”
* “Make the hair more geometric.”

Astra responds by proposing or applying model-program changes.

---

# 17. Generation strategies

Assemblavatar SHALL support at least three internal Astra-based strategies.

## 17.1 Direct procedural synthesis

Astra builds the model from primitives, extrusions, deformations and materials.

Best for:

* stylised avatars;
* objects;
* prototypes;
* scenes;
* architecture.

## 17.2 Program refinement

Astra receives previous code and adjusts it.

Best for:

* iterative improvement;
* likeness tuning;
* bug correction;
* controlled edits.

## 17.3 Hybrid photo-guided synthesis

Astra receives:

* the photos;
* render snapshots;
* current code;
* structured hints from local image analysis.

It then modifies the program.

This is the likely default for avatar creation.

---

# 18. Optional local vision helpers

The system may include non-generative local helpers, but no external 3D providers.

Allowed internal helpers may include:

* face detection;
* landmark extraction;
* pose estimation;
* colour sampling;
* edge/silhouette extraction.

These helpers do **not** generate 3D.
They support Astra by providing structured signals.

For example:

```ts
interface VisionHints {
  estimatedYawByImage: number[];
  faceBoundingBoxes: number[][];
  landmarkPoints?: Record<string, [number, number][]>;
  dominantSkinTone?: string;
}
```

This can improve prompts sent to Astra.

These helpers are optional, local, and non-essential to the architecture.
The essential generator remains Astra.

---

# 19. Source program lifecycle

Each generation produces or modifies a source program.

Lifecycle:

```text
draft
  ↓
generated
  ↓
validated
  ↓
executed
  ↓
reviewed
  ↓
accepted or revised
```

The code must be versioned.

```ts
interface SourceProgramRevision {
  id: string;
  sourceProgramId: string;
  version: number;
  code: string;
  changeSummary?: string;
  createdAt: string;
}
```

---

# 20. Validation pipeline

Before execution, generated code must pass:

## 20.1 Static validation

* TypeScript syntax valid;
* entry point present;
* only approved imports;
* no `eval`;
* no `Function` constructor;
* no filesystem access;
* no network access;
* no subprocess execution;
* no infinite obvious loops;
* no mutation outside context;
* complexity budget within limit.

## 20.2 Semantic validation

* returns `THREE.Object3D` or `THREE.Scene`;
* object count below limit;
* geometry count below limit;
* polygon budget below limit;
* texture budget below limit.

Rejected programs shall never execute.

---

# 21. Execution sandbox

Generated code SHALL execute in a sandboxed environment.

Requirements:

* isolated worker/process;
* restricted runtime API;
* no host filesystem access;
* no network access;
* time limit;
* memory limit;
* object count limit;
* geometry size limit;
* caught exceptions with diagnostics.

The sandbox output should be:

```ts
interface BuildResult {
  success: boolean;
  scene?: SerializedSceneHandle;
  diagnostics?: string[];
  stats?: {
    objectCount: number;
    vertexCount: number;
    triangleCount: number;
  };
}
```

---

# 22. Rendering subsystem

Assemblavatar renders the generated scene for two reasons:

* to show the result to the user;
* to feed render snapshots back to Astra during iteration.

Render subsystem responsibilities:

* create camera rig;
* frame the object;
* apply default lighting;
* generate multiple viewpoints;
* generate thumbnails;
* optionally render wireframe/normal previews.

Three.js is used as the runtime renderer throughout.

---

# 23. Export model

Although source code is canonical, the system should export build artifacts.

Supported export formats for MVP:

* GLB;
* GLTF;
* PNG thumbnails.

Export pipeline:

```text
SourceProgram
   ↓
build scene
   ↓
Three.js scene
   ↓
GLTFExporter
   ↓
GLB
```

Export is important for portability and downstream use.

---

# 24. Persistence

## 24.1 AssetStore abstraction

Assets must be abstracted.

```ts
interface AssetStore {
  put(content: Uint8Array, metadata: AssetMetadata): Promise<AssetRef>;
  get(assetId: string): Promise<Uint8Array>;
  delete(assetId: string): Promise<void>;
  exists(assetId: string): Promise<boolean>;
  getMetadata(assetId: string): Promise<AssetMetadata>;
}
```

Initial implementation:

* filesystem-backed storage.

Possible later replacements:

* database;
* blob storage;
* object storage.

## 24.2 Repositories

Assemblages, revisions and jobs should sit behind repositories, not raw filesystem logic.

---

# 25. Filesystem MVP layout

Example:

```text
data/
  assemblages/
    <assemblage-id>/
      assemblage.json
      revisions/
      jobs/

  source-programs/
    <program-id>/
      v1.ts
      v2.ts
      v3.ts

  assets/
    <asset-id>

  models/
    <model-id>/
      metadata.json
      model.glb
      previews/
```

---

# 26. Backend API

Initial API surface:

```http
GET    /api/assemblages
POST   /api/assemblages

GET    /api/assemblages/:id
PUT    /api/assemblages/:id
DELETE /api/assemblages/:id

POST   /api/assemblages/:id/references
GET    /api/assemblages/:id/references

POST   /api/assemblages/:id/chat
POST   /api/assemblages/:id/generate
POST   /api/assemblages/:id/refine
POST   /api/assemblages/:id/build
GET    /api/assemblages/:id/revisions

GET    /api/models
GET    /api/models/:id
GET    /api/models/:id/content

GET    /api/jobs/:id
```

---

# 27. Backend services

## 27.1 AssemblageService

Handles CRUD around workspaces.

## 27.2 AstraModellingService

Builds prompts, sends requests to GPT-6 Astra, parses structured responses.

## 27.3 SourceProgramService

Stores, versions and retrieves model-building programs.

## 27.4 ProgramValidationService

Static and semantic validation.

## 27.5 SandboxExecutionService

Executes generated code safely.

## 27.6 RenderReviewService

Renders viewpoints and builds evaluation payloads.

## 27.7 ExportService

Exports Three.js scenes to GLB/GLTF.

## 27.8 ModelService

Stores final artifacts and model metadata.

---

# 28. Frontend architecture

Suggested structure:

```text
src/
  frontend/
    app/
    components/
    viewer/
    editor/
    ai/
    api/

  backend/
    api/
    services/
    repositories/
    sandbox/
    runtime/
    export/
    ai/

  shared/
    contracts/
    types/
```

## 28.1 Viewer layer

* scene host;
* OrbitControls;
* selection overlay;
* gizmos;
* diagnostics overlay.

## 28.2 Editor layer

* Assemblage tree;
* properties panel;
* chat panel;
* source panel;
* revision diff panel.

---

# 29. Configuration

Configuration SHALL be server-side.

Example `.env`:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-6-astra

ASSEMBLAVATAR_DATA_DIR=./data
ASSEMBLAVATAR_HOST=127.0.0.1
ASSEMBLAVATAR_PORT=3000

MAX_UPLOAD_SIZE_MB=30
MAX_GENERATION_ITERATIONS=8
SANDBOX_TIMEOUT_MS=10000
MAX_TRIANGLE_COUNT=300000
```

Rules:

* no API keys in browser code;
* OS environment variables may override `.env`;
* all Astra communication goes through backend.

---

# 30. Prompting contract with Astra

Astra should receive a highly controlled prompt contract.

It should specify:

* app identity;
* available modelling toolkit;
* output format;
* coding restrictions;
* style goal;
* reference images;
* iteration objective;
* quality priorities;
* complexity budget.

Example priorities:

```text
1. recognisable silhouette
2. stable geometry
3. clean hierarchy
4. reasonable material realism
5. low enough complexity to render interactively
```

---

# 31. Structured Astra responses

The application should prefer structured responses rather than free-form text.

Example:

```ts
interface AstraGenerationResponse {
  summary: string;
  code: string;
  expectedObjects?: string[];
  notes?: string[];
  suggestedNextChecks?: string[];
}
```

For refinement:

```ts
interface AstraRefinementResponse {
  summary: string;
  code: string;
  changes: string[];
  confidence?: number;
}
```

---

# 32. Revision model

Every meaningful change creates a revision.

A revision captures:

* user prompt;
* source code;
* generated previews;
* diagnostics;
* exported artifact;
* AI summary.

This supports:

* auditability;
* rollback;
* branching;
* comparison.

---

# 33. Expert-mode editing

Assemblavatar should not force everything through the AI.

Expert mode should allow a user to:

* inspect code;
* edit code manually;
* re-run build;
* compare against previous version.

This is particularly valuable for technical users.

---

# 34. Non-goals

Assemblavatar MVP is not:

* Blender in the browser;
* a full sculpting environment;
* a photogrammetry workstation;
* a rigging suite;
* a general mesh editor;
* a topology painting application;
* a CAD package.

Its core identity is:

> AI-assisted procedural 3D model construction and viewing.

---

# 35. Security

Security requirements are strict because the AI generates code.

Assemblavatar SHALL:

* treat AI code as untrusted;
* sandbox all generated programs;
* forbid arbitrary imports;
* forbid I/O;
* forbid shell execution;
* forbid network calls;
* validate uploads;
* constrain resource usage;
* log execution provenance.

This is not optional.
The application lives or dies on safe code execution.

---

# 36. Performance constraints

Generated models must remain practical for browser rendering.

MVP target budgets:

* object count bounded;
* texture size bounded;
* triangle count bounded;
* build time bounded;
* render time bounded.

The validator should reject pathological output.

---

# 37. Quality strategy

The central quality strategy is **closed-loop refinement**.

Not:

```text
photos → one shot → final model
```

But:

```text
photos
  ↓
Astra code
  ↓
build
  ↓
render
  ↓
review
  ↓
Astra revision
  ↓
build
  ↓
render
  ↓
repeat
```

This loop is fundamental to Assemblavatar.

---

# 38. Avatar-specific workflow

Primary avatar workflow:

```text
Create Assemblage
   ↓
Choose kind = avatar
   ↓
Upload 3–6 face photos
   ↓
Prompt:
"Generate a realistic 3D head avatar"
   ↓
Astra creates procedural model
   ↓
Model built and rendered
   ↓
User inspects front/profile
   ↓
User says:
"jaw slightly stronger, nose less broad"
   ↓
Astra modifies source program
   ↓
Model rebuilt
```

The result is not an opaque third-party asset.
It is Assemblavatar-native source plus artifact.

---

# 39. Generic-object workflow

Generic workflow is the same:

```text
Create Assemblage
   ↓
Choose kind = object
   ↓
Upload images / prompt
   ↓
Astra creates program
   ↓
Build and preview
   ↓
Refine interactively
```

This is why the architecture must remain general.

---

# 40. MVP scope

## 40.1 Must-have

* Bun backend;
* TypeScript frontend/backend;
* Three.js viewer;
* model list;
* Assemblage CRUD;
* upload photos/images;
* AI chat panel;
* Astra prompt-to-program generation;
* source-program storage;
* validation;
* sandbox execution;
* render preview generation;
* iterative refinement;
* revision history;
* export GLB.

## 40.2 Should-have

* expert source view;
* object hierarchy;
* transform controls;
* material panel;
* thumbnail generation;
* wireframe preview.

## 40.3 Later

* animation support;
* blend shapes;
* rigging helpers;
* multi-object scenes;
* collaborative editing;
* source diff UI;
* local vision hints;
* audio-driven talking avatars.

---

# 41. Future avatar animation

Because the system generates its own model structure, later versions may add conventions:

* named head;
* eyes;
* mouth;
* jaw;
* brows;
* facial control groups.

Astra can then generate models conforming to an animation contract.

For example:

```text
Avatar root
 ├─ Head
 ├─ LeftEye
 ├─ RightEye
 ├─ Teeth
 ├─ Hair
 └─ FaceControls
```

This would later support deterministic animations without changing the core modelling approach.

---

# 42. Recommended initial implementation strategy

Phase 1:

* build viewer;
* build Assemblage persistence;
* build source-program lifecycle;
* build sandbox;
* build basic Astra code generation;
* support simple objects first.

Phase 2:

* add avatar-focused prompting;
* add multi-view render loop;
* improve procedural toolkit;
* add refinement workflow.

Phase 3:

* improve materials, hair, facial details;
* add export polish;
* add optional local vision helpers.

This phased plan is important.
The biggest technical risk is not Three.js. It is the quality of generated procedural modelling code.

---

# 43. Final architectural statement

Assemblavatar is fundamentally an **AI-native procedural 3D application**.

Its central rule is:

```text
User references + prompt
          ↓
GPT-6 Astra
          ↓
TypeScript / Three.js model program
          ↓
validated sandbox execution
          ↓
3D render
          ↓
iterative review and refinement
          ↓
saved source + exported artifact
```

No external 3D-generation service is used.
No external avatar-generation model is used.
No opaque third-party mesh pipeline is assumed.

The essential core of the application is that **GPT-6 Astra generates, revises and improves the procedural source that creates the 3D model**.

That is the defining property of Assemblavatar.

# 44. Technical implementation architecture

The implementation SHALL preserve the architectural separation established above:

```text
Presentation
    ↓
Application services
    ↓
Domain
    ↓
Infrastructure
```

Three.js, Bun, OpenAI connectivity, filesystem persistence and sandbox execution are infrastructure concerns. They SHALL NOT leak unnecessarily into the core domain model.

A practical repository structure is:

```text
assemblavatar/
│
├─ package.json
├─ bun.lock
├─ tsconfig.json
├─ .env.example
│
├─ src/
│  │
│  ├─ shared/
│  │  ├─ domain/
│  │  │  ├─ assemblage.ts
│  │  │  ├─ model-artifact.ts
│  │  │  ├─ source-program.ts
│  │  │  ├─ generation-job.ts
│  │  │  ├─ revision.ts
│  │  │  └─ asset.ts
│  │  │
│  │  ├─ contracts/
│  │  │  ├─ api.ts
│  │  │  ├─ ai.ts
│  │  │  ├─ modelling.ts
│  │  │  └─ sandbox.ts
│  │  │
│  │  └─ validation/
│  │
│  ├─ backend/
│  │  │
│  │  ├─ server.ts
│  │  │
│  │  ├─ api/
│  │  │  ├─ assemblages.ts
│  │  │  ├─ models.ts
│  │  │  ├─ assets.ts
│  │  │  ├─ generation.ts
│  │  │  └─ jobs.ts
│  │  │
│  │  ├─ services/
│  │  │  ├─ AssemblageService.ts
│  │  │  ├─ AssetService.ts
│  │  │  ├─ GenerationService.ts
│  │  │  ├─ RevisionService.ts
│  │  │  ├─ SourceProgramService.ts
│  │  │  ├─ BuildService.ts
│  │  │  ├─ RenderReviewService.ts
│  │  │  └─ ExportService.ts
│  │  │
│  │  ├─ ai/
│  │  │  ├─ AstraClient.ts
│  │  │  ├─ AstraModellingService.ts
│  │  │  ├─ prompts/
│  │  │  │  ├─ generate-model.ts
│  │  │  │  ├─ refine-model.ts
│  │  │  │  ├─ repair-program.ts
│  │  │  │  └─ evaluate-render.ts
│  │  │  └─ schemas/
│  │  │
│  │  ├─ sandbox/
│  │  │  ├─ ProgramValidator.ts
│  │  │  ├─ ImportValidator.ts
│  │  │  ├─ BuildWorker.ts
│  │  │  ├─ SandboxRunner.ts
│  │  │  └─ ResourceLimits.ts
│  │  │
│  │  ├─ modelling/
│  │  │  ├─ runtime/
│  │  │  ├─ geometry/
│  │  │  ├─ materials/
│  │  │  ├─ textures/
│  │  │  └─ validation/
│  │  │
│  │  ├─ persistence/
│  │  │  ├─ AssetStore.ts
│  │  │  ├─ FileSystemAssetStore.ts
│  │  │  ├─ AssemblageRepository.ts
│  │  │  ├─ FileAssemblageRepository.ts
│  │  │  ├─ RevisionRepository.ts
│  │  │  └─ FileRevisionRepository.ts
│  │  │
│  │  └─ config/
│  │     └─ config.ts
│  │
│  └─ frontend/
│     │
│     ├─ app/
│     │  ├─ App.ts
│     │  ├─ router.ts
│     │  └─ state.ts
│     │
│     ├─ viewer/
│     │  ├─ Viewer.ts
│     │  ├─ SceneHost.ts
│     │  ├─ CameraController.ts
│     │  ├─ ModelLoader.ts
│     │  ├─ SelectionController.ts
│     │  └─ RenderSettings.ts
│     │
│     ├─ editor/
│     │  ├─ AssemblageEditor.ts
│     │  ├─ ObjectTree.ts
│     │  ├─ PropertiesPanel.ts
│     │  ├─ SourcePanel.ts
│     │  ├─ RevisionPanel.ts
│     │  └─ ReferencePanel.ts
│     │
│     ├─ ai/
│     │  ├─ ChatPanel.ts
│     │  ├─ GenerationStatus.ts
│     │  └─ RefinementPanel.ts
│     │
│     └─ api/
│        └─ AssemblavatarClient.ts
│
├─ data/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ modelling/
│  └─ generation/
│
└─ scripts/
```

---

# 45. Application layers

The backend SHOULD be structured around four conceptual layers.

## 45.1 Domain

Contains pure definitions and rules:

```text
Assemblage
SourceProgram
Revision
ModelArtifact
Asset
GenerationJob
```

No filesystem, HTTP, Three.js rendering or OpenAI-specific logic should exist here.

## 45.2 Application services

Coordinates use cases such as:

```text
create assemblage
upload reference
generate model
refine model
build model
export model
rollback revision
```

## 45.3 Infrastructure

Provides concrete implementations for:

* filesystem persistence;
* GPT-6 Astra communication;
* code execution;
* GLB generation;
* rendering;
* image storage.

## 45.4 Presentation

Includes:

* HTTP API;
* browser UI;
* Three.js viewer;
* editor controls.

---

# 46. Shared modelling contract

The most important technical contract in Assemblavatar is the interface between Astra-generated code and the modelling runtime.

A generated program SHALL implement:

```ts
export interface AssemblavatarModelModule {
  buildModel(
    context: ModelBuildContext
  ): Promise<ModelBuildOutput> | ModelBuildOutput;
}
```

The context:

```ts
export interface ModelBuildContext {
  runtime: ModellingRuntime;

  assets: AssetAccessor;

  parameters: Record<string, unknown>;

  metadata: {
    assemblageId: string;
    revision: number;
  };
}
```

Output:

```ts
export interface ModelBuildOutput {
  root: ModelObject;

  metadata?: Record<string, unknown>;

  suggestedCamera?: {
    position: [number, number, number];
    target: [number, number, number];
  };
}
```

The generated program SHALL NOT receive direct references to:

```text
Bun
filesystem
network
process
environment
database
HTTP client
OpenAI client
```

---

# 47. ModellingRuntime interface

Astra should program against a stable Assemblavatar abstraction rather than unrestricted Three.js.

```ts
export interface ModellingRuntime {

  create: PrimitiveFactory;

  geometry: GeometryOperations;

  material: MaterialFactory;

  texture: TextureOperations;

  transform: TransformOperations;

  scene: SceneOperations;

  utility: GeometryUtilities;
}
```

This creates a controlled semantic surface for AI-generated programs.

---

# 48. PrimitiveFactory

Initial API:

```ts
export interface PrimitiveFactory {

  box(options: BoxOptions): ModelObject;

  sphere(options: SphereOptions): ModelObject;

  ellipsoid(options: EllipsoidOptions): ModelObject;

  cylinder(options: CylinderOptions): ModelObject;

  cone(options: ConeOptions): ModelObject;

  capsule(options: CapsuleOptions): ModelObject;

  torus(options: TorusOptions): ModelObject;

  plane(options: PlaneOptions): ModelObject;

  group(name?: string): ModelGroup;
}
```

Example:

```ts
const skull = runtime.create.ellipsoid({
  width: 1.56,
  height: 2.03,
  depth: 1.71,
  segments: 64
});
```

---

# 49. GeometryOperations

The procedural modelling capability depends heavily on this interface.

Initial operations SHOULD include:

```ts
export interface GeometryOperations {

  union(
    a: ModelObject,
    b: ModelObject
  ): ModelObject;

  subtract(
    a: ModelObject,
    b: ModelObject
  ): ModelObject;

  intersect(
    a: ModelObject,
    b: ModelObject
  ): ModelObject;

  extrude(
    profile: Profile2D,
    options: ExtrudeOptions
  ): ModelObject;

  loft(
    profiles: Profile3D[],
    options?: LoftOptions
  ): ModelObject;

  lathe(
    profile: Profile2D,
    options?: LatheOptions
  ): ModelObject;

  mirror(
    object: ModelObject,
    axis: "x" | "y" | "z"
  ): ModelObject;

  smooth(
    object: ModelObject,
    options?: SmoothOptions
  ): ModelObject;

  subdivide(
    object: ModelObject,
    levels: number
  ): ModelObject;

  deform(
    object: ModelObject,
    deformation: Deformation
  ): void;
}
```

---

# 50. Deformation model

Deformations are particularly important for organic models.

```ts
export type Deformation =
  | ScaleRegionDeformation
  | BendDeformation
  | TaperDeformation
  | TwistDeformation
  | InflateDeformation
  | DisplaceDeformation
  | CurveWarpDeformation;
```

Example:

```ts
runtime.geometry.deform(head, {
  type: "scale-region",
  centre: [0, -0.45, 0],
  radius: 0.65,
  scale: [1.12, 0.96, 1.04],
  falloff: "smooth"
});
```

This is substantially more efficient for Astra than manipulating individual vertices.

---

# 51. Direct BufferGeometry escape hatch

The runtime MAY expose a controlled low-level geometry constructor for cases where primitives and deformation operations are insufficient.

```ts
runtime.geometry.fromVertices({
  positions,
  normals,
  uvs,
  indices
});
```

This MUST remain bounded by strict resource limits.

It is an escape hatch, not the default modelling technique.

Astra should be instructed to prefer:

```text
procedural construction
→ transformations
→ loft/extrusion
→ deformation
```

over manually emitting tens of thousands of vertices.

---

# 52. Three.js adapter

The modelling runtime internally maps its abstractions to Three.js.

Example:

```text
runtime.create.ellipsoid()
          ↓
Assemblavatar ModelObject
          ↓
ThreeModelAdapter
          ↓
THREE.Mesh
```

This isolates generated programs from Three.js version changes.

It also makes it possible later to improve modelling implementations without rewriting existing source programs.

---

# 53. Source program example

A valid generated avatar program might resemble:

```ts
export function buildModel(
  ctx: ModelBuildContext
): ModelBuildOutput {

  const { runtime } = ctx;

  const root =
    runtime.create.group("Avatar");

  const head =
    runtime.create.ellipsoid({
      width: 1.54,
      height: 2.01,
      depth: 1.69,
      segments: 64
    });

  runtime.geometry.deform(head, {
    type: "scale-region",
    centre: [0, -0.52, 0],
    radius: 0.62,
    scale: [1.08, 0.95, 1.02],
    falloff: "smooth"
  });

  const nose =
    runtime.geometry.loft(
      [
        /* generated profiles */
      ],
      {
        closed: true
      }
    );

  runtime.transform.position(
    nose,
    [0, 0.03, 0.72]
  );

  const leftEye =
    createEye(runtime, -0.31);

  const rightEye =
    createEye(runtime, 0.31);

  root.add(head);
  root.add(nose);
  root.add(leftEye);
  root.add(rightEye);

  return {
    root,
    suggestedCamera: {
      position: [0, 0, 5],
      target: [0, 0, 0]
    }
  };
}
```

The program remains ordinary TypeScript, but executes inside a constrained modelling environment.

---

# 54. AstraModellingService

The primary AI integration is represented by:

```ts
export interface ModellingAI {

  generate(
    request: GenerateModelRequest
  ): Promise<GeneratedProgram>;

  refine(
    request: RefineModelRequest
  ): Promise<GeneratedProgram>;

  repair(
    request: RepairProgramRequest
  ): Promise<GeneratedProgram>;

  evaluate(
    request: EvaluateRenderRequest
  ): Promise<RenderEvaluation>;
}
```

The initial implementation:

```text
AstraModellingService
```

uses GPT-6 Astra exclusively.

---

# 55. Astra generation request

```ts
export interface GenerateModelRequest {

  assemblage: {
    id: string;
    name: string;
    kind: AssemblageKind;
    description?: string;
  };

  userPrompt: string;

  references: ReferenceInput[];

  runtimeCapabilities:
    ModellingRuntimeDescription;

  constraints: GenerationConstraints;
}
```

Reference input:

```ts
export interface ReferenceInput {
  assetId: string;
  type: "image";
  role?: string;
  description?: string;
}
```

---

# 56. Generation constraints

Assemblavatar SHALL explicitly communicate technical limits to Astra.

```ts
export interface GenerationConstraints {

  maxObjects: number;

  maxTriangles: number;

  maxTextures: number;

  maxTextureDimension: number;

  preferredTriangleCount: number;

  maxBuildDurationMs: number;

  allowedRuntimeVersion: string;
}
```

This should form part of every generation request.

---

# 57. Astra system instruction

The generation system instruction should establish the following contract conceptually:

```text
You are the procedural 3D modelling engine for Assemblavatar.

You construct 3D models by writing TypeScript against the
Assemblavatar Modelling Runtime.

The supplied images are visual references.

Your output must implement the required buildModel contract.

Prefer compact procedural geometry over raw vertex dumps.

Use multiple components where that produces better topology.

Models must remain within the supplied complexity budget.

Do not use network calls, files, process APIs or external imports.

Do not return placeholder geometry.

The output is executed and rendered automatically.

When refining an existing model, preserve good existing geometry
and make targeted modifications rather than recreating everything
without reason.
```

The exact instruction MAY evolve, but these rules are mandatory.

---

# 58. Structured Astra output

Astra's output SHALL be structured.

Conceptual schema:

```ts
export interface GeneratedProgram {

  code: string;

  summary: string;

  objectStructure: {
    name: string;
    purpose?: string;
  }[];

  assumptions: string[];

  expectedLimitations?: string[];
}
```

The application MUST treat `code` as untrusted.

---

# 59. Generation request lifecycle

A complete generation request follows:

```text
POST generate
      ↓
GenerationService
      ↓
load Assemblage
      ↓
load reference assets
      ↓
construct Astra request
      ↓
AstraModellingService.generate()
      ↓
GeneratedProgram
      ↓
ProgramValidator
      ↓
SandboxRunner
      ↓
BuildResult
      ↓
RenderReviewService
      ↓
preview images
      ↓
persist revision
      ↓
return generation status
```

---

# 60. Program validation architecture

Generated source must pass several validation stages.

## 60.1 Parsing

Parse the TypeScript into an AST.

Generation MUST fail before execution if parsing fails.

## 60.2 Import validation

Only allow explicitly approved imports.

For example:

```text
@assemblavatar/runtime
```

should be legal.

The following must be rejected:

```text
node:fs
bun
child_process
http
https
net
worker_threads
process
```

and arbitrary package imports.

## 60.3 Syntax restrictions

Reject at minimum:

```text
eval()
new Function()
dynamic import()
require()
WebSocket
fetch()
process.*
Bun.*
```

## 60.4 Complexity checks

Statically detect obvious pathological patterns such as:

* deeply nested generated loops;
* huge literal arrays;
* enormous subdivision counts;
* extreme geometry dimensions;
* unbounded recursion.

Static checks are advisory in addition to runtime enforcement.

---

# 61. Sandbox process architecture

Generated code SHOULD execute outside the main web server process.

Architecture:

```text
Bun HTTP server
      │
      ▼
SandboxRunner
      │
      ▼
isolated BuildWorker
      │
      ▼
generated program
```

The build worker is disposable.

Each build should execute within its own controlled lifetime.

If the worker:

* exceeds timeout;
* exceeds resource limits;
* crashes;
* enters an infinite loop;

the server terminates it and records the generation as failed.

---

# 62. Sandbox API surface

The generated code sees only:

```text
ModelBuildContext
Assemblavatar Runtime
reference-safe assets
parameter values
```

It SHALL NOT see:

```text
server configuration
API keys
filesystem paths
HTTP request
user session
environment variables
OpenAI credentials
repository implementations
```

---

# 63. Build resource limits

Initial configurable defaults:

```text
maximum execution time:        10 seconds
maximum objects:               1,000
preferred triangles:           100,000
hard triangle limit:           500,000
maximum texture dimension:     4096 × 4096
maximum generated source size: 500 KB
maximum model bounding size:   configurable
```

These are engineering defaults rather than permanent product limits.

The configuration SHALL allow them to be tuned without code changes.

---

# 64. Build diagnostics

Every build must produce diagnostics.

```ts
export interface BuildDiagnostics {

  durationMs: number;

  objectCount: number;

  meshCount: number;

  vertexCount: number;

  triangleCount: number;

  materialCount: number;

  textureCount: number;

  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };

  warnings: string[];
}
```

These diagnostics should be retained with each revision.

---

# 65. Automatic program repair

Compilation or runtime failure SHALL NOT immediately terminate an AI generation attempt.

Assemblavatar should support a controlled repair cycle:

```text
Astra generated source
       ↓
validation/build failure
       ↓
collect compiler/runtime diagnostics
       ↓
send source + diagnostics to Astra
       ↓
Astra repairs program
       ↓
validate/build again
```

A configurable repair limit should apply.

Example:

```text
MAX_PROGRAM_REPAIR_ATTEMPTS=3
```

The repair prompt must instruct Astra to make the smallest viable correction.

---

# 66. Render pipeline

A successful build creates a renderable scene.

The RenderReviewService produces standardised images using a deterministic camera rig.

For an object centred at the origin:

```text
front
front-left 45°
left
rear-left 45°
rear
rear-right 45°
right
front-right 45°
```

For avatars, priority views are:

```text
front
left 45°
left profile
right 45°
right profile
```

Optional views:

```text
top
bottom
close face
full body
```

---

# 67. Deterministic review environment

AI comparison is only meaningful if render conditions remain stable.

Therefore review renders SHALL use:

* fixed focal length;
* fixed neutral lighting;
* fixed background;
* calculated object framing;
* stable camera angles;
* stable render resolution.

For example:

```text
1024 × 1024
neutral grey background
three-point neutral lighting
fixed perspective camera
```

This makes revisions visually comparable.

---

# 68. Self-review by Astra

After the first successful build, Assemblavatar MAY automatically ask Astra to evaluate its own result.

Input:

```text
original reference images
+
generated model renders
+
current source program
+
original user request
```

Astra receives a specific evaluation task.

It should NOT be asked:

```text
"Do you think this is good?"
```

Instead:

```text
Compare the generated render with the supplied references.

Identify concrete geometric discrepancies in:
- head proportions
- silhouette
- eyes
- nose
- mouth
- jaw
- ears
- visible hairstyle
- surface appearance

Rank discrepancies by visual importance.

Recommend only changes that can be implemented through the
available modelling runtime.
```

This produces actionable feedback.

---

# 69. RenderEvaluation contract

```ts
export interface RenderEvaluation {

  overallAssessment: string;

  issues: RenderIssue[];

  recommendation:
    | "accept"
    | "refine"
    | "requires-user-review";
}
```

Issue:

```ts
export interface RenderIssue {

  area: string;

  severity:
    | "minor"
    | "moderate"
    | "major";

  description: string;

  suggestedChange?: string;
}
```

---

# 70. Automatic refinement loop

Generation MAY perform multiple automatic model revisions.

```text
generate
   ↓
build
   ↓
render
   ↓
evaluate
   ↓
refine source
   ↓
build
   ↓
render
   ↓
evaluate
   ↓
...
```

This loop MUST be bounded.

Configuration example:

```text
MAX_GENERATION_ITERATIONS=5
```

Automatic refinement stops when:

* Astra recommends `accept`;
* iteration limit reached;
* user cancels;
* repeated builds fail;
* no material improvement is detected.

---

# 71. Distinguish generation from conversation

The chat interface should not directly control persistence.

Instead:

```text
ChatPanel
   ↓
user instruction
   ↓
GenerationService
   ↓
AstraModellingService
   ↓
proposed revision
```

Conversation describes intent.

Application services decide:

* what context to provide;
* whether a generation operation is required;
* when to save;
* when to build;
* when to create a revision.

---

# 72. Refinement request

```ts
export interface RefineModelRequest {

  userInstruction?: string;

  originalRequest: string;

  currentProgram: string;

  references: ReferenceInput[];

  renders: RenderReference[];

  evaluation?: RenderEvaluation;

  constraints: GenerationConstraints;
}
```

This allows both:

```text
automatic refinement
```

and:

```text
user-directed refinement
```

through the same mechanism.

---

# 73. User-directed refinement example

User:

```text
The face is close, but the nose is too broad and the lower
jaw should project slightly further forward.
```

Flow:

```text
current source
+
current renders
+
reference photos
+
user instruction
        ↓
Astra
        ↓
revised program
        ↓
validation
        ↓
build
        ↓
new revision
```

Astra SHOULD preserve unrelated geometry.

---

# 74. Revision architecture

Every successfully built program becomes a revision.

```ts
export interface AssemblageRevision {

  id: string;

  assemblageId: string;

  revisionNumber: number;

  parentRevisionId?: string;

  sourceProgramId: string;

  modelArtifactId?: string;

  referenceAssetIds: string[];

  originatingPrompt?: string;

  aiSummary?: string;

  diagnostics: BuildDiagnostics;

  previewAssetIds: string[];

  createdAt: string;
}
```

---

# 75. Branching

The revision model SHOULD support branching even if the first UI only exposes linear history.

Example:

```text
r1
 │
 r2
 ├──── r3a realistic
 │
 └──── r3b stylised
```

This avoids redesign later when users want to explore alternatives.

---

# 76. Comparison UI

The editor SHOULD eventually support comparing two revisions.

Possible modes:

```text
side-by-side render
overlay
rapid A/B toggle
source diff
metadata comparison
```

For MVP, side-by-side preview is sufficient.

---

# 77. Source diff

Because the canonical model is procedural source, traditional text diff becomes unusually useful.

Example:

```diff
- width: 1.54,
+ width: 1.59,

- scale: [1.08, 0.95, 1.02]
+ scale: [1.11, 0.94, 1.04]
```

This makes AI changes auditable in a way that opaque generated meshes are not.

---

# 78. AssetStore implementation

Initial filesystem implementation:

```ts
export class FileSystemAssetStore
  implements AssetStore {

  constructor(
    private readonly root: string
  ) {}

  async put(
    content: Uint8Array,
    metadata: AssetMetadata
  ): Promise<AssetRef> {
    // implementation
  }

  async get(
    assetId: string
  ): Promise<Uint8Array> {
    // implementation
  }
}
```

Asset identity should be generated by the server.

Physical filenames SHOULD NOT be part of the domain contract.

---

# 79. Asset metadata

```ts
export interface AssetMetadata {

  id: string;

  mimeType: string;

  size: number;

  originalFilename?: string;

  sha256: string;

  category:
    | "reference"
    | "texture"
    | "model"
    | "preview"
    | "other";

  createdAt: string;
}
```

Content hashing allows duplicate detection and later migration to content-addressed storage.

---

# 80. Assemblage repository

```ts
export interface AssemblageRepository {

  create(
    assemblage: Assemblage
  ): Promise<void>;

  get(
    id: string
  ): Promise<Assemblage | null>;

  update(
    assemblage: Assemblage
  ): Promise<void>;

  delete(
    id: string
  ): Promise<void>;

  list(): Promise<Assemblage[]>;
}
```

The initial filesystem implementation may use JSON documents.

A database can replace it later without affecting service logic.

---

# 81. API conventions

The HTTP API SHOULD use JSON except where binary assets are transferred.

Errors SHOULD use a consistent envelope:

```json
{
  "error": {
    "code": "GENERATION_FAILED",
    "message": "Generated model could not be built.",
    "details": {}
  }
}
```

The API SHOULD expose identifiers rather than storage paths.

---

# 82. Create Assemblage API

```http
POST /api/assemblages
Content-Type: application/json
```

Request:

```json
{
  "name": "Iwan Avatar",
  "kind": "avatar",
  "description": "Realistic head avatar"
}
```

Response:

```json
{
  "id": "asm_123",
  "name": "Iwan Avatar",
  "kind": "avatar",
  "status": "draft",
  "currentRevision": 0
}
```

---

# 83. Upload reference API

```http
POST /api/assemblages/:id/references
Content-Type: multipart/form-data
```

Fields MAY contain:

```text
file
role
description
```

Example role:

```text
front
left-profile
right-profile
three-quarter
detail
```

---

# 84. Generate API

```http
POST /api/assemblages/:id/generate
```

Request:

```json
{
  "prompt": "Create a realistic 3D head from the supplied photographs.",
  "automaticRefinement": true,
  "maxIterations": 4
}
```

Response:

```json
{
  "jobId": "job_123",
  "status": "queued"
}
```

---

# 85. Refinement API

```http
POST /api/assemblages/:id/refine
```

Request:

```json
{
  "instruction": "The nose should be slightly narrower and the chin more pronounced."
}
```

This always operates from the current revision unless another revision is explicitly supplied.

---

# 86. Job status API

```http
GET /api/jobs/:id
```

Response:

```json
{
  "id": "job_123",
  "status": "running",
  "phase": "rendering",
  "iteration": 2,
  "maxIterations": 4,
  "progress": 0.55
}
```

Possible phases:

```text
preparing
generating
validating
building
rendering
evaluating
refining
exporting
completed
failed
```

---

# 87. Event transport

The UI SHOULD receive generation progress asynchronously.

For the initial version, Server-Sent Events are sufficient.

Example:

```http
GET /api/jobs/:id/events
```

Possible events:

```text
generation.started
program.generated
validation.completed
build.completed
render.completed
evaluation.completed
revision.created
generation.completed
generation.failed
```

WebSockets are unnecessary unless bidirectional real-time communication becomes required.

---

# 88. Frontend state model

The frontend should maintain explicit state for:

```ts
interface ApplicationState {

  mode: "view" | "edit";

  selectedAssemblageId?: string;

  selectedRevisionId?: string;

  selectedObjectId?: string;

  activeGenerationJobId?: string;

  viewer: ViewerState;

  editor: EditorState;
}
```

The Three.js scene itself should not be used as the application's state store.

---

# 89. Three.js Viewer API

```ts
export interface Viewer {

  loadModel(
    model: ModelSource
  ): Promise<void>;

  unload(): void;

  focusObject(
    objectId: string
  ): void;

  selectObject(
    objectId?: string
  ): void;

  fitToModel(): void;

  resetCamera(): void;

  setWireframe(
    enabled: boolean
  ): void;

  dispose(): void;
}
```

The rest of the UI should interact through this interface.

---

# 90. Scene resource disposal

Three.js objects consume GPU resources and require explicit disposal.

When changing models Assemblavatar MUST dispose:

* geometries;
* materials;
* textures;
* render targets;
* animation mixers where applicable.

Failing to do so will cause GPU memory leakage during repeated model generation.

---

# 91. Editor object selection

The editor SHOULD support raycast-based selection.

User clicks visible model geometry:

```text
pointer event
    ↓
Three.js raycaster
    ↓
Object3D
    ↓
Assemblavatar object ID
    ↓
selection state
```

Objects generated by Astra SHOULD therefore have stable names or identifiers whenever practical.

---

# 92. Transform controls

Manual transformations should use Three.js `TransformControls`.

Initial supported operations:

```text
translate
rotate
scale
```

A manual transformation should be recorded as an Assemblage operation rather than existing only in the browser.

---

# 93. Relationship between manual edits and source code

This is a critical design issue.

Manual changes must not silently diverge from canonical source.

For MVP, manual transforms SHOULD be stored as a post-build override layer:

```text
Source Program
     ↓
Generated Scene
     ↓
Manual Overrides
     ↓
Final Scene
```

Example:

```json
{
  "objectId": "LeftEye",
  "transform": {
    "position": [-0.32, 0.21, 0.68]
  }
}
```

---

# 94. Incorporating overrides into source

The user may ask:

```text
"Make these manual changes permanent."
```

Assemblavatar can then send:

```text
current source
+
manual overrides
```

to Astra and request an updated source program that incorporates them.

After successful rebuild, the override layer is cleared.

This provides an elegant bridge between direct manipulation and AI-generated source.

---

# 95. Materials

The modelling runtime SHOULD initially expose a limited set of PBR-oriented material operations.

Example:

```ts
runtime.material.standard({
  baseColor: "#d6a381",
  roughness: 0.62,
  metalness: 0.0
});
```

The goal is not to expose every Three.js material parameter immediately.

The API should favour semantic stability.

---

# 96. Texture references

Generated programs should access images through safe asset references.

Example:

```ts
const texture =
  await ctx.assets.texture(
    "asset_32f..."
  );
```

They SHALL NOT receive filesystem paths.

This allows the same program to work regardless of physical storage backend.

---

# 97. Reference images vs model textures

Reference photographs and model textures are conceptually different.

```text
Reference image
    used by Astra for reasoning

Texture asset
    used by model at runtime
```

A source photo should not automatically become a runtime texture.

Any conversion must be explicit.

---

# 98. Source-program reproducibility

Given:

* the exact source program;
* compatible runtime version;
* referenced assets;
* identical parameters;

Assemblavatar SHOULD produce effectively the same geometry.

Procedural randomness SHALL use seeded random generators.

For example:

```ts
ctx.runtime.utility.random(seed);
```

Direct use of uncontrolled `Math.random()` should be prohibited in generated source.

---

# 99. Runtime versioning

Source programs depend on a specific modelling runtime contract.

Each program SHALL therefore declare:

```ts
runtimeVersion: "1.0"
```

Breaking API changes require a new runtime version.

Existing source programs must continue to build against the compatible runtime.

---

# 100. Model provenance

Every generated model SHOULD retain enough information to answer:

```text
Who created this?
From which references?
Using which prompt?
Using which source program?
Using which Astra model configuration?
Which application/runtime version?
Which revision?
```

Example:

```ts
interface GenerationProvenance {

  model: string;

  runtimeVersion: string;

  sourceProgramId: string;

  revisionId: string;

  referenceAssetIds: string[];

  generationTimestamp: string;
}
```

No hidden chain-of-thought needs to be stored.

Only operational provenance is required.

---

# 101. Logging

Structured application logging should cover:

```text
HTTP operations
generation jobs
AI requests
AI response metadata
validation results
build diagnostics
render durations
export operations
storage failures
```

Secrets and original image contents MUST NOT be logged.

---

# 102. AI observability

For each Astra request, retain operational metrics where available:

```text
request type
model name
request duration
input token count
output token count
success/failure
generation iteration
```

This allows Assemblavatar to measure the actual cost of generating a model.

---

# 103. Generation cost controls

Model generation may involve repeated large multimodal requests.

The system therefore SHOULD support:

```text
maximum automatic iterations
maximum repair attempts
maximum source size
maximum images supplied per request
optional generation budget
```

User-driven refinements are independent operations.

---

# 104. Context management

Assemblavatar SHALL NOT resend unlimited historical conversation and revisions to Astra.

Each request should contain only context needed for the current task.

For refinement:

```text
current prompt
current source
relevant references
current renders
latest evaluation
user instruction
runtime contract
```

Older revisions should remain accessible to the application but excluded unless needed.

---

# 105. Reference-image handling

When many photographs exist, Assemblavatar SHOULD select a useful subset.

For avatar generation, prefer:

```text
front
left three-quarter
right three-quarter
left/right profile when available
high-detail facial reference
```

The user may explicitly mark images as primary.

---

# 106. Image preprocessing

Before sending reference images to Astra, Assemblavatar MAY perform deterministic preprocessing:

* orientation correction;
* downscaling;
* cropping;
* background simplification;
* face-region extraction;
* duplicate detection.

Original uploads must remain unchanged.

Preprocessed variants are derived assets.

---

# 107. Avatar-specific generation profile

Assemblavatar SHOULD define domain-specific generation profiles.

Example:

```ts
export interface GenerationProfile {

  id: string;

  systemInstructions: string;

  reviewViews: CameraView[];

  preferredComplexity: GenerationConstraints;

  evaluationCriteria: string[];
}
```

Initial profiles:

```text
avatar-head-realistic
avatar-head-stylised
generic-object
architectural-object
```

All still use Astra and the same core runtime.

---

# 108. Realistic avatar profile

The realistic avatar profile should prioritise:

1. overall cranial silhouette;
2. face width/height ratio;
3. jaw/chin;
4. eye placement;
5. nose geometry;
6. mouth placement and proportions;
7. ears;
8. hairstyle silhouette;
9. material appearance.

The system should optimise large structural mismatches before fine surface details.

---

# 109. Stylised avatar profile

The stylised profile may intentionally simplify geometry.

The prompt should preserve recognizable characteristics while permitting:

* exaggerated proportions;
* reduced surface detail;
* simplified hair;
* larger eyes;
* simplified ears/nose;
* lower polygon count.

The same source/revision architecture applies.

---

# 110. Generic object profile

For arbitrary objects the generation process should reason about:

```text
global silhouette
major components
relative dimensions
symmetry
materials
functional details
```

An example request:

```text
Generate the house visible in these four photographs.
Prioritise the overall building shape, roof geometry,
windows and entrance. Do not invent unseen decorative details
unless structurally necessary.
```

---

# 111. Uncertainty handling

Astra will often need to infer unseen geometry.

Assemblavatar SHOULD explicitly permit this while maintaining provenance.

Generated metadata may include:

```ts
assumptions: [
  "Back of head inferred from visible side profiles.",
  "Rear hairstyle not visible and approximated."
]
```

This is preferable to implying exact reconstruction.

---

# 112. User review gates

Automatic refinement should not run indefinitely toward an opaque target.

Useful gates:

```text
Initial model generated
       ↓
Automatic refinement
       ↓
User review
       ↓
User-directed changes
       ↓
Final approval/export
```

The user should always remain able to interrupt automatic generation.

---

# 113. Build history

Every build attempt need not become a visible revision.

Distinguish:

```text
BuildAttempt
```

from:

```text
AssemblageRevision
```

Failed compiler repairs can remain internal build attempts. Every successfully rendered intermediate result SHALL be persisted and shown immediately, before AI evaluation or the next refinement begins. Draft visibility SHALL NOT depend on quality acceptance.

The viewport SHALL retain the latest rendered result while later steps run, with a clear draft label, current phase, elapsed time and pass count. Users SHALL be able to inspect earlier rendered passes in a Results history. Draft geometry, source, previews and evaluation feedback SHALL survive refresh, cancellation, provider failures and server restarts.

Insufficient model quality at the pass limit SHALL end as **Needs review**, with the draft visible and available for refinement, manual editing and export. Processing failures SHALL explain the error while preserving the last available draft. Only accepted states advance the canonical revision.

Successful meaningful states become revisions.

---

# 114. BuildAttempt

```ts
interface BuildAttempt {

  id: string;

  jobId: string;

  iteration: number;

  sourceProgram: string;

  validationResult: ValidationResult;

  diagnostics?: BuildDiagnostics;

  previewAssetIds?: string[];

  status:
    | "validation-failed"
    | "build-failed"
    | "rendered"
    | "accepted"
    | "superseded";
}
```

---

# 115. Acceptance logic

An automatic iteration becomes the current revision when:

```text
build succeeds
AND
render succeeds
AND
no critical validator warnings
AND
evaluation does not identify catastrophic geometry
```

The system should not depend solely on Astra assigning itself a numerical score.

---

# 116. Testing strategy

Assemblavatar requires tests beyond ordinary application unit tests.

Four categories are required.

## 116.1 Unit tests

For:

* repositories;
* asset handling;
* validation;
* API contracts;
* runtime helpers.

## 116.2 Geometry tests

Verify primitives and operations.

For example:

```text
box has expected bounds
mirror produces expected symmetry
union produces valid geometry
deformation preserves finite vertices
```

## 116.3 Generation integration tests

Use fixed prompts and reference assets.

Verify:

```text
Astra response can be parsed
program validates
program builds
scene contains geometry
triangle count remains bounded
GLB can be exported
```

## 116.4 Visual regression tests

Render known model programs from fixed cameras and compare against baseline images.

This tests the modelling runtime independently of Astra variability.

---

# 117. AI evaluation test set

Create a small internal benchmark containing:

```text
simple chair
coffee mug
stylised robot
simple house
human head
cartoon head
```

For each item provide reference images and expected qualitative properties.

Run the benchmark when changing:

* prompts;
* runtime API;
* Astra model configuration;
* generation loop logic.

This is necessary because output quality cannot be measured adequately by conventional unit tests.

---

# 118. MVP delivery sequence

The implementation SHOULD proceed in the following dependency order.

## Phase A — Runtime foundation

Implement:

* Bun project;
* TypeScript configuration;
* frontend shell;
* Three.js viewer;
* asset storage;
* Assemblage CRUD.

Success criterion:

```text
Existing GLB can be selected and viewed.
```

---

# 119. Phase B — Procedural runtime

Implement:

* `ModellingRuntime`;
* primitives;
* transformations;
* materials;
* basic geometry operations;
* program contract;
* local test programs.

Success criterion:

```text
Hand-written TypeScript model programs can generate
and display models.
```

This must work before involving Astra.

---

# 120. Phase C — Safe execution

Implement:

* TypeScript parsing;
* import restrictions;
* program validation;
* isolated build worker;
* timeouts;
* diagnostics.

Success criterion:

```text
Untrusted generated model programs can execute
without access to the main application environment.
```

---

# 121. Phase D — Astra generation

Implement:

* Astra client;
* generation prompt contract;
* structured response;
* initial program generation;
* automatic repair of compilation failures.

Start with simple objects.

Success criterion:

```text
Prompt:
"Create a wooden stool with four legs."

→ Astra source program
→ build
→ Three.js model
```

---

# 122. Phase E — Render feedback loop

Implement:

* deterministic camera rig;
* preview rendering;
* Astra evaluation;
* iterative refinement.

Success criterion:

```text
Astra can inspect its generated result and produce
a materially revised source program.
```

---

# 123. Phase F — Photo-driven objects

Provide Astra with reference images.

Begin with geometrically simple objects.

Examples:

```text
mug
lamp
chair
small table
simple building
```

Success criterion:

```text
Reference photographs produce a recognisable
procedural approximation.
```

This phase tests the fundamental Assemblavatar hypothesis before tackling human likeness.

---

# 124. Phase G — Avatar generation

Add:

* avatar generation profile;
* face-oriented reference handling;
* avatar-specific review cameras;
* more advanced deformation operations;
* curve/loft utilities;
* enhanced materials.

Success criterion:

```text
Several photographs produce a recognisable
3D avatar approximation that can be interactively refined.
```

The acceptance criterion is recognisability and useful editability, not photogrammetric accuracy.

---

# 125. Phase H — Edit workflow

Implement:

* object tree;
* transform gizmos;
* manual overrides;
* source view;
* revision history;
* user-directed AI refinement.

Success criterion:

```text
A generated model can be modified through both
direct manipulation and natural-language instructions.
```

---

# 126. Phase I — Export

Implement:

```text
Three.js scene
    ↓
GLTFExporter
    ↓
GLB
```

Validate that exported artifacts can be reopened by Assemblavatar.

Success criterion:

```text
generate → edit → export → reload
```

works without loss of the core model.

---

# 127. First technical milestone

The first milestone SHOULD deliberately avoid avatars.

Demonstrate:

```text
Prompt:
"Create a small one-storey modern house with a flat roof,
two front windows and a recessed entrance."

        ↓

GPT-6 Astra

        ↓

generated TypeScript

        ↓

sandbox

        ↓

Three.js scene

        ↓

interactive browser rendering
```

This isolates the core hypothesis:

> Can Astra successfully act as a procedural Three.js modeller?

Only after that mechanism is solid should photo-guided avatar likeness become the primary test.

---

# 128. Second technical milestone

Use photographs of a relatively simple physical object from several angles.

For example:

```text
chair
lamp
computer monitor
coffee machine
```

Test:

```text
multi-image understanding
+
procedural reconstruction
+
render feedback
```

without the extreme perceptual sensitivity associated with human faces.

---

# 129. Third technical milestone

Generate a stylised human head.

This tests:

* organic shapes;
* symmetry;
* eyes;
* nose;
* ears;
* mouth;
* hair.

Stylisation gives the procedural runtime tolerance before attempting realism.

---

# 130. Fourth technical milestone

Attempt realistic likeness from several photographs.

At this point the system already has:

* reliable program generation;
* safe execution;
* procedural geometry toolkit;
* render feedback;
* refinement;
* revision history.

The remaining experiment is the actual quality ceiling of Astra-driven 3D likeness.

---

# 131. Fundamental experimental nature

The application architecture SHALL acknowledge that the achievable fidelity of direct Astra-driven procedural reconstruction is an empirical question.

Assemblavatar therefore must not hide failures.

Its design should make experimentation cheap:

```text
change prompt
change modelling toolkit
change review strategy
change number of iterations
change reference set
```

and compare results.

The purpose of the architecture is to create a powerful feedback environment in which Astra's 3D modelling ability can be progressively improved.

---

# 132. No fallback external 3D generator

Assemblavatar SHALL NOT silently switch to an external 3D-generation model or service if Astra cannot generate a satisfactory model.

The permitted outcome is:

```text
Generation did not reach satisfactory quality.
```

The user may then:

* refine the prompt;
* add references;
* edit manually;
* start another generation;
* modify the generated source.

This constraint is deliberate.

Assemblavatar exists specifically to explore and exploit direct AI-controlled procedural 3D modelling.

---

# 133. Architectural invariant

The following invariant SHALL remain true:

```text
                    GPT-6 Astra
                         │
                         │ generates / modifies
                         ▼
               procedural TypeScript
                         │
                         │ executes against
                         ▼
              Assemblavatar Runtime
                         │
                         │ backed by
                         ▼
                     Three.js
                         │
                         ▼
                      Scene
                         │
                ┌────────┴─────────┐
                ▼                  ▼
              Render              GLB
                │
                ▼
          Astra evaluation
                │
                └──── refinement loop
```

No external 3D generator exists in this loop.

---

# 134. Product identity

Assemblavatar should ultimately be understood not merely as:

```text
"a tool that generates avatars"
```

but as:

> **A visual development environment in which an AI writes, executes, observes and iteratively improves procedural 3D programs.**

Avatars provide the demanding flagship use case.

The same architecture can later support:

```text
3D concept modelling
architectural sketches
product prototypes
characters
interactive assistants
diagrammatic 3D scenes
procedural environments
```

without changing the fundamental system.

---

# 135. Final implementation principle

The core technical principle of Assemblavatar is:

> **The AI should model by programming, observe by rendering, and improve through iteration.**

This produces a closed engineering loop:

```text
understand
   ↓
construct
   ↓
execute
   ↓
observe
   ↓
criticise
   ↓
modify
   ↓
repeat
```

The source remains visible and reproducible.

The 3D result remains interactive.

Three.js remains the runtime.

Bun remains the application platform.

TypeScript remains the common implementation language.

GPT-6 Astra remains the sole generative intelligence responsible for constructing and refining the 3D model.

