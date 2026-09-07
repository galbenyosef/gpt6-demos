import { type Voice } from './document';
import { validateVoice } from './validation';
export type Preset = {
  id: string;
  name: { en: string; es: string };
  voice: Voice;
  generator?: { id: 'pluck'; frequency: number; duration: number };
  audio?: string;
};
export type Pack = {
  slug: string;
  name: { en: string; es: string };
  description: { en: string; es: string };
  presets: Preset[];
};
export function validatePack(value: unknown): Pack {
  const pack = value as Pack;
  if (!pack || !/^([a-z0-9]+-)*[a-z0-9]+$/.test(pack.slug)) throw new Error('Invalid pack slug.');
  for (const text of [pack.name, pack.description])
    if (!text || typeof text.en !== 'string' || !text.en || typeof text.es !== 'string' || !text.es)
      throw new Error('Pack needs English and Spanish text.');
  if (!Array.isArray(pack.presets) || !pack.presets.length) throw new Error('Pack has no presets.');
  const ids = new Set();
  for (const preset of pack.presets) {
    if (!/^[a-z0-9-]+$/.test(preset.id) || ids.has(preset.id))
      throw new Error('Invalid preset ID.');
    ids.add(preset.id);
    if (!preset.name?.en || !preset.name.es) throw new Error('Preset needs bilingual names.');
    validateVoice(preset.voice);
    if (preset.voice.mode === 'sampler') {
      const g = preset.generator;
      if (
        !g ||
        g.id !== 'pluck' ||
        !Number.isFinite(g.frequency) ||
        g.frequency < 30 ||
        g.frequency > 4000 ||
        !Number.isFinite(g.duration) ||
        g.duration < 0.1 ||
        g.duration > 10
      )
        throw new Error('Invalid sample generator.');
    }
  }
  return pack;
}
export async function loadPacks(): Promise<Pack[]> {
  const r = await fetch('./packs/catalog.json');
  if (!r.ok) throw new Error('Could not load instrument packs.');
  return (await r.json()).map(validatePack);
}
