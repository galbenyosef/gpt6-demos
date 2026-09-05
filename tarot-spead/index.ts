import page from './index.html';
import { discoverDecks } from './scripts/decks';
const publicRoot = new URL('./public/', import.meta.url).pathname;
const server = Bun.serve({
 port: Number(process.env.PORT || 3000),
 routes: {'/':page,'/api/decks':{GET:async()=>Response.json(await discoverDecks())},'/decks.json':{GET:async()=>Response.json(await discoverDecks())}},
 async fetch(req){const path=decodeURIComponent(new URL(req.url).pathname);if(path.includes('..')||path.includes('\\'))return new Response('Not found',{status:404});const file=Bun.file(publicRoot+path.replace(/^\//,''));if(await file.exists())return new Response(file);return new Response('Not found',{status:404});},
 development:process.env.NODE_ENV!=='production'?{hmr:true,console:true}:false,
});
console.log(`Arcana is ready at ${server.url}`);
