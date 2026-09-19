import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: process.env.TRACEWORK_E2E_EXTERNAL
      ? "http://127.0.0.1:4310"
      : "http://127.0.0.1:4312",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: process.env.TRACEWORK_CHROMIUM_PATH },
  },
  webServer: process.env.TRACEWORK_E2E_EXTERNAL
    ? undefined
    : {
        command: "bun apps/server/src/index.ts",
        url: "http://127.0.0.1:4312/api/health",
        reuseExistingServer: false,
        env: { TRACEWORK_DATA_DIR: "/tmp/tracework-e2e-data", PORT: "4312" },
      },
});
