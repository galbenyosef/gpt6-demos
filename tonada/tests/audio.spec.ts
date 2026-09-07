import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('/test-harness');
  await page.waitForFunction(() => !!(window as any).tonada);
});
test('offline render is bit-identical, bounded, finite, and portable through project export', async ({
  page,
  browser,
}, info) => {
  const result = await page.evaluate(async () => {
    const a = (window as any).tonada;
    const p = a.newProject({ seed: 'render-contract' });
    p.humanize = 0.65;
    p.swing = 27;
    const before = JSON.stringify(p);
    const one = await a.renderAudio(p, 'pattern', p.patterns[0].id, 22050),
      two = await a.renderAudio(p, 'pattern', p.patterns[0].id, 22050);
    let equal = true,
      peak = 0,
      sum = 0;
    for (let ch = 0; ch < 2; ch++) {
      const x = one.getChannelData(ch),
        y = two.getChannelData(ch);
      for (let i = 0; i < x.length; i++) {
        equal &&= x[i] === y[i];
        peak = Math.max(peak, Math.abs(x[i]));
        sum += x[i];
      }
    }
    const exported = await a.exportProject(p),
      imported = await a.importProject(new File([exported], 'test.json'));
    const three = await a.renderAudio(imported, 'pattern', imported.patterns[0].id, 22050);
    let portable = true;
    for (let ch = 0; ch < 2; ch++) {
      const x = one.getChannelData(ch),
        y = three.getChannelData(ch);
      for (let i = 0; i < x.length; i++) portable &&= x[i] === y[i];
    }
    return {
      equal,
      portable,
      peak,
      dc: sum / (one.length * 2),
      unchanged: JSON.stringify(p) === before,
      length: one.length,
      wavBytes: a.wav(one, 24).byteLength,
    };
  });
  expect(result.equal).toBe(true);
  expect(result.portable).toBe(true);
  expect(result.peak).toBeGreaterThan(0.01);
  expect(result.peak).toBeLessThanOrEqual(0.89001);
  expect(Math.abs(result.dc)).toBeLessThan(0.001);
  expect(result.unchanged).toBe(true);
  await info.attach('audio-report', {
    body: JSON.stringify({ browser: browser.version(), ...result }, null, 2),
    contentType: 'application/json',
  });
});
test('known sine fundamental, overload, deterministic voice stealing', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = (window as any).tonada;
    const base = a.newProject({}, true);
    const tr = base.tracks[4];
    Object.assign(tr.voice, {
      ...a.defaultVoice,
      wave: 'sine',
      detune: 0,
      sub: 0,
      attack: 0.005,
      decay: 0.005,
      sustain: 1,
      release: 0.05,
      velocityCutoff: 0,
      cutoff: 18000,
      filterDepth: 0,
    });
    tr.reverb = tr.delay = 0;
    tr.saturation = 0;
    const c = new OfflineAudioContext(2, 44100, 44100),
      engine = new a.Engine(c, [tr], base.master, 'pitch', [], 120);
    engine.schedule({ track: tr.id, pitch: 69, velocity: 1, time: 0, duration: 0.8, key: 'a' });
    const b = await c.startRendering();
    engine.dispose();
    const x = b.getChannelData(0);
    const crossings: number[] = [];
    for (let i = 5000; i < 25000; i++) if (x[i - 1]! < 0 && x[i]! >= 0) crossings.push(i);
    const hz = (44100 * (crossings.length - 1)) / (crossings.at(-1)! - crossings[0]!);
    const render = async () => {
      const c = new OfflineAudioContext(2, 44100 * 2, 44100);
      const ts = base.tracks.map((t: any) => ({
        ...t,
        level: 1.5,
        voice: { ...tr.voice, resonance: 12, cutoff: 440, sustain: 1 },
        reverb: 1,
        delay: 1,
      }));
      const e = new a.Engine(c, ts, { ...base.master, level: 1 }, 'overload', [], 120);
      for (let n = 0; n < 200; n++)
        e.schedule({
          track: ts[n % 8].id,
          pitch: 45 + (n % 36),
          velocity: 1,
          time: Math.floor(n / 40) * 0.03,
          duration: 1,
          key: String(n),
        });
      const b = await c.startRendering();
      e.dispose();
      return b.getChannelData(0);
    };
    const first = await render(),
      second = await render();
    let peak = 0,
      equal = true,
      finite = true,
      jump = 0;
    for (let i = 0; i < first.length; i++) {
      peak = Math.max(peak, Math.abs(first[i]!));
      equal &&= first[i] === second[i];
      finite &&= Number.isFinite(first[i]);
      if (i) jump = Math.max(jump, Math.abs(first[i]! - first[i - 1]!));
    }
    return { hz, cents: 1200 * Math.log2(hz / 440), peak, equal, finite, jump };
  });
  expect(Math.abs(result.cents)).toBeLessThan(2);
  expect(result.peak).toBeLessThanOrEqual(0.89001);
  expect(result.equal).toBe(true);
  expect(result.finite).toBe(true);
  expect(result.jump).toBeLessThan(0.3);
});
test('200-seed corpus', async ({ page, browser }, info) => {
  test.skip(!process.env.CORPUS, 'Run bun run verify:corpus for the full corpus.');
  test.setTimeout(300000);
  const report = await page.evaluate(async () => {
    const a = (window as any).tonada;
    const rows = [];
    for (let seed = 0; seed < 200; seed++) {
      const p = a.newProject({
        seed: `corpus-${seed}`,
        tonic: seed % 12,
        mode: Object.keys(a.MODES)[seed % 12],
        tempo: 80 + (seed % 100),
      });
      p.patterns[0].bars = 1;
      p.patterns[0].notes = p.patterns[0].notes.filter((n: any) => n.tick < 3840);
      p.patterns[0].chords = p.patterns[0].chords.slice(0, 1);
      p.humanize = (seed % 11) / 10;
      p.swing = seed % 60;
      const b = await a.renderAudio(p, 'pattern', p.patterns[0].id, 22050);
      const x = b.getChannelData(0);
      let peak = 0,
        h = 2166136261;
      const ints = new Uint32Array(x.buffer);
      for (let i = 0; i < x.length; i++) {
        if (!Number.isFinite(x[i])) throw new Error(`Non-finite seed ${seed}`);
        peak = Math.max(peak, Math.abs(x[i]!));
        h = Math.imul(h ^ ints[i]!, 16777619);
      }
      rows.push({ seed, peak, duration: b.duration, checksum: (h >>> 0).toString(16) });
    }
    return rows;
  });
  expect(report).toHaveLength(200);
  expect(report.every((x) => x.peak <= 0.89001 && x.peak > 0)).toBe(true);
  await info.attach('corpus', {
    body: JSON.stringify(
      { browser: browser.version(), engine: '1.0.0', sampleRate: 22050, report },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});
test('ADSR checkpoints and spectral filter response', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = (window as any).tonada,
      p = a.newProject({}, true);
    const measure = async (cutoff: number, noise: number) => {
      const tr = p.tracks[4];
      tr.voice = {
        ...a.defaultVoice,
        wave: 'sine',
        noise,
        detune: 0,
        sub: 0,
        cutoff,
        filterDepth: 0,
        velocityCutoff: 0,
        attack: 0.05,
        decay: 0.1,
        sustain: 0.4,
        release: 0.2,
      };
      tr.reverb = tr.delay = tr.saturation = 0;
      const c = new OfflineAudioContext(2, 44100, 44100),
        engine = new a.Engine(c, [tr], { ...p.master, level: 1 }, 'envelope', [], 120);
      // Measure the voice envelope before the intentionally dynamic bus chain.
      engine.analyser.disconnect(c.destination);
      engine.tracks.get(tr.id).input.connect(c.destination);
      engine.schedule({ track: tr.id, pitch: 69, velocity: 1, time: 0, duration: 0.6, key: 'one' });
      const b = await c.startRendering();
      engine.dispose();
      return b.getChannelData(0);
    };
    const sine = await measure(18000, 0);
    const rms = (data: Float32Array, time: number) => {
      let sum = 0;
      const begin = Math.floor(time * 44100);
      for (let i = begin; i < begin + 100; i++) sum += data[i]! * data[i]!;
      return Math.sqrt(sum / 100);
    };
    const peak = rms(sine, 0.048);
    const ratios = [
      rms(sine, 0.024) / peak,
      rms(sine, 0.2) / peak,
      rms(sine, 0.7) / peak,
      rms(sine, 0.82) / peak,
    ];
    const centroids = [];
    for (const cutoff of [400, 1800, 7000]) {
      const x = await measure(cutoff, 1);
      let power = 0,
        weighted = 0;
      const size = 2048;
      for (let k = 1; k < 512; k++) {
        let re = 0,
          im = 0;
        for (let i = 0; i < size; i++) {
          const sample = x[9000 + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
          re += sample * Math.cos((2 * Math.PI * k * i) / size);
          im -= sample * Math.sin((2 * Math.PI * k * i) / size);
        }
        const energy = re * re + im * im;
        power += energy;
        weighted += (energy * k * 44100) / size;
      }
      centroids.push(weighted / power);
    }
    return { ratios, centroids };
  });
  expect(result.ratios[0]).toBeGreaterThan(0.4);
  expect(result.ratios[0]).toBeLessThan(0.65);
  expect(result.ratios[1]).toBeGreaterThan(0.3);
  expect(result.ratios[1]).toBeLessThan(0.5);
  expect(result.ratios[2]).toBeGreaterThan(0.12);
  expect(result.ratios[2]).toBeLessThan(0.3);
  expect(result.ratios[3]).toBeLessThan(0.001);
  expect(result.centroids[1]!).toBeGreaterThan(result.centroids[0]!);
  expect(result.centroids[2]!).toBeGreaterThan(result.centroids[1]!);
});
test('maximum sample count exports, imports and renders intact', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const a = (window as any).tonada,
      p = a.newProject({ seed: 'samples-max' });
    p.samples = Array.from({ length: 16 }, (_, i) => ({
      id: `sample-${i}`,
      name: `Sample ${i}`,
      rate: 8000,
      channels: [
        Array.from({ length: 240000 }, (_, n) => Math.sin((n * 2 * Math.PI * 220) / 8000) * 0.2),
      ],
      root: 57,
      start: 0,
      end: 30,
      loop: false,
      loopStart: 0,
      loopEnd: 30,
      origin: 'file',
    }));
    p.tracks[4].voice.mode = 'sampler';
    p.tracks[4].voice.sampleId = 'sample-0';
    const text = await a.exportProject(p),
      copy = await a.importProject(new File([text], 'samples.tonada.json'));
    const buffer = await a.renderAudio(copy, 'pattern', copy.patterns[0].id, 22050);
    let refused = false;
    try {
      await a.decodeSample(new Blob(['x']), 'extra', copy);
    } catch {
      refused = true;
    }
    return { count: copy.samples.length, bytes: text.length, refused, frames: buffer.length };
  });
  expect(result.count).toBe(16);
  expect(result.bytes).toBeLessThan(100 * 1024 * 1024);
  expect(result.refused).toBe(true);
  expect(result.frames).toBeGreaterThan(0);
});
