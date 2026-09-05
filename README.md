# Edificio Europa architectural explorer

A Bun + Three.js interactive reconstruction of Edificio Europa in Valencia, based on the reference photographs in `stock-images/`.

## Run

```sh
bun install
bun run dev
```

Open http://localhost:3000.

## Features

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

The static output is written to `dist/`. The development server uses Bun HTML imports directly, without Vite.

## Accuracy and verification

This is an interpretive photo-based model, not photogrammetry or a measured survey. Dimensions, unseen surfaces, landscaping, and neighboring buildings are approximations. Reference images are supplied by the user.

Geometry validation (finite vertex data, compatible material batches, and building bounds), TypeScript validation, production bundling, and an HTTP response check were completed. Browser rendering and interaction testing were unavailable because no browser was connected. The optional WebMCP configuration tool is feature-detected; its browser registration was not verified in this environment.
