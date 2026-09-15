import type { Settings } from "../../packages/contracts";
export class MatchAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  crowd: GainNode | null = null;
  settings: Settings | null = null;
  unlock() {
    if (!this.context) {
      try {
        const ctx = (this.context = new AudioContext());
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
          data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          last = (last + (Math.random() * 2 - 1) * 0.025) / 1.02;
          data[i] = last;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 650;
        this.crowd = ctx.createGain();
        source.connect(filter).connect(this.crowd).connect(this.master);
        source.start();
        this.configure(this.settings);
      } catch {
        return;
      }
    }
    void this.context?.resume();
  }
  configure(settings: Settings | null) {
    this.settings = settings;
    if (this.master)
      this.master.gain.value = settings?.muted ? 0 : (settings?.master ?? 0.7);
    if (this.crowd) this.crowd.gain.value = (settings?.crowd ?? 0.25) * 0.5;
  }
  play(kind: string) {
    const ctx = this.context;
    if (!ctx || !this.master || ctx.state !== "running") return;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      t = ctx.currentTime;
    const effect = this.settings?.effects ?? 0.8;
    osc.type = kind === "kick" ? "sine" : "triangle";
    osc.frequency.setValueAtTime(
      kind === "kick"
        ? 120
        : kind === "goal"
          ? 660
          : kind === "whistle"
            ? 1900
            : 440,
      t,
    );
    osc.frequency.exponentialRampToValueAtTime(
      kind === "kick"
        ? 40
        : kind === "goal"
          ? 990
          : kind === "whistle"
            ? 2200
            : 550,
      t + 0.12,
    );
    gain.gain.setValueAtTime(0.12 * effect, t);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t + (kind === "goal" ? 0.8 : 0.2),
    );
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 1);
  }
}
