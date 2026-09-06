import { SPEED, WALL_GRACE, type Settings, type Vec } from "./domain";
import type { GameEvent, Input } from "./simulation";

type Flight = Vec & {
  vx: number;
  vy: number;
  facing: number;
  health: number;
  wallContact: number;
};
const clamp = (n: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, n));
const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Audio follows physical banking even when reduced motion hides the visual tilt.
export function flightSound(player: Flight, input: Pick<Input, "x" | "y">) {
  const speed = clamp(Math.hypot(player.vx, player.vy) / SPEED);
  const climb = clamp(player.vy / SPEED, -1, 1);
  const bank = -player.vx * 0.012;
  const forwardTilt = (-bank * player.facing) / (SPEED * 0.012);
  const thrust = clamp(Math.hypot(input.x, input.y));
  const braking = clamp(-(player.vx * input.x + player.vy * input.y) / SPEED);
  const load = clamp(thrust * 0.4 + Math.max(0, climb) * 0.35 + braking * 0.4);
  return {
    rotor: 38 + speed * 12 + climb * 7 + forwardTilt * 3 + load * 8,
    pulse: 15 + speed * 4 + load * 5,
    turbine: 155 + speed * 65 + climb * 30 + forwardTilt * 12 + load * 45,
    filter: 180 + speed * 170 + load * 150,
    level: 0.065 + load * 0.035,
    wind: speed * speed * 0.035,
    scrape: clamp(player.wallContact / WALL_GRACE) * 0.06,
  };
}

type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[] };

export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private effects?: GainNode;
  private music?: GainNode;
  private helicopter?: GainNode;
  private rotor?: OscillatorNode;
  private pulse?: OscillatorNode;
  private turbine?: OscillatorNode;
  private rotorGain?: GainNode;
  private rotorFilter?: BiquadFilterNode;
  private windGain?: GainNode;
  private scrapeGain?: GainNode;
  private noise?: AudioBuffer;
  private loops: AudioScheduledSourceNode[] = [];
  private voices = new Set<Voice>();
  private enabled = false;
  private settings?: Settings;
  private nextBeat = 0;
  private beat = 0;
  private nextWarning = 0;
  private suspendTimer?: ReturnType<typeof setTimeout>;

  async start(settings: Settings) {
    clearTimeout(this.suspendTimer);
    if (!this.context) {
      const ctx = (this.context = new AudioContext());
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -16;
      limiter.knee.value = 12;
      limiter.ratio.value = 5;
      this.master.connect(limiter).connect(ctx.destination);
      this.effects = ctx.createGain();
      this.music = ctx.createGain();
      this.helicopter = ctx.createGain();
      for (const bus of [this.effects, this.music, this.helicopter]) {
        bus.gain.value = 0;
        bus.connect(this.master);
      }
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      let seed = 0x1cafe;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = (seed / 4294967296) * 2 - 1;
      }
      this.rotor = ctx.createOscillator();
      this.rotor.type = "sawtooth";
      this.rotor.frequency.value = 38;
      this.rotorFilter = ctx.createBiquadFilter();
      this.rotorFilter.type = "lowpass";
      this.rotorFilter.frequency.value = 180;
      this.rotorGain = ctx.createGain();
      this.rotorGain.gain.value = 0.065;
      const chop = ctx.createGain(),
        depth = ctx.createGain();
      chop.gain.value = 0.65;
      depth.gain.value = 0.3;
      this.pulse = ctx.createOscillator();
      this.pulse.frequency.value = 15;
      this.pulse.connect(depth).connect(chop.gain);
      this.rotor
        .connect(this.rotorFilter)
        .connect(this.rotorGain)
        .connect(chop)
        .connect(this.helicopter);
      this.turbine = ctx.createOscillator();
      this.turbine.type = "triangle";
      this.turbine.frequency.value = 155;
      const turbineGain = ctx.createGain();
      turbineGain.gain.value = 0.016;
      this.turbine.connect(turbineGain).connect(this.helicopter);
      this.windGain = this.noiseLoop(this.helicopter, 1100, 0.5);
      this.scrapeGain = this.noiseLoop(this.effects, 650, 2);
      this.loops.push(this.rotor, this.pulse, this.turbine);
      this.rotor.start();
      this.pulse.start();
      this.turbine.start();
      this.nextBeat = ctx.currentTime;
    }
    this.enabled = true;
    this.update(settings);
    await this.context.resume();
  }

  private noiseLoop(bus: GainNode, frequency: number, q: number) {
    const ctx = this.context!,
      source = ctx.createBufferSource();
    source.buffer = this.noise!;
    source.loop = true;
    const filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(bus);
    source.start();
    this.loops.push(source);
    return gain;
  }

  update(settings: Settings) {
    this.settings = { ...settings };
    const now = this.context?.currentTime || 0;
    this.master?.gain.setTargetAtTime(settings.muteAudio ? 0 : 0.8, now, 0.025);
    this.effects?.gain.setTargetAtTime(settings.effects, now, 0.025);
    this.music?.gain.setTargetAtTime(settings.music, now, 0.08);
    this.helicopter?.gain.setTargetAtTime(settings.helicopter, now, 0.025);
  }

  active(active: boolean, tailSeconds = 0) {
    clearTimeout(this.suspendTimer);
    this.enabled = active;
    if (!this.context) return;
    if (active) void this.context.resume().catch(() => {});
    else if (tailSeconds > 0) {
      const now = this.context.currentTime;
      this.helicopter?.gain.setTargetAtTime(0, now, 0.1);
      this.music?.gain.setTargetAtTime(0, now, 0.1);
      this.scrapeGain?.gain.setTargetAtTime(0, now, 0.04);
      this.suspendTimer = setTimeout(
        () => this.active(false),
        tailSeconds * 1000,
      );
    } else {
      // Cancel scheduled notes so entering a menu never queues a burst on resume.
      this.clearVoices();
      this.nextBeat = this.context.currentTime;
      this.nextWarning = 0;
      void this.context.suspend().catch(() => {});
    }
  }

  motion(player: Flight, input: Pick<Input, "x" | "y">) {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== "running") return;
    const sound = flightSound(player, input),
      now = ctx.currentTime;
    this.rotor!.frequency.setTargetAtTime(sound.rotor, now, 0.12);
    this.pulse!.frequency.setTargetAtTime(sound.pulse, now, 0.12);
    this.turbine!.frequency.setTargetAtTime(sound.turbine, now, 0.16);
    this.rotorFilter!.frequency.setTargetAtTime(sound.filter, now, 0.15);
    this.rotorGain!.gain.setTargetAtTime(sound.level, now, 0.12);
    this.windGain!.gain.setTargetAtTime(sound.wind, now, 0.2);
    this.scrapeGain!.gain.setTargetAtTime(sound.scrape, now, 0.04);
    if (player.health <= 25 && now >= this.nextWarning) {
      if (this.settings!.effects > 0 && !this.settings!.muteAudio) {
        this.tone(this.effects!, now, 420, 0.12, 0.035, "sine");
        this.tone(this.effects!, now + 0.19, 350, 0.12, 0.025, "sine");
      }
      this.nextWarning = now + 2.5;
    }
    this.score(now);
  }

  // Original 24-second, 80 BPM minor-key loop: soft pads, bass and bell motif.
  // Schedule against audio time with a short look-ahead; suspension freezes it.
  private score(now: number) {
    if (!this.settings?.music || this.settings.muteAudio) {
      this.nextBeat = now;
      return;
    }
    if (this.nextBeat < now - 0.2) this.nextBeat = now;
    const chords = [
      [45, 52, 60, 64],
      [41, 48, 57, 60],
      [48, 55, 59, 64],
      [43, 50, 57, 62],
    ];
    const melody = [0, 2, 1, 3, 2, 1, 3, 2];
    while (this.nextBeat < now + 0.18) {
      const step = this.beat % 8,
        bar = Math.floor(this.beat / 8) % 8;
      const chord = chords[Math.floor(bar / 2)]!;
      if (step === 0) {
        for (let i = 1; i < chord.length; i++)
          this.tone(
            this.music!,
            this.nextBeat,
            note(chord[i]!),
            3.15,
            0.018,
            "sine",
            undefined,
            (i - 2) * 0.4,
            0.5,
          );
      }
      if (step === 0 || step === 4)
        this.tone(
          this.music!,
          this.nextBeat,
          note(chord[0]!),
          1.4,
          0.032,
          "sine",
          undefined,
          0,
          0.08,
        );
      if (step % 2 === 0 || (bar % 2 === 1 && step === 7)) {
        const pitch = note(chord[melody[step]!]! + 12);
        this.tone(
          this.music!,
          this.nextBeat,
          pitch,
          0.85,
          0.022,
          "sine",
          undefined,
          step % 4 === 0 ? -0.25 : 0.25,
          0.015,
        );
        this.tone(this.music!, this.nextBeat, pitch * 2, 0.32, 0.004, "sine");
      }
      this.beat = (this.beat + 1) % 64;
      this.nextBeat += 0.375;
    }
  }

  private voice(
    source: AudioScheduledSourceNode,
    bus: GainNode,
    when: number,
    duration: number,
    volume: number,
    pan: number,
    attack: number,
    filter?: BiquadFilterNode,
  ) {
    const ctx = this.context!;
    if (this.voices.size >= 96) {
      source.disconnect();
      filter?.disconnect();
      return;
    }
    const gain = ctx.createGain(),
      panner = ctx.createStereoPanner();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.00001, when + duration);
    gain.gain.setValueAtTime(0, when + duration + 0.01);
    panner.pan.value = clamp(pan, -1, 1);
    if (filter) source.connect(filter).connect(gain);
    else source.connect(gain);
    gain.connect(panner).connect(bus);
    const voice = {
      source,
      nodes: filter ? [source, filter, gain, panner] : [source, gain, panner],
    };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  private tone(
    bus: GainNode,
    when: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    end?: number,
    pan = 0,
    attack = 0.008,
  ) {
    const osc = this.context!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, when);
    if (end) osc.frequency.exponentialRampToValueAtTime(end, when + duration);
    this.voice(osc, bus, when, duration, volume, pan, attack);
  }

  private burst(
    when: number,
    duration: number,
    volume: number,
    frequency: number,
    pan: number,
  ) {
    const ctx = this.context!,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter();
    source.buffer = this.noise!;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(frequency, when);
    filter.frequency.exponentialRampToValueAtTime(100, when + duration);
    this.voice(
      source,
      this.effects!,
      when,
      duration,
      volume,
      pan,
      0.004,
      filter,
    );
  }

  event(event: GameEvent, listener: Vec) {
    const ctx = this.context;
    if (
      !ctx ||
      !this.enabled ||
      !this.effects ||
      ctx.state !== "running" ||
      !this.settings?.effects ||
      this.settings.muteAudio
    )
      return;
    const now = ctx.currentTime;
    const distance = Math.hypot(
      event.position.x - listener.x,
      event.position.y - listener.y,
    );
    const level = 1 / (1 + distance / 12);
    const pan = clamp((event.position.x - listener.x) / 20, -1, 1);
    const tone = (
      frequency: number,
      end: number,
      duration: number,
      volume: number,
      type: OscillatorType = "triangle",
      delay = 0,
    ) =>
      this.tone(
        this.effects!,
        now + delay,
        frequency,
        duration,
        volume * level,
        type,
        end,
        pan,
      );
    const burst = (duration: number, volume: number, frequency: number) =>
      this.burst(now, duration, volume * level, frequency, pan);
    switch (event.type) {
      case "shot":
        tone(260, 65, 0.09, 0.075);
        burst(0.06, 0.09, 2200);
        break;
      case "enemyShot":
        tone(380, 100, 0.16, 0.065, "sawtooth");
        break;
      case "hit":
        burst(0.35, 0.22, 1800);
        tone(130, 35, 0.3, 0.13, "sine");
        break;
      case "enemy":
        burst(0.5, 0.25, 2800);
        tone(95, 28, 0.45, 0.12, "sine");
        break;
      case "death":
        burst(0.85, 0.28, 1600);
        tone(180, 24, 0.9, 0.14, "sawtooth");
        break;
      case "relay":
        burst(0.65, 0.1, 750);
        [220, 330, 440, 660].forEach((f, i) =>
          tone(f, f, 0.55, 0.065, "sine", i * 0.12),
        );
        break;
      case "checkpoint":
        [330, 440, 554, 660].forEach((f, i) =>
          tone(f, f, 0.55, 0.065, "sine", i * 0.15),
        );
        break;
      case "discovery":
        tone(740, 740, 0.45, 0.028, "sine");
        tone(1108, 1108, 0.6, 0.02, "sine", 0.18);
        break;
      case "complete":
        [220, 330, 440, 554, 660, 880].forEach((f, i) =>
          tone(f, f, 1.3, 0.05, "sine", i * 0.14),
        );
        break;
    }
  }

  private release(voice: Voice) {
    voice.nodes.forEach((node) => node.disconnect());
    this.voices.delete(voice);
  }
  private clearVoices() {
    for (const voice of this.voices) {
      voice.source.onended = null;
      voice.source.stop();
      this.release(voice);
    }
  }
  dispose() {
    clearTimeout(this.suspendTimer);
    this.enabled = false;
    this.clearVoices();
    this.loops.forEach((source) => {
      source.stop();
      source.disconnect();
    });
    this.loops = [];
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}
