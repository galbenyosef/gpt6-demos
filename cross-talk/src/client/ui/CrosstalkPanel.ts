import type { Status } from '../../protocol';
export class CrosstalkPanel {
  readonly host = document.createElement('div');
  readonly root = this.host.attachShadow({ mode: 'open' });
  readonly audio = document.createElement('audio');
  private status: HTMLElement;
  private caption: HTMLElement;
  private toggle: HTMLButtonElement;
  private panel: HTMLElement;
  private confirmation?: { id: string; finish(value: boolean): void };
  private syncFullscreen = () => {
    const parent = document.fullscreenElement ?? document.body;
    if (this.host.parentElement !== parent) parent.append(this.host);
    this.host.style.bottom = document.fullscreenElement ? '84px' : '22px';
  };
  constructor(onToggle: () => void, position: 'bottom-right' | 'bottom-left' = 'bottom-right') {
    this.host.style.cssText = `position:fixed;bottom:22px;${position === 'bottom-right' ? 'right' : 'left'}:22px;z-index:10000;pointer-events:none`;
    this.root.innerHTML = `<style>
      :host{font:14px/1.5 system-ui,sans-serif;color:#edece5}*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #d9eaaa;outline-offset:4px}
      .toggle{pointer-events:auto;background:#263b35;color:#f4f3ea;border:1px solid #a4b4a866;border-radius:30px;padding:13px 20px;box-shadow:0 4px 22px #10231a25;display:flex;gap:11px;align-items:center;font-size:11px;font-weight:650;letter-spacing:1.6px}.dot{width:8px;height:8px;border-radius:50%;background:#c9e5ac}.toggle[aria-pressed=true] .dot{box-shadow:0 0 0 4px #c9e5ac22}
      .panel{pointer-events:auto;width:min(320px,calc(100vw - 44px));padding:20px;margin-bottom:80px;border-radius:18px;background:#1e302b;box-shadow:0 8px 35px #10231a30;border:1px solid #ffffff20}.heading{font-size:10px;letter-spacing:2px;color:#b3c1b5;margin-bottom:14px}.status{font-size:14px}.caption{font-size:13px;color:#ccd3cc;margin:12px 0 0;max-height:100px;overflow:auto;white-space:pre-wrap}.hint{font-size:12px;color:#a9b9ac}.confirm{margin-top:14px;border-top:1px solid #ffffff25;padding-top:14px}.actions{display:flex;gap:10px;margin-top:12px}.actions button{padding:8px 14px;border:1px solid #bccbb555;border-radius:8px;background:#d4e5bb;color:#1e302b}.actions button+button{background:transparent;color:#ebefe4}pre{white-space:pre-wrap;font-size:11px;max-height:90px;overflow:auto}audio{width:100%;height:34px;margin-top:12px}[hidden]{display:none!important}
    </style><section class="panel" hidden aria-label="Crosstalk conversation"><div class="heading">CROSSTALK</div><div class="status" role="status" aria-live="polite">Ready to talk</div><p class="hint">Try “Show me around”</p><div class="caption" aria-label="Conversation captions"></div><div class="confirm" hidden></div></section><button class="toggle" aria-label="Start Crosstalk conversation" aria-expanded="false" aria-pressed="false"><span class="dot"></span><span class="label">CROSSTALK</span></button>`;
    this.status = this.root.querySelector('.status')!; this.caption = this.root.querySelector('.caption')!; this.toggle = this.root.querySelector('.toggle')!; this.panel = this.root.querySelector('.panel')!;
    this.toggle.onclick = onToggle; this.audio.autoplay = true; this.audio.controls = true; this.audio.hidden = true; this.panel.append(this.audio);
    this.syncFullscreen();
    document.addEventListener('fullscreenchange', this.syncFullscreen);
  }
  setStatus(status: Status, message?: string) {
    const active = status !== 'idle' && status !== 'error';
    this.panel.hidden = status === 'idle'; this.toggle.setAttribute('aria-expanded', String(!this.panel.hidden)); this.toggle.setAttribute('aria-pressed', String(active));
    this.toggle.setAttribute('aria-label', active ? 'End Crosstalk conversation' : 'Start Crosstalk conversation');
    this.root.querySelector('.label')!.textContent = active ? 'END CONVERSATION' : 'CROSSTALK';
    this.status.textContent = message ?? ({ idle: 'Ready to talk', connecting: 'Connecting…', listening: 'Listening', speaking: 'Speaking', working: 'Working…', 'waiting-for-confirmation': 'Your confirmation is needed', error: 'Voice is unavailable. Try again.' })[status];
    if (status === 'idle') { this.caption.textContent = ''; this.cancelConfirmation(); }
  }
  transcript(role: string, text: string) { if (this.caption.dataset.role !== role) { this.caption.textContent = ''; this.caption.dataset.role = role; } this.caption.textContent = (this.caption.textContent + text).slice(-1200); this.caption.scrollTop = this.caption.scrollHeight; }
  confirm(id: string, title: string, args: unknown): Promise<boolean> {
    this.cancelConfirmation();
    const box = this.root.querySelector<HTMLElement>('.confirm')!;
    box.replaceChildren(); box.hidden = false;
    const titleNode = document.createElement('div'); titleNode.textContent = `${title}?`;
    const detail = document.createElement('pre');
    detail.textContent = args && typeof args === 'object' ? Object.entries(args).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join('\n') : String(args ?? '');
    detail.hidden = !detail.textContent;
    const actions = document.createElement('div'); actions.className = 'actions';
    const allow = document.createElement('button'); allow.textContent = 'Allow';
    const deny = document.createElement('button'); deny.textContent = 'Cancel'; actions.append(allow, deny); box.append(titleNode, detail, actions);
    return new Promise(resolve => {
      const finish = (value: boolean) => { box.hidden = true; this.confirmation = undefined; resolve(value); };
      this.confirmation = { id, finish }; allow.onclick = () => finish(true); deny.onclick = () => finish(false); deny.focus();
    });
  }
  cancelConfirmation(id?: string) { if (!id || this.confirmation?.id === id) this.confirmation?.finish(false); }
  dispose() { this.cancelConfirmation(); document.removeEventListener('fullscreenchange', this.syncFullscreen); this.host.remove(); }
}
