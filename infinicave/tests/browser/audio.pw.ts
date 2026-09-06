import { test, expect } from "@playwright/test";

test("optional audio controls persist and preserve old rotor mute", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "infinicave-settings",
      JSON.stringify({ effects: 0, music: 0.3 }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Helicopter volume" }),
  ).toHaveValue("0");
  await expect(page.getByRole("slider", { name: "Music volume" })).toHaveValue(
    "0.3",
  );
  for (const [label, value] of [
    ["Helicopter volume", "0.65"],
    ["Effects volume", "0.4"],
    ["Music volume", "0.25"],
  ]) {
    await page.getByRole("slider", { name: label }).fill(value!);
  }
  await page.getByRole("checkbox", { name: "Mute all audio" }).check();
  await page.screenshot({
    path: "/tmp/infinicave-audio-settings.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Mute all audio" }),
  ).toBeChecked();
  await expect(
    page.getByRole("slider", { name: "Helicopter volume" }),
  ).toHaveValue("0.65");
  await expect(
    page.getByRole("slider", { name: "Effects volume" }),
  ).toHaveValue("0.4");
  await expect(page.getByRole("slider", { name: "Music volume" })).toHaveValue(
    "0.25",
  );
  await page.getByRole("checkbox", { name: "Mute all audio" }).uncheck();
  await page.evaluate(() => localStorage.removeItem("infinicave-settings"));
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Music volume" })).toHaveValue(
    "0",
  );
});

test("Web Audio emits independent channels, changes pitch, mutes and cleans up", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.addScriptTag({ path: process.env.INFINICAVE_HARNESS! });
  const result = await page.evaluate(() =>
    (window as any).caveHarness.audioAudit(),
  );
  for (const channel of [result.helicopter, result.effects, result.music]) {
    expect(channel.rms).toBeGreaterThan(0.00001);
    expect(channel.peak).toBeLessThan(1);
  }
  for (const channel of [result.silent, result.effectsIdle, result.muted])
    expect(channel.rms).toBeLessThan(0.000001);
  expect(result.climbPitch).toBeGreaterThan(result.descentPitch);
  expect(result.paused).toEqual({ state: "suspended", voices: 0 });
  expect(result.loops).toBe(5);
  expect(result.scheduled).toBeGreaterThan(9);
  expect(result.drained).toBe(0);
  expect(result.tailState).toBe("running");
  expect(result.tailEnded).toEqual({ state: "suspended", voices: 0 });
  expect(errors).toEqual([]);
});
