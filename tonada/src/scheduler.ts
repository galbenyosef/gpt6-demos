import { type Project, type Pattern, patternTicks } from './document';
import { PPQ, random } from './theory';
import { Engine, type SoundEvent } from './engine';
export const INTERVAL_MS = 25,
  AHEAD = 0.2;
export type MusicalEvent = Omit<SoundEvent, 'time' | 'duration'> & {
  tick: number;
  durationTick: number;
};
export function tickSeconds(tick: number, tempo: number, swing = 0, resolution = 240) {
  const step = Math.floor(tick / resolution),
    offset = step % 2 ? (resolution * swing) / 100 : 0;
  return (((tick + offset) / PPQ) * 60) / tempo;
}
export function eventsFor(
  p: Project,
  range: 'pattern' | 'song',
  patternId = p.patterns[0]!.id,
): { events: MusicalEvent[]; ticks: number } {
  let offset = 0;
  const events: MusicalEvent[] = [];
  const ids = range === 'song' ? p.song : [patternId];
  const rng = random(p.seed, 'humanization');
  ids.forEach((id, slot) => {
    const pattern = p.patterns.find((x) => x.id === id)!;
    const notes = [...pattern.notes].sort(
      (a, b) =>
        a.tick - b.tick ||
        a.track.localeCompare(b.track) ||
        a.pitch - b.pitch ||
        a.id.localeCompare(b.id),
    );
    for (const note of notes) {
      const jitter = (rng() + rng() - 1) * 24 * p.humanize;
      const velocity = Math.max(
        0.01,
        Math.min(1, note.velocity + (rng() * 2 - 1) * 0.12 * p.humanize),
      );
      events.push({
        track: note.track,
        pitch: note.pitch,
        velocity,
        tick: Math.max(offset, offset + note.tick + jitter),
        durationTick: note.duration,
        key: `${slot}:${note.id}`,
      });
    }
    let ct = offset;
    for (const [i, chord] of pattern.chords.entries()) {
      chord.voicing.forEach((pitch, j) =>
        events.push({
          track: 'chords',
          pitch,
          velocity: 0.65,
          tick: ct,
          durationTick: chord.duration * 0.9,
          key: `${slot}:chord:${i}:${j}`,
        }),
      );
      ct += chord.duration;
    }
    offset += patternTicks(p, pattern);
  });
  return {
    events: events.sort(
      (a, b) =>
        a.tick - b.tick ||
        a.track.localeCompare(b.track) ||
        a.pitch - b.pitch ||
        a.key.localeCompare(b.key),
    ),
    ticks: offset,
  };
}
export function soundEvent(e: MusicalEvent, p: Project, origin = 0): SoundEvent {
  return {
    track: e.track,
    pitch: e.pitch,
    velocity: e.velocity,
    time: origin + tickSeconds(e.tick, p.tempo, p.swing),
    duration: ((e.durationTick / PPQ) * 60) / p.tempo,
    key: e.key,
  };
}
export class Transport {
  context: AudioContext | null = null;
  engine: Engine | null = null;
  playing = false;
  loop = true;
  metronome = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private origin = 0;
  private cycle = 0;
  private committed = 0;
  private ticks = 0;
  private tempo = 96;
  private anchorTick = 0;
  private anchorTime = 0;
  private getProject: () => Project;
  private range: 'pattern' | 'song';
  private patternId: string;
  constructor(
    getProject: () => Project,
    range: 'pattern' | 'song',
    patternId: string,
    private onStop: () => void,
  ) {
    this.getProject = getProject;
    this.range = range;
    this.patternId = patternId;
  }
  async play() {
    if (this.playing) return;
    const p = this.getProject();
    this.context = new AudioContext();
    await this.context.resume();
    this.engine = new Engine(
      this.context,
      [...p.tracks, p.chordTrack],
      p.master,
      p.seed,
      p.samples,
      p.tempo,
    );
    this.origin = this.context.currentTime + 0.06;
    this.anchorTime = this.origin;
    this.anchorTick = 0;
    this.tempo = p.tempo;
    this.cycle = 0;
    this.committed = 0;
    this.ticks = eventsFor(p, this.range, this.patternId).ticks;
    this.playing = true;
    this.pump();
    this.timer = setInterval(() => this.pump(), INTERVAL_MS);
  }
  private time(tick: number, p: Project) {
    return (
      this.anchorTime +
      tickSeconds(tick, p.tempo, p.swing) -
      tickSeconds(this.anchorTick, p.tempo, p.swing)
    );
  }
  private pump() {
    if (!this.context || !this.engine) return;
    const p = this.getProject();
    const now = this.context.currentTime;
    if (!this.loop && this.cycle > 0) {
      if (now >= this.time(this.ticks, p) + 4) this.stop();
      return;
    }
    if (p.tempo !== this.tempo) {
      this.anchorTime = this.time(this.committed, { ...p, tempo: this.tempo });
      this.anchorTick = this.committed;
      this.tempo = p.tempo;
    }
    // Web Audio cannot reconstruct sound during a stall. Pause at the committed seam
    // and continue all remaining events from there; never fire overdue notes in a burst.
    if (this.time(this.committed, p) < now - 0.025 && this.committed > 0) {
      this.anchorTime = now + 0.02;
      this.anchorTick = this.committed;
    }
    this.engine.update([...p.tracks, p.chordTrack], p.master.level, now);
    const ahead = now + AHEAD;
    const data = eventsFor(p, this.range, this.patternId);
    const cycleTicks = data.ticks;
    while (this.time(this.committed, p) < ahead) {
      const end = Math.min((this.cycle + 1) * cycleTicks, this.committed + 240);
      for (const e of data.events) {
        const tick = e.tick + this.cycle * cycleTicks;
        if (tick >= this.committed && tick < end)
          this.engine.schedule({ ...soundEvent(e, p), time: this.time(tick, p) });
      }
      if (this.metronome) {
        const beat = Math.ceil(this.committed / PPQ) * PPQ;
        if (beat < end)
          this.engine.schedule({
            track: 'track-2',
            pitch: beat % (PPQ * p.signature[0]) === 0 ? 84 : 76,
            velocity: 0.6,
            time: this.time(beat, p),
            duration: 0.025,
            key: `metro:${beat}`,
          });
      }
      this.committed = end;
      if (end >= (this.cycle + 1) * cycleTicks) {
        this.cycle++;
        if (!this.loop) {
          if (now >= this.time(end, p) + 2) this.stop();
          break;
        }
      }
      if (!this.loop && this.cycle > 0) break;
    }
    if (!this.loop && this.cycle > 0 && now >= this.time(cycleTicks, p) + 2) this.stop();
  }
  position() {
    if (!this.playing || !this.context) return 0;
    const tick =
      this.anchorTick + ((this.context.currentTime - this.anchorTime) * PPQ * this.tempo) / 60;
    return Math.max(0, tick % this.ticks);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.playing = false;
    this.engine?.dispose();
    this.engine = null;
    void this.context?.close();
    this.context = null;
    this.onStop();
  }
}
