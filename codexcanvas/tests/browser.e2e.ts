import { test, expect, type Page } from '@playwright/test';
async function newSession(page: Page) {
  await page.goto('/'); await expect(page.getByText('Codex connected', { exact: true })).toBeVisible();
  if (await page.getByText('Your projects will appear here.').isVisible()) {
    await page.getByRole('button', { name: 'Add workspace', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Canvas test workspace');
    await page.getByLabel('Absolute folder path').fill(process.env.CANVAS_E2E_DIR!);
    await page.getByRole('dialog').getByRole('button', { name: 'Add workspace', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await page.getByRole('button', { name: '＋ New session' }).click(); await expect(page.getByRole('textbox', { name: 'Message Codex' })).toBeVisible();
}
test('streaming, artifacts, drag/resize, collapse and reload restore the same session', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await newSession(page);
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('Fix the animation export'); await page.getByRole('button', { name: 'Send ↑' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Running export tests');
  await expect(page.locator('.message-text').filter({ hasText: 'All 47 tests pass.' })).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(6);
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await expect(page.locator('.messages table')).toBeVisible();
  await page.getByRole('button', { name: 'Fit', exact: false }).first().click();
  const diff = page.locator('.card-diff'), header = diff.locator('.card-header');
  const before = await diff.evaluate(e => ({ x: e.style.left, y: e.style.top, width: e.style.width }));
  const box = await header.boundingBox(); if (!box) throw new Error('Missing diff header');
  await page.mouse.move(box.x + 55, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x - 70, box.y - 50, { steps: 10 }); await page.mouse.up();
  await expect.poll(() => diff.evaluate(e => e.style.left)).not.toBe(before.x);
  const resize = await diff.locator('.resize-handle').boundingBox(); if (!resize) throw new Error('Missing resize handle');
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2); await page.mouse.down(); await page.mouse.move(resize.x + 80, resize.y + 70, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => diff.evaluate(e => e.style.width)).not.toBe(before.width);
  const saved = await diff.evaluate(e => ({ x: e.style.left, y: e.style.top, width: e.style.width, height: e.style.height }));
  await diff.getByRole('button', { name: 'Collapse or expand card' }).click(); await expect(diff).toHaveClass(/collapsed/);
  const zoom = await page.locator('#zoom-level').textContent();
  const thread = await page.evaluate(() => localStorage.getItem('canvas.thread'));
  await page.waitForTimeout(300); await page.reload();
  await expect(page.locator('.card-diff')).toHaveClass(/collapsed/);
  expect(await page.evaluate(() => localStorage.getItem('canvas.thread'))).toBe(thread);
  expect(await diff.evaluate(e => ({ x: e.style.left, y: e.style.top, width: e.style.width }))).toEqual({ x: saved.x, y: saved.y, width: saved.width });
  await expect(page.locator('#zoom-level')).toHaveText(zoom!);
  await expect(page.locator('.user-message')).toHaveCount(1);
  await page.getByRole('button', { name: 'Conversation', exact: false }).last().click();
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('Now simplify the implementation'); await page.getByRole('button', { name: 'Send ↑' }).click();
  await expect(page.locator('.user-message')).toHaveCount(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/canvas-session.png' });
});
test('mid-turn steering, reload while running, and Stop use the active Codex turn', async ({ page }) => {
  await newSession(page); const input = page.getByRole('textbox', { name: 'Message Codex' });
  await input.fill('slow inspection'); await page.getByRole('button', { name: 'Send ↑' }).click();
  await expect(page.getByRole('button', { name: 'Add to current turn ↑' })).toBeEnabled();
  await input.fill('Keep the public API unchanged'); await page.getByRole('button', { name: 'Add to current turn ↑' }).click();
  await expect(page.locator('.user-message')).toHaveCount(2); await page.reload();
  await expect(page.getByRole('button', { name: '■ Stop' })).toBeVisible(); await page.getByRole('button', { name: '■ Stop' }).click();
  await expect(page.locator('.turn-state')).toHaveText('interrupted'); await expect(page.getByRole('button', { name: 'Send ↑' })).toBeEnabled();
});
test('network approvals survive browser reload and disappear after response', async ({ page }) => {
  await newSession(page); await page.getByRole('textbox', { name: 'Message Codex' }).fill('Fix export with approval'); await page.getByRole('button', { name: 'Send ↑' }).click();
  const approval = page.getByRole('dialog', { name: 'Codex approval request' }); await expect(approval).toContainText('registry.npmjs.org');
  await page.reload(); await expect(approval).toContainText('Network access requested');
  await approval.getByRole('button', { name: 'Allow', exact: true }).click(); await expect(approval).not.toBeVisible();
  await expect(page.locator('.terminal-output')).toContainText('47 tests passed');
});
test('Codex process restart hydrates history and geometry, plus search and file previews', async ({ page }) => {
  await newSession(page);
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('Fix export before restart'); await page.getByRole('button', { name: 'Send ↑' }).click();
  await expect(page.locator('.turn-state')).toHaveText('completed');
  await page.getByRole('button', { name: 'Fit', exact: false }).first().click();
  await page.locator('.card-diff').getByRole('button', { name: 'Files' }).click();
  await page.locator('.card-diff').getByRole('button', { name: /export.ts/ }).click();
  await page.locator('.card-diff').getByRole('button', { name: 'Open file on canvas' }).click();
  await expect(page.locator('.card-file')).toContainText('const timestamp');
  await page.getByRole('button', { name: 'Search canvas' }).click();
  await page.getByRole('searchbox', { name: 'Search canvas content' }).fill('timestamp');
  await expect(page.locator('.search-result').first()).toBeVisible(); await page.locator('.search-result').first().click();
  await page.locator('.card-diff').getByRole('button', { name: 'Hide from canvas' }).click();
  await expect(page.locator('.card-diff')).not.toBeVisible();
  await page.getByRole('button', { name: 'Restore hidden artifacts' }).click();
  await expect(page.locator('.card-diff')).toBeVisible();
  await page.getByRole('button', { name: 'Conversation', exact: false }).last().click();
  await page.getByRole('textbox', { name: 'Message Codex' }).fill('/exit-fixture'); await page.getByRole('button', { name: 'Send ↑' }).click();
  await expect(page.getByText('Codex offline', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message Codex' })).toBeDisabled();
  await page.getByRole('button', { name: 'Restart Codex' }).click();
  await expect(page.getByText('Codex connected', { exact: true })).toBeVisible();
  await expect(page.locator('.messages')).toContainText('All 47 tests pass.');
  await expect(page.locator('.card-diff')).toBeAttached();
  await expect(page.locator('.card-file')).toContainText('const timestamp');
  await expect(page.getByRole('textbox', { name: 'Message Codex' })).toBeEnabled();
});
