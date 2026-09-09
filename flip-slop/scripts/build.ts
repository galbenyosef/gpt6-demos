const result = await Bun.build({ entrypoints: ["./src/index.html"], outdir: "./dist", target: "browser", minify: true, env: "disable" });
if (!result.success) { console.error(result.logs); process.exit(1); }
console.log(`Built ${result.outputs.length} browser assets. Start with bun run start.`);

const worker = await Bun.build({entrypoints:['./src/gif.worker.ts'],outdir:'./dist',naming:'gif-worker.js',target:'browser',minify:true,env:'disable'});
if(!worker.success){console.error(worker.logs);process.exit(1);}
