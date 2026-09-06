import type { Settings, Vec } from './domain';
import type { GameEvent } from './simulation';
export class GameAudio {
  private context?: AudioContext;
  private effects?: GainNode;
  private music?: GainNode;
  private rotor?: OscillatorNode;
  private hum?: OscillatorNode;
  private rotorGain?: GainNode;
  async start(settings: Settings) {
    if (!this.context) {
      const ctx = this.context = new AudioContext(); this.effects = ctx.createGain(); this.effects.connect(ctx.destination); this.music = ctx.createGain(); this.music.connect(ctx.destination);
      this.rotor = ctx.createOscillator(); this.rotor.type = 'sawtooth'; this.rotor.frequency.value = 42; this.rotorGain = ctx.createGain(); this.rotorGain.gain.value = .025;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 140; this.rotor.connect(filter).connect(this.rotorGain).connect(this.effects); this.rotor.start();
      this.hum = ctx.createOscillator(); this.hum.type = 'sine'; this.hum.frequency.value = 55; const gain = ctx.createGain(); gain.gain.value = .035; this.hum.connect(gain).connect(this.music); this.hum.start();
    }
    this.update(settings); await this.context.resume();
  }
  update(settings: Settings) { if (this.effects) this.effects.gain.value = settings.effects; if (this.music) this.music.gain.value = settings.music; }
  active(active: boolean) { if (!this.context) return; if (active) void this.context.resume(); else void this.context.suspend(); }
  motion(speed: number) { if (this.rotor && this.context) this.rotor.frequency.setTargetAtTime(42 + speed * 2, this.context.currentTime, .2); }
  event(event: GameEvent, listener: Vec) {
    const ctx = this.context; if (!ctx || !this.effects || ctx.state !== 'running') return;
    const osc = ctx.createOscillator(), gain = ctx.createGain(), pan = ctx.createStereoPanner(), now = ctx.currentTime;
    const frequencies = { shot: 190, hit: 65, enemy: 90, checkpoint: 440, relay: 550, death: 45, complete: 660, discovery: 740 };
    const duration = event.type === 'shot' ? .07 : event.type === 'complete' ? 1.3 : .35;
    osc.type = ['shot', 'hit', 'enemy'].includes(event.type) ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(frequencies[event.type], now); osc.frequency.exponentialRampToValueAtTime(frequencies[event.type] * (event.type === 'relay' || event.type === 'checkpoint' ? 1.5 : .5), now + duration);
    const d = Math.hypot(event.position.x - listener.x, event.position.y - listener.y); gain.gain.setValueAtTime(.09 / (1 + d / 12), now); gain.gain.exponentialRampToValueAtTime(.001, now + duration); pan.pan.value = Math.max(-1, Math.min(1, (event.position.x - listener.x) / 20));
    osc.connect(gain).connect(pan).connect(this.effects); osc.start(); osc.stop(now + duration); osc.onended = () => { osc.disconnect(); gain.disconnect(); pan.disconnect(); };
  }
  dispose() { this.rotor?.stop(); this.hum?.stop(); void this.context?.close(); }
}
