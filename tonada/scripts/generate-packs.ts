import { chromium } from '@playwright/test';
import { catalog } from './catalog';
import { wav } from '../src/render';
const packs = await catalog();
const generated = packs.flatMap((pack) =>
  pack.presets.filter((p) => p.generator).map((p) => ({ pack, preset: p })),
);
if (!generated.length) process.exit(0);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage();
  for (const { pack, preset } of generated) {
    const audio = await page.evaluate(async (g) => {
      const context = new OfflineAudioContext(1, Math.ceil(g.duration * 22050), 22050);
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(g.frequency, 0);
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(0.7, 0.004);
      gain.gain.exponentialRampToValueAtTime(0.00001, g.duration - 0.01);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(0);
      oscillator.stop(g.duration);
      const buffer = await context.startRendering();
      return Array.from(buffer.getChannelData(0));
    }, preset.generator!);
    const buffer = {
      numberOfChannels: 1,
      length: audio.length,
      sampleRate: 22050,
      getChannelData: () => new Float32Array(audio),
    } as unknown as AudioBuffer;
    await Bun.write(`public/packs/${pack.slug}/${preset.id}.wav`, wav(buffer, 16));
    console.log(`Generated ${pack.slug}/${preset.id}`);
  }
} finally {
  await browser.close();
}
