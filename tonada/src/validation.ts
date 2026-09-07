import { MODES } from './theory';
import { type Project, type Voice, VERSION, patternTicks, defaultVoice } from './document';
export const LIMITS = {
  samples: 16,
  sampleBytes: 16 * 1024 * 1024,
  importBytes: 100 * 1024 * 1024,
  captureSeconds: 30,
  renderSeconds: 180,
  notes: 16384,
};
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function number(v: unknown, lo: number, hi: number, integer = false) {
  assert(
    typeof v === 'number' &&
      Number.isFinite(v) &&
      v >= lo &&
      v <= hi &&
      (!integer || Number.isInteger(v)),
    `Expected ${integer ? 'integer' : 'number'} in ${lo}–${hi}.`,
  );
}
function string(v: unknown, max = 100) {
  assert(typeof v === 'string' && v.length > 0 && v.length <= max, 'Invalid text field.');
}
export function validateVoice(v: Voice) {
  assert(v && ['subtractive', 'fm', 'sampler'].includes(v.mode), 'Invalid voice mode.');
  assert(['sine', 'triangle', 'sawtooth', 'square'].includes(v.wave), 'Invalid waveform.');
  assert(['pitch', 'filter', 'amplitude'].includes(v.lfoTarget), 'Invalid modulation target.');
  const ranges: Record<string, [number, number]> = {
    detune: [0, 50],
    sub: [0, 1],
    noise: [0, 1],
    attack: [0.001, 3],
    decay: [0.005, 3],
    sustain: [0, 1],
    release: [0.005, 4],
    cutoff: [30, 18000],
    resonance: [0.1, 12],
    filterDepth: [-15000, 15000],
    filterAttack: [0.001, 3],
    filterDecay: [0.005, 3],
    filterSustain: [0, 1],
    filterRelease: [0.005, 4],
    ratio: [0.25, 12],
    index: [0, 12],
    modDecay: [0.005, 4],
    lfoRate: [0.1, 20],
    lfoDepth: [0, 200],
    velocityCutoff: [0, 6000],
    velocityAmp: [0, 1],
    pan: [-1, 1],
    pitchDrop: [0, 300],
  };
  for (const [key, range] of Object.entries(ranges))
    number((v as unknown as Record<string, unknown>)[key], ...range);
  if (v.sampleId) string(v.sampleId);
}
export function validateProject(value: unknown): Project {
  const p = value as Project;
  assert(p && typeof p === 'object', 'Not a project document.');
  assert(p.schema === 1, 'Unsupported project schema. Original file is unchanged.');
  assert(p.engine === VERSION && p.content === VERSION, 'Unsupported engine or content version.');
  for (const v of [p.id, p.name, p.seed]) string(v, 200);
  for (const v of [p.created, p.updated, p.lastOpened])
    assert(typeof v === 'string' && Number.isFinite(Date.parse(v)), 'Invalid timestamp.');
  number(p.revision, 0, Number.MAX_SAFE_INTEGER, true);
  number(p.tonic, 0, 11, true);
  assert(Object.hasOwn(MODES, p.mode), 'Unknown mode.');
  number(p.tempo, 40, 240);
  assert(Array.isArray(p.signature) && p.signature.length === 2, 'Invalid time signature.');
  number(p.signature[0], 1, 12, true);
  assert([2, 4, 8, 16].includes(p.signature[1]), 'Invalid beat unit.');
  number(p.swing, 0, 65);
  number(p.humanize, 0, 1);
  assert(typeof p.scaleLock === 'boolean', 'Invalid scale lock.');
  assert(Array.isArray(p.tracks) && p.tracks.length === 8, 'A project must have eight tracks.');
  assert(p.chordTrack?.id === 'chords', 'Missing chord track.');
  const ids = new Set<string>();
  for (const t of [...p.tracks, p.chordTrack]) {
    string(t.id);
    assert(!ids.has(t.id), 'Duplicate track.');
    ids.add(t.id);
    string(t.name);
    string(t.instrument);
    string(t.preset);
    assert(/^#[0-9a-fA-F]{6}$/.test(t.color), 'Invalid color.');
    for (const k of ['mute', 'solo', 'percussive'] as const)
      assert(typeof t[k] === 'boolean', 'Invalid track flag.');
    number(t.level, 0, 1.5);
    number(t.pan, -1, 1);
    number(t.reverb, 0, 1);
    number(t.delay, 0, 1);
    number(t.saturation, 0, 1);
    number(t.cutoff, 30, 18000);
    validateVoice(t.voice);
  }
  assert(
    Array.isArray(p.patterns) && p.patterns.length >= 1 && p.patterns.length <= 64,
    'Invalid pattern count.',
  );
  const patterns = new Set<string>();
  let noteCount = 0;
  for (const pattern of p.patterns) {
    string(pattern.id);
    assert(!patterns.has(pattern.id), 'Duplicate pattern.');
    patterns.add(pattern.id);
    string(pattern.name);
    number(pattern.bars, 1, 8, true);
    assert([120, 240, 480, 960].includes(pattern.resolution), 'Invalid step resolution.');
    const ticks = patternTicks(p, pattern);
    assert(Array.isArray(pattern.notes) && Array.isArray(pattern.chords), 'Invalid pattern.');
    const notes = new Set<string>();
    for (const n of pattern.notes) {
      string(n.id);
      assert(!notes.has(n.id), 'Duplicate note.');
      notes.add(n.id);
      assert(ids.has(n.track) && n.track !== 'chords', 'Invalid note track.');
      number(n.tick, 0, ticks - 1);
      number(n.duration, 1, ticks - n.tick);
      number(n.pitch, 0, 127, true);
      number(n.velocity, 0.01, 1);
      noteCount++;
    }
    let chordTicks = 0;
    assert(pattern.chords.length <= 32, 'Too many chords.');
    for (const c of pattern.chords) {
      number(c.degree, 0, MODES[p.mode].length - 1, true);
      assert(
        ['diatonic', 'major', 'minor', 'diminished'].includes(c.quality),
        'Invalid chord quality.',
      );
      number(c.inversion, 0, 2, true);
      number(c.duration, 1, ticks);
      chordTicks += c.duration;
      assert(Array.isArray(c.voicing) && c.voicing.length === 3, 'Invalid voicing.');
      c.voicing.forEach((n) => number(n, 0, 127, true));
    }
    assert(chordTicks <= ticks, 'Chords exceed pattern.');
  }
  assert(noteCount <= LIMITS.notes, 'Too many notes.');
  assert(
    Array.isArray(p.song) &&
      p.song.length > 0 &&
      p.song.length <= 64 &&
      p.song.every((id) => patterns.has(id)),
    'Invalid song slots.',
  );
  assert(Array.isArray(p.samples) && p.samples.length <= LIMITS.samples, 'Too many samples.');
  let bytes = 0;
  const samples = new Set<string>();
  for (const s of p.samples) {
    string(s.id);
    assert(!samples.has(s.id), 'Duplicate sample.');
    samples.add(s.id);
    string(s.name);
    string(s.origin);
    number(s.root, 0, 127, true);
    number(s.rate, 8000, 96000, true);
    assert(
      Array.isArray(s.channels) && s.channels.length > 0 && s.channels.length <= 2,
      'Invalid sample channels.',
    );
    const length = s.channels[0]?.length ?? 0;
    assert(length > 0 && length <= s.rate * LIMITS.captureSeconds, 'Invalid sample length.');
    for (const channel of s.channels) {
      assert(Array.isArray(channel) && channel.length === length, 'Invalid sample dimensions.');
      bytes += length * 4;
      assert(bytes <= LIMITS.sampleBytes, 'Sample storage limit reached (16 MiB).');
      channel.forEach((x) => number(x, -1, 1));
    }
    number(s.start, 0, length / s.rate);
    number(s.end, s.start + 0.00001, length / s.rate);
    number(s.loopStart, s.start, s.end);
    number(s.loopEnd, s.loopStart + 0.00001, s.end);
    assert(typeof s.loop === 'boolean', 'Invalid loop.');
  }
  for (const t of [...p.tracks, p.chordTrack])
    if (t.voice.sampleId) assert(samples.has(t.voice.sampleId), 'Missing sample.');
  assert(p.master, 'Missing master chain.');
  number(p.master.level, 0, 1);
  number(p.master.reverbDecay, 0.1, 4);
  number(p.master.preDelay, 0, 0.2);
  number(p.master.delayDivision, 0.125, 2);
  number(p.master.feedback, 0, 0.75);
  if (p.thumbnail) {
    assert(p.thumbnail.length <= 128, 'Invalid thumbnail.');
    p.thumbnail.forEach((n) => number(n, 0, 1));
  }
  return p;
}
