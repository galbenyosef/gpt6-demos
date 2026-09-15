import { cp, mkdir, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
const result = await Bun.build({
  entrypoints: ["apps/client/index.html"],
  outdir: "dist",
  minify: true,
  sourcemap: "linked",
  target: "browser",
  naming: "[name]-[hash].[ext]",
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
const html = result.outputs.find((o) => o.path.endsWith(".html"))!;
await Bun.write("dist/index.html", await html.text());
await cp("public", "dist", { recursive: true });
console.log("Browser app built into dist/");
