import { mkdir } from "node:fs/promises";
await mkdir(".build", { recursive: true });
const result = await Bun.build({ entrypoints: ["src/frontend/index.html"], outdir: "dist", target: "browser", minify: true });
if (!result.success) { console.error(result.logs); process.exit(1); }
const runtime = await Bun.build({ entrypoints: ["src/backend/sandbox/entry.ts", "src/backend/render/render-page.ts"], outdir: ".build", target: "browser", minify: true });
if (!runtime.success) { console.error(runtime.logs); process.exit(1); }
console.info("Frontend, modelling runtime and renderer built successfully.");
