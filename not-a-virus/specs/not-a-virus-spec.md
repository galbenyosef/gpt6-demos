# NotAVirus

**A cartoon that follows your mouse. It is not a virus.**

Specification revision: 0.3  
Platform: macOS first (Linux and Windows explicitly out of scope)  
Language: Rust  
UI: AppKit via `objc2`  
Document status: implementation spec for v1 / v1.1

Revision 0.3 grounds the character briefs in the supplied Paco and gatita reference images, building on the pack, clip, transition, and movement contract from revision 0.2. The pack format remains `schema = 1`: this is a revision of the unpublished v1 contract, not a migration of released packs.

---

## 1. Product

### 1.1 One-liner

NotAVirus is a menu-bar macOS app that draws a small animated character in a transparent, always-on-top panel. The character trots after the pointer, idles when you stop, and never steals clicks unless you ask it to.

### 1.2 Why this name

The joke is the point. A sprite glued to the cursor *looks* like the kind of thing a scare-site would warn you about. The app leans into that:

- Bundle name: `NotAVirus.app`
- Binary name: `notavirus`
- Menu-bar tooltip: `Not a virus`
- First-run copy: short, dry, no onboarding carousel
- About panel: “It follows the mouse. That is the entire product.”

Tone: deadpan utility, not “AI companion,” not “wellness pet,” not Copilot with ears.

### 1.3 v1 user-facing behaviour

On launch:

1. No Dock icon.
2. A status item appears in the menu bar (simple mark, e.g. `‽` or a tiny sprite).
3. A default pack loads (shipped inside the app bundle).
4. A borderless transparent panel appears and the character starts lagging behind the cursor.
5. Clicks pass through the character to whatever is underneath.
6. Status item menu: Pause, Click-through (on), Packs ▸, Size ▸, About, Quit.

The character:

- Faces the direction of travel.
- Plays the pack's moving clip while chasing, including catching up after the pointer stops.
- Optionally plays a start clip before moving and a stop clip when it arrives.
- Plays the pack's idle clip after arriving; optionally sleeps after a longer rest.
- Optionally plays a turn clip when facing flips and a wake clip when leaving sleep.
- Uses the active pack's speed and acceleration, so different characters feel different to move.
- Stays on the screen that currently contains the pointer.
- Is clamped to `visibleFrame` (avoids the menu bar and Dock).
- Does not request Accessibility, Screen Recording, or Input Monitoring.

### 1.4 Non-goals (v1)

- Linux, Windows, X11, Wayland, Electron.
- Climbing real windows, sitting on the Dock, bouncing on the menu bar.
- Chat, LLM, voice, “memory,” telemetry.
- Overlaying exclusive-fullscreen games reliably.
- App Store sandbox (v1 is Developer ID / ad-hoc local).
- Native plugin `.dylib`s.
- Spine / Lottie / video clips.
- Multi-pet physics.
- Physical jumps, orbiting, or obstacle navigation. In v1, a kitten's hops are drawn into its moving clip; its ground position follows the same configurable chase model.
- Settings sync / iCloud.

---

## 2. Design principles

1. **The engine is boring. The packs are the product.**  
   New characters are folders, not pull requests.

2. **A small window, not a full-screen overlay.**  
   The panel is the sprite’s bounding box (plus a little padding). Move the window; do not composite a desktop-sized surface.

3. **Click-through by default.**  
   If it blocks Mail, it gets uninstalled in four minutes.

4. **No extra permissions.**  
   Global mouse position comes from AppKit. If a feature needs TCC prompts, it is not v1.

5. **Main thread owns AppKit.**  
   Simulation may be cheap enough to live there too. Do not touch `NSWindow` off the main thread.

6. **Fail a pack, not the app.**  
   A broken zip must log and skip. The last good pack (or the bundled default) stays up.

---

## 3. Platform behaviour (macOS)

### 3.1 Process model

- `LSUIElement = YES` (agent app, no Dock, no app-switcher tile).
- `NSApplicationActivationPolicy::Accessory`.
- Single instance. A second launch activates the existing status item and exits.
- Lives until Quit. Closing the panel is not a thing; there is no close box.

### 3.2 Panel

Create an `NSPanel` (not a standard `NSWindow`):

| Property | Value |
|---|---|
| Style | borderless + nonactivatingPanel |
| Opaque | false |
| Background | clear |
| Shadow | off |
| Level | `NSFloatingWindowLevel` |
| Collection behaviour | `CanJoinAllSpaces` \| `FullScreenAuxiliary` \| `Stationary` |
| Ignores mouse events | `true` in chase mode |
| Hides on deactivate | `false` |
| Floating panel | `true` |
| Becomes key only if needed | `true` |
| Movable by background | `false` |
| Aspect / resize | not user-resizable |

Size = pack tile size × user scale (1.0 / 1.5 / 2.0), in points.  
`contentsScale` follows the screen’s `backingScaleFactor`.

When the pointer crosses displays, move the panel to that `NSScreen` and update scale if Retina-ness changed.

### 3.3 Cursor and movement

Each tick:

```text
p = NSEvent.mouseLocation          // global, bottom-left, screen points
screen = NSScreen containing p
target_origin = p - pack.anchor_in_points
target_origin = clamp_panel_origin(target_origin, screen.visibleFrame, panel_size)
target_distance = length(target_origin - panel_origin)
update_chase_request_and_behavior(dt, target_distance)
advance_motion_if_allowed(dt, target_origin)
panel.setFrameOrigin(panel_origin)
```

All movement values use macOS screen points, seconds, and points/second; never call them pixels. Frame coordinates use atlas pixels. User scale changes the artwork and anchor, not the configured movement speed or chase distances.

Keep separate signals:

| Signal | Meaning |
|---|---|
| `cursor_speed` | Length of cursor displacement / elapsed time |
| `character_speed` | Length of actual panel displacement / elapsed time |
| `target_distance` | Distance from panel origin to the clamped target origin |
| `cursor_still_ms` | Continuous time with `cursor_speed <= 4` points/second |
| `rest_ms` | Continuous time in idle/sleep with no chase request and a still cursor; resets otherwise |

Use the clamped target when measuring arrival, so a pointer at a screen edge cannot cause endless chasing of an unreachable point. On display changes, place/clamp the panel on the destination display, reset velocity and cursor sampling, and treat the relocation as a teleport rather than travel for animation/facing purposes. Do the same velocity reset after a size change; preserve the visual anchor where possible before clamping. If a scaled tile is larger than the visible frame, reduce its effective scale to fit.

Chasing uses two distances to avoid repeated standing/sitting from tiny mouse movements:

- Set `chase_requested = true` when `target_distance >= motion.start_distance`.
- While chasing, clear it only after `target_distance <= motion.stop_distance` continuously for `behavior.idle_delay_ms`; reset this arrival timer whenever the distance exceeds the stop distance.
- Between the two distances, preserve the previous request. Pointer speed alone never ends a chase.
- Keep updating the request during transition clips, including while movement is held.

While the behavior permits movement, approach the target with a speed cap and acceleration. With `d = max(target_distance - stop_distance, 0)`:

```text
desired_speed = min(max_speed, sqrt(2 * acceleration * d))
desired_velocity = direction_to_target * desired_speed
velocity = move_towards(velocity, desired_velocity, acceleration * dt)
panel_origin += velocity * dt
```

At or inside the stop distance, set velocity to zero. If an integration step would enter that radius, shorten it to the first intersection and zero velocity, preventing overshoot. Clamp to the visible frame after integration and remove velocity directed outside its bounds. Held phases keep the panel still and velocity zero; the speed ramp starts when movement resumes. Use simulation steps no larger than 1/120 s and cap a single tick's elapsed time at 100 ms; do not fast-forward through a long system suspension.

Facing follows horizontal character velocity when its magnitude exceeds 8 points/second; otherwise preserve the previous facing. Before a start/wake clip, face toward the target if the horizontal gap exceeds 2 points. Vertical movement alone does not flip the character. Movement and animation use the same bounded simulation clock; Pause freezes both clocks and their timers.

Install both:

- `NSEvent.addGlobalMonitorForEvents(.mouseMoved | .leftMouseDragged | …)`
- `NSEvent.addLocalMonitorForEvents(same)`

Global monitors do not fire when this app is active; local ones do. Display-link still polls `mouseLocation` so a static cursor is fine even if monitors hiccup.

### 3.4 Display link

Drive the tick from `CVDisplayLink` (or `CADisplayLink` on recent macOS) attached to the screen the panel is on. Fallback: `Timer` at 60 Hz on the main run loop. Pause the link when the app is paused or the lid is shut if that is cheap to detect; otherwise just keep ticking, it is a 128px blit.

### 3.5 Click-through vs interactive

v1 ships chase-only (`ignoresMouseEvents = true`).

v1.1 optional “Pet me”:

- Default remains click-through.
- If enabled, `ignoresMouseEvents = false` only while the cursor is over a pixel whose atlas alpha > threshold (e.g. 16). Otherwise set it back to true.
- Hit-testing uses the current frame’s bitmap, not the window rect.
- Right-click on opaque pixels can show the same menu as the status item.

Do not implement event forwarding gymnastics in v1.

### 3.6 Spaces, Stage Manager, fullscreen

- `CanJoinAllSpaces` so the pet is not left on Desktop 3.
- `FullScreenAuxiliary` so it has a chance to survive a Safari fullscreen video.
- Accept disappearance over exclusive Metal/game fullscreen. Do not fight it.
- Do not try to sample other apps’ window lists in v1.

### 3.7 Permissions

v1 must launch with **zero** TCC dialogs.

Allowed:

- Reading `NSEvent.mouseLocation`
- Drawing our own window
- Reading pack files from the bundle and Application Support

Forbidden in v1:

- `CGEvent` tap
- Accessibility APIs
- Screen capture / `CGWindowListCreateImage`
- Injecting input

---

## 4. Animation system

### 4.1 Packs are the extension point

A **pack** describes one selectable character: its images, animation clips, behavior roles, and movement settings. A **clip** is a sequence of frames, such as running or standing up. A **role** tells the engine when to use a clip. One pack can contain many clips; different characters are separate packs. Only one pack is active at a time in v1.

A pack is a directory or a `.petpack` zip:

```text
paco/
  pack.toml
  atlas.png
  atlas.json          # optional, if not using grid tiles
  preview.png         # status/about thumbnail
  sounds/             # ignored in v1
```

`.petpack` = zip of that directory, `pack.toml` at the root of the zip (or one folder deep). Max uncompressed size: 32 MiB. Max atlas dimension: 4096 on a side.

Runtime artwork is a **static transparent PNG sprite sheet**, not a self-playing image. The engine selects a frame and its duration, so it can respond to the mouse, pause, switch clips, and flip facing consistently. Grid tiles are the simplest authoring format; named frame regions are optional.

| Asset format | Contract |
|---|---|
| Static PNG sprite sheet | Required runtime format in v1 |
| Separate transparent PNG frames | Suitable source artwork; assemble into a sheet before packaging. An automatic importer is a future authoring tool, not required in v1. |
| APNG / GIF | Possible future import/preview formats; not accepted as runtime animation assets in v1. Any importer must convert to complete PNG frames and preserve timing. |
| Video, Spine, Lottie | Out of scope for v1 |

Image files describe appearance; `pack.toml` describes reactions. An animated image alone cannot define chasing or transitions. Paco's huffing and puffing and gatita's purring are conveyed visually in v1; the engine does not play audio.

Search order:

1. `NotAVirus.app/Contents/Resources/packs/`
2. `~/Library/Application Support/NotAVirus/packs/`
3. User-dropped `.petpack` files copied into (2) on import

Hot-reload v1.1: watch Application Support with `notify`. On change, debounce 300 ms, reload that pack if it is active.

### 4.2 `pack.toml` schema (v1)

Complete example for Paco (frame indices describe the layout of artwork to be created; his visual reference and expression requirements are in §12.2):

```toml
schema = 1
id = "paco"                 # [a-z0-9_-]+
name = "Paco"
author = "NotAVirus"
version = 1
tile = [128, 128]           # frame size in atlas pixels
anchor = [64, 116]          # ground contact, from the frame's top-left
filter = "nearest"         # nearest | linear; default nearest

[atlas]
file = "atlas.png"
grid = [8, 4]               # columns, rows; indices start at top-left, row-major
# Alternative to grid: regions = "atlas.json"

[behavior]
preset = "chase"
idle = "sit_and_wipe"
moving = "huffing_run"
start_moving = "stand_up"
stop_moving = "sit_down"
turn = "turn_around"
sleep = "doze"
idle_delay_ms = 250
sleep_after_ms = 12000

[motion]
max_speed = 180             # screen points / second
acceleration = 500          # screen points / second squared
stop_distance = 24          # distance from the clamped target origin
start_distance = 40         # must be greater than stop_distance

[states.sit_and_wipe]
frames = [0, 1, 2, 1]       # indices into grid, or names
fps = 6
loop = true

[states.huffing_run]
frames = [8, 9, 10, 11]
fps = 12
loop = true
flip = "velocity"           # none | velocity | always_left | always_right

[states.stand_up]
frames = [16, 17, 18]
fps = 10
loop = false
interrupt = "finish"

[states.sit_down]
frames = [18, 17, 16]
fps = 10
loop = false
interrupt = "on_move"

[states.turn_around]
frames = [20, 21]
fps = 12
loop = false
interrupt = "finish"

[states.doze]
frames = [24, 25]
fps = 2
loop = true
```

`[states.<name>]` defines a clip, not a hardcoded engine state. Names are chosen by the author and referenced by `[behavior]`. The two required **roles** are `idle` and `moving`; the corresponding clip names need not be `idle` and `run`.

#### Defaults and role mapping

| Setting | Default / requirement |
|---|---|
| `behavior.preset` | `"chase"`; the only preset in v1 |
| `behavior.idle` | `"idle"`; must resolve to a looping clip |
| `behavior.moving` | `"run"`; must resolve to a looping clip |
| `behavior.start_moving` | Optional one-shot; standing up or preparing to pounce |
| `behavior.stop_moving` | Optional one-shot; sitting down or settling |
| `behavior.turn` | Optional one-shot |
| `behavior.sleep` | Optional looping clip |
| `behavior.wake` | Optional one-shot; only valid when a sleep role exists |
| `behavior.idle_delay_ms` | `250`; continuous arrival time before resting |
| `behavior.sleep_after_ms` | `12000`; continuous `rest_ms` before sleeping; unused without sleep |
| `motion.max_speed` | `360` points/second |
| `motion.acceleration` | `1200` points/second squared |
| `motion.stop_distance` | `24` points |
| `motion.start_distance` | `40` points |

Omitting `[behavior]` and `[motion]` uses these defaults. Optional roles are enabled only when explicitly mapped; a similarly named clip is not automatically enabled. A missing optional role skips that transition; an explicitly mapped but missing clip is a validation error.

#### Clip and frame contract

- `frames` is a nonempty ordered array of zero-based grid indices or named regions. Use only indices with a grid and only names with a regions file.
- `fps` is positive and defaults to `8`. Alternatively provide `durations_ms = [100, 100, 250, 100]`, with one positive duration per frame. Explicit `fps` and `durations_ms` are mutually exclusive.
- `loop` defaults to `true`. Required idle/moving and optional sleep clips must loop. Transition clips and every clip in their `next` chain must be one-shots (`loop = false`).
- A one-shot may specify `next = "another_clip"` to create a sequence, for example sit down → wipe forehead → settle. The last clip omits `next` and returns control to the behavior engine. `next` is invalid on looping clips; missing references and cycles are rejected at load time.
- `interrupt` is `"finish"` (default) or `"on_move"` for one-shots. Loops are always interruptible and must omit this field. See §4.4 for exact behavior.
- `flip` defaults to `"velocity"`, preserving the last facing while resting. All source art faces right. `none` displays unmirrored art; `always_left` mirrors it; `always_right` displays it unmirrored. Turn clips are drawn in the new facing; they do not animate a second mirror operation.
- `anchor` is a common ground-contact point for every frame. For user scale `s`, its AppKit offset is `(anchor.x * s, (tile.h - anchor.y) * s)`. Mirror the artwork about the vertical line through this anchor, so facing changes do not move the feet. Authors must leave enough transparent space for mirrored artwork to remain inside the tile.
- A regions file maps names to `{x, y, w, h}` in top-left atlas pixels. Exactly one of `grid` or `regions` is required. In v1, all regions must have the declared tile dimensions and be unrotated/untrimmed; trimmed or rotated atlas formats require a later importer.
- The grid image dimensions must equal `(columns * tile.w, rows * tile.h)`. Referenced indices/regions must exist and fit inside the PNG. Use one static RGBA PNG atlas in v1; reject an APNG supplied as the atlas instead of silently using its first frame.

Validate finite positive speeds/acceleration, `0 <= stop_distance < start_distance`, nonnegative idle delay, positive sleep delay, positive tile dimensions, and an anchor within the tile. All referenced files must resolve inside the pack. Invalid values, unknown enum values, unsupported presets, or unknown schema versions reject the pack with a useful reason while the current pack stays active. Unknown metadata keys may be ignored with a warning; unknown keys in atlas, behavior, motion, or clip configuration are errors so misspelled behavior is not silently lost.

The earlier draft's ambiguous `speed_gt` / `speed_lt` rule list is replaced by the chase contract below. `[[rules]]` is not accepted in schema 1. Advanced custom rules are a possible later schema extension, not required to author either example character.

### 4.3 Runtime types

Illustrative core types (no AppKit dependencies):

```rust
struct PackId(String);
struct ClipId(String);

struct Pack {
    id: PackId,
    name: String,
    version: u32,
    tile: UVec2,
    anchor: Vec2,          // frame pixels; convert using the selected scale
    atlas: Atlas,
    clips: HashMap<ClipId, Clip>,
    behavior: ChaseBehavior,
    motion: MotionConfig,
}

struct ChaseBehavior {
    idle: ClipId,
    moving: ClipId,
    start_moving: Option<ClipId>,
    stop_moving: Option<ClipId>,
    turn: Option<ClipId>,
    sleep: Option<ClipId>,
    wake: Option<ClipId>,
    idle_delay: Duration,
    sleep_after: Duration,
}

struct MotionConfig {
    max_speed: f32,
    acceleration: f32,
    stop_distance: f32,
    start_distance: f32,
}

struct Clip {
    frames: Vec<Frame>,
    looped: bool,
    next: Option<ClipId>,
    interrupt: InterruptPolicy,
    flip: FlipMode,
}

struct Frame {
    uv: Rect,
    duration: Duration,
}

enum FlipMode { None, FromVelocity, AlwaysLeft, AlwaysRight }
enum InterruptPolicy { Finish, OnMove }
enum Phase { Idle, Starting, Moving, Turning, Stopping, Sleeping, Waking }
```

The player stores the phase separately from the active clip. A sequence of clips can remain in the same phase; swapping artwork never changes the movement policy implicitly.

### 4.4 Behavior and player

On pack load, enter the idle role, reset all timers and velocity, and set facing right. Evaluate the chase request on the first tick. On each simulation step, choose at most one behavior transition, apply that phase's motion policy, and advance the active clip. Re-selecting the same phase/clip does not restart its playback clock.

| Current phase | Condition | Result |
|---|---|---|
| Idle | Chase requested | Starting if mapped, otherwise Moving |
| Sleeping | Chase requested | Waking if mapped; otherwise Starting if mapped; otherwise Moving |
| Idle | No chase, sleep mapped, `rest_ms >= sleep_after_ms` | Sleeping |
| Moving | Chase request cleared after arrival | Stopping if mapped, otherwise Idle |
| Moving | Still chasing and facing changed | Turning if mapped, otherwise stay Moving with new facing |
| Starting / Waking / Turning | Entire one-shot chain finished | Moving if chasing; otherwise Stopping if mapped, otherwise Idle |
| Stopping | Entire one-shot chain finished | Starting (or directly Moving) if chasing; otherwise Idle |

Idle, Sleeping, Starting, Waking, and Stopping hold the panel still. Moving and Turning permit following. A wake sequence **replaces** the start sequence when waking from sleep; it does not play both. A turn sequence continues following, with direction changes applied immediately even while the clip finishes.

For Paco, the normal cycle is:

```text
sit_and_wipe (loop)
  → mouse pulls far enough away → stand_up (once, position held)
  → huffing_run (loop, chase until caught up)
  → arrival delay → sit_down (once, position held)
  → sit_and_wipe (loop)
  → prolonged rest → doze (loop)
```

#### Completion, interruption, and precedence

Apply this order; do not use unspecified first/last matching rules:

1. **App controls:** Quit ends playback. A successful pack switch replaces the player. Pause freezes position, facing, frame, and all timers without resetting them; Resume samples the current cursor with a fresh velocity baseline and continues. Failed pack loads do not disturb playback.
2. **Active one-shot:** `finish` completes the current clip. `on_move` may interrupt it while in Stopping and `chase_requested` is true; cancel the remaining stop sequence and enter Starting (or Moving if absent). In all other phases it behaves as `finish`. A facing flip never interrupts or restarts a one-shot. Authors who need a complete sit-down before standing should use `finish` for that clip.
3. **Completed one-shot:** Follow `next` if present, retaining the phase. Otherwise use the completion row above with the latest chase request. During a multi-clip stop sequence, apply `on_move` for the next clip before playing it if a chase is already pending.
4. **Looping phase:** Movement demand takes precedence over sleeping; arrival takes precedence over turning. Sleeping is considered only from Idle, never in the middle of a transition. A turn event seen during another one-shot is consumed by updating facing, not queued to replay later.

Clip time carries across loop boundaries and `next` edges, including when one simulation step passes multiple short frames. Once a chain returns to the behavior engine, enter the selected clip at time zero. Continuous idle/sleep playback does not reset `rest_ms`; movement demand, a moving cursor, or entering any transition phase does. The sleep timer therefore starts after the character has settled, not when a distant pointer first stops.

An absent transition is an immediate role change. Transition clips are optional, but mapping one obliges the engine to honor its hold/follow policy and interruption setting.

### 4.5 Renderer (Mac)

v1 renderer:

- `NSView` with a `CALayer`
- `layer.setContents(atlas CGImage)`
- `contentsRect` = current frame UV (AppKit rect is unit space, y-flipped vs some atlas formats — convert once at pack load)
- Apply `flip_x` around the frame's anchor (including the necessary translation), not around an arbitrary cropped region center
- Nearest-neighbor if the pack is pixel art (`magnificationFilter = nearest`); linear otherwise. Pack flag `filter = "nearest" | "linear"`, default nearest.

Do not bring wgpu in v1. A single `CALayer` is the whole compositor budget.

### 4.6 Authoring contract

An end user selects a character from Packs; no behavior editor or preferences window is required. An author supplies images and a small TOML file. Start with two clips, then add optional transitions or longer sequences without changing application code.

Minimum viable pack (with an 8×2 sheet of 128×128 tiles):

```toml
schema = 1
id = "simple-pet"
name = "Simple Pet"
version = 1
tile = [128, 128]
anchor = [64, 116]

[atlas]
file = "atlas.png"
grid = [8, 2]

[states.idle]
frames = [0, 1]
fps = 6

[states.run]
frames = [8, 9, 10, 11]
fps = 12
```

Recommended artwork:

- 128×128 frames as the starting size; other uniform tile sizes are valid within atlas limits.
- At least two idle frames and four moving frames for the shipped pack. A single-frame loop is valid for placeholders.
- Static RGBA PNG with straight alpha; premultiply once on load.
- Consistent canvas, ground contact, scale, and facing across clips. Keep the feet near `anchor` and preserve enough transparent room for ears, sweat, tails, and drawn hops.
- No text in frames because artwork can flip.
- Use named regions when numeric frame indices become difficult to maintain. Per-frame durations support holds such as wiping a forehead without duplicating artwork.

Optional later: a tool to assemble separate images, APNG/GIF import, or an Aseprite exporter. These tools must produce the same validated runtime format; they do not add a second animation engine.

### 4.7 Example personalities and later extensions

Paco and gatita are separate packs with the same authoring structure. The supplied images and character direction in §12.2 are their visual references.

| Role | Paco | gatita |
|---|---|---|
| Idle (loop) | Sitting, catching his breath, sweating, and wiping his forehead; tired but content | Playing near the pointer, rolling onto her side/back, then resting with a contented purr and tail flick |
| Start (once) | Getting to his feet with effort and a willing, good-natured expression | Gathering herself into a crouch before a pounce |
| Moving (loop) | Running after the pointer, huffing and puffing; exhausted but keeping on, without anxiety | Scampering after the pointer and bounding with playful hops |
| Stop (once) | Sitting down with relief | Landing and settling into play |
| Turn (once, optional) | An effortful pivot while staying cheerful | A quick, playful scamper turn |
| Sleep (loop, optional) | Dozing peacefully while seated | Curled up comfortably |
| Wake (once, optional) | Rousing and standing, ready to try again | Uncurling and stretching into a ready stance |

For gatita, the following fragment sets the identity/filter and replaces the behavior and motion tables. Her own `[states.*]` tables supply the named clips with the same loop/one-shot requirements; the remaining required pack fields follow §4.2:

```toml
id = "gatita"
name = "gatita"
filter = "linear"

[behavior]
preset = "chase"
idle = "play_roll_purr"
moving = "bound"
start_moving = "crouch"
stop_moving = "settle"
sleep = "curl_up_asleep"
wake = "stretch"
idle_delay_ms = 180
sleep_after_ms = 18000

[motion]
max_speed = 420
acceleration = 1600
stop_distance = 18
start_distance = 32
```

These are starting values to tune by watching the characters, not universal constants. Paco visibly lags and takes longer to accelerate; gatita catches up quickly. Her `play_roll_purr` idle clip contains an authored sequence of playful poses, a roll, and a contented rest, returning to its opening pose before looping. It is immediately interruptible when a chase is requested; author the crouch/start pose to make that change readable. This fixed sequence needs no randomized idle selector. Purring reads through relaxed eyes, a comfortable pose, and gentle breathing rather than sound or text.

gatita's intended personality is to play around the pointer both while it rests and while it moves. In v1, local hops, rolls, and playful sideways motion are drawn within the tile while the panel holds position during idle or follows the chase path during movement. Keep all poses inside the canvas, with a consistent virtual ground anchor even when paws leave the ground. Actual jumping paths, overshooting, circling the pointer, randomized idle variations, and general custom rules require explicit future behavior features and must not be implied by a clip name.

If a later schema adds custom rules, keep the role-based chase preset as the easy path. Define distinct cursor speed, character speed, distance, elapsed-time, and source-phase predicates; require deterministic priority (explicit priority, then declaration order for ties; first eligible match wins). Such rules must use the same transition and interruption machinery. Version any incompatible change rather than silently reinterpreting schema 1.

---

## 5. Application architecture

### 5.1 Crate layout

```text
notavirus/
  Cargo.toml
  rust-toolchain.toml          # stable
  crates/
    notavirus-app/             # binary: macOS entry
    notavirus-core/            # packs, brain, player — no AppKit
    notavirus-pack/            # toml + atlas decode + zip
  resources/
    Info.plist
    packs/default/
  scripts/
    bundle.sh                  # make NotAVirus.app
```

`notavirus-core` must be testable on any host (including Linux CI) without AppKit. That is why Mac types stay in `notavirus-app`.

### 5.2 Crates (expected)

| Crate | Use |
|---|---|
| `objc2`, `objc2-foundation`, `objc2-app-kit` | AppKit |
| `objc2-core-video` or manual CVDisplayLink | ticks |
| `serde`, `toml` | pack.toml |
| `image` | PNG atlas |
| `zip` | .petpack |
| `notify` | hot reload (v1.1) |
| `thiserror`, `tracing` | errors / log |
| `dirs` | Application Support |
| `uuid` or just pack id | identity |

No Tokio in v1. No async runtime. File IO on launch and on pack switch is fine on a background queue; apply results on main.

### 5.3 Modules (`notavirus-app`)

```text
main.rs          // NSApplication, accessory, single instance
app.rs           // owns panel, status item, store
panel.rs         // NSPanel construction
status.rs        // NSStatusItem + menu
cursor.rs        // mouseLocation + screen
tick.rs          // display link → App::tick
bridge.rs        // core Pack/Player → CALayer
```

### 5.4 Modules (`notavirus-core`)

```text
lib.rs
pack.rs          // Pack, load from dir
player.rs        // clip sampling
brain.rs         // chase request, role transitions, interruption policy
math.rs          // bounded movement, clamp, velocity
```

### 5.5 Tick contract

```rust
struct TickInput {
    dt: f32,
    cursor: Vec2,       // global points, AppKit space
    screen: ScreenGeometry, // plain data: id, visible frame, backing scale
    scale: f32,         // requested user scale
    paused: bool,
}

struct TickOutput {
    panel_origin: Vec2,
    panel_size: Vec2,
    frame: FrameRef,
    flip_x: bool,
    screen_id: u64,
}
```

`App::tick` selects the screen containing the pointer, supplies its geometry as plain data, and asks core for `TickOutput`, then mutates the panel and layer. Core never sees Objective-C objects. The output panel size reflects any scale reduction needed to fit the visible frame.

---

## 6. UI chrome

### 6.1 Status item menu

```
NotAVirus
─────────
Pause / Resume
Click-through  ✓
─────────
Packs ▸   Default
          Paco
          gatita
          Open packs folder…
          Import .petpack…
─────────
Size ▸    Small
          Medium ✓
          Large
─────────
About NotAVirus
Quit
```

No preferences window in v1. Everything fits in this menu. Pack names above illustrate installed packs; only the bundled default is required to ship. Speed, clip mappings, and transition details belong in each pack, not extra menu controls.

### 6.2 About

Tiny `NSPanel` or `NSAlert`:

```
NotAVirus
It follows the mouse.
That is the entire product.

v0.1
```

### 6.3 First launch

If no user defaults exist, write:

```toml
# ~/Library/Preferences via NSUserDefaults
active_pack = "default"
scale = 1.0
click_through = true
paused = false
```

No splash, no “welcome to your new friend.”

### 6.4 Logging

`~/Library/Logs/NotAVirus/notavirus.log` via `tracing-appender`, rotate at 2 MiB. Pack load failures go here and as a one-line disabled menu entry (`Neko (invalid atlas)`).

---

## 7. Packaging

### 7.1 Bundle

```text
NotAVirus.app/
  Contents/
    Info.plist
    MacOS/notavirus
    Resources/
      packs/default/...
      AppIcon.icns
```

`Info.plist` essentials:

- `CFBundleIdentifier` = `app.notavirus.NotAVirus` (placeholder; pick a domain you control)
- `CFBundleName` = `NotAVirus`
- `LSUIElement` = `true`
- `LSMinimumSystemVersion` = `13.0` (reasonable floor; bump if using CADisplayLink-only APIs)
- `NSHighResolutionCapable` = `true`

### 7.2 Signing

v1 local: ad-hoc `codesign --sign - --force --deep`.  
Distribution later: Developer ID + notarization. Not in the critical path to a chasing sprite.

### 7.3 Build

```text
cargo build --release -p notavirus-app
./scripts/bundle.sh
open dist/NotAVirus.app
```

`bundle.sh` copies the binary, resources, and generates `PkgInfo`.

---

## 8. Persistence and files

| Path | What |
|---|---|
| App Support `/NotAVirus/packs/` | user packs |
| App Support `/NotAVirus/preferences.json` or UserDefaults | last pack, scale, flags |
| Logs `/NotAVirus/` | tracing |
| Bundle `Resources/packs/default` | factory pack |

Never write into the `.app` after install.

---

## 9. Security and “not a virus” in practice

The name is a joke. The process should still be boring to a security reviewer.

- No network in v1. No update ping. No analytics.
- No input injection.
- No reading other processes.
- Packs are data: PNG + TOML + optional atlas JSON, distributed as directories or zip. No executable payloads. Reject zip entries with `..` or absolute paths; reject asset references or symlinks that escape the pack root.
- If v2 adds Wasm, it is capability-denied by default (no FS, no net). Not v1.
- Gatekeeper will still scare people because of the name. About box and README lead with “menu bar sprite, no network, no permissions.”

README section **“Is this a virus?”**:

```
No. It is a transparent window and a PNG.
It does not see your keystrokes.
It does not touch the network.
It cannot click things for you.
Quit it from the menu bar extra.
```

---

## 10. Testing

### 10.1 Core (CI, any OS)

- Parse the minimum pack, the full Paco example, and a gatita pack using the example role mappings
- Reject missing clips, incorrect loop types, invalid timings, unsupported presets, invalid atlas regions, and broken/cyclic `next` chains
- Reject APNG atlases and invalid grid dimensions; verify grid order and top-left named regions
- Zip-slip rejection
- Chase table: idle → start → moving → stop → idle → sleep; optional wake replaces start
- Pointer stops while character is far away: keep chasing until arrival, then start the rest timer after settling
- Tiny pointer jitter and distances between stop/start thresholds do not repeatedly trigger sitting and standing
- Missing optional transitions switch roles directly; explicitly missing mapped clips fail validation
- Move again during stop: `on_move` cancels the stop chain; `finish` completes the current clip before the next clip's policy applies
- Move request disappears during start/wake: finish the sequence and settle without blindly entering the moving loop
- Simultaneous arrival/turn and movement/sleep conditions follow §4.4 precedence; flips do not restart one-shots
- One-shot chains preserve phase and time across `next`; terminal completion reevaluates current demand
- Frame sampling at t=0, exact boundaries, loop wrap, and unequal durations; repeated phase selection does not restart animation
- Movement respects configured speed/acceleration outside documented arrival/clamp resets; comparable paths at 60/120 Hz, including long-tick bounds
- Pause freezes all timers; Resume resets cursor sampling; screen/size changes clamp correctly and do not produce artificial turn events
- Anchor stays fixed when artwork flips; top-left frame pixels convert correctly to bottom-left screen points

### 10.2 App (manual Mac checklist)

- Launch: no Dock icon, status item present, no TCC prompt
- Character trails cursor on built-in display
- Drag across an external display; scale updates on Retina vs non-Retina
- Clicks land on apps below
- Pause freezes the sprite and stops following
- Switch pack from menu
- Compare Paco and gatita packs: distinct speed, acceleration, clips, and transition timing without changing app code
- Check Paco remains good-natured while visibly exhausted; check gatita's idle loop includes play, rolling, and visual purring and can switch promptly back to chasing
- Leave the pointer still at screen edges: the character arrives and rests instead of running forever
- Restart movement while the character sits down; confirm the configured interruption policy
- Import a valid `.petpack`
- Import a truncated zip → error log, current pack unchanged
- Fullscreen YouTube: pet may stay (auxiliary) or vanish; app must not crash
- Quit from menu; no leftover process

### 10.3 Performance budget

- Idle CPU < 1% on Apple Silicon at 60 Hz, one 128px layer
- RSS < 80 MB after load
- No per-frame PNG decode; atlas lives on the GPU via CALayer

---

## 11. Implementation plan

Detailed tasks, verification gates, and persistent implementation state live in [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md). The coding agent must keep that file updated while executing the milestones below.

### Milestone A — rectangle that follows

- Bundle + accessory app + status item + Quit
- Clear `NSPanel`, floating, click-through
- Display link moves a solid color view using the bounded chase model
- Multi-display clamp

Exit criterion: a red square runs after the mouse and does not eat clicks.

### Milestone B — one baked sprite

- Load bundled atlas
- Hardcoded idle/moving roles from distance and arrival timing
- Flip on velocity sign
- User scale Small/Medium/Large

Exit criterion: it looks like a character, not a debug quad.

### Milestone C — packs and behavior

- `pack.toml` + atlas loader in `notavirus-core`
- Pack menu
- Import zip
- Validation + logs
- Default chase preset, role mappings, per-pack motion, and hysteresis
- Start/stop/wake/turn transitions, one-shot chains, interruption policies, and variable frame timing
- Validate both example personalities with placeholder sheets before commissioning animation artwork

Exit criterion: swapping packs changes the character's artwork and movement personality without a rebuild; Paco completes the sit → stand → chase → sit cycle correctly, and gatita plays while idle and resumes chasing when the pointer moves away.

### Milestone D — polish

- Sleep / turn clips
- Review the default character's reference art, then author its animation sheet
- Pause
- About
- Default pack art good enough to screenshot
- README including the “not a virus” bit

v1 ships at the end of D.

### Milestone E — v1.1

- Hot-reload
- Optional pixel hit-testing (“Pet me”)
- `notify` watch
- Authoring/import helpers may follow separately; runtime nearest/linear filtering is already part of v1

---

## 12. Default pack

### 12.1 Shipping requirement

Ship one character so the app is complete without a download.

Constraints:

- Original art or clearly licensed (CC0). Do not ship someone else’s Neko/Shimeji sheet.
- 128×128 starting tile size; choose the filter for the selected artwork. Paco uses pixel art with nearest filtering; gatita uses smooth cartoon illustration with linear filtering.
- Roles: idle, moving, turn, sleep; start/stop/wake clips are optional additions.
- Personality follows the chosen character brief below. Keep the app's deadpan name/copy separate from the character's mood: Paco stays warm and willing; gatita stays sweet and playful.

Placeholder for A/B: a 2-frame blob is acceptable until art exists.

### 12.2 Character references and art direction

The supplied images establish the appearance of two animation packs. Any new artwork at this stage should be **static character reference art or pose studies**, before creating animation frames or sprite sheets. Documenting both packs does not require shipping two finished packs in v1.

| Pack | Source reference | Visual identity to preserve |
|---|---|---|
| **Paco** (`paco`) | [paco.jpeg](example-character/paco.jpeg) | Short, round, overweight older middle-aged man; balding head with gray side hair, full gray beard, expressive face; bright blue tracksuit with white stripes, rounded exposed belly, matching blue-and-white trainers; pixel-art treatment |
| **gatita** (`gatita`) | [gatita.jpeg](example-character/gatita.jpeg) | Small, sweet brown tabby kitten; dark stripes, large green eyes, pink nose and inner ears, cream muzzle/chest/paws, rounded striped tail, soft proportions; smooth outlined cartoon illustration |

The cat's character/display name and pack identifier are **gatita**, matching the reference file `gatita.jpeg`. The JPEGs are visual references, not transparent runtime atlases. Preserve their defining appearance and distinct art styles when producing further reference studies; a pack does not have to share another pack's rendering style.

**Paco — emotional direction and pose studies**

- He follows with willing determination. Exertion is visible in his breathing, sweat, effortful stride, and pauses; he is exhausted but keeps trying and is not unhappy.
- Keep the warmth of the supplied face: relaxed, friendly eyes and brows, an occasional slight smile, and a panting mouth when appropriate. Do not turn fatigue into an anxious, frightened, distressed, or defeated expression.
- When the mouse moves away, he picks himself up and runs after it, huffing and puffing. When it stops, he catches up, sits down with relief, catches his breath, and wipes sweat from his forehead. He gets up willingly when the chase resumes.
- Useful static studies: the reference's relaxed standing pose; a determined but friendly running pose; seated and sweaty while wiping his forehead; getting back to his feet with effort. Preserve the same body proportions, beard, tracksuit, and trainers across poses.

**gatita — emotional direction and pose studies**

- She is sweet, curious, affectionate, and playful. Follow the reference's bright eyes, soft shapes, and friendly expression.
- When the mouse is still, she plays nearby, rolls, and rests contentedly with a visual purr. When it moves, she gathers herself, scampers after it, and bounds playfully around its vicinity within the behavior limits in §4.7.
- Useful static studies: the reference's alert sitting pose; a low playful crouch; a bounding pose with paws lifted; rolling onto her side/back; a relaxed, eyes-softly-closed purring pose. Keep her stripe pattern, green eyes, cream markings, and tail recognizable across poses.

A useful reference sheet shows the full character against a clean background plus a few key pose or expression studies with consistent proportions. These are design references, not sequential animation frames. Keep silhouettes and faces readable at a small desktop size, and retain each source's visual identity before adapting it to runtime tiles. No GIF, APNG, animated sequence, or loadable pack is required for this reference-art step.

---

## 13. API surface we are *not* exposing

v1 has no IPC, no URL scheme, no AppleScript dictionary, no REST, no plugin host.

The only “API” is the pack format. Version it (`schema = 1`) and treat it as a public contract.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| `objc2` window-level / collectionBehavior constants mismatch | Tiny Swift reference app if a flag is ignored; port the working combination |
| Y-flip of `contentsRect` vs PNG origin | Convert UVs once in loader; golden test with a numbered atlas |
| Global monitor gaps when app is focused | Always poll `mouseLocation` on the display link |
| GNOME/Windows users ask immediately | README: “Mac only. On purpose.” |
| Name triggers AV heuristics | Notarize when distributing; keep the binary tiny and network-free |
| Pack authors put frames in the wrong order | Preview in About later; v1 they live with it |

---

## 15. Success

v1 is done when:

1. A teammate can install `NotAVirus.app` on a fresh Mac, get no permission prompts, and see a character chase the pointer within five seconds.
2. Clicks miss the character and hit the app below.
3. A second character can be added with a folder of PNG + TOML and a menu pick.
4. Quit leaves nothing behind but files the user can delete.

That is the entire product.
