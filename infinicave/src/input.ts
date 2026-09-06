import type { Settings } from './domain';
import type { Input } from './simulation';
export class InputManager {
  private held = new Set<string>();
  private pulses = new Set<string>();
  private gamepadButtons = new Set<number>();
  private enabled = false;
  onAction: (action: 'pause' | 'map') => void = () => {};
  constructor(readonly surface: HTMLElement, public settings: Settings) {
    surface.addEventListener('keydown', this.keydown); surface.addEventListener('keyup', this.keyup);
  }
  private keydown = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    const entries = Object.entries(this.settings.controls), key = entries.find(([, code]) => code === event.code)?.[0];
    if (key || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.held.add(event.code); this.pulses.add(event.code);
    if (key === 'pause' || key === 'map') this.onAction(key);
  };
  private keyup = (event: KeyboardEvent) => { this.held.delete(event.code); };
  activate(value: boolean) { this.enabled = value; this.clear(); if (value) this.surface.focus(); }
  clear() { this.held.clear(); this.pulses.clear(); this.gamepadButtons.clear(); }
  sample(): Input {
    if (!this.enabled) return { x: 0, y: 0, fire: false, interact: false };
    const c = this.settings.controls, down = (...keys: string[]) => keys.some(k => this.held.has(k));
    let x = Number(down(c.right, 'ArrowRight')) - Number(down(c.left, 'ArrowLeft')), y = Number(down(c.up, 'ArrowUp')) - Number(down(c.down, 'ArrowDown'));
    let fire = down(c.fire), interact = this.pulses.has(c.interact); this.pulses.clear();
    const pad = navigator.getGamepads?.().find(p => p?.connected);
    if (pad) {
      const buttons = new Set(pad.buttons.map((b, i) => b.pressed ? i : -1).filter(i => i >= 0));
      const axisX = pad.axes[0] || 0, axisY = -(pad.axes[1] || 0), magnitude = Math.hypot(axisX, axisY), dead = this.settings.deadZone;
      if (magnitude > dead) { const strength = Math.min(1, (magnitude - dead) / (1 - dead)); x += axisX / magnitude * strength; y += axisY / magnitude * strength; }
      x += Number(buttons.has(15)) - Number(buttons.has(14)); y += Number(buttons.has(12)) - Number(buttons.has(13)); fire ||= buttons.has(7); interact ||= buttons.has(0) && !this.gamepadButtons.has(0);
      if (buttons.has(9) && !this.gamepadButtons.has(9)) this.onAction('pause'); else if (buttons.has(3) && !this.gamepadButtons.has(3)) this.onAction('map'); this.gamepadButtons = buttons;
    }
    const magnitude = Math.hypot(x, y); if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    return { x, y, fire, interact };
  }
  dispose() { this.surface.removeEventListener('keydown', this.keydown); this.surface.removeEventListener('keyup', this.keyup); }
}
