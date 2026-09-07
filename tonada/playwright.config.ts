import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4317',
    headless: true,
    viewport: { width: 1440, height: 1080 },
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
  },
  webServer: {
    command: 'PORT=4317 TONADA_TEST=1 bun index.ts',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
  },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
});
