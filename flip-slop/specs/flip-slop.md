# Flip-slop-slop

## Generative Canvas & Stop-Motion Studio

## 1. Product Definition

**Flip-slop-slop** is a local-first creative application for generating, editing and animating images with OpenAI image models.

The application revolves around one persistent visual workspace rather than separate generation, editor and animation tools.

The fundamental workflow is:

```text
CREATE → EDIT → ANIMATE
```

but these are not separate document types.

An image created in **Create** can immediately be edited. Any edited image can become an animation frame. Any animation frame can be edited individually. An edited frame can become a new keyframe from which subsequent frames are regenerated.

The central object is always the same **Flip-slop-slop Project**.

The application should feel closer to a lightweight drawing and stop-motion studio than to a chat interface.

The primary interaction surface is a single visible HTML Canvas. Conventional controls, inspectors and timelines use HTML/CSS around it.

Flip-slop uses OpenAI's current image models as its generative engine. GPT-Image-2.5 Flare is intended as the normal interactive model, while GPT-Image-2.5 Sunburst is available for edits and final frames that require greater precision. OpenAI specifically describes Images 2.5 as improving focused editing, preservation across successive edits, and multi-turn consistency — properties directly relevant to Flip-slop's frame-by-frame workflow. ([OpenAI][1])

---

# 2. Product Principle

Flip-slop should not behave like:

```text
prompt
→ image
→ download
```

It should behave like:

```text
idea
 ↓
image
 ↓
revision
 ↓
revision
 ↓
keyframe
 ↓
motion
 ↓
frame sequence
 ↓
frame correction
 ↓
animation
```

The user is building an evolving visual artifact.

AI generation is therefore an operation inside an editor, not the editor itself.

---

# 3. Core Use Cases

Flip-slop must support four primary workflows.

### Image creation

The user describes an image or provides reference material and creates an initial visual.

### Directed image editing

The user selects, sketches over, annotates or describes a specific modification and generates a revised image while preserving the rest of the composition.

### Stop-motion animation

The user turns an image into the first frame of an animation and creates subsequent frames through controlled, incremental edits.

### Image and animation export

The user can save individual images, image sequences, animations and the complete editable project.

---

# 4. Technical Baseline

Use:

* **Bun**
* **TypeScript**
* modern browser APIs
* HTML
* CSS
* Canvas 2D
* IndexedDB
* optional OPFS for large projects
* Web Workers / OffscreenCanvas where useful

Do not introduce React, Angular, Vue or another frontend framework unless implementation complexity demonstrably requires it.

Do not use Three.js.

The visual domain is fundamentally two-dimensional.

The application should run with:

```bash
bun install
bun run dev
bun test
bun run build
```

Production should consist of:

```text
Browser application
+
small Bun API service
```

The Bun service exists primarily to protect OpenAI credentials and normalize model access.

---

# 5. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                             │
│                                                             │
│  ┌─────────────┐       ┌───────────────────────────────┐   │
│  │ UI / Tools  │──────▶│      Project Controller       │   │
│  └─────────────┘       └───────────────┬───────────────┘   │
│                                        │                   │
│                                ┌───────▼────────┐          │
│                                │ Canvas Engine  │          │
│                                └───────┬────────┘          │
│                                        │                   │
│     ┌──────────────┐      ┌────────────▼────────────┐      │
│     │ IndexedDB /  │◀────▶│ Generation Controller  │      │
│     │ OPFS         │      └────────────┬────────────┘      │
│     └──────────────┘                   │                   │
│                                        │ HTTPS             │
└────────────────────────────────────────┼───────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────┐
│                        BUN SERVER                           │
│                                                             │
│  API Routes                                                │
│      │                                                     │
│      ▼                                                     │
│  OpenAI Gateway                                            │
│      │                                                     │
│      ├── Image generation                                  │
│      ├── Image editing                                     │
│      └── Optional motion-planning model                    │
│                                                             │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                     OpenAI API
```

---

# 6. Model Strategy

Two image-generation profiles must be exposed.

## Flare

Use GPT-Image-2.5 Flare as the normal mode.

Suitable for:

* initial generation;
* interactive edits;
* exploratory changes;
* frame generation;
* animation batches;
* rapid iteration.

OpenAI describes Flare as the default model for most applications and positions it around generation quality, editing and reduced latency. ([OpenAI][1])

UI label:

```text
FAST
Flare
```

---

## Sunburst

Use GPT-Image-2.5 Sunburst where preserving exact details is more important than latency.

Suitable for:

* hero images;
* difficult local edits;
* consistency-critical keyframes;
* final-quality animation frames;
* repair of drift;
* production exports.

OpenAI positions Sunburst specifically for workflows requiring tighter control across edits. ([OpenAI][1])

UI label:

```text
PRECISE
Sunburst
```

---

# 7. Do Not Hard-Code API Identifiers

The application should not couple internal domain logic to a particular OpenAI model string.

Use environment configuration:

```env
OPENAI_API_KEY=...

OPENAI_IMAGE_FAST_MODEL=...
OPENAI_IMAGE_PRECISE_MODEL=...
OPENAI_PLANNER_MODEL=...
```

And:

```ts
interface ModelProfile {
  id: string;
  label: string;
  role: "FAST" | "PRECISE";
}
```

The OpenAI-specific implementation belongs inside one adapter.

```ts
interface ImageModelGateway {
  generate(request: GenerateRequest): Promise<GeneratedImage>;

  edit(request: EditRequest): Promise<GeneratedImage>;
}
```

This allows API details to evolve without contaminating the project model or UI.

---

# 8. Single-Canvas Principle

Flip-slop should have exactly one primary visible editing canvas.

```html
<canvas id="Flip-slop-canvas"></canvas>
```

The same canvas is used for:

* displaying generated images;
* drawing;
* selections;
* masks;
* sketches;
* comments;
* motion arrows;
* onion skinning;
* crop previews;
* animation playback.

Internal temporary canvases and `OffscreenCanvas` objects are permitted for compositing and export.

Do not stack several visible canvases to implement the UI.

---

# 9. Canvas Coordinate System

Store all editable geometry in normalized project coordinates.

Example:

```ts
interface Point {
  x: number;
  y: number;
}
```

with:

```text
0 ≤ x ≤ 1
0 ≤ y ≤ 1
```

A point:

```ts
{ x: 0.5, y: 0.5 }
```

always means the centre of the source image regardless of zoom, display resolution or screen size.

Canvas transforms handle:

* zoom;
* pan;
* high-DPI displays;
* viewport fitting.

Never permanently rescale annotations because the browser window changed.

---

# 10. Main UI

Desktop layout:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Flip-slop       Project Name                          Undo Redo   Export │
├───────────┬───────────────────────────────────────────────┬──────────┤
│           │                                               │          │
│ Select    │                                               │ Prompt   │
│ Brush     │                                               │          │
│ Mask      │                                               │          │
│ Eraser    │                  CANVAS                       │          │
│ Arrow     │                                               │ Model    │
│ Comment   │                                               │          │
│ Crop      │                                               │ Generate │
│ Hand      │                                               │          │
│ Zoom      │                                               │          │
├───────────┴───────────────────────────────────────────────┴──────────┤
│   CREATE                   EDIT                   ANIMATE            │
├──────────────────────────────────────────────────────────────────────┤
│ Animation timeline / revision history depending on current mode     │
└──────────────────────────────────────────────────────────────────────┘
```

The canvas should dominate the interface.

Avoid large chat panels.

The prompt is an editing control, not the main application surface.

---

# 11. Application Modes

Flip-slop has three top-level modes:

```text
CREATE
EDIT
ANIMATE
```

Changing mode does not change the underlying project.

It changes which operations are emphasized.

---

# 12. CREATE Mode

Create mode initializes visual material.

The user may begin from:

### Text

Example:

```text
A small clay robot sitting at an old wooden desk,
warm morning light, handcrafted stop-motion aesthetic.
```

### Uploaded image

Accepted initial formats:

```text
PNG
JPEG
WebP
```

### Sketch

The user draws a rough composition.

### Sketch + prompt

Example:

```text
[rough drawing]

"Turn this into a Scandinavian cabin beside a frozen lake,
seen at dusk."
```

### Reference images

The user may attach visual references to guide:

* subject identity;
* style;
* clothing;
* object design;
* environment;
* layout.

---

# 13. Canvas Sizes

Provide useful presets:

```text
Square       1:1
Portrait     4:5
Landscape    16:9
Story        9:16
Classic      4:3
Custom
```

Internally store:

```ts
interface CanvasSize {
  width: number;
  height: number;
}
```

The project dimensions remain stable throughout an animation unless explicitly changed.

---

# 14. Creation Request

Conceptually:

```ts
interface GenerateRequest {
  prompt: string;

  width: number;
  height: number;

  modelProfile: "FAST" | "PRECISE";

  references: AssetReference[];
}
```

The server returns:

```ts
interface GeneratedImage {
  assetId: string;
  mimeType: string;
  width: number;
  height: number;

  model?: string;
  createdAt: number;

  generationMetadata?: Record<string, unknown>;
}
```

The original generated binary must be retained.

---

# 15. EDIT Mode

Edit mode is non-destructive.

Every successful AI transformation creates a new revision.

Never overwrite the source image.

Conceptually:

```text
Revision 1
    │
    ▼
Revision 2
    │
    ├────────▶ Revision 3A
    │
    └────────▶ Revision 3B
```

This is a revision graph rather than a single undo stack.

---

# 16. Editing Tools

Required tools:

```text
Select
Brush
Mask
Eraser
Sketch
Arrow
Comment
Crop
Hand
Zoom
```

---

# 17. Select

Allow:

* rectangular selection;
* freehand/lasso selection.

The selected region can guide an AI edit.

Example:

```text
[select jacket]

"Change this jacket to dark green wool."
```

The selection is guidance.

It should not be assumed that a generative model will respect a pixel-perfect hard boundary.

---

# 18. Mask

Allow the user to paint an explicit edit region.

Representation:

```ts
interface MaskStroke {
  points: Point[];
  radius: number;
  hardness: number;
}
```

The mask is stored separately from the image.

Before sending it to the backend it can be rasterized to a monochrome image.

---

# 19. Sketch

Sketch provides semantic visual guidance.

Examples:

* sketch a missing object;
* redraw the outline of an object;
* roughly reposition an arm;
* indicate a new room layout;
* draw the intended silhouette.

OpenAI's Images 2.5 release explicitly introduces sketch-based guidance as a creative workflow, which makes this interaction a natural fit rather than a workaround. ([OpenAI][1])

---

# 20. Arrow Tool

Arrows communicate spatial change.

Example:

```text
HAND ●──────────────→
```

An arrow has:

```ts
interface MotionArrow {
  id: string;

  start: Point;
  end: Point;

  label?: string;
}
```

In Edit mode an arrow may mean:

```text
Move this object here.
```

In Animate mode the same arrow becomes a motion constraint.

---

# 21. Comments

Comments are anchored to a location.

Example:

```text
               ○
               │
"Keep this face unchanged"
```

Data:

```ts
interface CanvasComment {
  id: string;
  anchor: Point;
  text: string;
}
```

Comments can be incorporated into AI edit instructions.

---

# 22. AI Edit Composition

A focused editing request may combine:

```text
current image
+
canonical reference image
+
mask
+
sketch overlay
+
arrows
+
comments
+
text instruction
```

The Generation Controller creates a normalized edit request.

Example conceptual instruction:

```text
Modify only the requested element.

Requested change:
Raise the character's right arm and place a ceramic coffee cup
in the hand.

Visual guidance:
The user has drawn an arrow showing the intended arm movement.

Preserve:
- character identity
- face
- camera
- background
- desk
- lighting
- clothing
- overall composition
```

Do not expose such generated system instructions as editable project content unless debug mode is enabled.

---

# 23. Preserve Constraints

Users should be able to mark important elements as persistent.

Examples:

```text
Lock character identity
Lock camera
Lock background
Lock lighting
Lock palette
Lock typography
```

These are semantic constraints, not literal frozen pixel layers.

Represent them as:

```ts
interface PreservationConstraint {
  id: string;
  type:
    | "SUBJECT"
    | "CAMERA"
    | "BACKGROUND"
    | "LIGHTING"
    | "STYLE"
    | "CUSTOM";

  description: string;
  referenceAssetId?: string;
}
```

---

# 24. Revision Model

```ts
interface Revision {
  id: string;

  parentId?: string;

  imageAssetId: string;

  createdAt: number;

  prompt?: string;

  modelProfile?: "FAST" | "PRECISE";

  annotations?: AnnotationSnapshot;

  generation?: GenerationRecord;
}
```

A revision can have multiple children.

Undo navigates to the parent.

Redo navigates to the previously selected child.

The revision browser allows explicit branch selection.

---

# 25. Revision History UI

The normal interface can show:

```text
Original
  ↓
Added cup
  ↓
Raised arm
  ↓
Changed lighting
```

An optional expanded history exposes branches:

```text
               ┌── Red coat
Original ─ Cup ┤
               └── Blue coat ─ Hat
```

The branch model makes visual experimentation cheap without destroying preferred versions.

---

# 26. ANIMATE Mode

Animate mode treats project images as frames in a stop-motion sequence.

Animation is **not video generation**.

Each final frame is a discrete image.

This directly exploits the model's ability to maintain visual consistency over successive edits. OpenAI's own Images 2.5 examples create videos from sequences of separately generated images, including cube rotation and other multi-turn edit sequences. ([OpenAI][1])

---

# 27. Animation Timeline

When Animate mode is selected:

```text
┌──────────────────────────────────────────────────────────────────┐
│ ◀   ▶   ▶ Play   ■ Stop      8 FPS       Loop       + Frame   │
├──────────────────────────────────────────────────────────────────┤
│ [01] [02] [03] [04] [05] [06] [07] [08] [09] [10] ...        │
└──────────────────────────────────────────────────────────────────┘
```

Frame thumbnails should indicate:

```text
normal frame
keyframe
generating
failed
manually edited
AI-generated
stale descendant
```

---

# 28. Frame Model

```ts
interface Frame {
  id: string;

  order: number;

  revisionId: string;

  durationMs?: number;

  keyframe: boolean;

  generatedFromFrameId?: string;

  motionInstruction?: string;

  status:
    | "READY"
    | "GENERATING"
    | "FAILED"
    | "STALE";
}
```

Frames point to revisions rather than directly to image assets.

This means every frame can itself retain edit history.

---

# 29. Create Animation From Image

Any image revision can become:

```text
Frame 1
```

The user selects:

```text
Animate
```

and the current image becomes the first animation frame.

Nothing is regenerated at this point.

---

# 30. Add Next Frame

The simplest animation operation is:

```text
+ Frame
```

The previous frame appears on the canvas.

The user may:

* type an instruction;
* draw over it;
* move something with arrows;
* add a mask;
* combine these operations.

Example:

```text
Raise his right arm slightly.
Everything else remains unchanged.
```

Flip-slop generates Frame 2 as an edit of Frame 1.

---

# 31. Incremental Motion

A stop-motion sequence should normally contain small visual changes.

Example:

```text
Frame 01    arm down
Frame 02    arm +8°
Frame 03    arm +16°
Frame 04    arm +24°
Frame 05    arm +32°
Frame 06    arm +40°
```

Large semantic jumps between adjacent frames should produce a warning:

```text
This change may create discontinuity.

Generate as:
[1 frame] [4 frames] [8 frames] [12 frames]
```

---

# 32. Onion Skinning

Animate mode must support onion skinning.

Options:

```text
Previous frame
Next frame
Previous + next
```

Opacity:

```text
10% ───────────── 70%
```

Conceptual render:

```text
current frame
+
previous frame at 35% opacity
```

The onion skin is a local Canvas operation.

It must never modify source image data.

---

# 33. Keyframes

Any frame may be promoted to:

```text
KEYFRAME
```

Keyframes define significant intended states.

Example:

```text
F01     F12                F24
●────────●──────────────────●

sitting  standing           waving
```

The user can manually create only these three images and ask Flip-slop to generate intermediate frames.

---

# 34. AI In-Between Generation

Command:

```text
Generate Between
```

Example:

```text
Frame 1
Character seated.

Frame 12
Character standing.
```

Flip-slop generates Frames 2–11.

This is not conventional pixel interpolation.

The application creates a **semantic motion plan** and then performs controlled image edits.

---

# 35. Motion Planning

For complex interpolation, use a language model as a planner.

Input:

```text
Start frame description
End frame description
Number of intermediate frames
Motion annotations
Preservation constraints
```

Output should be structured.

Example:

```json
{
  "frames": [
    {
      "index": 2,
      "instruction": "Shift torso slightly forward while keeping both feet fixed."
    },
    {
      "index": 3,
      "instruction": "Increase forward lean and move both hands toward the desk edge."
    },
    {
      "index": 4,
      "instruction": "Begin lifting the hips while preserving foot placement."
    }
  ]
}
```

Require structured output validated against a schema.

Do not permit arbitrary prose to control the batch-generation engine.

---

# 36. Motion Brush

Motion Brush is Flip-slop's characteristic animation interaction.

The user draws one or more arrows over a frame.

Example:

```text
              ↺ head

left hand ●──────────→

                  ↑
                  │ torso
```

The user chooses:

```text
6 frames
12 frames
24 frames
```

Flip-slop interprets those arrows as desired temporal changes.

---

# 37. Motion Constraint

```ts
interface MotionConstraint {
  id: string;

  type:
    | "TRANSLATE"
    | "ROTATE"
    | "SCALE"
    | "CUSTOM";

  region?: NormalizedBounds;

  vector?: {
    dx: number;
    dy: number;
  };

  description?: string;
}
```

The generated animation does not need to mathematically transform the selected pixels.

The geometry communicates intent to the generative model.

---

# 38. Motion Planning Example

User draws:

```text
right hand → 140px right
```

and requests:

```text
8 frames
```

The planner may produce:

```text
F2   move right hand slightly right
F3   continue movement; begin elbow extension
F4   hand reaches approximately 40% of destination
F5   hand reaches approximately 55%
F6   hand reaches approximately 70%
F7   hand reaches approximately 85%
F8   hand reaches destination
```

Each request also includes preservation constraints.

---

# 39. Animation Consistency Strategy

Naively feeding every generated frame into the next generation creates cumulative drift.

Flip-slop must actively resist this.

Use three levels of reference.

```text
CANONICAL REFERENCE
       +
CURRENT / PREVIOUS FRAME
       +
TARGET MOTION
       ↓
NEXT FRAME
```

---

# 40. Canonical Reference

Each animation sequence should have a canonical visual reference.

Usually:

```text
Frame 1
```

but the user may explicitly choose another image.

The canonical reference anchors:

* character appearance;
* objects;
* costume;
* background;
* camera;
* style.

---

# 41. Previous Frame

The immediately preceding frame provides local continuity.

It communicates:

```text
Where are we now?
```

The canonical image communicates:

```text
What must remain recognizable?
```

---

# 42. Target Keyframe

When generating between two keyframes, the target image may also be supplied as guidance where supported.

Conceptually:

```text
canonical reference
+
previous generated frame
+
target keyframe
+
specific transition instruction
```

This provides both continuity and destination.

---

# 43. Scene Bible

Each animation has a lightweight semantic definition.

```ts
interface SceneBible {
  description: string;

  subjects: SubjectDefinition[];

  environment?: string;
  camera?: string;
  lighting?: string;
  visualStyle?: string;

  immutableDetails: string[];
}
```

Example:

```text
SUBJECT
Small handmade clay robot.

IDENTITY
Square head.
Two circular amber eyes.
Blue painted metal body.
Small scratch above left eye.

CAMERA
Static medium shot.
50mm-equivalent perspective.
Eye level.

ENVIRONMENT
Wooden desk in small workshop.

LIGHTING
Warm morning light from camera left.

DO NOT CHANGE
Desk.
Camera position.
Robot proportions.
Background window.
```

The user should not have to manually author this in normal usage.

Flip-slop may derive an initial Scene Bible from the first frame and user instructions.

The user can inspect and correct it.

---

# 44. Drift Detection

After a generated frame returns, Flip-slop may optionally evaluate it against:

```text
canonical reference
previous frame
Scene Bible
```

The evaluation should check qualitative consistency such as:

```text
subject identity
camera stability
background consistency
object persistence
unexpected additions
unexpected removals
```

Result:

```ts
interface ConsistencyEvaluation {
  score: number;

  warnings: {
    category: string;
    severity: number;
    description: string;
  }[];
}
```

This should be advisory.

Do not silently reject generated images unless generation itself failed.

---

# 45. Repair Frame

If drift occurs:

```text
Frame 9
```

the user can select:

```text
Repair
```

Flip-slop creates a new revision of Frame 9 using:

* canonical reference;
* Frame 8;
* Frame 9;
* Scene Bible;
* a repair instruction.

Example:

```text
Restore the robot's original facial proportions and the missing
scratch above the left eye.

Preserve the pose and motion state of the current frame.
```

Sunburst is a suitable default for this precision-oriented operation.

---

# 46. Descendant Invalidation

Suppose:

```text
F1 → F2 → F3 → F4 → F5
```

The user changes F3.

Frames F4 and F5 were generated from the previous F3 and may now be inconsistent.

Mark them:

```text
STALE
```

Visually:

```text
F1   F2   F3'   F4⚠   F5⚠
```

Offer:

```text
Keep descendants
Regenerate descendants
Compare first
```

Do not automatically destroy them.

---

# 47. Regenerate Forward

Command:

```text
Regenerate From Here
```

Example:

```text
F13'
  ↓
F14'
  ↓
F15'
  ↓
F16'
```

The existing branch remains available in revision history.

This turns animation correction into branching history rather than destructive recomputation.

---

# 48. Frame Variants

A generated frame may have alternatives:

```text
Frame 8
 ├ A
 ├ B
 └ C
```

The user chooses one variant as active.

Animation descendants should reference the specific selected revision.

---

# 49. Batch Generation

Generating twelve frames should create an explicit batch job.

```ts
interface GenerationBatch {
  id: string;

  type:
    | "FRAMES"
    | "INBETWEEN"
    | "REGENERATE_FORWARD";

  frameIds: string[];

  status:
    | "QUEUED"
    | "RUNNING"
    | "COMPLETED"
    | "CANCELLED"
    | "FAILED";

  completed: number;
  total: number;
}
```

---

# 50. Generation Queue

Do not fire dozens of image requests blindly.

Implement a queue.

Default:

```text
concurrency = 1
```

Configurable:

```text
1–3
```

Sequential generation should remain the default for animations because later frames often depend on earlier results.

---

# 51. Cancellation

Every generation operation must be cancellable.

Example:

```text
Generating frames

████████░░░░░░░░  7 / 16

[ Stop ]
```

Stopping should:

* cancel future requests;
* attempt to abort current HTTP work;
* preserve completed frames;
* leave the project valid.

---

# 52. No Obsolete Results

Use request IDs.

Example:

```ts
interface GenerationRequest {
  id: string;
  generationEpoch: number;
}
```

If the user modifies the project while an obsolete request is running, its result must not automatically overwrite the newer project state.

The generated asset may still be retained as an unused revision.

---

# 53. Playback

Playback is local.

No OpenAI request is involved.

Use:

```ts
requestAnimationFrame()
```

while controlling frame presentation from a playback clock.

Do not assume browser rendering FPS equals animation FPS.

---

# 54. Supported Animation Rates

Provide:

```text
4 FPS
6 FPS
8 FPS
10 FPS
12 FPS
15 FPS
24 FPS
Custom
```

Default:

```text
8 FPS
```

This encourages a recognizable stop-motion aesthetic and keeps generation counts manageable.

---

# 55. Variable Frame Duration

Individual frames may optionally have custom duration.

Example:

```text
F01 125 ms
F02 125 ms
F03 500 ms
F04 125 ms
```

This allows pauses without duplicating frames.

---

# 56. Looping

Playback modes:

```text
Once
Loop
Ping-pong
```

Ping-pong is useful for very short generated sequences.

Example:

```text
1 2 3 4 5 4 3 2
```

---

# 57. Frame Operations

Timeline operations:

```text
Add
Duplicate
Delete
Move
Copy
Paste
Set keyframe
Unset keyframe
Regenerate
Repair
Generate before
Generate after
Generate between
```

Support drag-and-drop frame reordering.

---

# 58. Manual Drawing

Flip-slop is AI-first but must remain useful without an API call.

Brush operations are applied as editable overlay strokes.

Example:

```ts
interface BrushStroke {
  id: string;

  points: Point[];

  width: number;
  opacity: number;

  color: string;
}
```

The user may either:

```text
Flatten into image
```

or:

```text
Use as AI guidance
```

These are different operations.

---

# 59. Overlay Model

Annotations remain distinct from pixels.

```ts
type Annotation =
  | BrushStroke
  | MaskStroke
  | MotionArrow
  | CanvasComment
  | SelectionAnnotation;
```

Canvas rendering is:

```text
base image
+
onion skin
+
drawing overlays
+
selection
+
motion annotations
+
comments
+
tool UI
```

---

# 60. Canvas Rendering Pipeline

Recommended order:

```text
1. clear viewport

2. calculate image transform

3. render onion skin if enabled

4. render active image

5. render persistent drawing overlays

6. render mask visualization

7. render motion arrows

8. render selections

9. render comments

10. render active tool affordances
```

Use device-pixel-ratio-aware rendering.

---

# 61. Viewport

Support:

```text
Fit
100%
200%
400%
```

and arbitrary zoom.

Controls:

```text
mouse wheel       zoom
space + drag      pan
double click      fit
```

Touch support is desirable but desktop is the primary target.

---

# 62. Project Data Model

```ts
interface Flip-slopProject {
  version: number;

  id: string;
  name: string;

  createdAt: number;
  modifiedAt: number;

  canvas: {
    width: number;
    height: number;
  };

  assets: AssetRecord[];

  revisions: Revision[];

  frames: Frame[];

  activeRevisionId?: string;
  activeFrameId?: string;

  animation: AnimationSettings;

  sceneBible?: SceneBible;

  constraints: PreservationConstraint[];

  generationHistory: GenerationRecord[];
}
```

---

# 63. Asset Storage

Do not embed large base64 images directly in the main project JSON.

Store:

```text
metadata in IndexedDB
binary assets as Blob records
```

For very large projects, prefer OPFS where browser support is sufficient.

Asset:

```ts
interface AssetRecord {
  id: string;

  type:
    | "GENERATED_IMAGE"
    | "UPLOADED_IMAGE"
    | "MASK"
    | "REFERENCE"
    | "EXPORT";

  mimeType: string;

  width?: number;
  height?: number;

  createdAt: number;

  checksum?: string;
}
```

---

# 64. Autosave

Autosave project metadata after meaningful changes.

Debounce frequent input.

Example:

```text
500–1000 ms
```

Generation results must be persisted immediately after successful receipt.

A browser crash should not destroy a completed fifteen-frame generation batch.

---

# 65. Project Save Format

Support an explicit portable Flip-slop project.

Suggested extension:

```text
.Flip-slop
```

Internally it may be a ZIP archive:

```text
project.json

assets/
  01.webp
  02.webp
  03.webp

references/
  character.png

masks/
  mask-001.png

manifest.json
```

Do not make `.Flip-slop` dependent on the browser's IndexedDB implementation.

---

# 66. Image Export

Current frame:

```text
PNG
JPEG
WebP
```

Allow:

```text
original generated asset
```

or:

```text
flattened canvas
```

These are not necessarily identical because the flattened version may contain manual drawing overlays.

---

# 67. Animation Export

Required:

### PNG sequence

```text
Flip-slop-0001.png
Flip-slop-0002.png
Flip-slop-0003.png
...
```

### WebM

Render frames to Canvas and encode through browser media capabilities where supported.

### Animated WebP or GIF

At least one compact animated-image format should be supported.

A worker-based encoder may be used.

---

# 68. Export Frames at Source Resolution

Playback may use downscaled images for responsiveness.

Export must operate on project resolution.

Do not export a screen-sized Canvas snapshot when source frames have higher resolution.

Use an offscreen export canvas.

---

# 69. Contact Sheet

Provide:

```text
Export Contact Sheet
```

Example:

```text
┌──────┬──────┬──────┬──────┐
│ F01  │ F02  │ F03  │ F04  │
├──────┼──────┼──────┼──────┤
│ F05  │ F06  │ F07  │ F08  │
├──────┼──────┼──────┼──────┤
│ F09  │ F10  │ F11  │ F12  │
└──────┴──────┴──────┴──────┘
```

This is useful for evaluating visual continuity.

---

# 70. Provenance

Keep generation metadata associated with every AI-generated asset.

OpenAI states that Images 2.5 continues to use C2PA metadata and invisible watermarking. ([OpenAI][1])

Flip-slop should retain the untouched image binary returned by the API.

Important limitation:

```text
Canvas recomposition or re-encoding may strip source metadata.
```

Do not claim that C2PA metadata survives arbitrary Canvas exports.

Instead maintain a project provenance record:

```ts
interface GenerationRecord {
  id: string;

  timestamp: number;

  operation: "GENERATE" | "EDIT";

  model?: string;

  parentRevisionIds: string[];

  prompt?: string;

  generatedAssetId: string;
}
```

---

# 71. Backend API

Recommended Bun routes:

```text
POST /api/images/generate
POST /api/images/edit

POST /api/motion/plan
POST /api/consistency/evaluate

GET  /api/models
GET  /api/health
```

Only generation/edit routes are essential to the MVP.

---

# 72. OpenAI Gateway

Keep OpenAI logic isolated.

```text
server/
  openai/
    client.ts
    image-gateway.ts
    planning-gateway.ts
```

The browser must never receive:

```text
OPENAI_API_KEY
```

---

# 73. Input Validation

The server must validate:

```text
mime type
file size
dimensions
request size
frame count
model profile
text lengths
```

Do not allow the backend to fetch arbitrary user-supplied remote URLs.

References should be uploaded explicitly.

---

# 74. Generation Errors

Normalize model/API errors into application-level errors.

```ts
interface GenerationError {
  code:
    | "INVALID_INPUT"
    | "CONTENT_REJECTED"
    | "RATE_LIMIT"
    | "MODEL_UNAVAILABLE"
    | "TIMEOUT"
    | "NETWORK"
    | "UNKNOWN";

  message: string;

  retryable: boolean;
}
```

Do not expose raw provider stack traces to the browser.

---

# 75. Retry Behaviour

Automatic retry is acceptable for transient failures such as:

```text
network interruption
server overload
temporary rate limits
```

Use bounded exponential backoff.

Never repeatedly resubmit a request rejected because of its content.

---

# 76. Generation Cost Awareness

Animation can multiply image requests quickly.

Before a large batch, show:

```text
Generate 23 frames

Model: Flare
Frames: 23

[ Generate ]
```

If reliable pricing metadata is available, an estimated cost may be shown.

Do not hard-code pricing into the frontend.

---

# 77. Batch Protection

Set a configurable maximum batch size.

Initial recommendation:

```text
24 generated frames per operation
```

The user may create longer animations through multiple operations.

This prevents accidental generation of hundreds of expensive frames.

---

# 78. Keyboard Shortcuts

Suggested:

```text
V       Select
B       Brush
M       Mask
A       Arrow
C       Comment
H       Hand

Space   temporary Hand
+/-     Zoom

Cmd/Ctrl+Z       Undo
Cmd/Ctrl+Shift+Z Redo

←       Previous frame
→       Next frame

Space while timeline focused
        Play / Pause
```

Resolve shortcut conflicts contextually.

---

# 79. Suggested Source Structure

```text
src/
  app/
    App.ts
    ProjectController.ts
    CommandBus.ts
    UndoController.ts

  canvas/
    CanvasEngine.ts
    Camera2D.ts
    CoordinateSystem.ts
    Renderer.ts

    tools/
      Tool.ts
      SelectTool.ts
      BrushTool.ts
      MaskTool.ts
      SketchTool.ts
      ArrowTool.ts
      CommentTool.ts
      CropTool.ts
      HandTool.ts

  project/
    Flip-slopProject.ts
    Asset.ts
    Revision.ts
    Frame.ts
    SceneBible.ts
    Constraints.ts

  generation/
    GenerationController.ts
    GenerationQueue.ts
    BatchController.ts
    EditComposer.ts
    DriftController.ts

  animation/
    AnimationController.ts
    PlaybackClock.ts
    MotionConstraint.ts
    OnionSkin.ts
    FrameInterpolator.ts

  storage/
    ProjectRepository.ts
    AssetRepository.ts
    IndexedDb.ts
    OpfsStore.ts

  export/
    ImageExporter.ts
    SequenceExporter.ts
    VideoExporter.ts
    ContactSheetExporter.ts
    ProjectExporter.ts

  ui/
    Toolbar.ts
    PromptPanel.ts
    ModeSelector.ts
    Timeline.ts
    RevisionBrowser.ts
    Inspector.ts
    ExportDialog.ts

  workers/
    export.worker.ts
    image.worker.ts

server/
  index.ts

  routes/
    images.ts
    motion.ts

  openai/
    client.ts
    ImageModelGateway.ts
    OpenAIImageGateway.ts

tests/
```

---

# 80. Testing

Use:

```bash
bun test
```

with:

```ts
import { describe, test, expect } from "bun:test";
```

---

# 81. Required Unit Tests

Test:

```text
coordinate conversion

project serialization

revision branching

undo / redo

frame insertion

frame deletion

frame reordering

stale descendant detection

batch cancellation

generation queue ordering

motion-plan schema validation

project migration

asset reference counting
```

---

# 82. Canvas Tests

Canvas logic should remain separable enough to test:

```text
screen → project coordinate transformation

zoom around cursor

pan

fit-to-screen

annotation hit testing

mask bounds

motion-arrow calculation
```

Avoid putting domain state directly inside mouse-event handlers.

---

# 83. Generation Tests

Use a mock `ImageModelGateway`.

Verify:

```text
CREATE generates revision

EDIT retains parent

frame generation references previous frame

repair retains target pose revision

cancelled generation does not mutate active state

late API response cannot overwrite newer revision
```

Do not require real OpenAI API calls for normal automated tests.

---

# 84. End-to-End Demo Scenario

The finished application must support the following demonstration without pre-rendered animation.

## Step 1 — Create

Prompt:

```text
A tiny handmade clay robot sitting at a wooden desk in a small
workshop, warm morning sunlight, tactile stop-motion aesthetic.
```

Generate.

The resulting image appears on the Canvas.

---

## Step 2 — Edit

Circle the desk.

Prompt:

```text
Add a small red ceramic coffee mug here.
Preserve everything else.
```

Generate.

The mug appears.

---

## Step 3 — Directed edit

Select the robot's right arm.

Draw an arrow toward the mug.

Prompt:

```text
Move the right hand to grasp the mug.
```

Generate.

The new image becomes another revision.

---

## Step 4 — Animate

Select:

```text
ANIMATE
```

The current image becomes Frame 1.

---

## Step 5 — Motion Brush

Draw an upward arrow from the robot's hand.

Instruction:

```text
Lift the mug toward the robot's mouth.
```

Choose:

```text
8 frames
```

Flip-slop generates the sequence.

---

## Step 6 — Playback

Press:

```text
▶
```

The robot lifts the mug.

The application is showing eight independently generated images in sequence.

---

## Step 7 — Onion skin

Pause at Frame 5.

Enable:

```text
Previous frame 35%
```

The previous pose becomes visible underneath the active frame.

---

## Step 8 — Repair

Frame 6 accidentally changes the robot's eye shape.

Select:

```text
Repair
```

Instruction:

```text
Restore the original eyes.
Preserve the current pose.
```

Use Sunburst.

---

## Step 9 — Regenerate forward

Frame 6 now has a corrected revision.

Frames 7 and 8 become stale.

Select:

```text
Regenerate From Here
```

New Frames 7 and 8 are generated from the corrected branch.

---

## Step 10 — Export

Export:

```text
robot-coffee.webm
```

and:

```text
robot-coffee.Flip-slop
```

The first is the finished animation.

The second is the complete editable project.

---

# 85. Second Demo Scenario: Keyframe Animation

This should demonstrate that Flip-slop is more than sequential prompting.

Create:

```text
Frame 1
A paper aeroplane resting on a desk.
```

Create a second keyframe:

```text
Frame 16
The same paper aeroplane near the opposite side of the room,
still airborne.
```

Draw a curved motion path:

```text
       ______
      /      \
●────         ────→●
```

Choose:

```text
Generate Between
15 frames
```

Flip-slop creates a motion plan and generates the intermediate stop-motion sequence.

The keyframes remain untouched.

---

# 86. Visual Design

Flip-slop should look like a creative tool, not an enterprise dashboard.

Use:

* neutral work surface;
* large uninterrupted canvas;
* compact controls;
* clear selected states;
* restrained shadows;
* strong typography;
* highly legible frame thumbnails.

The generated artwork supplies most of the colour.

Avoid:

* excessive gradients;
* futuristic AI imagery;
* glowing borders;
* huge prompt boxes;
* decorative chat bubbles.

---

# 87. Interaction Character

The application should feel direct.

Good:

```text
Draw arrow
Choose 8 frames
Generate
```

Bad:

```text
Open animation wizard
Choose transformation strategy
Choose generation methodology
Configure frame synthesis
Confirm
```

Complexity should exist in the implementation, not in routine user interactions.

---

# 88. Responsive Behaviour

Desktop is primary.

Minimum practical viewport:

```text
1280 × 720
```

Smaller screens may collapse:

```text
tool palette
inspector
prompt panel
```

into drawers.

The Canvas must remain visible.

---

# 89. Accessibility

At minimum:

* keyboard-accessible commands;
* visible focus states;
* labels for icon controls;
* tooltips;
* non-colour indications for keyframes and failed frames;
* configurable motion-animation reduction for UI effects;
* adequate contrast.

AI-generated image content itself is outside the application's direct accessibility guarantee, but project images should support an optional description field.

---

# 90. Performance Targets

For ordinary projects:

```text
Canvas interaction        60 FPS
Pan / zoom                60 FPS
Timeline interaction      immediate
Frame switching           <100 ms when cached
Autosave                  non-blocking
```

Large image decoding should occur asynchronously.

Use `createImageBitmap()` where appropriate.

Do not repeatedly decode the same asset.

---

# 91. Image Cache

Maintain a bounded decoded-image cache.

Example:

```text
current frame
previous frame
next frame
canonical reference
recent frames
```

Release old `ImageBitmap` resources.

Do not keep every full-resolution frame decoded indefinitely.

---

# 92. Thumbnail Generation

Generate animation thumbnails once and cache them.

Do not display full-resolution source images scaled down inside dozens of timeline cells.

Thumbnail generation can use `OffscreenCanvas`.

---

# 93. Large Projects

A project with:

```text
100 frames × large images
```

can consume substantial memory and storage.

The application must distinguish:

```text
stored binary
```

from:

```text
decoded bitmap in memory
```

Only a small working set should remain decoded.

---

# 94. Offline Behaviour

Projects should remain browsable and editable locally when the API is unavailable.

Offline-capable operations include:

```text
open project
draw
annotate
change frame order
play animation
export existing frames
save project
```

Generation operations clearly report that network access is required.

---

# 95. Security

The browser must never store the OpenAI API key.

Server configuration only:

```env
OPENAI_API_KEY
```

Apply:

* request size limits;
* upload validation;
* strict MIME handling;
* no arbitrary shell execution;
* no arbitrary remote file fetching;
* safe generated filenames;
* server-side error normalization.

---

# 96. Explicit Non-Goals

The first version is not:

* Photoshop;
* After Effects;
* Blender;
* a vector illustration package;
* a conventional frame-by-frame painting program;
* a full video editor;
* a video-generation frontend;
* a skeletal animation system;
* a motion-capture tool;
* an optical-flow research platform.

Its purpose is narrower:

> Create an image, transform it precisely, and turn controlled transformations into editable stop-motion animation.

---

# 97. MVP Boundary

The MVP must contain:

```text
CREATE
text-to-image
upload image
sketch guidance
Flare / Sunburst selection

EDIT
selection
mask
brush/sketch
arrow
comments
AI edit
revision history
undo/redo

ANIMATE
frame timeline
add frame
duplicate frame
delete frame
incremental AI frame generation
onion skin
playback
FPS control
keyframes
Generate Between
Motion Brush
repair frame
stale descendants
regenerate forward

SAVE
IndexedDB persistence
.Flip-slop project export/import

EXPORT
PNG
PNG sequence
one animation format
```

Everything else is secondary.

---

# 98. Features Explicitly Deferred Until After MVP

Potential later additions:

```text
audio track

sound synchronization

camera-motion planning

multi-scene projects

automatic lip synchronization

character libraries

shared projects

cloud persistence

collaboration

real-time co-editing

advanced rotoscoping

segmentation layers

automatic background separation

traditional tweening

optical-flow interpolation

video import

video-to-stop-motion conversion
```

Do not implement these before the core revision/frame model is solid.

---

# 99. Core Architectural Invariant

There must be no separate "image editor project" and "animation project".

The dependency chain is:

```text
Asset
  ↓
Revision
  ↓
Frame
  ↓
Animation
```

A frame references a revision.

A revision references an asset.

An animation is an ordered collection of frames.

This makes every animation frame inherently editable and every edited image inherently capable of becoming a frame.

---

# 100. Core Generative Invariant

Animation must not be implemented as:

```text
Generate a completely new image
Generate another completely new image
Generate another completely new image
...
```

Instead:

```text
canonical visual identity
        +
previous state
        +
explicit change
        +
preservation constraints
        ↓
next state
```

This is the central technical idea behind Flip-slop.

---

# 101. Definition of Done

Flip-slop is complete when a user can:

1. launch it with Bun;
2. create an image using an OpenAI image model;
3. upload an existing image instead;
4. sketch directly on the Canvas;
5. select or mask a region;
6. describe an edit;
7. generate a revised image without destroying the previous revision;
8. branch revision history;
9. turn any revision into an animation frame;
10. create additional frames through AI edits;
11. use onion skinning to inspect motion;
12. draw motion arrows directly over the image;
13. generate a multi-frame motion from those instructions;
14. define keyframes;
15. generate semantic in-between frames;
16. play the resulting sequence locally;
17. modify a single problematic frame;
18. detect that dependent frames may now be stale;
19. regenerate subsequent frames from the corrected state;
20. save and reopen the complete project;
21. export an individual image;
22. export the complete image sequence;
23. export a playable stop-motion animation;
24. preserve original generated assets and generation history;
25. remain responsive while generation and export operations are running.

The finished application should make the distinction between image generation and visual creation disappear.

A user should be able to start with a sentence, alter the result with words and gestures, make it move, correct individual moments, and save the whole process as one editable artifact.

**Flip-slop is a canvas first, an AI interface second, and a stop-motion studio when time is added to the canvas.**

The specification deliberately makes animation a temporal extension of the image revision model, rather than bolting a video feature onto an image generator. That is the architectural property I would preserve even if individual UI features are cut from the first implementation.

[1]: https://openai.com/index/introducing-chatgpt-images-2-5/ "Introducing ChatGPT Images 2.5 | OpenAI"
