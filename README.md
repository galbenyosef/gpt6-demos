# GPT6 Demos

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE.md)
[![Bun](https://img.shields.io/badge/Runtime-Bun-14151a?logo=bun&logoColor=white)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/3D-Three.js-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Contributions welcome](https://img.shields.io/badge/Contributions-welcome-brightgreen.svg)](#principles-of-participation)

A collection of interactive web demos exploring 3D graphics, visual design, and browser-based experiences. Built with Bun, TypeScript, and Three.js, the projects include an architectural explorer, a tarot reading room, a helicopter cave expedition, a music composition desk, and an orbital mechanics laboratory. Each demo is a standalone application with its own source code and setup instructions. YouTube walkthroughs are included where available.

Use this repository to try the demos, explore how they work, or build on their ideas. Follow the linked project READMEs for installation, development, and build instructions.

## Run all demos

Install each demo’s dependencies with `bun install` in its directory, then run from the repository root:

```sh
./run-all.sh
```

The launcher starts Edificio Europa on [port 3000](http://localhost:3000), InfiniCave on [port 3001](http://localhost:3001), Tonada on [port 3002](http://localhost:3002), Tarot Spread on [port 3003](http://localhost:3003), and Orbital on [port 3004](http://localhost:3004). Logs are labelled by demo. Press **Ctrl+C** to stop all five; if a demo exits, the launcher stops the others too. The assigned ports must be free.

Browser saves are specific to each address and port. Export existing projects or saves before moving a demo to a different port, then import them at its new address.

## Current demos

### Edificio Europa — Architectural explorer

An interactive, photo-based reconstruction of Edificio Europa in Valencia. Explore the building with free orbit, pan, and zoom, or use three animated camera presets. Switch between daylight, golden-hour, and blue-hour lighting, and export the current view as a 4K PNG. The model is an interpretive reconstruction rather than a measured architectural survey.

[![Edificio Europa — 3D demo](https://i.ytimg.com/vi/YwKfrL4P3N4/hqdefault.jpg)](https://youtu.be/YwKfrL4P3N4)

[Edificio Europa — 3D demo](https://youtu.be/YwKfrL4P3N4)

[Source and setup](./edificio-europa/README.md)

### Arcana — The Reading Room

An Art Deco tarot experience with animated Three.js cards, four spreads, and card-by-card explanations and combined readings in English and Spanish. Choose between Rider–Waite–Smith and Grand Etteilla decks, switch among three visual themes, and enlarge cards for a closer look. New decks can be added through folders of consistently named images.

[![Tarot Spread — Arcana demo](https://i.ytimg.com/vi/7ZIemecE9Cg/hqdefault.jpg)](https://youtu.be/7ZIemecE9Cg)

[Tarot Spread — Arcana demo](https://youtu.be/7ZIemecE9Cg)

[Source and setup](./tarot-spead/README.md) · [Adding a deck](./tarot-spead/DECKS.md)

### InfiniCave — Helicopter cave expedition

A single-player, side-view exploration game inspired by John Vanderaart’s Eindeloos. Pilot an armed helicopter through seeded caverns and mechanical ruins, activate relays, and shut down the cave’s heart. Choose from three finite map sizes, discover optional routes, survive enemies and timed hazards, and recover at repair checkpoints. Each expedition keeps its own local save, with autosaving and JSON import/export.

[![InfiniCave — Helicopter cave expedition demo](https://i.ytimg.com/vi/m6Nl7rRFqCg/hqdefault.jpg)](https://youtu.be/m6Nl7rRFqCg)

[InfiniCave — Helicopter cave expedition demo](https://youtu.be/m6Nl7rRFqCg)

[Source and setup](./infinicave/README.md) · [Game specification](./infinicave/specs/infinicave.md)

### Tonada — Music composition desk

A local music composition desk built with Three.js and Web Audio. Create patterns with a zoomable piano roll, drum grid, and chord tools, or start from five arrangement templates. Shape sounds with synthesis, FM, and sampling, mix tracks in a 3D room, and chain patterns into songs. Projects stay on your device, with JSON import/export and WAV and MIDI export; classic house and ambient soul example projects are included.

[![Tonada — Music composition desk demo](https://i.ytimg.com/vi/8P9yiukoHns/hqdefault.jpg)](https://youtu.be/8P9yiukoHns)

[Tonada — Music composition desk demo](https://youtu.be/8P9yiukoHns)

[Source and setup](./tonada/README.md) · [Example projects](./tonada/examples/README.md)

### Orbital — Mechanics laboratory

An interactive spacecraft dynamics and mission-planning workspace built with Three.js and a physics simulation running in a Web Worker. Place spacecraft in orbit, plan impulsive or finite-duration burns, and inspect how their trajectories and orbital elements change. Explore Earth–Moon transfers and lunar capture, compare planned and coasting paths, switch reference frames, and accelerate or replay mission time. Includes a simplified Earth–Mars scenario, a Hohmann transfer helper, analysis charts, and local mission saves with JSON import/export.

[![Orbital — Mechanics laboratory demo](https://i.ytimg.com/vi/hqoUdaAgZiw/hqdefault.jpg)](https://youtu.be/hqoUdaAgZiw)

[Orbital — Mechanics laboratory demo](https://youtu.be/hqoUdaAgZiw)

[Source and setup](./orbital-mechanics-laboratory/README.md) · [Demo specification](./orbital-mechanics-laboratory/specs/orbital-mechanics-laboratory.md)

---

## Principles of Participation

Everyone is invited and welcome to contribute: open issues, propose pull requests, share ideas, or help improve documentation. Participation is open to all, regardless of background or viewpoint.

This project follows the [FOSS Pluralism Manifesto](./FOSS_PLURALISM_MANIFESTO.md), which affirms respect for people, freedom to critique ideas, and space for diverse perspectives.

Before submitting a change, complete its verification tasks and update the
relevant OpenSpec artifacts when behavior or requirements change.

## License and Copyright

Copyright (c) 2026 Iwan van der Kleijn

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.
