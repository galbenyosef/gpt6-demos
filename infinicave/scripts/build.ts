const result = await Bun.build({
  entrypoints: ["./index.html", "./src/generation.worker.ts"],
  outdir: "./dist",
  target: "browser",
  minify: true,
  sourcemap: "linked",
  naming: {
    entry: "[name].[ext]",
    chunk: "[name]-[hash].[ext]",
    asset: "[name]-[hash].[ext]",
  },
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
const emitted = new Set(
  result.outputs.map((output) => output.path.split("/").at(-1)),
);
// Remove only this bundler's superseded generated filenames after a successful build.
for (const file of new Bun.Glob("*").scanSync("dist")) {
  if (
    /^(index(-[a-z0-9]+)?\.(html|js|css)(\.map)?|generation\.worker\.js(\.map)?)$/.test(
      file,
    ) &&
    !emitted.has(file)
  )
    await Bun.file(`dist/${file}`).delete();
}
for (const font of ["DM-Sans", "Space-Grotesk"])
  await Bun.write(
    `dist/licenses/${font}.txt`,
    Bun.file(`src/fonts/${font}-LICENSE.txt`),
  );
console.log(`Built ${result.outputs.length} static assets in dist/`);
