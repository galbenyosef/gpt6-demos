# Edificio Europa architectural explorer

A Bun + Three.js interactive reconstruction of Edificio Europa in Valencia, based on the reference photographs in `stock-images/`.

## Run

```sh
cd ../cross-talk
bun install
# Configure OPENAI_API_KEY in cross-talk/.env for voice.
cd ../edificio-europa
bun install
bun run dev
```

Open http://localhost:3000. The startup command loads the server key and model configuration from `../cross-talk/.env`.

## Features

- Crosstalk voice control: ask about the current view, change lighting, explore viewpoints, zoom, rotate, or save a view.
- Three smoothly animated camera presets: urban perspective, street level, and skyline.
- Free orbit, pan, zoom, auto-rotation, reset, and fullscreen.
- Daylight, golden-hour, and blue-hour lighting with refreshed environment reflections.
- 3840 × 2160 PNG export of the current viewpoint.
- Responsive mouse, touch, and keyboard controls.
- Single recessed crown-window row, gridded rear service core, and continuous mirror strips.
- Narrow-end entrance with a slender lift shaft, overhanging crown, bronze-framed glazed lobby, radial canopy seams, entrance steps, and spherical bollards.
- Recessed rooftop plant court, sloping metal perimeter, terracotta plant room, ventilation fans, pipes, and maintenance rails.
- Planting, streetscape, and surrounding urban context.

Drag to orbit; right-drag to pan; scroll or pinch to zoom. Focus the canvas and use arrow keys to pan, +/− to zoom, and R to reset.

## Validate and build

```sh
bun test
bun run typecheck
bun run build
```

The static output is written to `dist/`. Voice requires the Bun server (or a reverse proxy forwarding `/crosstalk/*` to it); a standalone static host only serves the explorer. The development server uses Bun HTML imports directly, without Vite.

## Accuracy and verification

This is an interpretive photo-based model, not photogrammetry or a measured survey. Dimensions, unseen surfaces, landscaping, and neighboring buildings are approximations. Reference images are supplied by the user.

The Crosstalk adapter in `crosstalk/` exposes seven semantic tools through a shared `EuropaController`. Manual controls and voice actions update the same scene, UI and state. Camera transitions support cancellation and report completion only after settling. When users freely orbit or rotate, semantic state marks the view as adjusted and does not claim an exact set of visible features.

`set_fullscreen({ enabled: true | false })` enters fullscreen or returns to normal view. Native fullscreen changes (including the button and Escape) update the AI's `fullscreen` state, and Crosstalk remains accessible inside fullscreen. Browsers may require a recent click to enter fullscreen; when blocked, the tool returns `USER_ACTIVATION_REQUIRED` and a toast directs the user to the fullscreen button. Exiting fullscreen needs no click.

See [Crosstalk's README](../cross-talk/README.md) for protocol details, configuration, offline/browser tests, and opt-in live API checks. The previous one-off WebMCP bridge has been replaced by this application contract.
