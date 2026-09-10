import { defineConfig } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const data = process.env.CANVAS_E2E_DIR || mkdtempSync(join(tmpdir(), 'codexcanvas-e2e-'));
process.env.CANVAS_E2E_DIR = data;
writeFileSync(join(data, 'export.ts'), 'const timestamp = (index * 1000) / fps;\n');
export default defineConfig({
  testDir: './tests', testMatch: '*.e2e.ts', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3137', viewport: { width: 1512, height: 982 }, screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: { command: process.env.CANVAS_E2E_PRODUCTION ? 'NODE_ENV=production bun dist/index.js' : 'bun src/server/index.ts', url: 'http://127.0.0.1:3137/api/bootstrap', reuseExistingServer: false, env: { PORT: '3137', CODEX_CANVAS_DATA_DIR: data, CODEX_BIN: resolve('tests/fixtures/app-server.ts') } },
});
