import { test, expect } from '@playwright/test';
test('isolate floating point graph differences', async ({ page }) => {
  await page.goto('/test-harness');
  await page.waitForFunction(() => !!(window as any).tonada);
  const report = await page.evaluate(async () => {
    const a = (window as any).tonada;
    const results = [];
    for (const effects of ['none', 'delay', 'reverb', 'both']) {
      const p = a.newProject({ seed: 'x' });
      const tracks = p.tracks.map((t: any) => ({
        ...t,
        reverb: ['reverb', 'both'].includes(effects) ? 0.2 : 0,
        delay: ['delay', 'both'].includes(effects) ? 0.2 : 0,
      }));
      const go = async () => {
        const c = new OfflineAudioContext(2, 44100, 22050);
        const e = new a.Engine(c, tracks, p.master, 'x', [], 96);
        for (let i = 0; i < 8; i++)
          e.schedule({
            track: tracks[i].id,
            pitch: 60 + i,
            velocity: 0.7,
            time: 0,
            duration: 0.3,
            key: String(i),
          });
        const b = await c.startRendering();
        e.dispose();
        return b.getChannelData(0);
      };
      const x = await go(),
        y = await go();
      let diff = 0,
        max = 0,
        first = -1;
      for (let i = 0; i < x.length; i++)
        if (x[i] !== y[i]) {
          diff++;
          max = Math.max(max, Math.abs(x[i]! - y[i]!));
          if (first < 0) first = i;
        }
      results.push({ effects, diff, max, first });
    }
    return results;
  });
  expect(report.every((r) => r.diff === 0)).toBe(true);
});
