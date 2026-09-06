const result = await Bun.build({ entrypoints: ['./index.html', './src/generation.worker.ts'], outdir: './dist', target: 'browser', minify: true, sourcemap: 'linked', naming: { entry: '[name].[ext]', chunk: '[name]-[hash].[ext]', asset: '[name]-[hash].[ext]' } });
if (!result.success) { console.error(result.logs); process.exit(1); }
console.log(`Built ${result.outputs.length} static assets in dist/`);
