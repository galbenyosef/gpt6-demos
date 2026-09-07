import { test, expect } from '@playwright/test';
test('compose, undo, play, mixer, save, reload and export', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(page.locator('[data-track]')).toHaveCount(9);
  await page.screenshot({ path: info.outputPath('desk.png'), fullPage: true });
  const cell = page.locator('[data-step="1"][data-pitch="60"]');
  await cell.click();
  await expect(cell).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-action="undo"]').click();
  await expect(cell).toHaveAttribute('aria-selected', 'false');
  await page.locator('[data-action="redo"]').click();
  await expect(cell).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('#position')).not.toHaveText('01 : 01', { timeout: 5000 });
  await page.locator('[data-action="stop"]').click();
  await page.locator('[data-action="mixer"]').click();
  await expect(page.locator('.mixer-channel')).toHaveCount(9);
  await page.screenshot({ path: info.outputPath('mixer.png'), fullPage: true });
  await page.locator('[data-action="desk"]').click();
  await page.locator('[data-action="save"]').click();
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('[data-step="1"][data-pitch="60"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.locator('[data-action="render"]').click();
  await page.locator('[data-action="render-wav"]').click();
  await expect(page.getByRole('button', { name: 'Download WAV ↓' })).toBeVisible({
    timeout: 30000,
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download WAV ↓' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.wav$/);
  expect(errors).toEqual([]);
});
test('new empty project, keyboard edit, Spanish, project library', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.workspace')).toBeVisible();
  await page.locator('[data-action="projects"]').click();
  await page.locator('[data-action="new"]').click();
  await page.locator('#new-name').fill('Second idea');
  await page.locator('#new-template').selectOption('empty');
  await page.locator('[data-action="create"]').click();
  await expect(page.locator('.project-title')).toContainText('Second idea');
  await expect(page.locator('.cell.on')).toHaveCount(0);
  await page.locator('[data-action="arm"]').click();
  await page.keyboard.press('z');
  await expect(page.locator('.cell.on')).toHaveCount(1);
  await page.locator('[data-action="save"]').click();
  await page.locator('[data-action="language"]').click();
  await expect(page.locator('[data-action="projects"]')).toHaveText('Proyectos');
  await page.locator('[data-action="projects"]').click();
  await expect(page.locator('.project-card')).toHaveCount(2);
});
test('local sample import, pattern length, chromatic preservation and WebGL fallback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: any[]
    ) {
      if (type.startsWith('webgl')) return null;
      return original.call(this, type, ...args);
    } as any;
  });
  await page.goto('/');
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(page.locator('.no-gl')).toBeVisible();
  await page.locator('#pattern-bars').selectOption('8');
  await expect(page.locator('[data-bar]')).toHaveCount(8);
  await page.locator('[data-track="7"]').click();
  await page.locator('[data-action="instrument"]').first().click();
  await page.locator('#voice-mode').selectOption('sampler');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-action="import-sample"]').click();
  await (await chooser).setFiles('public/packs/essentials/wood.wav');
  await expect(page.locator('.sample-wave')).toBeVisible();
  await page.locator('[data-action="save"]').click();
  await page.reload();
  await page.locator('[data-track="7"]').click();
  await page.locator('[data-action="instrument"]').first().click();
  await expect(page.locator('.sample-wave')).toBeVisible();
});
