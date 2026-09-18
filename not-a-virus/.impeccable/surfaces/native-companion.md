# Native desktop companion

Targets: `crates/notavirus-app/src/`, `crates/notavirus-core/src/`, `resources/packs/`.

Modes: Experience for the transparent sprite; Operate for the native menu controls.

## Direction contract

**THESIS:** A small character follows the pointer without interrupting desktop work. The pinned spec requires native controls and no application shell.

**OWN-WORLD:** Transparent, shadowless sprite ground; pack-owned artwork; AppKit-owned menu and dialog typography, spacing, focus, and states. The user-selected paw is an 18-point native template SF Symbol.

**STORY:** Launch to see one sprite; use the status menu to pause, change pack or size, import, and quit. gatita provides the default animated character with playful rolls and quick bounding chases; Paco remains selectable.

**FIRST VIEWPORT:** One small transparent sprite over the user's desktop, using the selected pack tile at Small, Medium, or Large scale; the status item is the control entry point.

**FORM:** Brief-pinned native macOS accessory, preserved from spec revision 0.3. No concept roll or approved comp applies. Bounded acceleration and pack-defined held transitions supply the signature interaction.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Recorded outcome

`.impeccable/review/finish-review.md` records `ship` for prototype code and interaction only. `DESIGN.md` and `.impeccable/design.json` document the implemented native system. No web detector ran. No screenshot-backed visual approval was supplied to this documentation pass. Diagnostic atlas provenance remains fixture provenance, and finished character artwork plus outstanding desktop acceptance remain separate gates.

## Paco animation integration

The authored moment is Paco getting up willingly, jogging after the pointer, then sitting to recover and wipe sweat. One 512×512 RGBA atlas supplies 16 fixed 128-pixel tiles; (64,116) is the shared ground anchor. Timings live in the manifest; controls remain native. The sprite is a child layer below the AppKit-owned view geometry. See `.impeccable/review/paco-animation.md` for pixel and performance evidence and the remaining desktop acceptance limits.

## gatita animation integration

The focal moment is paw play → a playful roll → relaxed visual purring. A short crouch introduces a faster bounding chase; landing chains into an interruptible tail flick. Curled sleep wakes with a stretch. A 512×768 RGBA atlas supplies 24 drawings in 128px tiles with smooth alpha and linear filtering. Native controls, chase physics and saved user selection remain unchanged; gatita now also supplies the default pack. Source, prompts and compiler are documented in `art/gatita/`; the bounded visual review is `.impeccable/review/gatita-animation.md`. Physical desktop checks remain deferred by user instruction.
