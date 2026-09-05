import { cp, mkdir, rm } from 'node:fs/promises';
import { discoverDecks } from './decks';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
await Bun.write('public/decks.json',JSON.stringify(await discoverDecks(),null,2));
const result=await Bun.build({entrypoints:['index.html'],outdir:'dist',minify:true,target:'browser',sourcemap:'external'});
if(!result.success){console.error(result.logs);process.exit(1);}await cp('public','dist',{recursive:true});console.log('Production build ready in dist/');
