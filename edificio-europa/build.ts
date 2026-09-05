import { cp, mkdir } from 'node:fs/promises';
const result = await Bun.build({entrypoints:['./index.html'],outdir:'./dist',minify:true,target:'browser',sourcemap:'linked'});
if (!result.success) { console.error(result.logs); process.exit(1); }
await mkdir('dist/stock-images',{recursive:true});
await cp('stock-images','dist/stock-images',{recursive:true});
console.log(`Built ${result.outputs.length} assets and copied reference photographs.`);
