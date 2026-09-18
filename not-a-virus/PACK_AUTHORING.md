# Pack authoring

A pack is a folder containing `pack.toml`, `atlas.png`, and optionally `preview.png` and `atlas.json`. A `.petpack` is a zip of that folder's contents (or one containing the folder). Only one character is active.

For a **256×128, static 8-bit RGBA** atlas with two 128×128 frames, this is a complete minimum manifest:

```toml
schema = 1
id = "my_pet"
name = "My pet"
author = "Your name"
version = 1
tile = [128, 128]
anchor = [64, 116]

[atlas]
file = "atlas.png"
grid = [2, 1]

[states.idle]
frames = [0]

[states.run]
frames = [0, 1]
fps = 12
```

All art faces right. Frames use top-left, row-major indices. `anchor` is the shared virtual ground-contact point, measured from the tile's top-left. Leave enough transparency for both facing directions around that anchor. Keep the full pose, including drawn hops, inside every tile. The runtime mirrors about the anchor; it does not translate the feet. The AppKit anchor offset is `(anchor.x × scale, (tile.height − anchor.y) × scale)` in screen points.

`filter = "nearest"` is the default for pixel art; use `"linear"` for smooth illustration. Atlases must match `grid × tile` exactly. As an alternative to `grid`, write `regions = "atlas.json"` and use string frame names:

```json
{"standing": {"x": 0, "y": 0, "w": 128, "h": 128}}
```

All named regions must be full tile size, inside the atlas, without rotation or trimming. Metadata fields such as `rotated` are rejected. Atlas coordinates convert to bottom-left normalized UVs once in the loader. The renderer premultiplies straight RGBA once when preparing its CGImage; no PNG decoding happens during animation.

Clip names are arbitrary. Without a behavior table, the two required looping clips are `idle` and `run`. Custom mapping:

```toml
[behavior]
preset = "chase"
idle = "sit"
moving = "trot"
start_moving = "stand"
stop_moving = "settle"
turn = "pivot"
sleep = "doze"
wake = "stretch"
idle_delay_ms = 250
sleep_after_ms = 12000

[motion]
max_speed = 360
acceleration = 1200
stop_distance = 24
start_distance = 40
```

Idle, moving, and sleep roles must loop. Start, stop, turn, and wake roles must be one-shots. Optional roles are enabled only when explicitly mapped; `wake` requires `sleep`. Every mapped clip must exist. Speeds are screen points per second, acceleration is points per second squared, and distances are screen points. Require `0 <= stop_distance < start_distance`.

Each clip has nonempty `frames`, positive `fps` (default 8), and `loop` (default true). Instead of `fps`, `durations_ms = [100, 250, 100]` gives one positive duration for each frame. Providing both timing forms fails validation. `flip` is `velocity` (default), `none`, `always_left`, or `always_right`.

A one-shot may use `next = "wipe"` to continue a sequence. All clips in the chain must be one-shots. Cycles, missing references, and `next` on a loop are rejected. A one-shot's `interrupt` is `finish` (default) or `on_move`. Loops must omit `interrupt`.

Starting, waking, stopping, idle, and sleep hold the position; moving and turning follow the pointer. Wake replaces start. An `on_move` stop can be cancelled when chasing resumes; `finish` completes its current clip. In a chain, the next clip's policy applies before it plays. Facing changes do not restart a one-shot. At terminal completion, the engine reevaluates current movement demand. A distant stationary pointer still needs catching up: cursor speed alone never selects idle.

After reaching the clamped target's stop radius for `idle_delay_ms`, the pet settles. The sleep delay starts only after settling, while the cursor remains still. Jitter between the stop and start thresholds does not repeatedly retrigger transitions. Scale affects art and its anchor, never speed or chase distances.

Unknown metadata keys warn; unknown atlas, behavior, motion, or clip keys fail. Schema 1 rejects `[[rules]]`. Paths must stay within the pack. No scripting or executable extensions are accepted. Sounds are ignored. See the [full specification](specs/not-a-virus-spec.md) for precedence and the Paco/gatita reference direction.
