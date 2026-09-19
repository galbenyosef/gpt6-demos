import { chromium } from "@playwright/test";
import { join } from "node:path";
const report = await Bun.file("benchmark-results.json").json();
const server = Bun.spawn([process.execPath, "apps/server/src/index.ts"], {
  env: {
    ...process.env,
    PORT: "4313",
    TRACEWORK_DATA_DIR: report.dataDirectory,
  },
  stdout: "ignore",
  stderr: "pipe",
});
let browser;
try {
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch("http://127.0.0.1:4313/api/health")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  browser = await chromium.launch({
    executablePath: process.env.TRACEWORK_CHROMIUM_PATH,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:4313");
  await page
    .getByRole("heading", { name: "Start with what you know." })
    .waitFor();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name: "Model", exact: true })
    .click();
  const input = page.getByLabel("Filter model objects");
  await input.waitFor();
  const times: number[] = [];
  for (let n = 0; n < 25; n++) {
    const start = performance.now();
    await input.fill(n % 2 ? "Synthetic" : "");
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  report.browserInteraction = {
    browser: await browser.version(),
    sampleCount: times.length,
    action: "Fill model filter and await two rendered frames",
    p95Milliseconds: times[Math.ceil(times.length * 0.95) - 1],
    viewport: { width: 1440, height: 1000 },
    includesPlaywrightTransport: true,
  };
  await Bun.write("benchmark-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.browserInteraction, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
