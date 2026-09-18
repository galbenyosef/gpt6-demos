# Native desktop companion

Targets: `crates/notavirus-app/src/`, `crates/notavirus-core/src/`, `resources/packs/`.

Modes: Experience for the transparent sprite; Operate for the native menu controls.

## Direction contract

**THESIS:** A small character follows the pointer without interrupting desktop work. The pinned spec requires native controls and no application shell.

**OWN-WORLD:** Transparent, shadowless sprite ground; pack-owned artwork; AppKit-owned menu and dialog typography, spacing, focus, and states. The `‽` status mark is explicitly pinned.

**STORY:** Launch to see one sprite; use the status menu to pause, change pack or size, import, and quit. Paco provides the default animated character; gatita remains labeled Diagnostic.

**FIRST VIEWPORT:** One small transparent sprite over the user's desktop, using the selected pack tile at Small, Medium, or Large scale; the status item is the control entry point.

**FORM:** Brief-pinned native macOS accessory, preserved from spec revision 0.3. No concept roll or approved comp applies. Bounded acceleration and pack-defined held transitions supply the signature interaction.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Recorded outcome

`.impeccable/review/finish-review.md` records `ship` for prototype code and interaction only. `DESIGN.md` and `.impeccable/design.json` document the implemented native system. No web detector ran. No screenshot-backed visual approval was supplied to this documentation pass. Diagnostic atlas provenance remains fixture provenance, and finished character artwork plus outstanding desktop acceptance remain separate gates.

## Paco animation integration

The authored moment is Paco getting up willingly, jogging after the pointer, then sitting to recover and wipe sweat. One 512×512 RGBA atlas supplies 16 fixed 128-pixel tiles; (64,116) is the shared ground anchor. Timings live in the manifest; controls remain native. The sprite is a child layer below the AppKit-owned view geometry. See `.impeccable/review/paco-animation.md` for pixel and performance evidence and the remaining desktop acceptance limits.
