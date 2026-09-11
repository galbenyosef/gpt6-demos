import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('voice tools and manual controls stay synchronized, interrupt navigation, and confirm downloads', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveClass('loaded', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Start Crosstalk conversation' })).toBeVisible();
  let instanceId = '';
  await expect.poll(async () => { const ids = await (await request.get('/test/instances')).json(); instanceId = ids[0] ?? ''; return instanceId; }).not.toBe('');
  const state = async () => (await request.get('/test/state?id=' + instanceId)).json();
  const invoke = async (tool: string, args: object, explicit = true) => (await request.post('/test/invoke', { data: { instanceId, tool, args, explicit } })).json();
  expect((await invoke('set_lighting', { lighting: 'golden' })).result.ok).toBe(true);
  await expect(page.locator('[data-light="golden"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-light="blue"]').click(); expect((await state()).lighting).toBe('blue');
  const street = await invoke('show_perspective', { perspective: 'street' }); expect(street.result.ok).toBe(true); expect(street.state.transitioning).toBe(false);
  await expect(page.locator('[data-view="street"]')).toHaveAttribute('aria-pressed', 'true');
  expect(street.state.visibleFeatures).toContain('entrance');
  await page.locator('#rotate').click(); expect((await state()).autoRotate).toBe(true);
  await invoke('set_auto_rotation', { enabled: false }); await expect(page.locator('#rotate')).toHaveAttribute('aria-pressed', 'false');
  await invoke('adjust_zoom', { direction: 'closer', amount: 'large' }); expect((await state()).zoomLevel).toBe('close');
  await page.locator('#reset').click(); await expect.poll(async () => (await state()).transitioning).toBe(false); expect((await state()).zoomLevel).toBe('normal');
  const oldMovement = invoke('show_perspective', { perspective: 'aerial' });
  await expect.poll(async () => (await state()).transitioning).toBe(true);
  const newMovement = await invoke('show_perspective', { perspective: 'street' });
  expect((await oldMovement).result.ok).toBe(false); expect(newMovement.result.ok).toBe(true); expect(newMovement.state.perspective).toBe('street');
  const denied = invoke('capture_view', {}, false);
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await denied).result.ok).toBe(false);
  const saving = invoke('capture_view', {}, false);
  await expect(page.getByRole('button', { name: 'Allow', exact: true })).toBeVisible();
  await page.screenshot({ path: 'browser/artifacts/crosstalk-confirmation.png', fullPage: true });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Allow', exact: true }).click();
  expect((await saving).result.ok).toBe(true); const saved = await download; expect(saved.suggestedFilename()).toBe('edificio-europa-street-4k.png');
  const png = await readFile((await saved.path())!); expect(png.readUInt32BE(16)).toBe(3840); expect(png.readUInt32BE(20)).toBe(2160);
  expect((await invoke('unknown_tool', {})).result.ok).toBe(false);
  expect(errors).toEqual([]);
});

test('failed voice initialization releases microphone tracks and allows retry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).testStreams = [];
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); (window as any).testStreams.push(stream); return stream; };
  });
  await page.route('**/crosstalk/live/session', route => route.fulfill({ status: 503, json: { error: 'Voice is not configured.' } }));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveClass('loaded', { timeout: 20_000 });
  await expect.poll(async () => page.evaluate(() => (window as any).testStreams.length)).toBe(0);
  await page.getByRole('button', { name: 'Start Crosstalk conversation' }).click();
  await expect(page.getByText('Voice is not configured.')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => (window as any).testStreams.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
  await expect(page.getByRole('button', { name: 'Start Crosstalk conversation' })).toBeVisible();
});
