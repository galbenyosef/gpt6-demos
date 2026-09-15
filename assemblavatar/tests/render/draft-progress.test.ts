import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import html from "../../src/frontend/index.html";
import { createApplication } from "../../src/backend/api";
import { id } from "../../src/backend/persistence/store";
import { examples } from "../../src/shared/examples";
import type { RenderEvaluation } from "../../src/shared/domain";

test("browser shows live drafts before evaluation, restores on refresh, and retains failed results", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assemblavatar-draft-ui-")), app = createApplication(dir);
  let resolveReview!: (v: RenderEvaluation) => void, rejectReview!: (e: Error) => void;
  const generated = { code: examples.house.code, summary: "House draft", assumptions: [], expectedLimitations: [], objectStructure: [] };
  Object.assign(app.generation, { ai: {
    generate: async () => generated, refine: async () => generated, repair: async () => generated,
    evaluate: async () => new Promise<RenderEvaluation>((resolve, reject) => { resolveReview = resolve; rejectReview = reject; }),
  } });
  const fixture = await app.workspaces.create("Draft feedback fixture", "object");
  const legacyError = "Headless renderer unavailable. Run bunx playwright install chromium or set CHROMIUM_PATH. launch: Executable doesn't exist at /old/browser";
  const oldJobId = id("job");
  await app.store.jobs.put({ id: oldJobId, assemblageId: fixture.id, status: "failed", phase: "failed", error: legacyError, iteration: 1, maxIterations: 1, progress: 1, createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:01Z" });
  await app.store.messages.put({ id: id("msg"), assemblageId: fixture.id, role: "assistant", content: legacyError, jobId: oldJobId, createdAt: "2026-09-15T00:00:01Z" });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 120, routes: { "/": html, "/api/*": app.fetch } });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/config", route => route.fulfill({ json: { apiKeyConfigured: true, maxIterations: 2, model: "gpt-6-astra" } }));
    await page.goto(String(server.url));
    await page.getByText("Earlier build attempt", { exact: true }).waitFor();
    expect(await page.locator(".error-banner").count()).toBe(0);
    expect(await page.locator(".message.assistant details").getAttribute("open")).toBeNull();
    expect(await page.locator("body").textContent()).not.toContain("playwright install chromium");
    expect((await app.store.jobs.require(oldJobId)).error).toBe(legacyError);
    await page.locator("#prompt").fill("Make a house"); await page.locator(".generate").click();
    await page.locator(".draft-label").waitFor();
    expect(await page.locator(".generation-overlay").textContent()).toContain("Evaluating");
    await page.locator(".tree-row").first().waitFor();
    expect(await page.locator(".tree-row").count()).toBeGreaterThan(0);
    expect(await page.locator(".empty-scene").count()).toBe(0);
    expect(await page.locator(".viewport-footer").textContent()).toContain("triangles");
    await page.reload(); await page.locator(".draft-label").waitFor();
    expect(await page.locator(".generation-overlay").textContent()).toContain("Evaluating");
    resolveReview({ recommendation: "requires-user-review", overallAssessment: "The shape needs more work", issues: [{ area: "shape", severity: "major", description: "Too narrow", suggestedChange: "Widen it" }] });
    await page.waitForFunction(() => document.querySelector(".statusbar")?.textContent?.includes("Needs review"));
    expect(await page.locator(".error-banner").count()).toBe(0);
    expect(await page.locator(".draft-feedback").textContent()).toContain("The shape needs more work");
    await page.getByRole("button", { name: /^Results/ }).click();
    expect(await page.locator(".draft-results img").count()).toBe(1);
    await page.locator("#prompt").fill("Improve the draft"); await page.locator(".generate").click();
    await page.waitForFunction(() => document.querySelectorAll(".draft-results img").length === 2);
    expect(await page.locator(".generation-overlay").textContent()).toContain("Evaluating");
    rejectReview(new Error("Provider unavailable"));
    await page.locator(".error-banner").waitFor();
    expect(await page.locator(".draft-label").count()).toBe(1);
    expect(await page.locator(".tree-row").count()).toBe(0); // Results tab stays selected.
    await page.reload(); await page.locator(".draft-label").waitFor();
    await page.locator(".tree-row").first().waitFor();
    expect(await page.locator(".tree-row").count()).toBeGreaterThan(0);
    expect(await page.locator(".error-banner").textContent()).toContain("Provider unavailable");
    expect(errors).toEqual([]);
  } finally { server.stop(true); await browser.close(); await app.generation.renderer.close(); await rm(dir, { recursive: true, force: true }); }
}, 120000);
