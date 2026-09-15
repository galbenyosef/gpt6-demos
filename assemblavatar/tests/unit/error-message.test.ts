import { expect, test } from "bun:test";
import { isLegacyRendererError } from "../../src/frontend/error-message";

test("only retired-renderer failures are classified as historical", () => {
  expect(isLegacyRendererError("Headless renderer unavailable. Run bunx playwright install chromium or set CHROMIUM_PATH.")).toBe(true);
  expect(isLegacyRendererError("Provider unavailable")).toBe(false);
  expect(isLegacyRendererError("Browser rendering timed out. Keep Assemblavatar open in a browser tab and retry.")).toBe(false);
});
