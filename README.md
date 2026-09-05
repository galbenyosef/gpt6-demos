# Arcana — The Reading Room

A bilingual, Art Deco tarot app built with React, Three.js, and Bun. Gold-edged 3D cards float, lift, and turn to reveal their faces. All 78 cards have English and Spanish interpretations, including reversed readings, position-specific explanations, and a combined outcome.

## Run

```sh
bun install
bun run dev
```

Open `http://localhost:3000`. Set `PORT` to use a different port.

```sh
bun test
bun run typecheck
bun run build
```

`bun run build` produces a standalone static site in `dist/`. The development server uses Bun HTML imports and discovers decks on each catalog request. The static build refreshes the deck catalog before bundling.

## Reading features

- Daily Reflection: one guiding card.
- Past, Present & Future: three perspectives through time.
- The Path Forward: situation, challenge, support, advice, potential.
- The Celtic Cross: the traditional ten-position cross and staff arrangement.
- Click or keyboard-activate a card to turn it in either direction; reveal all with a staggered animation.
- Select a revealed position below the table to revisit its interpretation.
- Switch English/Spanish or deck without losing the current draw.
- Change spread, shuffle, or toggle reversals to begin a fresh draw. Cards are sampled without replacement using browser cryptographic randomness.
- Optional reversed cards, reduced-motion preferences, keyboard access, native focus-trapped dialogs, responsive layouts, and a non-WebGL fallback.

Interpretations are authored reflection prompts, not AI-generated answers or predictions. An optional question is kept as a personal reflection prompt; its text does not change the random draw. Only language preference is saved locally; questions and readings remain in memory.

## Add a deck without changing code

1. Add a folder `public/decks/my-new-deck/` (lowercase letters, numbers, and hyphens).
2. Add all **78 images** using the canonical filenames in [DECKS.md](DECKS.md). JPG, JPEG, PNG, WebP, and AVIF are supported; extensions must be lowercase. Images may use different extensions within one deck.
3. Reload the app while the development server is running. For a static deployment, run `bun run build` again and publish the new output.

No registry edit is required. Complete folders are automatically listed, and the display name is derived from the folder name. Incomplete folders are omitted with a server/build warning. Copy an existing deck directory as a naming reference. Portrait images around 600 × 1000 pixels work well; original artwork is stretched to the shared card geometry.

An optional `deck.json` customizes the name, description, and meanings:

```json
{
  "name": { "en": "My New Deck", "es": "Mi nueva baraja" },
  "description": { "en": "A new view of the symbols.", "es": "Una nueva mirada a los símbolos." },
  "overrides": {
    "fool": {
      "name": { "en": "The Wanderer", "es": "El Caminante" },
      "theme": { "en": "Exploration", "es": "Exploración" },
      "meaning": { "en": "Meet a new path with curiosity.", "es": "Recibe un nuevo camino con curiosidad." },
      "advice": { "en": "Take a small first step.", "es": "Da un pequeño primer paso." },
      "reversed": { "en": "Pause to consider your direction.", "es": "Detente a considerar tu dirección." }
    }
  }
}
```

Supply both languages for each customized field. Without overrides, new decks inherit the standard Rider–Waite–Smith-inspired reflection text. Filenames are stable artwork slots, while visible names and interpretations can differ between decks.

## Included historical decks

Original downloads remain in `rider-waite-tarot/` and `etteilla-tarot/`, including their source and licensing documents. Optimized, consistently named images are in `public/decks/`. Each included deck also has a `source-map.json` connecting normalized filenames to original scans.

**Rider–Waite–Smith:** 78 public-domain images featuring Pamela Colman Smith's artwork.

**Grand Etteilla:** 78 historical images supplied via Benebell Wen. Etteilla is a different tarot system: its major-card filenames occupy shared artwork slots for interchangeability, but the interface retains its distinct card identities (Chaos, Rest, Plants, and so on). Its text is explicitly presented as modern image-inspired reflection, not an authentic reconstruction of historical Etteilla divination. Minor-suit Coins use the shared `pentacles` filename convention. The printed artwork retains its original language.

To regenerate optimized included images from the originals, run `python3 scripts/prepare-decks.py` with Pillow installed. This is an optional asset preparation step, not a runtime dependency.

## Implementation

- `src/App.tsx`: reading flow, language, settings, dialogs, and interpretation views.
- `src/CardTable.tsx`: Three.js card geometry, textures, animation, resource cleanup, and fallback.
- `src/data.ts`: canonical identities, bilingual readings, spreads, and shuffle logic.
- `scripts/decks.ts`: filesystem discovery and Etteilla-specific identity overrides.
- `index.ts`: Bun development/production server with HTML imports.
- `scripts/build.ts`: Bun static build and deck-catalog generation.
- `src/webmcp.ts`: optional, feature-detected reading/reveal tools for compatible browsers. The app works without WebMCP. No compatible browser was available for end-to-end WebMCP validation in the implementation environment.

Tests cover complete bilingual data, unique random draws, reversal behavior, spread definitions, normalized assets, and historical identity mapping. Type checking and the production build are separate commands above. Browser visual verification was unavailable in the implementation environment.
