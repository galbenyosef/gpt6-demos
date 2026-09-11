import { test, expect } from '@playwright/test';
// Explicit opt-in: creates one billable GPT-Live session with synthetic silence.
test('live API establishes browser WebRTC and server sideband, then ends cleanly', async ({ page }) => {
  test.skip(process.env.CROSSTALK_LIVE_SMOKE !== '1');
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); (window as any).silentContext = context;
      return context.createMediaStreamDestination().stream;
    };
  });
  await page.goto('/'); await expect(page.locator('#loading')).toHaveClass('loaded', { timeout: 20_000 });
  const session = page.waitForResponse('**/crosstalk/live/session');
  await page.getByRole('button', { name: 'Start Crosstalk conversation' }).click();
  const response = await session;
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByText('Listening', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'End Crosstalk conversation' }).click();
  await expect(page.getByRole('button', { name: 'Start Crosstalk conversation' })).toBeVisible();
});


test('spoken sunset request delegates through Live and Astra to the visible explorer', async ({ page, request }) => {
  test.skip(process.env.CROSSTALK_LIVE_SMOKE !== '1');
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), destination = context.createMediaStreamDestination();
      // Keep the media clock advancing after the speech buffer ends.
      const clock = context.createOscillator(), quiet = context.createGain(); quiet.gain.value = 0.00001;
      clock.connect(quiet).connect(destination); clock.start(); void context.resume();
      (window as any).speakTestRequest = async () => {
        await context.resume();
        const audio = await (await fetch('/test/sunset.wav')).arrayBuffer();
        const source = context.createBufferSource(); source.buffer = await context.decodeAudioData(audio); source.connect(destination); source.start();
      };
      return destination.stream;
    };
  });
  await page.goto('/'); await expect(page.locator('#loading')).toHaveClass('loaded', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Start Crosstalk conversation' }).click();
  await expect(page.getByText('Listening', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (window as any).speakTestRequest());
  await expect(page.locator('[data-light="golden"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 55_000 });
  await expect.poll(async () => { const logs = await (await request.get('/test/logs')).json(); return logs.some((entry: any) => entry.event === 'live.commentary.accepted'); }, { timeout: 30_000 }).toBe(true);
  const logs = await (await request.get('/test/logs')).json();
  expect(logs.filter((entry: any) => entry.event.includes('failed') || entry.event.includes('error'))).toEqual([]);
  await page.getByRole('button', { name: 'End Crosstalk conversation' }).click();
});
