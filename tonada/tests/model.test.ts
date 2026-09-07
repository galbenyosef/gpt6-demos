import { TEMPLATES, createTemplate, applyTemplate } from '../src/templates';
import { activatePattern } from '../src/document';
import { describe, test, expect } from 'bun:test';
import {
  MODES,
  degreePitch,
  scalePitches,
  inScale,
  progression,
  parallelOuter,
  random,
  normalizeSeed,
  classification,
  type Mode,
} from '../src/theory';
import { newProject, changeKey, History, lockedPitch, patternTicks } from '../src/document';
import { validateProject, validateVoice } from '../src/validation';
import { eventsFor, soundEvent, tickSeconds } from '../src/scheduler';
import { midi } from '../src/render';
import { validatePack } from '../src/packs';
describe('theory and assistance', () => {
  test('documented scale interval fixtures', () => {
    expect(MODES.major).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(MODES.minor).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(MODES.dorian).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect(MODES.phrygian).toEqual([0, 1, 3, 5, 7, 8, 10]);
    expect(MODES.lydian).toEqual([0, 2, 4, 6, 7, 9, 11]);
    expect(MODES.mixolydian).toEqual([0, 2, 4, 5, 7, 9, 10]);
    expect(MODES.locrian).toEqual([0, 1, 3, 5, 6, 8, 10]);
    expect(MODES['harmonic minor']).toEqual([0, 2, 3, 5, 7, 8, 11]);
    expect(MODES['melodic minor']).toEqual([0, 2, 3, 5, 7, 9, 11]);
    expect(MODES['major pentatonic']).toEqual([0, 2, 4, 7, 9]);
    expect(MODES['minor pentatonic']).toEqual([0, 3, 5, 7, 10]);
    expect(MODES.blues).toEqual([0, 3, 5, 6, 7, 10]);
  });
  test('1,000 progressions per mode: cadence, scale membership, no parallel outer perfect intervals', () => {
    for (const mode of Object.keys(MODES) as Mode[])
      for (let seed = 0; seed < 1000; seed++) {
        const chords = progression(String(seed), seed % 12, mode, seed % 2 ? 4 : 8);
        expect(chords.at(-1)!.degree).toBe(0);
        expect(chords.at(-2)!.degree).toBe(MODES[mode].length === 7 ? 4 : 2);
        for (let i = 0; i < chords.length; i++) {
          expect(chords[i]!.voicing.every((n) => inScale(n, seed % 12, mode))).toBe(true);
          if (i) expect(parallelOuter(chords[i - 1]!.voicing, chords[i]!.voicing)).toBe(false);
        }
      }
  });
  test('every MIDI pitch locks into all keys and modes', () => {
    const p = newProject();
    for (const mode of Object.keys(MODES) as Mode[])
      for (let tonic = 0; tonic < 12; tonic++) {
        p.mode = mode;
        p.tonic = tonic;
        for (let note = 0; note < 128; note++)
          expect(inScale(lockedPitch(p, note), tonic, mode)).toBe(true);
      }
  });
  test('lock toggles preserve chromatic notes and key transpose preserves harmony', () => {
    const p = newProject({ seed: 'fixture' });
    p.patterns[0]!.notes.push({
      id: 'chromatic',
      track: 'track-4',
      tick: 100,
      duration: 100,
      pitch: 61,
      velocity: 0.5,
    });
    const before = structuredClone(p.patterns);
    p.scaleLock = false;
    p.scaleLock = true;
    expect(p.patterns).toEqual(before);
    const classifications = p.patterns[0]!.notes.filter((n) => n.track === 'track-4').map((n) =>
      classification(n.pitch, p.patterns[0]!.chords[Math.floor(n.tick / 3840)]!, p.tonic, p.mode),
    );
    changeKey(p, 5, 'minor');
    expect(
      p.patterns[0]!.notes.filter((n) => n.track === 'track-4').map((n) =>
        classification(n.pitch, p.patterns[0]!.chords[Math.floor(n.tick / 3840)]!, p.tonic, p.mode),
      ),
    ).toEqual(classifications);
  });
});
describe('document and scheduling', () => {
  test('all starter signatures validate', () => {
    for (const signature of [
      [4, 4],
      [3, 4],
      [6, 8],
      [5, 4],
    ] as [number, number][])
      expect(validateProject(newProject({ signature }))).toBeTruthy();
  });
  test('64 undo levels are isolated with redo and branch invalidation', () => {
    let p = newProject();
    const h = new History();
    for (let i = 0; i < 80; i++) {
      h.push(p);
      p.tempo = 80 + i;
    }
    expect(h.past.length).toBe(64);
    p = h.undo(p);
    expect(p.tempo).toBe(158);
    p = h.redo(p);
    expect(p.tempo).toBe(159);
    h.push(p);
    expect(h.future.length).toBe(0);
  });
  test('streams and schedule are deterministic without mutation', () => {
    const p = newProject({ seed: 'same' });
    p.humanize = 1;
    p.swing = 35;
    const before = JSON.stringify(p),
      one = eventsFor(p, 'song'),
      two = eventsFor(p, 'song');
    expect(one).toEqual(two);
    expect(one.events.map((e) => soundEvent(e, p))).toEqual(
      two.events.map((e) => soundEvent(e, p)),
    );
    expect(JSON.stringify(p)).toBe(before);
    const a = random('x', 'humanization'),
      b = random('x', 'humanization');
    random('x', 'progression')();
    expect(a()).toBe(b());
    expect(normalizeSeed(' e\u0301 ')).toBe('é');
  });
  test('ticks and swing exact at known boundaries', () => {
    expect(tickSeconds(960, 120)).toBe(0.5);
    expect(tickSeconds(240, 120, 50)).toBe(0.1875);
    expect(tickSeconds(480, 120, 50)).toBe(0.25);
  });
  test('rejects hostile structures before audio construction', () => {
    const p = newProject();
    for (const mutate of [
      (x: any) => (x.schema = 2),
      (x: any) => (x.tempo = Infinity),
      (x: any) => (x.tracks[0].voice.resonance = 500),
      (x: any) => (x.song = ['missing']),
      (x: any) => (x.patterns[0].notes[0].tick = -1),
      (x: any) => (x.samples = [{ channels: [] }]),
      (x: any) => (x.tracks[0].color = 'red;position:fixed'),
    ]) {
      const clone = structuredClone(p);
      mutate(clone);
      expect(() => validateProject(clone)).toThrow();
    }
  });
  test('MIDI has type 1, nine tracks, and 960 PPQ', () => {
    const p = newProject();
    const data = midi(p, 'song', p.patterns[0]!.id);
    expect(Array.from(data.slice(8, 14))).toEqual([0, 1, 0, 9, 3, 192]);
  });
  test('pack validates bilingual complete voices', async () => {
    const pack = await Bun.file('public/packs/essentials/pack.json').json();
    expect(validatePack(pack).presets.length).toBe(8);
    delete pack.presets[0].name.es;
    expect(() => validatePack(pack)).toThrow();
  });
});

describe('arrangement templates', () => {
  test('five distinct arrangements stay in scale and fit every supported meter', () => {
    const signatures: [number, number][] = [
      [4, 4],
      [3, 4],
      [6, 8],
      [5, 4],
    ];
    for (const template of TEMPLATES)
      for (const mode of Object.keys(MODES) as Mode[])
        for (const signature of signatures) {
          const p = newProject({ tonic: 11, mode, tempo: 137, signature, seed: 'templates' }, true);
          const index = applyTemplate(p, template.id);
          const pat = p.patterns[index]!;
          expect(validateProject(p)).toBe(p);
          expect(p.tempo).toBe(137);
          expect(p.signature).toEqual(signature);
          expect(pat.chords).toHaveLength(4);
          expect(pat.notes.length).toBeGreaterThan(20);
          for (const n of pat.notes)
            if (!pat.sound!.tracks.find((t) => t.id === n.track)!.percussive)
              expect(inScale(n.pitch, p.tonic, p.mode)).toBe(true);
        }
    const p = newProject();
    expect(
      new Set(
        TEMPLATES.map((t) =>
          JSON.stringify(
            createTemplate(p, t.id).notes.map((n) => [n.track, n.tick, n.duration, n.pitch]),
          ),
        ),
      ).size,
    ).toBe(5);
  });
  test('application preserves previous notes, sounds, samples and song and is undoable', () => {
    let p = newProject({ seed: 'preserve' });
    p.tracks[4]!.voice.cutoff = 777;
    p.tracks[4]!.pan = -0.7;
    const before = structuredClone(p),
      history = new History();
    history.push(p);
    const index = applyTemplate(p, 'house');
    expect(index).toBe(1);
    expect(p.patterns[0]!.notes).toEqual(before.patterns[0]!.notes);
    expect(p.patterns[0]!.sound).toEqual({ tracks: before.tracks, chordTrack: before.chordTrack });
    expect(p.song).toEqual(before.song);
    expect(p.samples).toEqual(before.samples);
    activatePattern(p, 0);
    expect(p.tracks).toEqual(before.tracks);
    activatePattern(p, 1);
    expect(p.tracks[4]!.instrument).toBe('House organ');
    const events = eventsFor(p, 'pattern', p.patterns[0]!.id);
    expect(events.events.every((e) => e.channel?.startsWith(p.patterns[0]!.id + '/'))).toBe(true);
    p = history.undo(p);
    expect(p).toEqual(before);
    p = history.redo(p);
    expect(p.patterns.length).toBe(2);
  });
  test('invalid snapshots and sample references are rejected; capacity refusal is atomic', () => {
    const p = newProject();
    applyTemplate(p, 'ambient');
    const broken = structuredClone(p);
    broken.patterns[1]!.sound!.tracks[0]!.voice.cutoff = Infinity;
    expect(() => validateProject(broken)).toThrow();
    const missing = structuredClone(p);
    missing.patterns[0]!.sound!.tracks[7]!.voice.sampleId = 'missing';
    expect(() => validateProject(missing)).toThrow();
    while (p.patterns.length < 64) {
      const pat = structuredClone(p.patterns[0]!);
      pat.id = crypto.randomUUID();
      p.patterns.push(pat);
    }
    const before = JSON.stringify(p);
    expect(() => applyTemplate(p, 'minimal')).toThrow();
    expect(JSON.stringify(p)).toBe(before);
  });
});
