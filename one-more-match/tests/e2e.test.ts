import { test, expect } from "bun:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { startServer } from "../apps/server/server";
import { mkdtemp, rm } from "node:fs/promises";
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const wait = async (fn: () => boolean, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end)
      throw new Error("State did not reach expected condition");
    await new Promise((r) => setTimeout(r, 30));
  }
};
test("browser: selection, controls, pause, settings, recovery and 20 rendered rematches", async () => {
  const dir = await mkdtemp("/tmp/omm-e2e-"),
    app = await startServer({ port: 0, dataDir: dir });
  let browser: Browser | undefined;
  const errors: string[] = [];
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: executable,
      args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    const url = `http://127.0.0.1:${app.server.port}`;
    await page.goto(url);
    await page.getByRole("button", { name: "LET’S PLAY" }).click();
    expect(await page.locator(".country-card").count()).toBe(20);
    await page.getByRole("button", { name: /BRA Brazil/ }).click();
    await page.locator("select").selectOption("ARG");
    await page.getByRole("button", { name: /KICK OFF/ }).click();
    await wait(() => app.simulation?.state.phase === "kickoff");
    await page.keyboard.press("j");
    await wait(() => app.simulation?.state.phase === "playing");
    expect(app.simulation!.state.setup.country).toBe("BRA");
    expect(app.simulation!.state.stats.passes[0]).toBe(1);
    const before =
      app.simulation!.state.players[app.simulation!.state.controlled]!.x;
    await page.keyboard.down("d");
    await page.waitForTimeout(800);
    await page.keyboard.up("d");
    expect(
      app.simulation!.state.players[app.simulation!.state.controlled]!.x,
    ).toBeGreaterThan(before);
    await page.keyboard.press("l");
    await page.keyboard.down("k");
    await page.waitForTimeout(100);
    await page.keyboard.up("k");
    await page.keyboard.press("Escape");
    await wait(() => app.simulation?.state.phase === "paused");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator("select").selectOption("low");
    await page.getByRole("button", { name: /SAVE SETTINGS/ }).click();
    expect((await app.storage.profiles.get()).settings.quality).toBe("low");
    await page.getByRole("button", { name: /BACK TO THE MATCH/ }).click();
    await wait(() => app.simulation?.state.phase === "playing");
    // Accelerate only the test fixture's clock; production has no debug endpoints.
    app.simulation!.state.elapsed = 149.999;
    app.simulation!.step();
    await page.getByRole("button", { name: /SECOND HALF/ }).click();
    await wait(() => app.simulation?.state.half === 2);
    expect(app.simulation!.state.phase).toBe("kickoff");
    await page.reload();
    await page.getByRole("button", { name: /Resume your match/ }).click();
    await page.getByRole("button", { name: /BACK TO THE MATCH/ }).click();
    await wait(() => app.simulation?.state.phase !== "paused");
    for (let i = 0; i < 20; i++) {
      const sim = app.simulation!;
      sim.state.half = 2;
      sim.state.elapsed = 299.999;
      sim.phase("playing");
      sim.step();
      await page.getByRole("button", { name: /ONE MORE MATCH/ }).waitFor();
      const old = sim.state.id;
      await page.getByRole("button", { name: /ONE MORE MATCH/ }).click();
      await wait(
        () =>
          app.simulation?.state.id !== old &&
          app.simulation?.state.phase === "kickoff",
      );
      expect(app.simulation!.state.setup.country).toBe("BRA");
      expect(app.simulation!.state.opponent).toBe("ARG");
      expect(app.simulation!.state.score).toEqual([0, 0]);
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Main menu", exact: true }).click();
    await page.getByRole("button", { name: /LEAVE MATCH/ }).click();
    await page.getByRole("button", { name: /KICK OFF/ }).waitFor();
    expect((await app.storage.results.list(100)).length).toBe(20);
    await page.setViewportSize({ width: 960, height: 640 });
    await page.screenshot({
      path: "test-results/selection-960.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 180000);
