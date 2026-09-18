# Paco animation pack

Paco is available as the `paco` pack; gatita is the bundled default. Six clips use 16 original, AI-assisted pixel-art drawings in a 512×512 RGBA atlas. Each tile is 128×128, with a common ground anchor at (64, 116). The two passing run poses lift two pixels; other poses meet the same ground line. Paco retains his artwork and motion settings independently of the default pack.

Open [preview.html](preview.html) locally to inspect clips, sizes, facing and transparency against three backgrounds without launching the desktop companion. The page embeds the actual shipped atlas and manifest. It is an authoring aid, not another app surface. The native app only consumes PNG/TOML.

| Frames | Drawing | Playback |
|---|---|---|
| 0–3 | Seated rest, raise arm, wipe brow, lower arm | A 2.38-second idle loop, including quiet holds |
| 4–7 | Huffing jog, contact and passing poses | Four-frame loop at 10 fps |
| 8–11 | Seated, lean forward, knees bent, standing | 500 ms getting up; reversed 460 ms sitting down |
| 12–13 | Turn through a front view | Two-frame turn at 12 fps |
| 14–15 | Eyes-closed seated doze, subtle exhale | Quiet two-second loop |

The start/stop interruption rules and chase speeds remain Paco's specified behavior. Warm expressions, visible exertion, gray beard, exposed belly, blue tracksuit and white stripes preserve his reference identity. No sound, simulated keystrokes, physical jump path, or petting behavior is added.

## Provenance and reproducibility

The supplied JPEG and static pose studies are preserved in `specs/`. `source-v1.png` is the selected output of the built-in OpenAI image generation tool, with its original provenance metadata. [prompts.json](prompts.json) records the generation prompt, targeted correction and discarded alternate-stride attempt. No external character sheet was downloaded.

The Rust asset compiler performs only alpha thresholding, bounding-box extraction, shared nearest-neighbor downsampling, ground registration and packing. It does not paint or synthesize poses. A shared 1/3 scale preserves shorter seated proportions; binary alpha removes translucent cutout fringes for nearest filtering. The runtime PNGs carry a provenance text chunk. The Paco compiler writes only the Paco pack.

From `not-a-virus/`:

```sh
cargo run --locked -p notavirus-pack --example build_paco
python3 scripts/preview-paco.py
sh scripts/build-paco-icon.sh
cargo test -p notavirus-app --test native --locked -- --capture
```

The compiler guards the source dimensions; changing the source requires reviewing registration. Icon generation uses macOS `sips` and `iconutil`. Native checks need WindowServer access; a sandbox may prevent Apple's icon compiler from reading system resources. Generated native view snapshots go to `target/native-captures/` and do not display a desktop pet. Normal native tests verify all 16 source silhouettes at three sizes and both facings. Art validation also checks transparent tile margins and grounded feet.

Final desktop interaction and mixed-display acceptance remain in [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md). gatita now has her own authored smooth animation pack in `art/gatita/`. The reference-only review in `specs/pose-studies/` is historical and is not evidence of runtime animation acceptance.
