# GNOME desktop companion

Date: 2026-09-20. Targets: `gnome/`, `crates/notavirus-gnome/`, existing core and pack crates, and `resources/packs/`. Platform: Ubuntu GNOME Shell 50 on Wayland; metadata limits the extension to Shell 50 and the normal user session.

## Direction contract

**THESIS:** A small animated character follows the pointer without interrupting desktop work. Existing artwork and native controls are pinned by the Ubuntu implementation plan.

**OWN-WORLD:** The desktop is the transparent sprite's ground. Character packs own artwork, alpha silhouette, anchors, filtering, and animation clips. GNOME Shell owns panel and popup-menu typography, spacing, selection, checkmarks, disabled states, and elevation. GTK/libadwaita owns the separate preferences window and native file chooser. The observed dark surfaces and accent are system appearance, not new application tokens.

**STORY:** Enable the extension to see the saved companion, defaulting to gatita. The paw menu exposes Pause/Resume, Packs, Size, folder/import actions, About, Preferences, and Quit. Quit stops the helper and sprite while leaving Start available; disabling the extension also removes the indicator. A helper failure exposes Restart and a bounded error. Temporary hiding preserves the user's pause preference.

**FIRST VIEWPORT:** One alpha-clipped character and a symbolic paw in the system panel. There is no authored desktop canvas, enclosing sprite card, or custom application shell. Preferences is a native supporting surface for visibility, pause, size, and importing a pack.

**FORM:** Ordinary platform extension of the existing companion. Shell `PanelMenu`/`PopupMenu` controls and GTK/libadwaita preferences replace the macOS control implementation for this target. No identity redesign or new artwork is part of this work.

**FINISH:** The bounded finish verdict and evidence are recorded in `../review/ubuntu-finish.md`. Reviewed UI may proceed to acceptance testing; this is not full desktop or release approval.

## Implemented ownership and conventions

- `extension.js` owns enable/disable entry points; `controller.js` owns settings connections, helper lifetime, scheduling, pack transactions, and menu state. Rust supplies production simulation and validated pack/frame data through the asynchronous, bounded private bridge; JavaScript does not define a second animation system.
- `sprite.js` creates a non-reactive, sprite-sized Clutter hierarchy in Shell chrome with `affectsStruts: false`. Atlas alpha provides transparency; clipping and crop positioning select a frame. GNOME 50 `St.ImageContent` uploads validated RGBA data. Filtering follows the pack, with nearest for Paco and linear for the smooth artwork. The sprite adds no border, background, shadow, focus, or input grab.
- `geometry.js` samples Shell logical pointer and work-area coordinates. The sprite hides in Activities, while locked, and when the pointer monitor is fullscreen. This Ubuntu policy is distinct from historical macOS behavior. Monitor/layout changes reset timing and geometry; Small, Medium, and Large correspond to user scales 1, 1.5, and 2, not fixed GNOME pixel tokens.
- `indicator.js` uses the bundled symbolic paw with Shell's `system-status-icon` class. The running menu shows a disabled title, Pause/Resume, checked disabled Click-through, Packs and Size submenus, optional error, and supporting actions. Selected valid packs and sizes use native checks; invalid packs use disabled rows with bounded reasons. About and folder-opening failures use Shell notifications.
- `prefs.js` uses `Adw.PreferencesPage`, `PreferencesGroup`, `SwitchRow`, `ComboRow`, and `ActionRow`, plus a native GTK button and `Gtk.FileDialog`. The size row follows external settings changes as well as its own selection. Import disables the action while processing and reports progress/success/failure in the row subtitle. File chooser dismissal is quiet; an unexpected chooser failure gives a reason and a retry instruction. GTK remains outside the Shell process.
- GSettings persists running, paused, size, and the successfully committed pack, with import revision keys coordinating the preferences process. No new typography, palette, corner, spacing, or motion tokens are authored for controls.

## Scope of this document

`IMPLEMENTATION_PLAN_UBUNTU.md` governs this platform extension. Root `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, and `native-companion.md` remain historical macOS records; this document does not rewrite their platform claims or repair pre-existing drift. Existing artwork provenance remains in `art/` and its earlier bounded reviews. A new GNOME surface record avoids presenting sampled OS appearance as a portable brand system.
