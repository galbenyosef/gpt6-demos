import type { Track, Voice, Sample, Project } from './document';
import { random } from './theory';
export const CEILING = 0.89;
export type SoundEvent = {
  track: string;
  channel?: string;
  pitch: number;
  velocity: number;
  time: number;
  duration: number;
  key: string;
};
type Active = {
  track: string;
  start: number;
  release: number;
  end: number;
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
};
type Chain = {
  input: GainNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  delay: GainNode;
  reverb: GainNode;
  analyser: AnalyserNode;
  drive: WaveShaperNode;
  driveGain: GainNode;
};
// Web Audio fan-in traversal order is not specified. A linked summing chain
// gives every adder at most two inputs, making floating-point addition stable.
class OrderedSum {
  private tail: SumLink | undefined;
  constructor(
    private context: BaseAudioContext,
    private destination: AudioNode,
  ) {}
  add(source: AudioNode) {
    const node = this.context.createGain();
    const link: SumLink = { node, source, previous: this.tail };
    source.connect(node);
    if (this.tail) {
      this.tail.node.disconnect(this.destination);
      this.tail.node.connect(node);
      this.tail.next = link;
    }
    node.connect(this.destination);
    this.tail = link;
    return {
      node,
      remove: () => {
        source.disconnect(node);
        const next = link.next?.node ?? this.destination;
        node.disconnect(next);
        if (link.previous) {
          link.previous.node.disconnect(node);
          link.previous.node.connect(next);
          link.previous.next = link.next;
        }
        if (link.next) link.next.previous = link.previous;
        else this.tail = link.previous;
        node.disconnect();
      },
    };
  }
}
type SumLink = { node: GainNode; source: AudioNode; previous?: SumLink; next?: SumLink };
export class Engine {
  readonly analyser: AnalyserNode;
  readonly tracks = new Map<string, Chain>();
  private sums = new Map<string, OrderedSum>();
  private configs = new Map<string, Track>();
  private buffers = new Map<string, AudioBuffer>();
  private samples = new Map<string, Sample>();
  private active: Active[] = [];
  private disposed = false;
  private voiceNodes = new Set<AudioNode>();
  private nodes: AudioNode[] = [];
  private master: GainNode;
  private noise: AudioBuffer;
  constructor(
    readonly context: BaseAudioContext,
    tracks: Track[],
    master: Project['master'],
    seed: string,
    samples: Sample[],
    tempo: number,
  ) {
    const c = context;
    this.master = c.createGain();
    const masterSum = new OrderedSum(c, this.master);
    this.master.gain.setValueAtTime(master.level * 0.5, 0);
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-15, 0);
    compressor.knee.setValueAtTime(15, 0);
    compressor.ratio.setValueAtTime(3, 0);
    compressor.attack.setValueAtTime(0.003, 0);
    compressor.release.setValueAtTime(0.15, 0);
    const dc = c.createBiquadFilter();
    dc.type = 'highpass';
    dc.frequency.setValueAtTime(20, 0);
    const limiter = c.createWaveShaper();
    limiter.curve = Float32Array.from({ length: 65537 }, (_, i) =>
      Math.max(-CEILING, Math.min(CEILING, (i / 65536) * 2 - 1)),
    );
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 256;
    this.master
      .connect(compressor)
      .connect(dc)
      .connect(limiter)
      .connect(this.analyser)
      .connect(c.destination);
    this.nodes.push(this.master, compressor, dc, limiter, this.analyser);
    const delay = c.createDelay(4),
      feedback = c.createGain(),
      damping = c.createBiquadFilter();
    delay.delayTime.setValueAtTime((60 / tempo) * master.delayDivision, 0);
    feedback.gain.setValueAtTime(master.feedback, 0);
    damping.frequency.setValueAtTime(3800, 0);
    delay.connect(damping).connect(feedback).connect(delay);
    this.nodes.push(masterSum.add(damping).node);
    const reverb = c.createConvolver(),
      predelay = c.createDelay(1);
    predelay.delayTime.setValueAtTime(master.preDelay, 0);
    predelay.connect(reverb);
    this.nodes.push(masterSum.add(reverb).node);
    const delaySum = new OrderedSum(c, delay),
      reverbSum = new OrderedSum(c, predelay);
    const impulse = c.createBuffer(2, Math.ceil(c.sampleRate * master.reverbDecay), c.sampleRate);
    const rng = random(seed, 'reverb');
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < data.length; i++) {
        prev = 0.6 * prev + 0.4 * (rng() * 2 - 1);
        data[i] = prev * Math.exp((-7 * i) / data.length) * 0.35;
      }
    }
    reverb.buffer = impulse;
    this.nodes.push(delay, feedback, damping, reverb, predelay);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nr = random(seed, 'noise');
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;
    for (const s of samples) {
      const buffer = c.createBuffer(s.channels.length, s.channels[0]!.length, s.rate);
      s.channels.forEach((channel, i) => buffer.copyToChannel(new Float32Array(channel), i));
      this.buffers.set(s.id, buffer);
      this.samples.set(s.id, s);
    }
    for (const t of tracks) {
      const input = c.createGain(),
        gain = c.createGain(),
        drive = c.createWaveShaper(),
        filter = c.createBiquadFilter(),
        pan = c.createStereoPanner(),
        d = c.createGain(),
        r = c.createGain(),
        analyser = c.createAnalyser(),
        driveGain = c.createGain();
      analyser.fftSize = 256;
      const solo = tracks.some((item) => item.solo);
      gain.gain.setValueAtTime(t.mute || (solo && !t.solo) ? 0 : t.level, 0);
      driveGain.gain.setValueAtTime(1 + t.saturation * 2, 0);
      filter.frequency.setValueAtTime(t.cutoff, 0);
      pan.pan.setValueAtTime(t.pan, 0);
      d.gain.setValueAtTime(t.delay, 0);
      r.gain.setValueAtTime(t.reverb, 0);
      input
        .connect(gain)
        .connect(driveGain)
        .connect(drive)
        .connect(filter)
        .connect(pan)
        .connect(analyser);
      this.nodes.push(masterSum.add(analyser).node);
      pan.connect(d);
      pan.connect(r);
      this.nodes.push(delaySum.add(d).node, reverbSum.add(r).node);
      this.sums.set(t.id, new OrderedSum(c, input));
      this.tracks.set(t.id, {
        input,
        gain,
        drive,
        filter,
        pan,
        delay: d,
        reverb: r,
        analyser,
        driveGain,
      });
      this.nodes.push(input, gain, driveGain, drive, filter, pan, d, r, analyser);
      this.configs.set(t.id, structuredClone(t));
    }
    this.update(tracks, master.level, 0);
  }
  update(tracks: Track[], master: number, time = this.context.currentTime) {
    const solo = tracks.some((t) => t.solo);
    this.master.gain.setTargetAtTime(master * 0.5, time, 0.015);
    for (const t of tracks) {
      const previous = this.configs.get(t.id);
      this.configs.set(t.id, structuredClone(t));
      if (
        previous &&
        (previous.voice.cutoff !== t.voice.cutoff || previous.voice.resonance !== t.voice.resonance)
      ) {
        for (const a of this.active.filter((a) => a.track === t.id && a.end > time)) {
          const filter = a.nodes[0] as BiquadFilterNode;
          filter.frequency.cancelAndHoldAtTime(time);
          filter.frequency.setTargetAtTime(t.voice.cutoff, time, 0.02);
          filter.Q.setTargetAtTime(t.voice.resonance, time, 0.02);
        }
      }
      const chain = this.tracks.get(t.id);
      if (!chain) continue;
      chain.gain.gain.setTargetAtTime(t.mute || (solo && !t.solo) ? 0 : t.level, time, 0.015);
      chain.pan.pan.setTargetAtTime(t.pan, time, 0.015);
      chain.filter.frequency.setTargetAtTime(t.cutoff, time, 0.015);
      chain.delay.gain.setTargetAtTime(t.delay, time, 0.015);
      chain.reverb.gain.setTargetAtTime(t.reverb, time, 0.015);
      chain.driveGain.gain.setTargetAtTime(1 + t.saturation * 2, time, 0.015);
      if (!chain.drive.curve)
        chain.drive.curve = Float32Array.from({ length: 2049 }, (_, i) => Math.tanh(i / 1024 - 1));
    }
  }
  schedule(event: SoundEvent) {
    const t = this.configs.get(event.channel ?? event.track),
      chain = this.tracks.get(event.channel ?? event.track);
    if (!t || !chain) return;
    const v = t.voice,
      c = this.context,
      start = event.time,
      release = start + Math.max(event.duration, v.attack + v.decay),
      end = release + v.release + 0.01;
    this.active = this.active.filter((a) => a.end > start);
    const local = this.active.filter((a) => a.track === t.id);
    if (local.length >= 16 || this.active.length >= 64) {
      const pool = local.length >= 16 ? local : this.active;
      const oldest = [...pool].sort(
        (a, b) => Number(a.release > start) - Number(b.release > start) || a.start - b.start,
      )[0]!;
      oldest.gain.gain.cancelAndHoldAtTime(start);
      oldest.gain.gain.linearRampToValueAtTime(0, start + 0.005);
      oldest.sources.forEach((s) => {
        try {
          s.stop(start + 0.006);
        } catch {}
      });
      oldest.end = start + 0.006;
      this.active = this.active.filter((a) => a !== oldest);
    }
    const filter = c.createBiquadFilter();
    filter.type = t.percussive && v.noise > 0.9 ? 'highpass' : 'lowpass';
    filter.Q.setValueAtTime(v.resonance, start);
    const base = Math.max(30, Math.min(18000, v.cutoff + event.velocity * v.velocityCutoff));
    const cut = (x: number) => Math.max(30, Math.min(c.sampleRate * 0.45, base + x));
    filter.frequency.setValueAtTime(base, start);
    filter.frequency.linearRampToValueAtTime(cut(v.filterDepth), start + v.filterAttack);
    filter.frequency.linearRampToValueAtTime(
      cut(v.filterDepth * v.filterSustain),
      start + v.filterAttack + v.filterDecay,
    );
    filter.frequency.setValueAtTime(cut(v.filterDepth * v.filterSustain), release);
    filter.frequency.linearRampToValueAtTime(base, release + v.filterRelease);
    const gain = c.createGain(),
      pan = c.createStereoPanner();
    pan.pan.setValueAtTime(v.pan, start);
    filter.connect(gain).connect(pan);
    const trackLink = this.sums.get(t.id)!.add(pan);
    const voiceSum = new OrderedSum(c, filter);
    const amp = 0.16 * (1 - v.velocityAmp + v.velocityAmp * event.velocity);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amp, start + v.attack);
    gain.gain.linearRampToValueAtTime(amp * v.sustain, start + v.attack + v.decay);
    gain.gain.setValueAtTime(amp * v.sustain, release);
    gain.gain.linearRampToValueAtTime(0, release + v.release);
    const sources: AudioScheduledSourceNode[] = [],
      nodes: AudioNode[] = [filter, gain, pan, trackLink.node];
    const freq = 440 * 2 ** ((event.pitch - 69) / 12);
    let carrier: OscillatorNode | undefined;
    const oscillator = (type: OscillatorType, mult: number, volume: number, detune = 0) => {
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * mult + v.pitchDrop, start);
      if (v.pitchDrop) o.frequency.exponentialRampToValueAtTime(freq * mult, start + 0.12);
      o.detune.setValueAtTime(detune, start);
      g.gain.setValueAtTime(volume, start);
      o.connect(g);
      nodes.push(voiceSum.add(g).node);
      sources.push(o);
      nodes.push(o, g);
      return o;
    };
    if (v.mode === 'sampler') {
      const buffer = this.buffers.get(v.sampleId || ''),
        sample = this.samples.get(v.sampleId || '');
      if (buffer && sample) {
        const s = c.createBufferSource();
        s.buffer = buffer;
        s.playbackRate.setValueAtTime(2 ** ((event.pitch - sample.root) / 12), start);
        s.loop = sample.loop;
        s.loopStart = sample.loopStart;
        s.loopEnd = sample.loopEnd;
        nodes.push(voiceSum.add(s).node);
        s.start(start, sample.start, sample.loop ? undefined : sample.end - sample.start);
        s.stop(end);
        sources.push(s);
        nodes.push(s);
      }
    } else if (v.mode === 'fm') {
      carrier = oscillator('sine', 1, 1);
      const m = c.createOscillator(),
        mg = c.createGain();
      m.frequency.setValueAtTime(freq * v.ratio, start);
      mg.gain.setValueAtTime(freq * v.index, start);
      mg.gain.exponentialRampToValueAtTime(0.001, start + v.modDecay);
      m.connect(mg).connect(carrier.frequency);
      sources.push(m);
      nodes.push(m, mg);
    } else {
      carrier = oscillator(v.wave, 1, (1 - v.noise) * 0.55, -v.detune);
      oscillator(v.wave, 1, (1 - v.noise) * 0.45, v.detune);
      if (v.sub) oscillator('sine', 0.5, v.sub);
      if (v.noise) {
        const s = c.createBufferSource(),
          ng = c.createGain();
        s.buffer = this.noise;
        s.loop = true;
        ng.gain.setValueAtTime(v.noise, start);
        s.connect(ng);
        nodes.push(voiceSum.add(ng).node);
        sources.push(s);
        nodes.push(s, ng);
      }
    }
    if (v.lfoDepth) {
      const lfo = c.createOscillator(),
        depth = c.createGain();
      lfo.frequency.setValueAtTime(v.lfoRate, start);
      depth.gain.setValueAtTime(v.lfoDepth, start);
      lfo.connect(depth);
      if (v.lfoTarget === 'pitch' && carrier) depth.connect(carrier.detune);
      else if (v.lfoTarget === 'filter') depth.connect(filter.frequency);
      else {
        depth.gain.setValueAtTime(v.lfoDepth * 0.0005, start);
        depth.connect(gain.gain);
      }
      sources.push(lfo);
      nodes.push(lfo, depth);
    }
    for (const s of sources) {
      if (v.mode === 'sampler' && s instanceof AudioBufferSourceNode) continue;
      s.start(start);
      s.stop(end);
    }
    nodes.forEach((n) => this.voiceNodes.add(n));
    const active = { track: t.id, start, release, end, gain, sources, nodes };
    this.active.push(active);
    const last = sources.at(-1);
    if (last && !(c instanceof OfflineAudioContext))
      last.onended = () => {
        if (this.disposed) return;
        trackLink.remove();
        nodes.forEach((n) => {
          n.disconnect();
          this.voiceNodes.delete(n);
        });
        this.active = this.active.filter((a) => a !== active);
      };
    else if (!last) {
      trackLink.remove();
      nodes.forEach((n) => {
        n.disconnect();
        this.voiceNodes.delete(n);
      });
    }
  }
  dispose() {
    this.disposed = true;
    for (const a of this.active) {
      a.sources.forEach((s) => {
        try {
          s.stop();
        } catch {}
      });
      a.nodes.forEach((n) => n.disconnect());
    }
    this.active = [];
    this.voiceNodes.forEach((n) => {
      if (n instanceof AudioScheduledSourceNode) n.onended = null;
      n.disconnect();
    });
    this.voiceNodes.clear();
    this.nodes.forEach((n) => n.disconnect());
    this.nodes = [];
    this.buffers.clear();
  }
}
