import { readdir } from 'node:fs/promises';
import { validatePack, type Pack } from '../src/packs';
export async function catalog() {
  const packs: Pack[] = [];
  for (const slug of await readdir('public/packs')) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
    try {
      const pack = validatePack(await Bun.file(`public/packs/${slug}/pack.json`).json());
      if (pack.slug !== slug) throw new Error('Folder and slug disagree.');
      for (const pre of pack.presets)
        if (pre.generator) pre.audio = `./packs/${slug}/${pre.id}.wav`;
      packs.push(pack);
    } catch (e) {
      console.warn(`Omitting pack ${slug}: ${e}`);
    }
  }
  return packs;
}
