# gatita animation pack

A sweet brown tabby with green eyes, cream markings and smooth cartoon outlines. The `gatita` pack now ships 24 authored drawings in a transparent 512×768 RGBA atlas. Tiles are 128×128 with linear filtering and a virtual ground anchor at (64,116). gatita is also the bundled `default` pack, shown as “gatita (Default)”; Paco remains selectable.

[Open the animation preview](preview.html) to inspect each shipped clip, size and facing against light, dark or blue. The offline page embeds the runtime atlas and manifest; it respects reduced motion on load and pauses advancement while hidden. It previews individual clips; the native app also chains `settle` into `tail_flick`.

| Frames | Poses | Playback |
|---|---|---|
| 0–7, 23 | Sit, paw play, roll onto back/side, rest, breathing, sit return | 5.48-second idle loop; immediately yields to chase demand |
| 8–11 | Push-off, extended bound, landing, gathered bound | Four-frame chase at 14 fps |
| 12–13 | Stand into crouch | 160 ms start |
| 14–17 | Landing, sit, tail lift and curl | 240 ms settle finishes before a 280 ms interruptible tail flick |
| 18–19 | Curled sleep and breath | Quiet 2.4-second loop |
| 20–22 | Wake, stretch, stand | 500 ms wake, replacing start |

Movement retains the specified 420 pt/s speed, 1600 pt/s² acceleration, 18/32-point stop/start thresholds and 18-second sleep delay. Purring is visible through relaxed eyes and breathing; there is no sound. Two bounding drawings lift by eight and four pixels inside the tile. The panel follows the existing chase path; it does not orbit or physically jump.

## Artwork provenance and rebuilding

The built-in OpenAI imagegen tool generated the source from the supplied [gatita JPEG](../../specs/example-character/gatita.jpeg) and approved [pose study](../../specs/pose-studies/gatita-v1.png). Both references remain unchanged. [prompts.json](prompts.json) records the exact generation and background-extraction prompts. `source-v1.png` is the selected generated RGBA output, with its provenance metadata; no external sprite sheet was downloaded.

The generated PNG retains brown RGB values underneath transparent areas, and its poses are not on an exact mathematical grid. The compiler uses the alpha channel, extracts the 24 separate substantial silhouettes, orders them by row and column, and packs uniform runtime tiles. Tiny detached matte fragments are discarded. Alpha levels 0–8 become transparent and 248–255 become opaque; intermediate edge alpha is retained. Area sampling uses alpha-weighted colors at a shared 1/2.7 scale, avoiding a brown matte fringe. It does not draw or synthesize poses. A small registration correction keeps the torso in place during the extended-tail frame.

```sh
cargo run --locked -p notavirus-pack --example build_gatita
python3 scripts/preview-paco.py gatita
cargo test -p notavirus-app --test native --locked -- --capture
cargo test -p notavirus-app --test native --release --locked -- --benchmark --pack gatita
```

The compiler updates both gatita and default artwork and synchronizes the default manifest. It guards the source dimensions and 24-silhouette count. Review source registration when replacing artwork. The original diagnostic pack is preserved under `tests/fixtures/diagnostic/gatita/`; the fixture generator only writes test fixtures.

Native captures check all 24 frames at three sizes and both facings against source alpha. Smooth filtering is compared with a bilinear reference using a mean error budget below one alpha level out of 255; Paco retains exact nearest-filter silhouette checks. Static native inspection verifies poses, transparency, facing and clipping. Human live-motion review and the other deferred desktop checks remain separate in [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md).
