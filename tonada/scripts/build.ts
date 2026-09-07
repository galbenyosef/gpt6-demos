import { mkdir, cp } from 'node:fs/promises';
import { catalog } from './catalog';
await mkdir('dist', { recursive: true });
const packs = await catalog();
await Bun.write('public/packs/catalog.json', JSON.stringify(packs));
const result = await Bun.build({
  entrypoints: ['index.html'],
  outdir: 'dist',
  minify: true,
  target: 'browser',
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
await cp('public', 'dist', { recursive: true });
console.log(`Built Tonada: ${result.outputs.length} bundles, ${packs.length} packs.`);
