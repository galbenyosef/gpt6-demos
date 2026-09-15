/** Isolated, long-running Linux CEF regression check. Never controls the user's app. */
import { mkdtemp, symlink, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "@playwright/test";
import config from "../electrobun.config";

if (process.platform !== "linux")
  throw new Error("This regression reproduces a Linux CEF helper issue.");
const root = resolve(import.meta.dir, "..");
const scratch = await mkdtemp("/tmp/omm-native-stability-");
for (const name of ["apps", "packages", "node_modules", "dist"])
  await symlink(join(root, name), join(scratch, name), "dir");
await Bun.write(
  join(scratch, "package.json"),
  await Bun.file(join(root, "package.json")).text(),
);
await Bun.write(
  join(scratch, "hutch.config.ts"),
  await Bun.file(join(root, "hutch.config.ts")).text(),
);
const testConfig = {
  ...config,
  app: {
    ...config.app,
    name: "One More Match Regression",
    identifier: `com.onemorematch.regression-${Date.now()}`,
  },
};
await Bun.write(
  join(scratch, "electrobun.config.ts"),
  `export default ${JSON.stringify(testConfig)};`,
);
const command = [
  process.execPath,
  join(root, "node_modules/electrobun/bin/electrobun.cjs"),
  "build",
  "--env=dev",
];
const build = Bun.spawn(command, {
  cwd: scratch,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await build.exited) !== 0) throw new Error("Isolated native build failed");
const bin = join(scratch, "build/dev-linux-x64/OneMoreMatchRegression-dev/bin");
let log = "";
const app = Bun.spawn([join(bin, "launcher")], {
  cwd: bin,
  env: {
    ...process.env,
    ONE_MORE_MATCH_DATA_DIR: join(scratch, "data"),
    ELECTROBUN_CEF_REMOTE_DEBUGGING_PORT: "9228",
  },
  stdout: "pipe",
  stderr: "pipe",
});
const capture = async (stream: ReadableStream<Uint8Array>) => {
  const decoder = new TextDecoder();
  for await (const chunk of stream)
    log += decoder.decode(chunk, { stream: true });
};
const captures = Promise.all([capture(app.stdout), capture(app.stderr)]);
const duration = Number(process.env.OMM_STABILITY_SECONDS ?? 310) * 1000;
const logPath = join(root, "test-results/native-stability.log");
await mkdir(join(root, "test-results"), { recursive: true });
let base = "",
  browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
try {
  for (let i = 0; i < 200; i++) {
    if (log.includes("One More Match desktop")) break;
    if (app.exitCode !== null) throw new Error("Native app exited at startup");
    await Bun.sleep(100);
  }
  base =
    log.match(/One More Match desktop · (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ??
    "";
  if (!base) throw new Error("No backend startup URL");
  browser = await chromium.connectOverCDP("http://127.0.0.1:9228");
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().startsWith(base))!;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "LET’S PLAY" }).click();
  await page.getByRole("button", { name: /KICK OFF/ }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press("j");
  const started = Date.now();
  let probes = 0;
  while (Date.now() - started < duration) {
    if (app.exitCode !== null)
      throw new Error(`Native process exited: ${app.exitCode}`);
    if (
      /stack smashing detected|unrecoverable error|GPU process exited unexpectedly/.test(
        log,
      )
    )
      throw new Error(
        "Native subprocess failure; inspect native-stability.log",
      );
    const result = await page.evaluate(async () => {
      const health = await fetch("/api/v1/health").then((r) => r.json());
      const gl = document.querySelector("canvas")?.getContext("webgl2");
      return { healthy: health.ok, context: !!gl && !gl.isContextLost() };
    });
    if (!result.healthy || !result.context)
      throw new Error("Backend or WebGL context stopped working");
    if (await page.getByRole("button", { name: /SECOND HALF/ }).isVisible())
      await page.getByRole("button", { name: /SECOND HALF/ }).click();
    console.log(
      `Native stability: ${Math.round((Date.now() - started) / 1000)}s — backend and WebGL healthy`,
    );
    probes++;
    await Bun.write(logPath, log);
    await Bun.sleep(
      Math.min(30000, Math.max(1, duration - (Date.now() - started))),
    );
  }
  const details = await page.evaluate(() => {
    const gl = document.querySelector("canvas")!.getContext("webgl2")!;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      width: innerWidth,
      height: innerHeight,
      renderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : "unknown",
    };
  });
  if (errors.length) throw new Error(errors.join("\n"));
  await page.screenshot({
    path: join(root, "test-results/native-stability.png"),
  });
  await page.evaluate(async () => {
    await fetch("/api/v1/quit", { method: "POST" });
  });
  const code = await Promise.race([
    app.exited,
    Bun.sleep(10000).then(() => null),
  ]);
  if (code !== 0) throw new Error(`Native app did not quit cleanly: ${code}`);
  await captures;
  if (/stack smashing detected/.test(log))
    throw new Error("Stack-canary failure during shutdown");
  const report = {
    seconds: Math.round((Date.now() - started) / 1000),
    probes,
    exitCode: code,
    ...details,
  };
  await Bun.write(
    join(root, "test-results/native-stability.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("PASS", JSON.stringify(report));
} finally {
  await Bun.write(logPath, log);
  // Only the isolated child process is ever terminated here.
  if (app.exitCode === null) {
    app.kill("SIGTERM");
    await Promise.race([app.exited, Bun.sleep(5000)]);
    if (app.exitCode === null) app.kill("SIGKILL");
  }
  await browser?.close().catch(() => {});
  if (app.exitCode !== null)
    await rm(scratch, { recursive: true, force: true });
  console.log(`Native test log: ${logPath}`);
}
