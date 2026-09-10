import { button, el } from '../ui/render';

/** Moves the live card out of the scaled world; streaming and composer state stay intact. */
export class CardReader {
  readonly dialog = el('dialog', 'card-reader');
  private current?: { id: string; node: HTMLElement; parent: HTMLElement; trigger: HTMLElement | null };
  private textSize = 20;
  private sizeLabel = el('output', 'reader-text-size');
  private smaller: HTMLButtonElement;
  private larger: HTMLButtonElement;
  private back: HTMLButtonElement;

  constructor() {
    this.dialog.id = 'card-reader';
    this.dialog.setAttribute('aria-label', 'Maximized card');
    try {
      const saved = Number(localStorage.getItem('canvas.readingTextSize'));
      if (Number.isFinite(saved) && saved >= 16 && saved <= 32) this.textSize = saved;
    } catch { /* Reading mode still works when storage is unavailable. */ }
    const toolbar = el('div', 'reader-toolbar');
    this.back = button('← Back to canvas', () => this.restore(), 'reader-back');
    this.back.title = 'Restore card (Escape)';
    const sizing = el('div', 'reader-sizing');
    this.smaller = button('A−', () => this.setTextSize(this.textSize - 2));
    this.smaller.setAttribute('aria-label', 'Decrease reading text size');
    this.larger = button('A+', () => this.setTextSize(this.textSize + 2));
    this.larger.setAttribute('aria-label', 'Increase reading text size');
    this.sizeLabel.setAttribute('aria-live', 'polite');
    sizing.append(el('span', '', 'Text size'), this.smaller, this.sizeLabel, this.larger);
    toolbar.append(this.back, sizing);
    this.dialog.append(toolbar);
    document.body.append(this.dialog);
    this.setTextSize(this.textSize, false);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.restore(); });
    this.dialog.addEventListener('close', () => { if (!this.dialog.open) this.restore(); });
  }

  get id() { return this.current?.id; }

  open(id: string, node: HTMLElement) {
    if (this.current?.id === id) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Keep the dialog open when following an artifact/provenance link to another card.
    this.returnCard();
    this.current = { id, node, parent: node.parentElement!, trigger };
    if (!this.dialog.open) this.dialog.showModal();
    this.movePreservingScroll(node, this.dialog);
    this.back.focus({ preventScroll: true });
  }

  restore(focus = true) {
    const previous = this.current;
    this.returnCard();
    if (this.dialog.open) this.dialog.close();
    if (focus && previous) {
      const target = previous.trigger?.isConnected && !previous.trigger.closest('#card-reader')
        ? previous.trigger : previous.node.querySelector<HTMLElement>('.maximize-card');
      target?.focus({ preventScroll: true });
    }
  }

  private returnCard() {
    if (!this.current) return;
    this.movePreservingScroll(this.current.node, this.current.parent);
    this.current = undefined;
  }

  private movePreservingScroll(node: HTMLElement, parent: HTMLElement) {
    const scroll = [...node.querySelectorAll<HTMLElement>('.card-body, .messages, .terminal-output')]
      .map(element => ({ element, top: element.scrollTop, left: element.scrollLeft }));
    parent.append(node);
    for (const { element, top, left } of scroll) { element.scrollTop = top; element.scrollLeft = left; }
  }

  private setTextSize(size: number, persist = true) {
    this.textSize = Math.max(16, Math.min(32, size));
    this.dialog.style.setProperty('--reading-text-size', `${this.textSize}px`);
    this.sizeLabel.textContent = `${this.textSize} px`;
    this.smaller.disabled = this.textSize === 16;
    this.larger.disabled = this.textSize === 32;
    if (persist) try { localStorage.setItem('canvas.readingTextSize', String(this.textSize)); } catch {}
  }
}
