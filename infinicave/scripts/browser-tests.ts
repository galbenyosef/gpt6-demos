import { chromium } from "@playwright/test";
const env = { ...process.env };
const build = Bun.spawn(["bun", "scripts/build.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (await build.exited)
  throw new Error("Production build failed before browser tests.");
const harness = await Bun.build({
  entrypoints: ["tests/browser/harness.ts"],
  target: "browser",
  format: "iife",
  minify: true,
});
if (!harness.success) throw new Error(harness.logs.join("\n"));
env.INFINICAVE_HARNESS = "/tmp/infinicave-browser-harness.js";
await Bun.write(env.INFINICAVE_HARNESS, harness.outputs[0]!);
if (
  !env.CHROMIUM_PATH &&
  !(await Bun.file(chromium.executablePath()).exists())
) {
  const cache = `${process.env.HOME}/.cache/ms-playwright`;
  try {
    const candidates = Array.from(
      new Bun.Glob("chromium-*/chrome-linux64/chrome").scanSync({
        cwd: cache,
        absolute: true,
      }),
    ).sort();
    env.CHROMIUM_PATH = candidates.at(-1);
  } catch {}
}
const result = Bun.spawn(
  ["node_modules/.bin/playwright", "test", ...process.argv.slice(2)],
  { env, stdout: "inherit", stderr: "inherit" },
);
process.exit(await result.exited);
