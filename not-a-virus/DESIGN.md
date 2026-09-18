---
name: NotAVirus
description: A small transparent desktop companion with native macOS controls.
colors:
  sprite-ground: "transparent"
components:
  sprite-small:
    backgroundColor: "{colors.sprite-ground}"
    width: "128pt"
    height: "128pt"
  sprite-medium:
    backgroundColor: "{colors.sprite-ground}"
    width: "192pt"
    height: "192pt"
  sprite-large:
    backgroundColor: "{colors.sprite-ground}"
    width: "256pt"
    height: "256pt"
---

# Design System: NotAVirus

## Overview

**Creative North Star: "A small transparent desktop companion"**

The character occupies a small, transparent, nonactivating panel over the user's desktop. The interface recedes into a native macOS status menu; the desktop remains the visual ground. Character identity and animation belong to the selected pack, while AppKit owns the control language.

Paco uses an AI-assisted 16-frame pixel-art atlas, documented in `art/paco/`. The default and gatita packs share a smooth 24-frame atlas documented in `art/gatita/`. Native view snapshots verify all Paco silhouettes, sizes and facings; `.impeccable/review/paco-animation.md` records the art/rendering review and its live-motion/desktop limitations. The earlier prototype review remains historical. Neither review is v1 release approval.

**Key Characteristics:**

- One transparent, shadowless sprite panel that lets mouse events reach the desktop.
- AppKit status menu, file chooser, and alerts with native control states.
- Pack-defined artwork, filtering, facing, and animation timing.
- Warm, effortful Paco animation and sweet, playful gatita animation.

## Colors

The application defines a clear sprite ground and delegates control colors to macOS. It has no authored brand palette in the current implementation.

### Neutral

- **Transparent sprite ground** (`colors.sprite-ground`): the panel uses `NSColor::clearColor()` and is nonopaque. Atlas alpha reveals the user's desktop.
- Menu text, selected rows, disabled rows, separators, alert surfaces, and focus treatment use AppKit's current appearance. Their resolved colors are OS-owned and are intentionally absent from the token frontmatter.

**The Asset Boundary Rule.** Diagnostic atlas colors are test data, not brand tokens or a prescription for finished Paco/gatita artwork.

## Typography

Menu items, the status button, the file chooser, and alerts inherit AppKit typography. The code sets no font family, font size, weight, tracking, line height, or custom type scale. There is no display typography role.

The status button uses the native `pawprint.fill` SF Symbol as an 18-point template image, with the accessible image description and tooltip “NotAVirus.” macOS supplies light/dark and menu-highlight tinting. It uses the native status item's variable width. Numbered diagnostic frames are raster test labels, not a reusable text style.

**The Native Controls Rule.** Keep typography, selection, spacing, focus, disabled states, and checkmarks in AppKit's control system; do not infer fixed design tokens from one macOS appearance.

## Layout

The sprite is a single borderless `NSPanel`, not a desktop-sized canvas. The frontmatter dimensions describe the three menu sizes for the bundled square tile. Each bundled pack uses a 128 × 128 atlas-pixel tile with a ground anchor at (64, 116), measured from the tile's top-left. Small, Medium, and Large apply user scales of 1, 1.5, and 2. Native screen points and atlas pixels are distinct units; the frontmatter's `pt` denotes macOS points, not a web layout conversion.

The runtime derives panel dimensions from the selected pack's tile and effective scale. Other valid tile sizes are supported. It clamps the complete panel to the pointer display's visible frame and reduces effective scale when necessary to fit. Size changes preserve the visual anchor where possible before clamping. Display changes reset velocity and cursor sampling; backing scale follows the destination display.

No custom spacing scale, grid, responsive breakpoint, menu padding, or alert margins are defined. Native AppKit owns those measurements. The menu is the sole control surface; there is no Dock icon, onboarding shell, or preferences window.

## Elevation & Depth

The sprite panel has no shadow, border, opaque background, or material effect. `NSFloatingWindowLevel` places it above ordinary windows; `CanJoinAllSpaces`, `FullScreenAuxiliary`, and `Stationary` specify its collection behavior. These flags describe implementation intent, not verified behavior in every desktop/fullscreen arrangement. AppKit owns menu and alert elevation.

**The Clear Ground Rule.** Keep the sprite panel transparent and shadowless so the desktop remains its ground.

## Shapes

The viewport follows the tile rectangle; the atlas alpha defines the visible silhouette. There is no application-defined corner radius or rounded container. Keep artwork within its tile and preserve the pack's anchor across animation frames. Facing mirrors about that anchor. The loader converts atlas top-left coordinates to bottom-left UVs once. Top-down PNG rows remain unchanged in CGImage; the sprite is a child of AppKit's backing layer and mirrors horizontally about its anchor. Native pixel checks verify actual orientation and sampling.

## Components

### Sprite panel

An unobtrusive moving image. The panel is borderless, nonactivating, nonopaque, and always click-through. It is not draggable or user-resizable. The renderer maps the current atlas frame into one `CALayer`; the layer anchor is (0.5, 0.5), with position at half the panel width and height. Both minification and magnification filtering follow the pack: nearest for Paco, linear for Default and gatita. Those settings describe the supplied packs, not a global requirement for future art.

Movement and animation are data-driven. The clock requests 60 Hz, with a 1/60-second timer fallback; simulation subdivisions are at most 1/120 second and elapsed time is capped at 100 ms per tick. Core Animation implicit actions are disabled. Pause removes the clock and freezes motion and animation; a size change while paused updates geometry with zero elapsed time. Resume resets cursor sampling. Clip rates and chase speeds remain pack configuration, not app-wide animation tokens.

### Status menu

The native paw status item opens this order: disabled NotAVirus title; separator; Pause or Resume; checked, disabled Click-through; separator; Packs; Size; optional disabled pack error; separator; About NotAVirus; Quit. Quit uses the native `q` key equivalent.

Packs shows the active valid pack checked. Invalid packs are disabled with the first line of their failure reason, limited to 70 characters. The submenu ends with Open packs folder… and Import .petpack…. Size checks one of Small, Medium, or Large. A failed switch or import keeps the previous usable pack and exposes a disabled “Pack error:” row with its first-line reason limited to 75 characters. These are native menu states, not custom badges or notifications.

### Native dialogs

Import uses a single-file `NSOpenPanel` for `.petpack` files. About uses `NSAlert` and explicitly identifies “v0.1 · Paco and gatita.” A startup failure uses `NSAlert` to name the default-pack problem and show its reason before termination. AppKit supplies dialog typography, layout, buttons, focus, and accessibility behavior; no custom visual variants are implemented.

Source evidence: `crates/notavirus-app/src/{panel,status,bridge,app,tick}.rs`, `crates/notavirus-core/src/{brain,pack}.rs`, `resources/packs/*/pack.toml`, `PRODUCT.md`, and `.impeccable/review/{direction,finish-review}.md`. Source verification does not establish perceived motion quality, final-art readability, or cross-display visual acceptance.

## Do's and Don'ts

### Do:

- **Do** preserve transparent, shadowless, nonactivating, click-through sprite presentation.
- **Do** use native AppKit controls and their OS-owned appearance and interaction states.
- **Do** distinguish screen points, atlas pixels, user scale, and display backing scale.
- **Do** keep artwork, filtering, anchors, and clip timing grounded in each pack.
- **Do** disclose diagnostic fixtures until finished character art passes its acceptance gate.

### Don't:

- **Don't** turn diagnostic geometry or its colors into a finished character identity or brand palette.
- **Don't** add custom menu typography, control chrome, shadows, or an application shell to this pinned surface.
- **Don't** let size changes or resume advance paused animation through elapsed wall time.
- **Don't** present the prototype review as screenshot-backed visual approval or final-art acceptance.
