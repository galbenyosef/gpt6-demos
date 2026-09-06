import { test, expect, type Page } from "@playwright/test";
async function create(page: Page, name: string, seed: string) {
  await page
    .getByRole("button", { name: "New expedition", exact: true })
    .click();
  await page.getByLabel("Expedition name").fill(name);
  await page.getByLabel("World seed").fill(seed);
  await page.getByRole("button", { name: "Small 10–15 min" }).click();
  await page.getByRole("button", { name: "Create expedition" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for the descent?" }),
  ).toBeVisible();
}
async function readRecords(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("infinicave-v1", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const records = await new Promise<any[]>((resolve, reject) => {
      const req = db.transaction("contexts").objectStore("contexts").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return records;
  });
}
test("create, fly, pause, save, reload and retain independent expeditions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The deep is calling." }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/infinicave-home.png", fullPage: true });
  await create(page, "Test A", "BROWSER-SEED");
  await page.getByRole("button", { name: "Begin expedition" }).click();
  await expect(page.getByText("HULL INTEGRITY")).toBeVisible();
  await page.keyboard.down("d");
  await page.waitForTimeout(600);
  await page.keyboard.up("d");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Flight paused." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(
    page.getByRole("heading", { name: "Test A", exact: true }),
  ).toBeVisible();
  const a = (await readRecords(page))[0].current.payload;
  expect(a.runtime.player.x).toBeGreaterThan(a.world.spawn.x);
  expect(a.runtime.tick).toBeGreaterThan(0);
  await create(page, "Test B", "BROWSER-SEED");
  await page.getByRole("button", { name: "Expeditions", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Test A", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Test B", exact: true }),
  ).toBeVisible();
  const records = await readRecords(page);
  expect(records).toHaveLength(2);
  expect(records[0].current.payload.world.hash).toBe(
    records[1].current.payload.world.hash,
  );
  expect(records.find((r) => r.id === a.id).current.payload.runtime).toEqual(
    a.runtime,
  );
  await page.getByRole("button", { name: "Play Test A", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to continue." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume flight" }).click();
  await page.screenshot({ path: "/tmp/infinicave-flight.png", fullPage: true });
  await page.keyboard.press("m");
  await expect(page.locator("#full-map")).toBeVisible();
  await page.screenshot({ path: "/tmp/infinicave-map.png", fullPage: true });
  await page.keyboard.press("m");
  await expect(page.getByText("HULL INTEGRITY")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(
    page.getByRole("heading", { name: "Flight paused." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("export/import round trip, tab ownership and malformed import safety", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await create(page, "Portable", "PORTABLE");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Play Portable" }).click();
  await expect(other.locator("#toast")).toContainText("another tab");
  await other.close();
  await page.getByRole("button", { name: "Begin expedition" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save expedition" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export save", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(
    page.getByRole("heading", { name: "Portable", exact: true }),
  ).toBeVisible();
  await page.locator("#import-file").setInputFiles(path!);
  await expect(
    page.getByRole("heading", { name: "Portable · imported", exact: true }),
  ).toBeVisible();
  const records = await readRecords(page);
  expect(records.length).toBe(2);
  expect(records[0].id).not.toBe(records[1].id);
  await page.locator("#import-file").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"payload":'),
  });
  await expect(page.locator("#toast")).toContainText("not valid JSON");
  expect((await readRecords(page)).length).toBe(2);
});

test("worker and nonworker generation agree across map sizes", async ({
  page,
}) => {
  const { generateWorld } = await import("../../src/generation");
  await page.goto("/");
  for (const size of ["small", "standard", "large"] as const) {
    const expected = (await generateWorld("BROWSER-PARITY", size)).hash;
    const actual = await page.evaluate(
      (size) =>
        new Promise<string>((resolve, reject) => {
          const worker = new Worker("/generation.worker.js", {
            type: "module",
          });
          worker.onmessage = ({ data }) => {
            if (data.world) {
              resolve(data.world.hash);
              worker.terminate();
            } else if (data.error) {
              reject(new Error(data.error));
              worker.terminate();
            }
          };
          worker.onerror = (e) => reject(new Error(e.message));
          worker.postMessage({ seed: "BROWSER-PARITY", size });
        }),
      size,
    );
    expect(actual).toBe(expected);
  }
});

test("failed Save & Exit stays paused with retry and export, then commits on retry", async ({
  page,
}) => {
  await page.goto("/");
  await create(page, "Quota browser", "QUOTA-BROWSER");
  await page.getByRole("button", { name: "Begin expedition" }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).restorePut = () =>
      (IDBObjectStore.prototype.put = original);
    IDBObjectStore.prototype.put = function () {
      throw new DOMException(
        "Browser test quota exceeded",
        "QuotaExceededError",
      );
    };
  });
  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(
    page.getByRole("heading", { name: "Flight paused." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export current progress" }),
  ).toBeVisible();
  await page.evaluate(() => (window as any).restorePut());
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.locator(".save-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(
    page.getByRole("heading", { name: "Quota browser", exact: true }),
  ).toBeVisible();
});

test("completed expeditions remain inspectable and remapped controls persist", async ({
  page,
}) => {
  const { generateWorld, digest } = await import("../../src/generation");
  const { createContext } = await import("../../src/simulation");
  const c = createContext(
    await generateWorld("COMPLETED-FIXTURE", "small"),
    "Completed test",
  );
  c.runtime.relays = 3;
  c.runtime.status = "completed";
  c.runtime.explored = c.world.rooms.map((r) => r.id);
  c.runtime.player.x = c.world.heart.x;
  c.runtime.player.y = c.world.heart.y;
  c.stats.completedAt = new Date().toISOString();
  c.stats.playTime = 540;
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "completed.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        payload: c,
        checksum: await digest(c),
        previousRevision: null,
      }),
    ),
  });
  await page
    .getByRole("button", {
      name: "Inspect Completed test · imported",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "The mountain falls silent." }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/infinicave-complete.png" });
  await page.getByRole("button", { name: "Inspect expedition map" }).click();
  await expect(page.locator("#full-map")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Return to expeditions" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: "Reduced flashing" }).check();
  await page.getByRole("button", { name: "Remap controls" }).click();
  await page.getByRole("button", { name: "Remap Fire", exact: true }).click();
  await page.keyboard.press("f");
  await expect(
    page.getByRole("button", { name: "Remap Fire", exact: true }),
  ).toHaveText("F");
  await page.reload();
  const prefs = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("infinicave-settings")!),
  );
  expect(prefs.controls.fire).toBe("KeyF");
  expect(prefs.reducedFlashing).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/infinicave-mobile-menu.png" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("repeated context switches release instance buffers and keep GPU resource counts bounded", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.addScriptTag({ path: process.env.INFINICAVE_HARNESS! });
  const result = await page.evaluate(() =>
    (window as any).caveHarness.resourceAudit(),
  );
  const stable = result.samples.slice(2);
  expect(new Set(stable.map((s: any) => s.geometries)).size).toBe(1);
  expect(new Set(stable.map((s: any) => s.textures)).size).toBe(1);
  expect(stable[0].calls).toBeLessThan(500);
  console.log("GPU resource audit:", JSON.stringify(result));
});

test("gamepad Menu resumes and pauses without toggling repeatedly while held", async ({
  page,
}) => {
  await page.goto("/");
  await create(page, "Gamepad", "PAD-TEST");
  await page.evaluate(() => {
    const pad = {
      connected: true,
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    (window as any).testPad = pad;
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [pad],
      configurable: true,
    });
  });
  await page.evaluate(
    () => ((window as any).testPad.buttons[9].pressed = true),
  );
  await expect(page.getByText("HULL INTEGRITY")).toBeVisible();
  await page.waitForTimeout(150);
  await expect(page.getByText("HULL INTEGRITY")).toBeVisible();
  await page.evaluate(
    () => ((window as any).testPad.buttons[9].pressed = false),
  );
  await page.waitForTimeout(100);
  await page.evaluate(
    () => ((window as any).testPad.buttons[9].pressed = true),
  );
  await expect(
    page.getByRole("heading", { name: "Flight paused." }),
  ).toBeVisible();
  await page.waitForTimeout(150);
  await expect(
    page.getByRole("heading", { name: "Flight paused." }),
  ).toBeVisible();
  await page.evaluate(
    () => ((window as any).testPad.buttons[9].pressed = false),
  );
  await page.waitForTimeout(100);
  await page.evaluate(
    () => ((window as any).testPad.buttons[9].pressed = true),
  );
  await expect(page.getByText("HULL INTEGRITY")).toBeVisible();
});

test("the production static build starts an expedition without external requests", async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://localhost:3001/")
    )
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3001/");
  await expect(
    page.getByRole("heading", { name: "The deep is calling." }),
  ).toBeVisible();
  await create(page, "Static build", "STATIC-BUILD");
  await page.getByRole("button", { name: "Begin expedition" }).click();
  await expect(page.getByText("HULL INTEGRITY")).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("legacy saves gain forgiving wall damage and remain playable", async ({
  page,
}) => {
  const { generateWorld, digest } = await import("../../src/generation");
  const { createContext } = await import("../../src/simulation");
  const { move, solid } = await import("../../src/physics");
  const world = await generateWorld("WALL-BROWSER", "small"),
    old: any = createContext(world, "Wall flight");
  const stop = move(world, world.spawn, -1000, 0, 0);
  let free = stop.x,
    blocked = free - 0.5;
  for (let i = 0; i < 20; i++) {
    const mid = (free + blocked) / 2;
    if (solid(world, { x: mid, y: stop.y }, 0)) blocked = mid;
    else free = mid;
  }
  Object.assign(old.runtime.player, {
    x: free + 0.002,
    y: stop.y,
    protection: 0,
  });
  old.schema = old.simulation = 1;
  old.stats.playTime = 30;
  for (const state of [old.runtime, old.checkpoint]) {
    delete state.player.wallContact;
    delete state.player.wallImpact;
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The deep is calling." }),
  ).toBeVisible();
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "old-flight.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          payload: old,
          checksum: await digest(old),
          previousRevision: null,
        }),
      ),
    });
  await page
    .getByRole("button", { name: "Play Wall flight · imported", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready to continue." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume flight" }).click();
  await page.keyboard.down("a");
  await expect(page.locator("#health-value")).not.toHaveText("100");
  expect(
    Number(await page.locator("#health-value").innerText()),
  ).toBeGreaterThan(0);
  await page.screenshot({ path: "/tmp/infinicave-wall-contact.png" });
  await page.keyboard.up("a");
  await page.keyboard.down("d");
  await page.waitForTimeout(400);
  await page.keyboard.up("d");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(
    page.getByRole("heading", { name: "Wall flight · imported", exact: true }),
  ).toBeVisible();
  const [saved] = await readRecords(page);
  expect(saved.current.payload.schema).toBe(2);
  expect(saved.current.payload.runtime.player.wallContact).toBe(0);
  expect(saved.current.payload.world.hash).toBe(world.hash);
});
