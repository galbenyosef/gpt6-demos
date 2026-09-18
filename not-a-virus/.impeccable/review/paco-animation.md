disposition: ship-with-acceptance-gaps

Scope: first Paco runtime animation, asset integration, and native renderer regression. This review is by the implementing agent, not an independent reviewer or user approval.

The selected source and compiled atlas were visually inspected. Paco retains the warm face, blue tracksuit, belly, beard and pixel-art silhouette. Seated/standing heights retain physical proportions; the 128-pixel tile has clear transparent margins. Clips cover seated wipe, effortful get-up/sit-down, jog, turn and silent doze. The short jog is intentionally a compact contact/passing loop; the source's two contact poses are similar, so this is not an anatomically exact alternating-stride study.

Native NSView snapshots cover 16 frames × 3 sizes × 2 facings. Captured alpha silhouettes match the requested source tile at every pixel after nearest scaling/mirroring. Review uncovered reversed atlas rows and a root-layer transform problem: the renderer now retains top-down image bytes and transforms a sprite sublayer beneath AppKit's backing layer. These failures are covered by normal native tests, not only optional captures.

The 512×512 runtime atlas replaces diagnostic Default/Paco art. Runtime PNGs have binary alpha, safe tile bounds and shared ground registration. The compiler, source, prompts, preview, icon and documentation are persisted. gatita is explicitly labeled Diagnostic. Existing native menu presentation and controls are preserved.

Controlled release benchmark with the actual Paco default: 15.072 seconds, 902 callbacks (59.85 Hz), 0.751% CPU, 45.96 MB peak RSS. The benchmark exits and removes its temporary panel/status item. 24 portable tests and native controls/pixel checks passed.

Limitations: snapshots verify static native rendering, not a human judgment of live motion. Browser policy blocked the local HTML preview; no workaround was attempted. Physical click-through, live import/Quit, mixed displays/Spaces/fullscreen and fresh-Mac/macOS 13 acceptance remain unverified. This is not v1 release approval. See the implementation plan for the sole release ledger.
