# Living Ink runtime artwork

Original AI-assisted animation drawings generated with the built-in OpenAI imagegen tool from [the supplied reference](../../specs/example-character/living-ink.png) and its [character brief](../../specs/example-character/living-ink.prompt.txt). The original reference is unchanged. [prompts.json](prompts.json) records the exact prompt and selected output. [source-v1.png](source-v1.png) preserves the selected 1254×1254 RGBA source.

The companion remains a glossy asymmetrical black ink drop with pale eyes, a swept tip, a pooled base and small satellite droplets. Curiosity appears through a reaching lobe, wobble and blink. Chasing stretches and squashes the liquid; arrival pools it, sleep flattens it and waking reforms it. It gains no limbs, mouth, sound or persistent ink trail.

## Frame map

| Frames | Clip | Timing |
|---|---|---|
| 0–3, then 0 | Curious wobble and blink | 2.03 s loop |
| 4–7 | Stretch-and-squash slither | 400 ms loop |
| 8–9 | Gather before chasing | 200 ms one-shot |
| 10–11 | Pool and settle | 320 ms, interrupted by renewed chase |
| 12–13 | Sleeping mound | 2.2 s loop |
| 14–15 | Wake and reform | 300 ms one-shot |

The [manifest](../../resources/packs/living-ink/pack.toml) owns timing and movement: speed 320 pt/s, acceleration 1100 pt/s², start/stop radii 36/20 pt, arrival hold 180 ms and sleep after 14 settled seconds. Pause freezes the existing engine and sprite.

## Rebuild

From `not-a-virus/`:

```sh
cargo run --locked -p notavirus-pack --example build_companions -- living-ink
python3 scripts/preview-paco.py living-ink
```

The [compiler](../../crates/notavirus-pack/examples/build_companions.rs) extracts sixteen large body silhouettes and associates the separate satellites with their body on the left. This keeps the second chase pose's droplets even though they cross the approximate source grid into its neighbor's bounding box. Tiny detached matte fragments are excluded; alpha 0–8 becomes transparent and 248–255 becomes opaque while intermediate edge coverage stays smooth, matching gatita's matte treatment.

Alpha-weighted area sampling uses a shared 1/3.1 scale for all poses. The pooled base registers at (64,116); low shapes are not enlarged to upright height. The compiler packs a static 512×512 RGBA atlas with 128×128 tiles and a preview, with linear filtering and transparent padding. It draws no poses and never writes gatita, default or Paco.

[preview.html](preview.html) is self-contained and previews the actual shipped atlas/manifest. It offers clips, three sizes, facing, background, pause and restart; reduced-motion starts paused. Clips preview individually. Behavior simulations and native captures verify transitions and rendering separately; static review does not substitute for human live-motion acceptance.
