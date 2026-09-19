# Jellyfish UFO runtime artwork

Original AI-assisted animation drawings generated with the built-in OpenAI imagegen tool from [the supplied reference](../../specs/example-character/jellyfish-ufo.png) and its [character brief](../../specs/example-character/jellyfish-ufo.prompt.txt). The original reference is unchanged. [prompts.json](prompts.json) records the exact generation and background-extraction prompts and selected output. [source-v1.png](source-v1.png) preserves the selected 1254×1254 RGBA source.

The companion has a pearl-silver bell, cyan inner core, lavender reflections and substantial curling tendrils, with no face. A quiet hover becomes a pulsing glide after the pointer; an open-bell arrival settles into rest. Compact sleeping poses unfurl when the mouse moves away. The hover is authored inside the tile; the app still uses its standard chase path.

## Frame map

| Frames | Clip | Timing |
|---|---|---|
| 0–3 | Hover with swaying tendrils | 1.36 s loop |
| 4–7 | Pulse glide | 560 ms loop |
| 8–9 | Gather before chasing | 240 ms one-shot |
| 10–11 | Drift to rest | 360 ms, interrupted by renewed chase |
| 12–13 | Compact sleeping hover | 2.4 s loop |
| 14–15 | Wake and unfurl | 360 ms one-shot |

The [manifest](../../resources/packs/jellyfish-ufo/pack.toml) owns timing and movement: speed 230 pt/s, acceleration 620 pt/s², start/stop radii 44/26 pt, arrival hold 240 ms and sleep after 16 settled seconds. Pause freezes the existing engine and sprite.

## Rebuild

From `not-a-virus/`:

```sh
cargo run --locked -p notavirus-pack --example build_companions -- jellyfish-ufo
python3 scripts/preview-paco.py jellyfish-ufo
```

The [compiler](../../crates/notavirus-pack/examples/build_companions.rs) extracts the sixteen connected silhouettes rather than cropping the approximate source grid. Tiny detached matte fragments are excluded; alpha 0–8 becomes transparent and 248–255 becomes opaque while intermediate edge coverage stays smooth, matching gatita's matte treatment. Alpha-weighted area sampling uses one shared 1/3.1 scale for all drawings and never samples background RGB into the character. It packs a static 512×512 RGBA atlas with 128×128 tiles and a preview; it draws no new poses.

Registration follows the bell height, with small internal hover offsets. The common anchor (64,116) is a virtual tracking point; the tendrils do not need to touch it. Curled poses retain their natural smaller size. Linear filtering and transparent padding prevent hard scaling edges and neighboring-frame bleed. Rebuilding this pack never writes gatita, default or Paco.

[preview.html](preview.html) is self-contained and previews the actual shipped atlas/manifest. It offers clips, three sizes, facing, background, pause and restart; reduced-motion starts paused. It previews clips individually, not mouse following or automatic transitions. Native captures and behavior simulations cover those integration boundaries separately; human live-motion judgment remains distinct from static image review.
