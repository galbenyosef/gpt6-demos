const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  target: "browser",
  minify: true,
});
const worker = await Bun.build({
  entrypoints: ["./src/simulation/worker.ts"],
  outdir: "./dist",
  naming: "worker.js",
  target: "browser",
  minify: true,
});
if (!result.success || !worker.success) {
  console.error(...result.logs, ...worker.logs);
  process.exit(1);
}
console.log("Static application built in dist/");

await Bun.write("./dist/earth.jpg", Bun.file("./public/earth.jpg"));
