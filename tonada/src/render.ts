import { type Project } from './document';
import { Engine, CEILING } from './engine';
import { eventsFor, soundEvent, tickSeconds } from './scheduler';
import { LIMITS, validateProject } from './validation';
export async function renderAudio(
  project: Project,
  range: 'pattern' | 'song',
  patternId: string,
  rate = 44100,
  progress: (fraction: number) => void = () => {},
) {
  const p = validateProject(structuredClone(project));
  const data = eventsFor(p, range, patternId);
  const release = Math.max(...[...p.tracks, p.chordTrack].map((t) => t.voice.release));
  const repeats =
    p.master.feedback > 0 ? Math.ceil(Math.log(0.0001) / Math.log(p.master.feedback)) : 1;
  const delayTail = (60 / p.tempo) * p.master.delayDivision * repeats;
  const tail = release + Math.max(p.master.reverbDecay + p.master.preDelay, delayTail) + 0.05;
  const duration = tickSeconds(data.ticks, p.tempo) + Math.max(4, tail);
  if (duration > LIMITS.renderSeconds)
    throw new Error('Render exceeds the 180-second limit. Shorten the song or render a pattern.');
  const c = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
  const engine = new Engine(c, [...p.tracks, p.chordTrack], p.master, p.seed, p.samples, p.tempo);
  data.events.forEach((e) => engine.schedule(soundEvent(e, p)));
  progress(0.05);
  for (let i = 1; i <= 4; i++) {
    void c.suspend((duration * i) / 5).then(() => {
      progress(i / 5);
      return c.resume();
    });
  }
  try {
    const buffer = await c.startRendering();
    progress(1);
    return buffer;
  } finally {
    engine.dispose();
  }
}
export function wav(buffer: AudioBuffer, depth: 16 | 24) {
  const bytes = depth / 8,
    channels = buffer.numberOfChannels;
  const out = new ArrayBuffer(44 + buffer.length * channels * bytes),
    v = new DataView(out);
  const text = (offset: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, out.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * bytes, true);
  v.setUint16(32, channels * bytes, true);
  v.setUint16(34, depth, true);
  text(36, 'data');
  v.setUint32(40, out.byteLength - 44, true);
  let o = 44;
  for (let i = 0; i < buffer.length; i++)
    for (let ch = 0; ch < channels; ch++) {
      const raw = buffer.getChannelData(ch)[i]!;
      if (!Number.isFinite(raw)) throw new Error('Render contains a non-finite sample.');
      const sample = Math.max(-CEILING, Math.min(CEILING, raw));
      const value = Math.round(sample * ((1 << (depth - 1)) - 1));
      if (depth === 16) v.setInt16(o, value, true);
      else {
        v.setUint8(o, value & 255);
        v.setUint8(o + 1, (value >> 8) & 255);
        v.setUint8(o + 2, (value >> 16) & 255);
      }
      o += bytes;
    }
  return out;
}
export function thumbnail(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0),
    result: number[] = [];
  for (let i = 0; i < 64; i++) {
    let peak = 0;
    for (let j = Math.floor((i * data.length) / 64); j < ((i + 1) * data.length) / 64; j++)
      peak = Math.max(peak, Math.abs(data[j] ?? 0));
    result.push(peak);
  }
  return result;
}
const be = (n: number, size: number) =>
  Array.from({ length: size }, (_, i) => (n >> ((size - i - 1) * 8)) & 255);
const vlq = (n: number) => {
  const a = [n & 127];
  while ((n >>= 7) > 0) a.unshift((n & 127) | 128);
  return a;
};
export function midi(p: Project, range: 'pattern' | 'song', id: string) {
  const { events } = eventsFor({ ...p, humanize: 0 }, range, id);
  const chunks: number[][] = [];
  const tracks = [...p.tracks, p.chordTrack];
  tracks.forEach((track, index) => {
    const channel = index < 8 ? index : 8;
    const name = Array.from(new TextEncoder().encode(track.name));
    const tempo = be(Math.round(60_000_000 / p.tempo), 3);
    const rows: { tick: number; data: number[] }[] = [
      { tick: 0, data: [255, 3, ...vlq(name.length), ...name] },
    ];
    if (index === 0)
      rows.push(
        { tick: 0, data: [255, 81, 3, ...tempo] },
        { tick: 0, data: [255, 88, 4, p.signature[0], Math.log2(p.signature[1]), 24, 8] },
      );
    for (const e of events.filter((e) => e.track === track.id)) {
      const tick = Math.round(tickSeconds(e.tick, 120, p.swing) * 1920);
      rows.push(
        { tick, data: [144 + channel, e.pitch, Math.round(e.velocity * 127)] },
        { tick: tick + Math.round(e.durationTick), data: [128 + channel, e.pitch, 0] },
      );
    }
    rows.sort((a, b) => a.tick - b.tick || ((a.data[0]! & 240) === 128 ? -1 : 1));
    let last = 0;
    const data = rows.flatMap((row) => {
      const delta = row.tick - last;
      last = row.tick;
      return [...vlq(delta), ...row.data];
    });
    data.push(0, 255, 47, 0);
    chunks.push([77, 84, 114, 107, ...be(data.length, 4), ...data]);
  });
  return new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    1,
    ...be(tracks.length, 2),
    3,
    192,
    ...chunks.flat(),
  ]);
}
