# Ubuntu GNOME native UI finish

Date: 2026-09-20. Scope: the GNOME 50 companion surface, native paw menu, and GTK/libadwaita preferences. Existing artwork and native controls are pinned. This document records the supplied finish-review verdict and a separate source/screenshot documentation check.

**Verdict: ship the reviewed native UI finish to acceptance testing.** This is a bounded UI verdict, not physical input, hardware, performance, installation, or full release approval.

## Evidence inspected

- Read the Ubuntu implementation plan, historical root `PRODUCT.md` and `DESIGN.md`, all `gnome/*.js` modules, extension metadata, settings schema, existing native surface record, and the impeccable documentation reference.
- Visually inspected `.impeccable/review/ubuntu-evidence/desktop.png` (1280×720). The capture shows a crisp gatita silhouette directly on a blue desktop, without an opaque sprite rectangle. The top-panel paw opens a native dark menu with a muted title, Resume, checked disabled Click-through, Packs and Size submenus, and folder/import/About/Preferences/Quit actions. Labels are legible and fit; the menu remains within the capture. This capture is a paused state, not evidence of motion quality.
- Visually inspected `.impeccable/review/ubuntu-evidence/preferences.png` (1280×720). The native NotAVirus window shows readable “Your companion” and “Character packs” groups, aligned switches, a Small size row, and a clear Choose File action. Supporting copy explains hiding, import preservation, and Quit/Start/disable semantics. The shown content fits without clipping; rounded groups, typography, elevation, and accent remain system-owned. The final isolated-backend screenshot shows Show companion and Pause enabled, consistent with the paused desktop capture.
- Source inspection confirms the two review fixes: `prefs.js` subscribes to `changed::size` and guards two-way synchronization, and unexpected file chooser failures update the import row with a reason and retry instruction. Their behavior is source-verified here; these static captures do not exercise those error or synchronization paths.

The screenshots are retained as test evidence, not shipping artwork. The implementation pass copied the final captures without altering them. No web design detector applies to a native Shell/GTK surface.

## Findings and disposition

The transparent pet and small panel entry preserve the existing unobtrusive companion identity. Shell owns menu structure and state treatment; libadwaita supplies a restrained, conventional preferences hierarchy. The paused menu state and always-click-through row are distinguishable. Preferences copy makes the Ubuntu-specific visibility and stop semantics explicit. The visible controls need no custom styling or new token system.

The stale preferences size display and silent chooser-failure issues are fixed in the inspected source. No additional visual change is required by these two captures. This documentation pass changed only the GNOME surface and this finish record; it did not rewrite the macOS product/design files or their sidecar.

## Acceptance limits

Static screenshots demonstrate the captured layout and silhouette only. They do not prove physical click, double-click, drag, scroll, selection, focus preservation, keyboard behavior, or native Wayland/XWayland input pass-through. They do not establish all four packs at every size/facing, animation quality, imports and rollback, popup submenu states, light appearance, keyboard or assistive-technology usability, or behavior at other display scales.

Real desktop acceptance still needs the implementation plan's applicable checks: app/workspace/Dock/fullscreen behavior, lock and suspend, mixed and negative/vertical monitor layouts, hotplug, repeated lifecycle cleanup, installation/update/uninstall, performance and memory measurements, and remaining pack/error paths. Automated or source-level evidence elsewhere must retain its own scope and must not be promoted to physical hardware observation. No active-session installation, hardware test, or release approval is claimed by this review.
