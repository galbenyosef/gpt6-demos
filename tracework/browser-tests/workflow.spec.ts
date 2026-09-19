import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
test("source → human model → artifact, evidence search and persistent reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator(".workspace-switch>button").click();
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Workspace name" })
    .fill("Browser test library " + Date.now());
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Explicit synthetic browser fixture");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start with what you know." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "library-brief.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Library\nA librarian maintains the edition catalog. Loans last fourteen days.",
    ),
  });
  await page
    .getByLabel("Classification", { exact: true })
    .selectOption("public");
  await page.getByRole("button", { name: "Upload and extract" }).click();
  await expect(
    page.getByText("library-brief.md", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "library-brief.md" })
      .getByText("ready", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect library-brief.md" }).click();
  await expect(page.getByText("Lines 1–2")).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name: "Model", exact: true })
    .click();
  await page.getByRole("button", { name: "Add element", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Edition");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A particular publication of a book.");
  await page
    .getByLabel("Definition", { exact: true })
    .fill("A particular publication of a book.");
  await page
    .getByLabel("Assertion", { exact: true })
    .selectOption("source-stated");
  const evidence = page.getByLabel("Supporting evidence");
  await expect(evidence.locator("option")).toHaveCount(1);
  await evidence.selectOption({ index: 0 });
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("button", { name: "Add element", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Edition");
  await page
    .getByLabel("Reason for this change")
    .fill("Librarian confirmed this domain term.");
  await page
    .getByRole("button", { name: "Accept change", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edition", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name: "Artifacts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate artifact", exact: true })
    .click();
  await page
    .getByLabel("Output", { exact: true })
    .selectOption("specification");
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Solution specification/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("button", { name: /Solution specification/ }).click();
  await expect(page.locator(".artifact-preview")).toContainText("Edition");
  await page.reload();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name: "Model", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edition", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("example proposal acceptance, changed requirement and bounded canvas load", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".workspace-switch>button").click();
  await page
    .getByRole("button", { name: "Open repair-service example" })
    .click();
  await expect(
    page.getByRole("button", { name: /Resolve guest appointment requests/ }),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: /Resolve guest appointment requests/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "You decide what becomes true." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept all changes" }).click();
  await expect(page.getByText("Nothing waiting for review.")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name: "Model", exact: true })
    .click();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.getByLabel("Canvas projection").selectOption("c4-context");
  await page.getByRole("button", { name: "Object table", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("button", { name: "Validation", exact: true })
    .click();
  await page.getByRole("button", { name: "Introduce source change" }).click();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Run checks", exact: true }).click();
  await expect(
    page.getByText(/cites an older version of customer-brief.md/).first(),
  ).toBeVisible();
});
test("desktop and mobile design captures", async ({ page }) => {
  await page.goto("/");
  await page.locator(".workspace-switch>button").click();
  const example = page
    .locator(".workspace-menu button")
    .filter({ hasText: "Neighborhood repair service" })
    .first();
  if (await example.count()) await example.click();
  await expect(
    page.getByRole("heading", { name: "Start with what you know." }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/desktop.png",
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".impeccable/review/mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});

test("keyboard modal, mobile search and inspector focus are usable", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".workspace-switch>button").click();
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const buttons = page.getByRole("dialog").getByRole("button");
  await buttons.last().focus();
  await page.keyboard.press("Tab");
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".workspace-switch>button")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open workspace search" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search workspace evidence" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Search workspace evidence" })
    .fill("appointment");
  await expect(page.locator(".search-results")).toBeVisible();
  await page.getByRole("button", { name: "Close search" }).click();
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  await expect(page.locator(".inspector-heading h2")).toBeFocused();
  const y = await page
    .locator(".inspector-heading h2")
    .evaluate((e) => e.getBoundingClientRect().top);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(y).toBeLessThan(200);
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(
    page.getByRole("button", { name: "Add sources", exact: true }),
  ).toBeFocused();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
