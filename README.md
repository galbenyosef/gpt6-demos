# GPT6 Demos

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE.md)
[![Bun](https://img.shields.io/badge/Runtime-Bun-14151a?logo=bun&logoColor=white)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/3D-Three.js-000000?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Contributions welcome](https://img.shields.io/badge/Contributions-welcome-brightgreen.svg)](#principles-of-participation)

A collection of interactive web demos exploring 3D graphics, visual design, and browser-based experiences. Built with Bun, TypeScript, and Three.js, the projects include an architectural explorer, a tarot reading room, and a helicopter cave expedition. Each demo is a standalone application with its own source code and setup instructions. YouTube walkthroughs are included where available.

Use this repository to try the demos, explore how they work, or build on their ideas. Follow the linked project READMEs for installation, development, and build instructions.

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

---

## Principles of Participation

Everyone is invited and welcome to contribute: open issues, propose pull requests, share ideas, or help improve documentation. Participation is open to all, regardless of background or viewpoint.

This project follows the [FOSS Pluralism Manifesto](./FOSS_PLURALISM_MANIFESTO.md), which affirms respect for people, freedom to critique ideas, and space for diverse perspectives.

Before submitting a change, complete its verification tasks and update the
relevant OpenSpec artifacts when behavior or requirements change.

## License and Copyright

Copyright (c) 2026 Iwan van der Kleijn

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.
