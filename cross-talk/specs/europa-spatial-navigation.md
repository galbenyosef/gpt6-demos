# Europa spatial navigation extension

This extends Europa's existing Crosstalk adapter without changing the generic client/server protocol.

## Reference frames

- User-supplied location: 39°28′18.4″N 0°21′25.5″W, decimal 39.471777778, −0.357083333.
- Front is the main entrance, outward bearing 010°; back is the opposite end, 190°.
- Left/right are fixed as seen from outside facing the entrance: left 100°, right 280°.
- Existing model axes remain unchanged: front −X, back +X, left −Z, right +Z, up +Y.
- Bearings are clockwise from geographic north using this user-supplied alignment, not an independently surveyed calibration.

## State

`spatial` is derived from the actual camera and orbit target, independently of the last selected preset. It contains camera side (including diagonal sectors), camera position bearing and eight-point compass direction, looking bearing, elevation relative to the mid-height building center, distance to that center, and focus offset from it. Distances use approximate model units. Overhead bearings are null when horizontal direction is undefined; adapters without spatial data return null for the whole field.

Manual orbit, pan, zoom, automatic rotation and scripted movements update spatial state. Changed snapshots are emitted at most once every 160 ms; explicit state requests read the current camera immediately. Spatial position does not establish screen visibility or occlusion. Existing conservative `visibleFeatures` behavior is retained.

## Actions and controls

- `show_side({ side })`: front, back, left, right, or any of eight named compass directions. Compass sides describe where the camera is placed, not its looking direction.
- `orbit_view({ direction, degrees? })`: left/right camera movement around the building from the current position, 1–180 degrees, default 30. Viewer-left increases geographic bearing; viewer-right decreases it.
- Both stop automatic rotation, recenter the orbit target, and follow an exterior arc. A close camera first pulls outward to a safe orbit radius. Actions resolve after the transition settles and honor interruption.
- Manual side buttons use the same controller. An orientation indicator shows the current side and bearing with a north-up building outline, entrance marker and camera dot.
- Presets remain available; reset restores the last selected preset. Side/orbit navigation is marked as an adjusted view, with current orientation available through `spatial`.
- Artificial lighting and simplified surroundings are not a geographically calibrated sun or mapping simulation.

## Verification

Unit tests verify coordinates, model-axis mapping, fixed sides versus viewer-relative movement, compass wraparound, look direction, panned focus, overhead ambiguity, safe arc geometry and adapter validation. Browser tests execute the real tools through Crosstalk, verify the visible controls and spatial state, exercise manual movement and auto-rotation, cancel a spatial transition, and capture desktop/mobile layouts.
