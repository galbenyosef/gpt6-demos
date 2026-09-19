# Jellyfish UFO and Living Ink animation review

Disposition: implementation and available automated/native checks pass. This is the implementing agent's bounded review, not independent review or human live-motion acceptance. Existing deferred performance/hardware acceptance remains under T10/T11.

## Delivered scope

Two selectable, original AI-assisted packs derived from the supplied PNG/prompt references. Each has sixteen authored poses, a static 512×512 RGBA atlas, six mapped behavior clips and linear filtering. Jellyfish UFO gathers into a pulsing glide, opens its bell on arrival and unfurls from compact sleep. Living Ink wobbles/blinks, stretches and squashes into pursuit, pools on arrival and reforms after sleep. The existing chase engine and native controls supply movement, mirroring, pause and selection. No new runtime effects or dependencies were needed.

The default remains gatita. Checksums confirm unchanged gatita/default/Paco atlases, previews and manifests, and unchanged supplied references. User preferences were not reset, and no live app was launched or reconfigured by this work.

## Visual and integration evidence

- Inspected both supplied references, generated source sheets, compiled atlases at their actual tile resolution and native Large/left contact sheets. The jellyfish's palette/tendrils and ink's glossy pooled mass/eyes remain recognizable. Transparent padding contains every pose; ink satellites survive extraction and mirroring. No residual background clouds remain in the runtime atlas.
- A targeted imagegen background extraction reduced jellyfish matte artifacts. Asset compilation uses generated alpha, excludes tiny detached fragments and retains intermediate edge coverage, with the same matte-tail normalization as gatita. One common scale per pack preserves smaller sleeping/pooled poses. Jellyfish bell registration prevents curling tendrils from moving the whole character; ink bases stay grounded.
- Found and corrected satellite ownership in the approximate ink source grid: a small droplet crosses the next body's bounding box. Constraining it to a body on its left preserves the intended chase drawing instead of moving a satellite to its neighbor.
- All 27 portable tests pass. New tests exercise real manifests through pause, start, chase, arrival, idle, sleep, wake, prompt interruption and direction reversal; asset checks cover discovery, all sixteen distinct/reachable drawings, alpha and padding.
- Native tests pass for 432 frame/size/facing comparisons across all four characters, plus pack menu selection and saved selection for the new IDs, gatita fallback, Pause/Resume/Size, failed switch preservation and import/reconstruction scenarios. Test preferences and files are isolated.
- Initial native checks failed only the mean-alpha tolerance: Jellyfish frame 0 measured 1.06495/255 against the software bilinear reference. Its native image had identical total alpha coverage and correct alignment. Nearest, bilinear and bicubic diagnostic comparisons confirmed a smoothing-kernel difference, not a pose or registration error. The test now requires both <1.5/255 mean error and <64/255 error at every pixel, adding a local bound to the previous mean-only check. Deliberately wrong-frame, vertically flipped and one-source-pixel-shifted comparisons fail those bounds (mean 28.58, 32.14 and 6.35; maximum 255, 255 and 201). Production rendering is unchanged.
- Final worst mean/max alpha errors: Jellyfish 1.1184/43.38, Ink 0.7392/42.50, gatita 0.8262/45.00 (all out of 255). Paco retains exact nearest silhouette agreement. All three sizes and both facings passed.
- Strict workspace/all-target Clippy and formatting passed. Offline previews embed the shipped atlas/manifest, provide light/dark backgrounds and pause controls, and start paused for reduced motion. Browser interaction was not rerun; the earlier browser restriction remains.
- Release bundling and strict ad-hoc signature verification passed. The 3.4 MiB bundle contains all five pack IDs with byte-identical resource files; plist, prompt JSON, preview JavaScript syntax and diff whitespace checks passed. No app launch was performed.

## Remaining scope and context

Human live-motion judgment of these new four-pose chase cycles and their transition timing remains useful. The separate performance and physical desktop/hardware checklist was not resumed: no fresh CPU, mixed-display, Spaces/fullscreen, macOS 13 fallback or fresh-Mac claim is made.

The Impeccable context loader reported legacy product metadata, a stale design sidecar and no saved build-path choice. Those pre-existing context migrations were not part of this feature; `init`/`document` can refresh them separately. The pinned native surface and provided character references supplied the direction here.
