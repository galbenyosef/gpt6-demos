import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('spatial navigation uses the entrance bearing and tracks manual movement and rotation', async ({ page, request }) => {
  const errors: string[] = [];page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');await expect(page.locator('#loading')).toHaveClass('loaded', { timeout: 20_000 });
  let instanceId = '';
  await expect.poll(async () => { instanceId = (await (await request.get('/test/instances')).json())[0] ?? ''; return instanceId; }).not.toBe('');
  const state = async () => (await request.get('/test/state?id=' + instanceId)).json();
  const invoke = async (tool: string, args: object) => (await request.post('/test/invoke', { data: { instanceId, tool, args, explicit: true } })).json();
  for (const [side, bearing] of [['front', 10], ['back', 190], ['left', 100], ['right', 280]] as const) {
    const result = await invoke('show_side', { side });
    expect(result.result.ok).toBe(true);
    expect(result.state).toMatchObject({ transitioning: false, viewAdjusted: true, spatial: { cameraSide: side, cameraBearingDegrees: bearing, focusOffset: 0 } });
    await expect(page.locator(`[data-side="${side}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#orientation-label')).toContainText(`${bearing}°`);
  }
  const north = await invoke('show_side', { side: 'north' });
  expect(north.state.spatial).toMatchObject({ cameraBearingDegrees: 0, lookBearingDegrees: 180 });
  await page.locator('[data-side="front"]').click();
  await expect.poll(async () => (await state()).transitioning).toBe(false);
  expect((await state()).spatial.cameraBearingDegrees).toBe(10);
  expect((await invoke('orbit_view', { direction: 'right', degrees: 90 })).state.spatial.cameraSide).toBe('right');
  expect((await invoke('orbit_view', { direction: 'left', degrees: 90 })).state.spatial.cameraSide).toBe('front');
  // Drag the actual canvas, then verify the state is live rather than preset-derived.
  const canvas = page.locator('#canvas-host canvas');const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .45);
  await page.mouse.down();await page.mouse.move(box.x + box.width * .60, box.y + box.height * .45, { steps: 12 });await page.mouse.up();
  await expect.poll(async () => (await state()).spatial.cameraBearingDegrees).not.toBe(10);
  await page.locator('#rotate').click();
  const before = (await state()).spatial.cameraBearingDegrees;
  await expect.poll(async () => (await state()).spatial.cameraBearingDegrees).not.toBe(before);
  const stopped = await invoke('show_side', { side: 'back' });
  expect(stopped.state).toMatchObject({ autoRotate: false, transitioning: false, spatial: { cameraSide: 'back', cameraBearingDegrees: 190 } });
  const old = invoke('orbit_view', { direction: 'left', degrees: 180 });
  await expect.poll(async () => (await state()).transitioning).toBe(true);
  const replacement = await invoke('show_side', { side: 'front' });
  expect((await old).result.ok).toBe(false);expect(replacement.result.ok).toBe(true);
  expect(replacement.state.spatial.cameraBearingDegrees).toBe(10);
  await page.screenshot({ path: 'browser/artifacts/europa-orientation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#orientation-label')).toBeVisible();
  await page.locator('[data-side="back"]').click();
  await expect.poll(async () => (await state()).transitioning).toBe(false);
  expect((await state()).spatial.cameraBearingDegrees).toBe(190);
  await page.screenshot({ path: 'browser/artifacts/europa-orientation-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('fullscreen tools respect browser activation and stay synchronized with native controls', async ({ page, request }) => {
  await page.addInitScript(() => {
    // Headless Chromium may allow entry without activation. Exercise the
    // browser-refusal path once, then use the real native API throughout.
    const nativeRequest = Element.prototype.requestFullscreen;
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false } });
    Element.prototype.requestFullscreen = function(options) {
      Element.prototype.requestFullscreen = nativeRequest;
      return Promise.reject(new TypeError('Fullscreen requires user activation'));
    };
  });
  await page.goto('/'); await expect(page.locator('#loading')).toHaveClass('loaded', { timeout: 20_000 });
  let instanceId = '';
  await expect.poll(async () => { instanceId = (await (await request.get('/test/instances')).json())[0] ?? ''; return instanceId; }).not.toBe('');
  const state = async () => (await request.get('/test/state?id=' + instanceId)).json();
  const invoke = async (enabled: boolean) => (await request.post('/test/invoke', { data: { instanceId, tool: 'set_fullscreen', args: { enabled }, explicit: true } })).json();
  const fullscreen = page.locator('#fullscreen');
  expect((await state()).fullscreen).toBe(false);
  const blocked = await invoke(true);
  expect(blocked.result.ok).toBe(false);
  expect(blocked.result.error.code).toBe('USER_ACTIVATION_REQUIRED');
  expect(blocked.state.fullscreen).toBe(false);
  await expect(page.locator('#toast')).toContainText('Click the fullscreen button');
  await page.evaluate(() => { delete (navigator as any).userActivation; });
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute('aria-label', 'Exit fullscreen');
  expect((await state()).fullscreen).toBe(true);
  const voice = page.getByRole('button', { name: 'Start Crosstalk conversation' });
  await expect(voice).toBeVisible();
  // Trial clicks verify fullscreen top-layer hit testing, without starting voice.
  await voice.click({ trial: true });
  expect(await page.evaluate(() => document.fullscreenElement?.contains(document.querySelector('.viewer')!))).toBe(true);
  expect((await invoke(false)).result.ok).toBe(true);
  await expect(fullscreen).toHaveAttribute('aria-label', 'Enter fullscreen');
  expect((await state()).fullscreen).toBe(false);
  await voice.click({ trial: true });
  // A real click supplies the transient activation needed for tool-driven entry.
  await page.locator('[data-light="day"]').click();
  const entered = await invoke(true); expect(entered.result.ok).toBe(true); expect(entered.state.fullscreen).toBe(true);
  expect((await invoke(true)).result.ok).toBe(true);
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  expect((await state()).fullscreen).toBe(false);
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
  // A browser-originated exit has no controller call (the same event as Escape).
  await page.evaluate(() => document.exitFullscreen());
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  expect((await state()).fullscreen).toBe(false);
});

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
