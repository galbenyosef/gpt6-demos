import {
  type Mode,
  type Chord,
  PPQ,
  progression,
  normalizeSeed,
  degreePitch,
  transposeDegree,
  scalePitches,
  nearest,
  MODES,
} from './theory';
export const VERSION = '1.0.0';
export type Voice = {
  mode: 'subtractive' | 'fm' | 'sampler';
  wave: OscillatorType;
  detune: number;
  sub: number;
  noise: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  cutoff: number;
  resonance: number;
  filterDepth: number;
  filterAttack: number;
  filterDecay: number;
  filterSustain: number;
  filterRelease: number;
  ratio: number;
  index: number;
  modDecay: number;
  lfoRate: number;
  lfoDepth: number;
  lfoTarget: 'pitch' | 'filter' | 'amplitude';
  velocityCutoff: number;
  velocityAmp: number;
  pan: number;
  pitchDrop: number;
  sampleId?: string;
};
export type Track = {
  id: string;
  name: string;
  instrument: string;
  preset: string;
  percussive: boolean;
  color: string;
  voice: Voice;
  level: number;
  pan: number;
  reverb: number;
  delay: number;
  saturation: number;
  cutoff: number;
  mute: boolean;
  solo: boolean;
};
export type Note = {
  id: string;
  track: string;
  tick: number;
  duration: number;
  pitch: number;
  velocity: number;
};
export type Pattern = {
  id: string;
  name: string;
  bars: number;
  resolution: number;
  notes: Note[];
  chords: Chord[];
};
export type Sample = {
  id: string;
  name: string;
  rate: number;
  channels: number[][];
  root: number;
  start: number;
  end: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  origin: string;
};
export type Project = {
  schema: 1;
  engine: string;
  content: string;
  id: string;
  sourceId?: string;
  name: string;
  created: string;
  updated: string;
  lastOpened: string;
  revision: number;
  seed: string;
  tonic: number;
  mode: Mode;
  tempo: number;
  signature: [number, number];
  swing: number;
  humanize: number;
  scaleLock: boolean;
  tracks: Track[];
  chordTrack: Track;
  patterns: Pattern[];
  song: string[];
  samples: Sample[];
  master: {
    level: number;
    reverbDecay: number;
    preDelay: number;
    delayDivision: number;
    feedback: number;
  };
  thumbnail?: number[];
};
export const defaultVoice: Voice = {
  mode: 'subtractive',
  wave: 'triangle',
  detune: 7,
  sub: 0.15,
  noise: 0,
  attack: 0.008,
  decay: 0.22,
  sustain: 0.35,
  release: 0.25,
  cutoff: 3500,
  resonance: 0.7,
  filterDepth: 1200,
  filterAttack: 0.01,
  filterDecay: 0.25,
  filterSustain: 0.2,
  filterRelease: 0.25,
  ratio: 2,
  index: 2,
  modDecay: 0.3,
  lfoRate: 4,
  lfoDepth: 0,
  lfoTarget: 'pitch',
  velocityAmp: 0.8,
  velocityCutoff: 1000,
  pan: 0,
  pitchDrop: 0,
};
export const COLORS = [
  '#e4ab69',
  '#d98273',
  '#d4bd73',
  '#82b7a1',
  '#86a9d3',
  '#b2a0d4',
  '#cb9ab8',
  '#a5b9c1',
];
export function makeTrack(i: number): Track {
  const names = ['Kick', 'Snare', 'Closed hat', 'Bass', 'Keys', 'Pluck', 'Pad', 'Sampler'];
  const voice = { ...defaultVoice };
  if (i === 0)
    Object.assign(voice, {
      wave: 'sine',
      detune: 0,
      sub: 0,
      pitchDrop: 110,
      decay: 0.18,
      sustain: 0,
      release: 0.08,
      cutoff: 800,
      filterDepth: 0,
    });
  if (i === 1)
    Object.assign(voice, {
      noise: 0.85,
      sub: 0,
      decay: 0.12,
      sustain: 0,
      release: 0.08,
      cutoff: 6500,
    });
  if (i === 2)
    Object.assign(voice, {
      noise: 1,
      sub: 0,
      decay: 0.035,
      sustain: 0,
      release: 0.03,
      cutoff: 11000,
    });
  if (i === 3) Object.assign(voice, { wave: 'sawtooth', cutoff: 650, filterDepth: 1400, sub: 0.4 });
  if (i === 4)
    Object.assign(voice, { mode: 'fm', ratio: 2, index: 1.7, sustain: 0.2, release: 0.65 });
  if (i === 5)
    Object.assign(voice, {
      mode: 'fm',
      ratio: 3,
      index: 2.5,
      decay: 0.16,
      sustain: 0,
      release: 0.3,
    });
  if (i === 6)
    Object.assign(voice, { wave: 'sawtooth', attack: 0.3, release: 1.4, cutoff: 1100, detune: 12 });
  return {
    id: `track-${i}`,
    name: names[i]!,
    instrument: [
      'Round kick',
      'Dust snare',
      'Silk hat',
      'Warm analog',
      'Glass keys',
      'Copper pluck',
      'Soft air',
      'Empty sampler',
    ][i]!,
    preset: `essentials/${i}`,
    percussive: i < 3,
    color: COLORS[i]!,
    voice,
    level: i === 2 ? 0.32 : i === 6 ? 0.25 : 0.6,
    pan: i === 2 ? 0.2 : 0,
    reverb: i < 3 ? 0.04 : 0.18,
    delay: i === 5 ? 0.22 : 0.03,
    saturation: 0.12,
    cutoff: 18000,
    mute: false,
    solo: false,
  };
}
export function newProject(
  options: Partial<Pick<Project, 'name' | 'tonic' | 'mode' | 'tempo' | 'signature' | 'seed'>> = {},
  empty = false,
): Project {
  const now = new Date().toISOString();
  const p: Project = {
    schema: 1,
    engine: VERSION,
    content: VERSION,
    id: crypto.randomUUID(),
    name: options.name || 'Midnight sketch',
    created: now,
    updated: now,
    lastOpened: now,
    revision: 0,
    seed: normalizeSeed(options.seed || ''),
    tonic: options.tonic ?? 0,
    mode: options.mode ?? 'minor',
    tempo: options.tempo ?? 96,
    signature: options.signature ?? [4, 4],
    swing: 0,
    humanize: 0,
    scaleLock: true,
    tracks: Array.from({ length: 8 }, (_, i) => makeTrack(i)),
    chordTrack: { ...makeTrack(6), id: 'chords', name: 'Chords', level: 0.17 },
    patterns: [],
    song: [],
    samples: [],
    master: { level: 0.65, reverbDecay: 1.8, preDelay: 0.02, delayDivision: 0.5, feedback: 0.3 },
  };
  const pattern: Pattern = {
    id: crypto.randomUUID(),
    name: 'A · First light',
    bars: 4,
    resolution: 240,
    notes: [],
    chords: empty ? [] : progression(p.seed, p.tonic, p.mode),
  };
  pattern.chords.forEach((c) => (c.duration = barTicks(p)));
  p.patterns.push(pattern);
  p.song = [pattern.id];
  if (!empty) {
    for (let bar = 0; bar < 4; bar++) {
      const base = bar * barTicks(p);
      const steps = barTicks(p) / 240;
      for (let s = 0; s < steps; s++) {
        const add = (track: number, pitch: number, duration = 180, velocity = 0.75) =>
          pattern.notes.push({
            id: crypto.randomUUID(),
            track: `track-${track}`,
            tick: base + s * 240,
            duration,
            pitch,
            velocity,
          });
        if (s % 4 === 0) add(0, 36, 120, 0.85);
        if (s % 8 === 4) add(1, 38, 120, 0.7);
        if (s % 2 === 0) add(2, 42, 80, s % 4 === 0 ? 0.35 : 0.5);
        const degree = pattern.chords[bar]!.degree;
        if ([0, 6, 10].includes(s))
          add(3, degreePitch(degree, p.tonic, p.mode, 2), s === 0 ? 1000 : 440, 0.7);
        if ([0, 3, 7, 10, 14].includes(s))
          add(
            4,
            degreePitch(
              degree + [0, 2, 4, 2, 1][[0, 3, 7, 10, 14].indexOf(s)]!,
              p.tonic,
              p.mode,
              4,
            ),
            400,
            0.55,
          );
      }
    }
  }
  return p;
}
export function barTicks(p: Project) {
  return (PPQ * p.signature[0] * 4) / p.signature[1];
}
export function patternTicks(p: Project, pattern: Pattern) {
  return barTicks(p) * pattern.bars;
}
export function changeKey(p: Project, tonic: number, mode: Mode) {
  const from = { tonic: p.tonic, mode: p.mode };
  for (const pattern of p.patterns) {
    for (const note of pattern.notes)
      if (!p.tracks.find((t) => t.id === note.track)?.percussive)
        note.pitch = transposeDegree(note.pitch, from, { tonic, mode });
    for (const c of pattern.chords) {
      c.degree = Math.min(c.degree, MODES[mode].length - 1);
      c.voicing = c.voicing.map((n) => transposeDegree(n, from, { tonic, mode }));
    }
  }
  p.tonic = tonic;
  p.mode = mode;
}
export function lockedPitch(p: Project, pitch: number) {
  return p.scaleLock ? nearest(pitch, scalePitches(p.tonic, p.mode, 0, 127)) : pitch;
}
export function editSnapshot(p: Project): Project {
  const copy: Project = structuredClone({ ...p, samples: [] });
  copy.samples = p.samples.map((s) => ({ ...s, channels: s.channels }));
  return copy;
}
export class History {
  past: Project[] = [];
  future: Project[] = [];
  push(p: Project) {
    this.past.push(editSnapshot(p));
    if (this.past.length > 64) this.past.shift();
    this.future = [];
  }
  undo(p: Project) {
    const prev = this.past.pop();
    if (prev) this.future.push(editSnapshot(p));
    return prev ?? p;
  }
  redo(p: Project) {
    const next = this.future.pop();
    if (next) this.past.push(editSnapshot(p));
    return next ?? p;
  }
}
