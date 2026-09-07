import { test, expect } from '@playwright/test';
test('template combo adds independently editable patterns, supports undo and persists sounds', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(page.locator('#arrangement-template option')).toHaveCount(5);
  await page.locator('#arrangement-template').selectOption('house');
  await expect(page.locator('#template-description')).toContainText('Four-on-the-floor');
  await page.locator('[data-action="apply-template"]').click();
  await expect(page.locator('#pattern-select option')).toHaveCount(2);
  await expect(page.locator('.instrument-title h3')).toHaveText('House organ');
  await expect(page.locator('.song-slot')).toHaveCount(1);
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('#pattern-select option')).toHaveCount(1);
  await expect(page.locator('.instrument-title h3')).toHaveText('Glass keys');
  await page.locator('[data-action="redo"]').click();
  await expect(page.locator('#pattern-select option')).toHaveCount(2);
  await page.locator('#pattern-select').selectOption('0');
  await expect(page.locator('.instrument-title h3')).toHaveText('Glass keys');
  await page.locator('#pattern-select').selectOption('1');
  await page.locator('#v-cutoff').fill('3210');
  await page.locator('#v-cutoff').dispatchEvent('change');
  await page.locator('[data-action="save"]').click();
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('#pattern-select option')).toHaveCount(2);
  await expect(page.locator('.instrument-title h3')).toHaveText('Glass keys');
  await page.locator('#pattern-select').selectOption('1');
  await expect(page.locator('#v-cutoff')).toHaveValue('3210');
  await page.locator('[data-action="add-slot"]').click();
  await page.locator('#scope').selectOption('song');
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('#position')).not.toHaveText('01 : 01');
  await page.locator('[data-action="stop"]').click();
  await page.locator('[data-action="language"]').click();
  await expect(page.locator('[data-action="apply-template"]')).toHaveText('＋ Añadir patrón');
  expect(errors).toEqual([]);
});
test('old audio is unchanged and each template renders deterministically with its own sounds', async ({
  page,
}) => {
  await page.goto('/test-harness');
  await page.waitForFunction(() => !!(window as any).tonada);
  const result = await page.evaluate(async () => {
    const a = (window as any).tonada,
      p = a.newProject({ seed: 'template-audio' });
    const id = p.patterns[0].id;
    const render = async (id: string) => {
      const b = await a.renderAudio(p, 'pattern', id, 22050);
      return [b.getChannelData(0), b.getChannelData(1)];
    };
    const before = await render(id);
    const reports = [];
    for (const template of a.TEMPLATES) {
      const index = a.applyTemplate(p, template.id),
        pat = p.patterns[index];
      const x = await render(pat.id),
        y = await render(pat.id);
      let peak = 0,
        equal = true;
      for (let ch = 0; ch < 2; ch++)
        for (let i = 0; i < x[ch].length; i++) {
          peak = Math.max(peak, Math.abs(x[ch][i]));
          equal &&= x[ch][i] === y[ch][i];
        }
      reports.push({ id: template.id, peak, equal });
    }
    const after = await render(id);
    const preserved = before.every(
      (x, ch) =>
        x.length === after[ch].length && x.every((v: number, i: number) => v === after[ch][i]),
    );
    p.song = [p.patterns[0].id, p.patterns[1].id];
    const song = await a.renderAudio(p, 'song', id, 22050);
    const exported = await a.exportProject(p),
      copy = await a.importProject(new File([exported], 'templates.json'));
    const restored = await a.renderAudio(copy, 'song', id, 22050);
    const portable = song
      .getChannelData(0)
      .every((v: number, i: number) => v === restored.getChannelData(0)[i]);
    return { preserved, reports, portable };
  });
  expect(result.preserved).toBe(true);
  expect(result.portable).toBe(true);
  expect(result.reports).toHaveLength(5);
  for (const report of result.reports) {
    expect(report.equal).toBe(true);
    expect(report.peak).toBeGreaterThan(0.01);
    expect(report.peak).toBeLessThanOrEqual(0.89001);
  }
});
