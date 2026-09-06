import { defineConfig } from "@playwright/test";
export default defineConfig({
  testMatch: "**/*.pw.ts",
  testDir: "./tests/browser",
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    },
    screenshot: "only-on-failure",
  },
  reporter: "list",
  webServer: [
    {
      command: "bun run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
    },
    {
      command: "bun run preview",
      url: "http://localhost:3001",
      reuseExistingServer: true,
    },
  ],
});
