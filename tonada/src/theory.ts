export const PPQ = 960;
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic minor': [0, 2, 3, 5, 7, 9, 11],
  'major pentatonic': [0, 2, 4, 7, 9],
  'minor pentatonic': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
} as const;
export type Mode = keyof typeof MODES;
export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const mod = (x: number, n: number) => ((x % n) + n) % n;
export function hash(text: string) {
  let h = 2166136261;
  for (const c of text) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function random(seed: string, stream: string) {
  let a = hash(`v1:${stream}:${seed}`);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function normalizeSeed(seed: string) {
  return seed.normalize('NFC').trim() || crypto.randomUUID();
}
export function inScale(pitch: number, tonic: number, mode: Mode) {
  return (MODES[mode] as readonly number[]).includes(mod(pitch - tonic, 12));
}
export function degreePitch(degree: number, tonic: number, mode: Mode, octave = 4) {
  const s = MODES[mode];
  return (octave + 1) * 12 + tonic + s[mod(degree, s.length)]! + Math.floor(degree / s.length) * 12;
}
export function nearest(pitch: number, pitches: number[]) {
  return pitches.reduce((a, b) => (Math.abs(b - pitch) < Math.abs(a - pitch) ? b : a), pitches[0]!);
}
export function scalePitches(tonic: number, mode: Mode, lo = 36, hi = 84) {
  return Array.from({ length: hi - lo + 1 }, (_, i) => i + lo).filter((p) =>
    inScale(p, tonic, mode),
  );
}
export function transposeDegree(
  pitch: number,
  from: { tonic: number; mode: Mode },
  to: { tonic: number; mode: Mode },
) {
  const source = scalePitches(from.tonic, from.mode, 0, 127);
  const snap = nearest(pitch, source);
  const octave = Math.floor((snap - from.tonic) / 12) - 1;
  const degree = (MODES[from.mode] as readonly number[]).indexOf(mod(snap - from.tonic, 12));
  return Math.max(
    0,
    Math.min(127, degreePitch(degree, to.tonic, to.mode, octave) + (pitch - snap)),
  );
}
export function pitchName(p: number) {
  return `${KEYS[mod(p, 12)]}${Math.floor(p / 12) - 1}`;
}
export type Chord = {
  degree: number;
  quality: 'diatonic' | 'major' | 'minor' | 'diminished';
  inversion: number;
  duration: number;
  voicing: number[];
};
export function chordPitches(
  degree: number,
  tonic: number,
  mode: Mode,
  quality: Chord['quality'] = 'diatonic',
) {
  const root = degreePitch(degree, tonic, mode, 3);
  return quality === 'diatonic'
    ? [0, 2, 4].map((d) => degreePitch(degree + d, tonic, mode, 3))
    : [root, root + (quality === 'major' ? 4 : 3), root + (quality === 'diminished' ? 6 : 7)];
}
export function parallelOuter(a: number[], b: number[]) {
  if (!a.length) return false;
  const interval = mod(a.at(-1)! - a[0]!, 12),
    next = mod(b.at(-1)! - b[0]!, 12);
  const low = b[0]! - a[0]!,
    high = b.at(-1)! - a.at(-1)!;
  return (interval === 0 || interval === 7) && interval === next && low * high > 0;
}
export function voiceLead(previous: number[], pitches: number[], inversion = 0) {
  const candidates: number[][] = [];
  for (let inv = 0; inv < 3; inv++)
    for (let oct = -1; oct <= 1; oct++) {
      const v = pitches.map((p, i) => p + oct * 12 + (i < inv ? 12 : 0)).sort((a, b) => a - b);
      if (v[0]! >= 36 && v.at(-1)! <= 84 && !parallelOuter(previous, v)) candidates.push(v);
    }
  return candidates.sort((a, b) => score(a) - score(b))[0] ?? pitches;
  function score(v: number[]) {
    return previous.length
      ? v.reduce((sum, p, i) => sum + Math.abs(p - previous[i]!), 0)
      : Math.abs(v[0]! - 48) + Math.abs(v.indexOf(pitches[0]!) - inversion);
  }
}
// Functional template: begin T, repeat/return between T and S, close D → T.
// Heptatonic degrees T=I/S=IV/D=V; pentatonic/blues use I/II/III scale-stacked chords.
export function progression(seed: string, tonic: number, mode: Mode, bars = 4): Chord[] {
  const rng = random(seed, 'progression');
  const n = MODES[mode].length;
  const dominant = n === 7 ? 4 : 2;
  const sub = n === 7 ? 3 : 1;
  const degrees = Array.from({ length: bars }, (_, i) =>
    i === 0 || i === bars - 1 ? 0 : i === bars - 2 ? dominant : rng() < 0.5 ? sub : 0,
  );
  let prev: number[] = [];
  return degrees.map((degree) => {
    const voicing = voiceLead(prev, chordPitches(degree, tonic, mode));
    prev = voicing;
    return { degree, quality: 'diatonic', inversion: 0, duration: PPQ * 4, voicing };
  });
}
export function classification(pitch: number, chord: Chord, tonic: number, mode: Mode) {
  return chord.voicing.some((p) => mod(p, 12) === mod(pitch, 12))
    ? 'chord'
    : inScale(pitch, tonic, mode)
      ? 'scale'
      : 'tension';
}
