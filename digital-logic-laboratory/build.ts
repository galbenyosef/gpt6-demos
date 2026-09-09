const results = await Promise.all([
  Bun.build({
    entrypoints: ["index.html"],
    outdir: "dist",
    target: "browser",
    minify: true,
  }),
  Bun.build({
    entrypoints: ["src/simulator/worker.ts"],
    outdir: "dist",
    naming: "worker.js",
    target: "browser",
    minify: true,
  }),
]);
for (const result of results)
  if (!result.success) {
    console.error(...result.logs);
    process.exit(1);
  }
console.log("Static application built in dist/");

export {};
