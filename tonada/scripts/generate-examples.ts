import { newProject, activatePattern, barTicks, type Project, type Pattern } from '../src/document';
import { createTemplate } from '../src/templates';
import { chordPitches, degreePitch, voiceLead, inScale } from '../src/theory';
import { validateProject } from '../src/validation';
import { exportProject, importProject } from '../src/persistence';

const stamp = '2026-09-07T12:00:00.000Z';
function note(
  p: Project,
  pat: Pattern,
  track: number,
  bar: number,
  step: number,
  degree: number,
  length: number,
  velocity: number,
  octave = 4,
) {
  const tick = bar * barTicks(p) + step * 240;
  pat.notes.push({
    id: crypto.randomUUID(),
    track: pat.sound!.tracks[track]!.id,
    tick,
    duration: Math.min(length * 240, barTicks(p) * pat.bars - tick),
    pitch: degreePitch(degree, p.tonic, p.mode, octave),
    velocity,
  });
}
function harmony(p: Project, pat: Pattern, roots: number[]) {
  let previous: number[] = [];
  pat.chords = roots.map((degree) => {
    const voicing = voiceLead(previous, chordPitches(degree, p.tonic, p.mode));
    previous = voicing;
    return { degree, quality: 'diatonic', inversion: 0, duration: barTicks(p), voicing };
  });
}
function variation(source: Pattern, name: string) {
  const pat = structuredClone(source);
  pat.name = name;
  return pat;
}
function keep(pat: Pattern, tracks: number[]) {
  const ids = new Set(tracks.map((i) => pat.sound!.tracks[i]!.id));
  pat.notes = pat.notes.filter((n) => ids.has(n.track));
}
function classicHouse() {
  const p = newProject(
    {
      name: 'After Hours · Classic House',
      tonic: 9,
      mode: 'minor',
      tempo: 124,
      seed: 'tonada:examples:classic-house:v1',
    },
    true,
  );
  p.id = '7e25b8b6-4124-4a41-a001-389ce718a111';
  p.swing = 13;
  p.humanize = 0.1;
  p.master = {
    level: 0.75,
    reverbDecay: 1.45,
    preDelay: 0.018,
    delayDivision: 0.75,
    feedback: 0.28,
  };
  const groove = createTemplate(p, 'house');
  groove.name = 'A · Warehouse groove';
  const roots = [0, 5, 6, 0];
  harmony(p, groove, roots);
  keep(groove, [0, 1, 2]);
  const tr = groove.sound!.tracks;
  Object.assign(tr[1]!.voice, { noise: 0.92, cutoff: 5200, decay: 0.105, release: 0.09 });
  tr[1]!.instrument = '909-style clap';
  tr[1]!.level = 0.52;
  tr[1]!.reverb = 0.12;
  Object.assign(tr[2]!, { pan: 0.28, level: 0.38, reverb: 0.025 });
  Object.assign(tr[3]!.voice, {
    mode: 'subtractive',
    wave: 'square',
    cutoff: 730,
    filterDepth: 1800,
    detune: 0,
    sub: 0.25,
    decay: 0.11,
    sustain: 0.22,
    release: 0.09,
  });
  tr[3]!.instrument = 'Rubber bass';
  Object.assign(tr[4]!.voice, {
    mode: 'fm',
    ratio: 1,
    index: 1.15,
    attack: 0.006,
    decay: 0.24,
    sustain: 0.18,
    release: 0.22,
    cutoff: 3300,
    sub: 0,
  });
  tr[4]!.instrument = 'Garage organ';
  tr[4]!.level = 0.42;
  tr[4]!.pan = -0.16;
  Object.assign(tr[5]!.voice, {
    mode: 'fm',
    ratio: 2,
    index: 1.45,
    attack: 0.003,
    decay: 0.13,
    sustain: 0,
    release: 0.22,
    cutoff: 4300,
  });
  tr[5]!.instrument = 'Late-night bell';
  tr[5]!.level = 0.28;
  tr[5]!.delay = 0.24;
  groove.sound!.chordTrack.level = 0.075;
  groove.sound!.chordTrack.reverb = 0.3;
  for (let b = 0; b < 4; b++) {
    const root = roots[b]!;
    [2, 6, 10, 14].forEach((step, i) =>
      note(p, groove, 3, b, step, root + (i === 3 ? 4 : 0), 1.5, i === 0 ? 0.8 : 0.67, 2),
    );
    if (b % 2) note(p, groove, 3, b, 15.5, root + 6, 0.45, 0.44, 2);
    for (const step of [2, 7, 10, 14])
      for (const degree of [0, 2, 4, 6])
        note(p, groove, 4, b, step, root + degree, step === 7 ? 1.8 : 1.15, 0.39, 3);
    [3, 7, 11, 15].forEach((step, i) =>
      note(p, groove, 5, b, step, root + [4, 2, 6, 4][i]!, 1, 0.36),
    );
  }
  const lift = variation(groove, 'B · Open the room');
  lift.sound!.tracks[4]!.voice.cutoff = 4700;
  lift.sound!.tracks[5]!.level = 0.35;
  for (let b = 0; b < 4; b++) {
    for (const d of [0, 2, 4]) note(p, lift, 6, b, 0, roots[b]! + d, 14, 0.38, 3);
    note(p, lift, 5, b, 13, roots[b]! + 8, 0.8, 0.38);
  }
  lift.sound!.tracks[6]!.level = 0.2;
  lift.sound!.tracks[6]!.reverb = 0.4;
  const breakdown = variation(groove, 'C · Organ break');
  keep(breakdown, [2, 4, 5]);
  breakdown.sound!.tracks[2]!.level = 0.2;
  breakdown.sound!.tracks[4]!.reverb = 0.4;
  breakdown.sound!.tracks[5]!.delay = 0.35;
  const intro = variation(groove, 'D · Doors open');
  keep(intro, [0, 1, 2, 3]);
  intro.sound!.chordTrack.mute = true;
  const outro = variation(groove, 'E · Last dancers');
  keep(outro, [0, 2, 3, 4]);
  outro.sound!.tracks[4]!.voice.cutoff = 1300;
  outro.sound!.tracks[4]!.level = 0.26;
  outro.sound!.chordTrack.mute = true;
  p.patterns = [groove, lift, breakdown, intro, outro];
  return finalize(p, 'classic-house', [3, 0, 0, 1, 2, 1, 1, 4]);
}
function ambientSoul() {
  const p = newProject(
    {
      name: 'Velvet Blue · Ambient Soul',
      tonic: 2,
      mode: 'dorian',
      tempo: 76,
      seed: 'tonada:examples:ambient-soul:v1',
    },
    true,
  );
  p.id = '0bd06ba0-b35b-43dc-b002-acd0f6e89122';
  p.swing = 26;
  p.humanize = 0.28;
  p.master = {
    level: 0.72,
    reverbDecay: 3.4,
    preDelay: 0.045,
    delayDivision: 0.75,
    feedback: 0.36,
  };
  const theme = createTemplate(p, 'ambient');
  theme.name = 'A · Velvet keys';
  theme.notes = [];
  const roots = [0, 3, 6, 0];
  harmony(p, theme, roots);
  const tr = theme.sound!.tracks;
  Object.assign(tr[0]!, { instrument: 'Felt heartbeat', level: 0.37, reverb: 0.015 });
  Object.assign(tr[0]!.voice, { pitchDrop: 45, cutoff: 440, decay: 0.22 });
  Object.assign(tr[1]!, { instrument: 'Brushed backbeat', level: 0.18, reverb: 0.22 });
  Object.assign(tr[1]!.voice, { noise: 0.95, cutoff: 2400, decay: 0.14, release: 0.1 });
  Object.assign(tr[2]!, { instrument: 'Soft shaker', level: 0.2, pan: 0.35, reverb: 0.15 });
  Object.assign(tr[2]!.voice, { cutoff: 7000, decay: 0.055, release: 0.045 });
  Object.assign(tr[3]!, { instrument: 'Velvet sub', level: 0.5, reverb: 0.04 });
  Object.assign(tr[3]!.voice, {
    wave: 'sine',
    cutoff: 550,
    filterDepth: 200,
    sub: 0.16,
    attack: 0.035,
    decay: 0.22,
    sustain: 0.55,
    release: 0.4,
  });
  Object.assign(tr[4]!, {
    instrument: 'Warm electric piano',
    level: 0.44,
    reverb: 0.37,
    delay: 0.1,
    pan: -0.17,
  });
  Object.assign(tr[4]!.voice, {
    mode: 'fm',
    ratio: 1,
    index: 0.72,
    modDecay: 0.65,
    attack: 0.014,
    decay: 0.65,
    sustain: 0.32,
    release: 1.3,
    cutoff: 2400,
    filterDepth: 450,
    velocityCutoff: 600,
  });
  Object.assign(tr[5]!, {
    instrument: 'Breathy answer',
    level: 0.25,
    reverb: 0.55,
    delay: 0.3,
    pan: 0.24,
  });
  Object.assign(tr[5]!.voice, {
    mode: 'subtractive',
    wave: 'triangle',
    noise: 0.035,
    detune: 3,
    sub: 0,
    attack: 0.075,
    decay: 0.28,
    sustain: 0.5,
    release: 0.85,
    cutoff: 2300,
    lfoRate: 4.6,
    lfoDepth: 4,
    lfoTarget: 'pitch',
  });
  Object.assign(tr[6]!, { instrument: 'Blue haze', level: 0.2, reverb: 0.66, pan: 0.1 });
  Object.assign(tr[6]!.voice, {
    wave: 'triangle',
    detune: 12,
    attack: 0.75,
    release: 2.7,
    cutoff: 1300,
    filterDepth: 250,
  });
  theme.sound!.chordTrack.level = 0.055;
  theme.sound!.chordTrack.reverb = 0.5;
  const drum = (ti: number, b: number, step: number, velocity: number) =>
    theme.notes.push({
      id: crypto.randomUUID(),
      track: tr[ti]!.id,
      tick: b * 3840 + step * 240,
      duration: 120,
      pitch: [36, 38, 42][ti]!,
      velocity,
    });
  for (let b = 0; b < 4; b++) {
    const root = roots[b]!;
    [0, 9.5].forEach((s) => drum(0, b, s, 0.65));
    [4, 12].forEach((s) => drum(1, b, s, 0.44));
    [2, 6, 10, 14].forEach((s, i) => drum(2, b, s, i % 2 ? 0.33 : 0.23));
    note(p, theme, 3, b, 0, root, 6.5, 0.68, 2);
    note(p, theme, 3, b, 9, root + 4, 4.5, 0.5, 2);
    // Seventh/ninth voicings add the soulful color while remaining entirely in D dorian.
    for (const degree of [0, 2, 6, 8]) note(p, theme, 4, b, 0.25, root + degree, 7.5, 0.45, 3);
    for (const degree of [2, 4, 6, 8]) note(p, theme, 4, b, 9.25, root + degree, 5.5, 0.34, 3);
    for (const degree of [0, 2, 4]) note(p, theme, 6, b, 0, root + degree, 15, 0.35, 3);
    if (b % 2 === 0) {
      note(p, theme, 5, b, 6, root + 4, 2, 0.48);
      note(p, theme, 5, b, 10, root + 2, 3.5, 0.4);
    } else {
      note(p, theme, 5, b, 7, root + 6, 2.5, 0.44);
      note(p, theme, 5, b, 12, root + 4, 3, 0.36);
    }
  }
  const drift = variation(theme, 'B · Weightless');
  keep(drift, [3, 4, 5, 6]);
  drift.sound!.tracks[3]!.level = 0.35;
  drift.sound!.tracks[4]!.reverb = 0.55;
  drift.sound!.tracks[6]!.level = 0.26;
  const answer = variation(theme, 'C · A quiet conversation');
  answer.notes = answer.notes.filter((n) => n.track !== tr[5]!.id);
  for (let b = 0; b < 4; b++)
    for (const [i, step] of [3, 6.5, 10, 13].entries())
      note(p, answer, 5, b, step, roots[b]! + [8, 6, 4, 2][i]!, i === 3 ? 2.5 : 1.75, 0.42);
  const close = variation(theme, 'D · Into the blue');
  keep(close, [4, 5, 6]);
  close.sound!.tracks[4]!.level = 0.3;
  close.sound!.tracks[5]!.level = 0.18;
  close.sound!.tracks[6]!.voice.release = 3.5;
  p.patterns = [theme, drift, answer, close];
  return finalize(p, 'ambient-soul', [0, 0, 1, 2, 2, 3]);
}
function finalize(p: Project, slug: string, order: number[]) {
  p.created = p.updated = p.lastOpened = stamp;
  p.revision = 1;
  p.patterns.forEach((pat, i) => {
    pat.id = `${slug}-pattern-${i + 1}`;
    pat.notes.forEach((n, j) => (n.id = `${slug}-${i + 1}-note-${j + 1}`));
  });
  p.song = order.map((i) => p.patterns[i]!.id);
  activatePattern(p, 0);
  validateProject(p);
  for (const pat of p.patterns)
    for (const n of pat.notes)
      if (
        !pat.sound!.tracks.find((tr) => tr.id === n.track)!.percussive &&
        !inScale(n.pitch, p.tonic, p.mode)
      )
        throw new Error('Example note outside key.');
  return p;
}
for (const [file, p] of [
  ['classic-house', classicHouse()],
  ['ambient-soul', ambientSoul()],
] as const) {
  const exported = await exportProject(p);
  const imported = await importProject(new File([exported], `${file}.tonada.json`));
  if (imported.sourceId !== p.id || imported.patterns.length !== p.patterns.length)
    throw new Error('Example import failed.');
  await Bun.write(
    `examples/${file}.tonada.json`,
    JSON.stringify(JSON.parse(exported), null, 2) + '\n',
  );
  console.log(
    `Created examples/${file}.tonada.json · ${p.patterns.length} patterns · ${p.song.length * 4} bars · ${p.tempo} BPM`,
  );
}
