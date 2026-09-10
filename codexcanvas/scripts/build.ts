const result = await Bun.build({ entrypoints: ['./src/server/index.ts'], target: 'bun', outdir: './dist', minify: true, sourcemap: 'external' });
if (!result.success) { console.error(result.logs); process.exit(1); }
console.log(`Built ${result.outputs.length} files. Run bun run start.`);
