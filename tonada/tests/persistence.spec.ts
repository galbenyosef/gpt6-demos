import { test, expect } from '@playwright/test';
test('independent projects, samples, revisions, integrity, and cross-tab lock', async ({
  page,
  context,
}) => {
  await page.goto('/test-harness');
  await page.waitForFunction(() => !!(window as any).tonada);
  const ids = await page.evaluate(async () => {
    const a = (window as any).tonada,
      s = new a.Store();
    await s.init();
    const p = a.newProject({ name: 'Project A', seed: 'a' }),
      q = a.newProject({ name: 'Project B', seed: 'b' });
    p.tracks[3].pan = -0.4;
    p.samples = [
      {
        id: 'sample-a',
        name: 'Local sample',
        rate: 8000,
        channels: [Array(800).fill(0.1)],
        root: 60,
        start: 0,
        end: 0.1,
        loop: false,
        loopStart: 0,
        loopEnd: 0.1,
        origin: 'file',
      },
    ];
    p.tracks[7].voice.mode = 'sampler';
    p.tracks[7].voice.sampleId = 'sample-a';
    await s.acquire(p.id);
    await s.acquire(q.id);
    await s.save(p);
    await s.save(q);
    p.tempo = 110;
    await s.save(p);
    s.release(q.id);
    Object.assign(window, { testStore: s });
    return { a: p.id, b: q.id };
  });
  const second = await context.newPage();
  await second.goto('/test-harness');
  await second.waitForFunction(() => !!(window as any).tonada);
  const locked = await second.evaluate(async (id) => {
    const s = new (window as any).tonada.Store();
    await s.init();
    return s.acquire(id);
  }, ids.a);
  expect(locked).toBe(false);
  await second.close();
  await page.reload();
  await page.waitForFunction(() => !!(window as any).tonada);
  const data = await page.evaluate(async (ids) => {
    const a = (window as any).tonada,
      s = new a.Store();
    await s.init();
    const p = await s.load(ids.a),
      q = await s.load(ids.b);
    return {
      a: p.tempo,
      b: q.tempo,
      pan: p.tracks[3].pan,
      sample: p.samples[0].channels[0].length,
      revision: p.revision,
    };
  }, ids);
  expect(data).toEqual({ a: 110, b: 96, pan: -0.4, sample: 800, revision: 2 });
  const recovery = await page.evaluate(async (id) => {
    const a = (window as any).tonada,
      s = new a.Store();
    await s.init();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('tonada', 1);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('projects', 'readwrite'),
        r = tx.objectStore('projects').get(id);
      r.onsuccess = () => {
        r.result.current.checksum = 'bad';
        tx.objectStore('projects').put(r.result);
      };
      tx.oncomplete = () => resolve();
    });
    db.close();
    try {
      await s.load(id);
      return null;
    } catch (e) {
      return e instanceof a.RecoveryError ? (e as any).previous.tempo : -1;
    }
  }, ids.a);
  expect(recovery).toBe(96);
});
test('invalid or future imports never alter storage', async ({ page }) => {
  await page.goto('/test-harness');
  await page.waitForFunction(() => !!(window as any).tonada);
  const result = await page.evaluate(async () => {
    const a = (window as any).tonada,
      s = new a.Store();
    await s.init();
    const p = a.newProject();
    await s.acquire(p.id);
    await s.save(p);
    let rejected = 0;
    for (const raw of [
      '{',
      JSON.stringify({ format: 'tonada', document: { ...p, schema: 2 }, checksum: 'x' }),
      JSON.stringify({ format: 'tonada', document: p, checksum: 'wrong' }),
    ])
      try {
        await a.importProject(new File([raw], 'bad.json'));
      } catch {
        rejected++;
      }
    s.release(p.id);
    return { rejected, count: (await s.list()).length };
  });
  expect(result).toEqual({ rejected: 3, count: 1 });
});
test('quota failure, aborted transaction and serialized revisions preserve the last valid save', async ({
  page,
}) => {
  await page.goto('/test-harness');
  await page.waitForFunction(() => !!(window as any).tonada);
  const result = await page.evaluate(async () => {
    const a = (window as any).tonada,
      s = new a.Store();
    await s.init();
    const p = a.newProject();
    await s.acquire(p.id);
    await s.save(p);
    const original = IDBObjectStore.prototype.put;
    let quota = false,
      aborted = false;
    p.tempo = 120;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Injected quota failure', 'QuotaExceededError');
    };
    try {
      await s.save(p);
    } catch {
      quota = true;
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    const afterQuota = (await s.load(p.id)).tempo;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const result = original.apply(this, args);
      this.transaction.abort();
      return result;
    };
    try {
      await s.save(p);
    } catch {
      aborted = true;
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    const afterAbort = (await s.load(p.id)).tempo;
    p.tempo = 130;
    const first = s.save(p);
    p.tempo = 150;
    const second = s.save(p);
    await Promise.all([first, second]);
    const final = await s.load(p.id);
    s.release(p.id);
    return { quota, aborted, afterQuota, afterAbort, tempo: final.tempo, revision: final.revision };
  });
  expect(result).toEqual({
    quota: true,
    aborted: true,
    afterQuota: 96,
    afterAbort: 96,
    tempo: 150,
    revision: 3,
  });
});
