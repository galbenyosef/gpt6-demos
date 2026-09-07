import {
  barTicks,
  makeTrack,
  type Pattern,
  type Project,
  type Track,
  type Voice,
} from './document';
import { degreePitch, MODES, progression } from './theory';
export const TEMPLATES = [
  {
    id: 'ambient',
    name: { en: 'Ambient', es: 'Ambient' },
    description: {
      en: 'Floating pads, glass notes and a spacious, unhurried pulse.',
      es: 'Pads flotantes, notas de cristal y un pulso amplio y pausado.',
    },
  },
  {
    id: 'house',
    name: { en: 'House', es: 'House' },
    description: {
      en: 'Four-on-the-floor drums, offbeat bass and bright chord stabs.',
      es: 'Bombo a negras, bajo a contratiempo y acordes brillantes.',
    },
  },
  {
    id: 'hip-hop',
    name: { en: 'Hip-hop', es: 'Hip-hop' },
    description: {
      en: 'A syncopated pocket, rounded bass and mellow electric keys.',
      es: 'Ritmo sincopado, bajo redondo y teclas eléctricas suaves.',
    },
  },
  {
    id: 'synthwave',
    name: { en: 'Synthwave', es: 'Synthwave' },
    description: {
      en: 'Driving bass, wide analog pads and a rising arpeggio.',
      es: 'Bajo enérgico, pads analógicos amplios y arpegio ascendente.',
    },
  },
  {
    id: 'minimal',
    name: { en: 'Minimal', es: 'Minimal' },
    description: {
      en: 'Sparse percussion, a repeating bass motif and delicate plucks.',
      es: 'Percusión espaciada, un motivo de bajo y pulsaciones delicadas.',
    },
  },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]['id'];
export function createTemplate(p: Project, id: TemplateId, language: 'en' | 'es' = 'en'): Pattern {
  const definition = TEMPLATES.find((t) => t.id === id);
  if (!definition) throw new Error('Unknown arrangement template.');
  const tracks = p.tracks.map((existing, i) => ({ ...makeTrack(i), id: existing.id }));
  const chordTrack = {
    ...makeTrack(6),
    id: 'chords',
    name: p.chordTrack.name,
    level: 0.16,
    reverb: 0.25,
  };
  const voice = (i: number, params: Partial<Voice>, name: string, mix: Partial<Track> = {}) => {
    Object.assign(tracks[i]!, mix);
    Object.assign(tracks[i]!.voice, params);
    tracks[i]!.instrument = name;
    tracks[i]!.preset = `template/${id}/${i}`;
  };
  tracks[4]!.pan = -0.2;
  tracks[5]!.pan = 0.25;
  tracks[6]!.pan = 0.12;
  if (id === 'ambient') {
    voice(0, { pitchDrop: 65, decay: 0.3 }, 'Soft pulse', { level: 0.3 });
    voice(4, { index: 0.7, attack: 0.04, release: 1.7 }, 'Distant glass', {
      level: 0.32,
      reverb: 0.65,
      delay: 0.2,
    });
    voice(5, { index: 1, ratio: 2, release: 1.2 }, 'Falling bell', {
      level: 0.24,
      reverb: 0.55,
      delay: 0.3,
    });
    voice(
      6,
      { wave: 'triangle', attack: 0.8, release: 2.8, cutoff: 1700, filterDepth: 400 },
      'Cloud pad',
      { level: 0.42, reverb: 0.7 },
    );
    voice(3, { wave: 'sine', sub: 0.15, cutoff: 500, release: 0.8 }, 'Round foundation', {
      level: 0.42,
    });
    chordTrack.level = 0.12;
  } else if (id === 'house') {
    voice(0, { pitchDrop: 140, decay: 0.23 }, 'Club kick', { level: 0.8 });
    voice(
      3,
      { wave: 'sawtooth', cutoff: 800, filterDepth: 2300, decay: 0.12, sustain: 0.15 },
      'Offbeat bass',
      { level: 0.58 },
    );
    voice(
      4,
      {
        mode: 'subtractive',
        wave: 'sawtooth',
        attack: 0.004,
        decay: 0.12,
        sustain: 0.12,
        release: 0.15,
        cutoff: 2800,
      },
      'House organ',
      { level: 0.38, reverb: 0.2 },
    );
    voice(5, { index: 1.2, ratio: 2, release: 0.18 }, 'Bright accent', {
      level: 0.26,
      delay: 0.18,
    });
  } else if (id === 'hip-hop') {
    voice(0, { pitchDrop: 80, decay: 0.28 }, 'Deep kick', { level: 0.75 });
    voice(1, { cutoff: 3800, decay: 0.16 }, 'Dry backbeat', { level: 0.55, reverb: 0.07 });
    voice(3, { wave: 'sine', sub: 0.3, cutoff: 600, filterDepth: 300 }, 'Velvet sub', {
      level: 0.65,
    });
    voice(4, { ratio: 1, index: 0.8, cutoff: 2100, release: 0.65 }, 'Mellow electric', {
      level: 0.45,
      reverb: 0.25,
    });
  } else if (id === 'synthwave') {
    voice(
      3,
      { wave: 'sawtooth', detune: 9, cutoff: 1100, filterDepth: 1600, decay: 0.12, sustain: 0.3 },
      'Neon bass',
      { level: 0.52 },
    );
    voice(
      5,
      {
        mode: 'subtractive',
        wave: 'square',
        sub: 0,
        cutoff: 2200,
        decay: 0.1,
        sustain: 0.1,
        release: 0.18,
      },
      'Neon arpeggio',
      { level: 0.34, delay: 0.32 },
    );
    voice(
      6,
      { wave: 'sawtooth', detune: 18, attack: 0.28, release: 1.5, cutoff: 2200 },
      'Wide analog',
      { level: 0.28, reverb: 0.45 },
    );
  } else {
    voice(0, { decay: 0.12, pitchDrop: 80 }, 'Small kick', { level: 0.55 });
    voice(
      3,
      { wave: 'triangle', sub: 0.2, cutoff: 600, decay: 0.1, sustain: 0.2 },
      'Minimal bass',
      { level: 0.55 },
    );
    voice(5, { ratio: 3, index: 1.4, decay: 0.08, release: 0.25 }, 'Wooden pluck', {
      level: 0.38,
      reverb: 0.25,
      delay: 0.25,
    });
    chordTrack.level = 0.1;
  }
  const length = barTicks(p),
    scale = MODES[p.mode];
  const chords = progression(`${p.seed}:template:${id}`, p.tonic, p.mode, 4);
  chords.forEach((c) => (c.duration = length));
  const result: Pattern = {
    id: crypto.randomUUID(),
    name: definition.name[language],
    bars: 4,
    resolution: 240,
    notes: [],
    chords,
    sound: { tracks, chordTrack },
  };
  // A 16-position phrase is proportionally mapped into the project's meter.
  const add = (
    bar: number,
    step: number,
    ti: number,
    degree: number,
    duration: number,
    velocity = 0.65,
  ) => {
    const local = Math.round((step / 16) * length),
      tick = bar * length + local;
    const pitch =
      ti < 3
        ? [36, 38, 42][ti]!
        : degreePitch(degree, p.tonic, p.mode, ti === 3 ? 2 : ti === 6 ? 3 : 4);
    result.notes.push({
      id: crypto.randomUUID(),
      track: tracks[ti]!.id,
      tick,
      duration: Math.max(1, Math.min(Math.round((duration / 16) * length), length - local)),
      pitch,
      velocity,
    });
  };
  for (let b = 0; b < 4; b++) {
    const root = chords[b]!.degree;
    const kick =
      id === 'ambient'
        ? [0]
        : id === 'house' || id === 'synthwave'
          ? [0, 4, 8, 12]
          : id === 'hip-hop'
            ? [0, 6, 10]
            : [0, 8];
    const snare = id === 'ambient' ? [] : id === 'minimal' ? [12] : [4, 12];
    const hats =
      id === 'ambient'
        ? [6, 14]
        : id === 'house'
          ? [2, 6, 10, 14]
          : id === 'minimal'
            ? [2, 10, 14]
            : [0, 2, 4, 6, 8, 10, 12, 14];
    kick.forEach((s) => add(b, s, 0, 0, 0.5, 0.85));
    snare.forEach((s) => add(b, s, 1, 0, 0.5, 0.65));
    hats.forEach((s, i) => add(b, s, 2, 0, 0.3, i % 2 ? 0.42 : 0.28));
    const bass =
      id === 'ambient'
        ? [0, 10]
        : id === 'house'
          ? [2, 6, 10, 14]
          : id === 'synthwave'
            ? [0, 2, 4, 6, 8, 10, 12, 14]
            : id === 'hip-hop'
              ? [0, 3, 7, 10]
              : [0, 6, 10];
    bass.forEach((s, i) =>
      add(
        b,
        s,
        3,
        root + (id === 'synthwave' && i % 4 === 3 ? scale.length : 0),
        id === 'ambient' ? 6 : id === 'house' ? 1.4 : 1.8,
        0.7,
      ),
    );
    if (id === 'house' || id === 'hip-hop')
      for (const s of id === 'house' ? [2, 8, 14] : [0, 7, 12])
        for (const d of [0, 2, 4]) add(b, s, 4, root + d, id === 'house' ? 1.1 : 3.5, 0.48);
    if (id === 'ambient') {
      add(b, 2, 4, root + 4, 5, 0.45);
      add(b, 11, 5, root + 2, 3, 0.4);
    }
    const plucks =
      id === 'synthwave'
        ? [0, 2, 4, 6, 8, 10, 12, 14]
        : id === 'minimal'
          ? [3, 9, 14]
          : id === 'house'
            ? [7, 15]
            : id === 'hip-hop'
              ? [14]
              : [];
    plucks.forEach((s, i) =>
      add(
        b,
        s,
        5,
        root + [0, 2, 4, scale.length, 4, 2, 1, 2][i % 8]!,
        id === 'minimal' ? 1.3 : 0.8,
        0.46,
      ),
    );
    if (id === 'ambient' || id === 'synthwave')
      for (const d of [0, 2, 4]) add(b, 0, 6, root + d, 15, 0.48);
  }
  return result;
}
export function applyTemplate(p: Project, id: TemplateId, language: 'en' | 'es' = 'en') {
  if (p.patterns.length >= 64)
    throw new Error(language === 'es' ? 'Máximo 64 patrones.' : 'Maximum 64 patterns.');
  const next = createTemplate(p, id, language);
  if (p.patterns.reduce((sum, pat) => sum + pat.notes.length, 0) + next.notes.length > 16384)
    throw new Error(
      language === 'es' ? 'Demasiadas notas en el proyecto.' : 'Too many notes in this project.',
    );
  // Snapshot old sounds before loading the new arrangement; never rewrite old notes or song slots.
  for (const pat of p.patterns)
    pat.sound ??= structuredClone({ tracks: p.tracks, chordTrack: p.chordTrack });
  p.patterns.push(next);
  p.tracks = structuredClone(next.sound!.tracks);
  p.chordTrack = structuredClone(next.sound!.chordTrack);
  return p.patterns.length - 1;
}
