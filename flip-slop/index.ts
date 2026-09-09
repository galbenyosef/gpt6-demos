import page from './src/index.html';
import { createApi } from './server/api';
const production=process.env.NODE_ENV==='production';
const api=createApi();
const server=Bun.serve({
  hostname:'127.0.0.1',port:Number(process.env.PORT)||3000,
  maxRequestBodySize:85_000_000,idleTimeout:255,
  development:production?false:{hmr:true,console:true},
  routes:{'/':production?()=>new Response(Bun.file('dist/index.html')):page,'/api/*':api,'/gif-worker.js':async()=>{if(production)return new Response(Bun.file('dist/gif-worker.js'));const result=await Bun.build({entrypoints:['./src/gif.worker.ts'],target:'browser',env:'disable'});return result.success?new Response(result.outputs[0],{headers:{'Content-Type':'application/javascript'}}):new Response('Worker build failed',{status:500});}},
  async fetch(req){
    const path=new URL(req.url).pathname;
    if(production){
      const name=path==='/'?'index.html':path.slice(1);
      if(/^[\w.-]+$/.test(name)&&/\.(html|js|css|woff2|png|svg)$/.test(name)){
        const file=Bun.file(`dist/${name}`);if(await file.exists())return new Response(file,{headers:{'X-Content-Type-Options':'nosniff'}});
      }
    }
    return new Response('Not found',{status:404});
  }
});
console.log(`Flip-slop studio: ${server.url}`);
