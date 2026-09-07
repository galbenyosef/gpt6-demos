import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
for (const [slug, tempo, patterns] of [
  ['classic-house', 124, 5],
  ['ambient-soul', 76, 4],
] as const) {
  test(`${slug}: self-contained project imports and full song renders`, async ({ page }, info) => {
    const json = await readFile(`examples/${slug}.tonada.json`, 'utf8');
    await page.goto('/test-harness');
    await page.waitForFunction(() => !!(window as any).tonada);
    const result = await page.evaluate(async (text) => {
      const a = (window as any).tonada;
      const original = JSON.parse(text).document;
      const p = await a.importProject(new File([text], 'example.tonada.json'));
      const buffer = await a.renderAudio(p, 'song', p.patterns[0].id, 44100);
      let peak = 0,
        finite = true,
        energy = 0;
      for (let ch = 0; ch < buffer.numberOfChannels; ch++)
        for (const value of buffer.getChannelData(ch)) {
          finite &&= Number.isFinite(value);
          peak = Math.max(peak, Math.abs(value));
          energy += value * value;
        }
      return {
        name: p.name,
        tempo: p.tempo,
        patterns: p.patterns.length,
        source: p.sourceId === original.id,
        newIdentity: p.id !== original.id,
        duration: buffer.duration,
        peak,
        finite,
        rms: Math.sqrt(energy / (buffer.length * 2)),
        samples: p.samples.length,
      };
    }, json);
    expect(result.tempo).toBe(tempo);
    expect(result.patterns).toBe(patterns);
    expect(result.source).toBe(true);
    expect(result.newIdentity).toBe(true);
    expect(result.finite).toBe(true);
    expect(result.peak).toBeGreaterThan(0.01);
    expect(result.peak).toBeLessThanOrEqual(0.89001);
    expect(result.duration).toBeGreaterThan(60);
    expect(result.duration).toBeLessThan(180);
    expect(result.samples).toBe(0);
    await info.attach(`${slug}-render`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
  });
}
