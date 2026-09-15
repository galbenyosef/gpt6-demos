import { mkdir } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP(
  process.env.CDP_URL ?? "http://127.0.0.1:9222",
);
const pages = browser.contexts().flatMap((c) => c.pages());
console.log("Native windows:", pages.length);
const page = pages.find((p) => p.url().includes("127.0.0.1"))!;
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page
  .getByRole("button", { name: "LET’S PLAY" })
  .waitFor({ timeout: 30000 });
await page.screenshot({ path: "test-results/native-home.png" });
await page.getByRole("button", { name: "LET’S PLAY" }).click();
await page.getByRole("button", { name: /KICK OFF/ }).click();
await page.waitForTimeout(1800);
await page.keyboard.press("j");
await page.keyboard.down("d");
await page.waitForTimeout(2000);
await page.keyboard.up("d");
await page.screenshot({ path: "test-results/native-match.png" });
console.log(
  await page.evaluate(async () => {
    const gaps: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 120; i++)
      await new Promise<void>((r) =>
        requestAnimationFrame((t) => {
          gaps.push(t - last);
          last = t;
          r();
        }),
      );
    gaps.sort((a, b) => a - b);
    return {
      userAgent: navigator.userAgent,
      frames: 120,
      p95: gaps[Math.floor(gaps.length * 0.95)],
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
      renderer: (() => {
        const gl = document.querySelector("canvas")!.getContext("webgl2")!;
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        return info
          ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
          : "unavailable";
      })(),
    };
  }),
);
await page.keyboard.press("Escape");
await page.getByText("Football can wait.").waitFor();
console.log("Native pause verified");
await browser.close();
