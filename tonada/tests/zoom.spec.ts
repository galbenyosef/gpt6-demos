import { test, expect } from '@playwright/test';

test('zoom preserves notes and snapping, later bars remain editable, and keyboard follows selection', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.workspace')).toBeVisible();
  await page.locator('[data-action="save"]').click();
  const notes = await page.locator('.cell.on').count();
  const resolution = await page.locator('#resolution').inputValue();
  const dimensions = () =>
    page
      .locator('#grid-scroll')
      .evaluate((e) => ({ width: e.clientWidth, content: e.scrollWidth }));
  const one = await dimensions();
  await page.locator('#roll-zoom').selectOption('2');
  const two = await dimensions();
  expect(two.content).toBeLessThan(one.content);
  await page.locator('[data-action="fit-pattern"]').click();
  const fit = await dimensions();
  expect(fit.content).toBeLessThanOrEqual(fit.width + 1);
  await page.locator('#pitch-zoom').selectOption('48');
  expect(
    await page
      .locator('[data-step="0"][data-pitch="60"]')
      .evaluate((e) => e.getBoundingClientRect().height),
  ).toBe(48);
  await expect(page.locator('.cell.on')).toHaveCount(notes);
  await expect(page.locator('#resolution')).toHaveValue(resolution);
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.locator('#roll-zoom').selectOption('1');
  await page.locator('[data-bar="3"]').click();
  const cell = page.locator('[data-step="49"][data-pitch="60"]');
  const before = await cell.getAttribute('aria-selected');
  await cell.click();
  await expect(cell).toHaveAttribute('aria-selected', before === 'true' ? 'false' : 'true');
  await page.locator('[data-action="undo"]').click();
  await expect(cell).toHaveAttribute('aria-selected', before!);
  await cell.click({ modifiers: ['Shift'] });
  await cell.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-step="50"][data-pitch="60"]')).toBeFocused();
});

test('pointer zoom keeps the time beneath the pointer stationary', async ({ page }) => {
  await page.goto('/');
  await page.locator('#roll-zoom').selectOption('2');
  const grid = page.locator('#grid-scroll');
  const bounds = (await grid.boundingBox())!;
  const x = 260,
    y = 120;
  const timeAtPointer = () =>
    grid.evaluate((e, x) => {
      const cell = e.querySelector('[data-step="0"]')!;
      return (e.scrollLeft + x - 58) / cell.getBoundingClientRect().width;
    }, x);
  const before = await timeAtPointer();
  await page.mouse.move(bounds.x + x, bounds.y + y);
  await page.keyboard.down('Alt');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Alt');
  await expect(page.locator('#roll-zoom')).toHaveValue('1');
  expect(await timeAtPointer()).toBeCloseTo(before, 1);
});
