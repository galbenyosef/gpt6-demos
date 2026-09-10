import type { Canvas, CanvasObject, Camera, ObjectPatch } from '../../shared/types';
import { fit, zoomAt } from './geometry';
import { isVisible } from '../../shared/presentation';
import { CardReader } from './CardReader';
import { el, button } from '../ui/render';
export interface Card { object: CanvasObject; node: HTMLElement; body: HTMLElement; status: HTMLElement; turnLink: HTMLButtonElement }
export class CanvasWorld {
  readonly cards = new Map<string, Card>();
  readonly reader = new CardReader();
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  threadId = '';
  selected?: string;
  viewedTurnId?: string;
  onPatch: (id: string, patch: ObjectPatch) => void = () => {};
  onCamera: (camera: Camera) => void = () => {};
  onTurn: (turnId: string) => void = () => {};
  private space = false;
  private history: Camera[] = [];
  private historyIndex = -1;
  constructor(readonly viewport: HTMLElement, readonly world: HTMLElement, readonly connectors: SVGElement) {
    viewport.addEventListener('wheel', event => {
      if ((event.target as HTMLElement).closest('.card-body, .messages, textarea') && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); const rect = viewport.getBoundingClientRect();
      this.setCamera(zoomAt(this.camera, event.clientX - rect.left, event.clientY - rect.top, this.camera.zoom * Math.exp(-event.deltaY * .0015)));
    }, { passive: false });
    viewport.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement;
      if (event.button !== 1 && !(event.button === 0 && (this.space || !target.closest('.card')))) return;
      event.preventDefault(); const start = { ...this.camera };
      this.gesture(event, (dx, dy) => this.setCamera({ ...start, x: start.x + dx, y: start.y + dy }, false), () => this.onCamera(this.camera));
    });
    document.addEventListener('keydown', event => {
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable], dialog')) return;
      if (event.code === 'Space') { this.space = true; viewport.classList.add('panning'); event.preventDefault(); }
      if (event.key === '0') this.fit();
      if (event.key === '1') this.focusConversation();
      if (event.key === 'Escape') this.select();
      if (event.key === 'f' && this.selected) this.focus(this.selected);
      if (event.key === 'm' && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); this.maximizeSelection(); }
    });
    document.addEventListener('keyup', event => { if (event.code === 'Space') { this.space = false; viewport.classList.remove('panning'); } });
    window.addEventListener('blur', () => { this.space = false; viewport.classList.remove('panning'); });
    new ResizeObserver(() => this.drawMinimap()).observe(viewport);
  }
  load(canvas: Canvas) {
    this.reader.restore(false);
    this.threadId = canvas.threadId; this.selected = undefined; this.history = []; this.historyIndex = -1;
    for (const card of this.cards.values()) card.node.remove(); this.cards.clear();
    this.setCamera(canvas.camera, false);
    for (const object of canvas.objects) this.upsert(object);
  }
  upsert(object: CanvasObject): Card {
    let card = this.cards.get(object.id);
    if (!card) {
      const node = el('article', `card card-${object.type}`); node.dataset.objectId = object.id; node.dataset.turnId = object.turnId ?? ''; node.tabIndex = 0;
      const header = el('header', 'card-header');
      const icon = ({ conversation: '▣', activity: '☷', plan: '☷', command: '>_', diff: '±', file: '▤', 'web-search': '◎', image: '▧', tool: '⌘', review: '⊙' })[object.type];
      header.append(el('span', 'card-icon', icon), el('strong', '', object.type === 'web-search' ? 'WEB SEARCH' : object.type === 'diff' ? 'CHANGES' : object.type.toUpperCase()));
      const turnLink = button('', () => object.turnId && this.onTurn(object.turnId), 'turn-link'); header.append(turnLink);
      const status = el('span', 'card-status'); header.append(status);
      if (object.type === 'conversation') header.append(button('⇤', () => this.dock(object.id), 'card-control'));
      const maximize = button('⛶ Maximize', () => this.maximize(object.id), 'card-control maximize-card');
      maximize.title = 'Maximize card for reading (M)'; maximize.setAttribute('aria-label', 'Maximize card'); header.append(maximize);
      if (object.type !== 'conversation') { const keep = button('', () => this.patch(object.id, { pinned: !this.cards.get(object.id)!.object.pinned }), 'card-control keep-card'); header.append(keep); }
      const collapse = button('−', () => this.patch(object.id, { collapsed: !this.cards.get(object.id)!.object.collapsed }), 'card-control'); collapse.title = 'Collapse or expand card'; collapse.setAttribute('aria-label', 'Collapse or expand card'); header.append(collapse);
      if (object.type !== 'conversation') { const hide = button('×', () => this.patch(object.id, { hidden: true }), 'card-control'); hide.title = 'Hide from canvas'; hide.setAttribute('aria-label', 'Hide from canvas'); header.append(hide); }
      const body = el('div', 'card-body');
      const resize = el('div', 'resize-handle'); resize.title = 'Drag to resize'; resize.setAttribute('role', 'separator'); resize.setAttribute('aria-label', 'Resize card'); resize.tabIndex = 0;
      node.append(header, body, resize); this.world.append(node);
      card = { object, node, body, status, turnLink }; this.cards.set(object.id, card);
      node.addEventListener('pointerdown', () => this.select(object.id));
      node.addEventListener('mouseenter', () => this.highlightTurn(object.turnId)); node.addEventListener('mouseleave', () => this.highlightTurn());
      header.addEventListener('dblclick', event => { if (!(event.target as HTMLElement).closest('button')) { if (this.reader.id === object.id) this.reader.restore(); else this.maximize(object.id); } });
      header.addEventListener('pointerdown', event => {
        if (this.reader.id === object.id || this.space || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
        event.preventDefault(); event.stopPropagation(); this.select(object.id);
        const start = { ...this.cards.get(object.id)!.object };
        this.gesture(event, (dx, dy) => this.patch(object.id, { x: start.x + dx / this.camera.zoom, y: start.y + dy / this.camera.zoom, manuallyPositioned: true }, false), () => this.onPatch(object.id, { x: card!.object.x, y: card!.object.y, manuallyPositioned: true }));
      });
      resize.addEventListener('pointerdown', event => {
        if (this.reader.id === object.id) return;
        event.preventDefault(); event.stopPropagation(); const start = { ...card!.object };
        this.gesture(event, (dx, dy) => this.patch(object.id, { width: Math.max(260, Math.min(4000, start.width + dx / this.camera.zoom)), height: Math.max(140, Math.min(4000, start.height + dy / this.camera.zoom)) }, false), () => this.onPatch(object.id, { width: card!.object.width, height: card!.object.height }));
      });
      resize.addEventListener('keydown', event => { if (event.key.startsWith('Arrow')) { event.preventDefault(); this.patch(object.id, { width: Math.max(260, card!.object.width + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0)), height: Math.max(140, card!.object.height + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0)) }); } });
      node.addEventListener('keydown', event => { if (event.target !== node || this.reader.id === object.id) return; if (event.key === 'Enter') { event.preventDefault(); this.maximize(object.id); return; } if (!event.key.startsWith('Arrow')) return; event.preventDefault(); this.patch(object.id, { x: card!.object.x + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0), y: card!.object.y + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0), manuallyPositioned: true }); });
    }
    if (this.reader.id === object.id && !this.visible(object)) this.reader.restore(false);
    card.object = object;
    Object.assign(card.node.style, { left: `${object.x}px`, top: `${object.y}px`, width: `${object.width}px`, height: `${object.collapsed ? 46 : object.height}px`, zIndex: String(this.selected === object.id ? 100000 : object.zIndex) });
    card.node.hidden = !this.visible(object); card.node.classList.toggle('collapsed', object.collapsed);
    const keep = card.node.querySelector<HTMLButtonElement>('.keep-card');
    if (keep) { keep.textContent = object.pinned ? '◆' : '◇'; keep.title = keep.ariaLabel = object.pinned ? 'Unkeep from canvas' : 'Keep on canvas'; }
    this.drawConnectors(); this.drawMinimap(); return card;
  }
  visible(object: CanvasObject) { return isVisible(object, this.viewedTurnId); }
  setTurn(turnId?: string) {
    this.viewedTurnId = turnId;
    for (const card of this.cards.values()) {
      const visible = this.visible(card.object);
      if (!visible && this.reader.id === card.object.id) this.reader.restore(false);
      card.node.hidden = !visible;
    }
    this.drawConnectors(); this.drawMinimap();
  }
  patch(id: string, patch: ObjectPatch, save = true) { const card = this.cards.get(id)!; this.upsert({ ...card.object, ...patch }); if (save) this.onPatch(id, patch); }
  select(id?: string) { this.selected = id; for (const card of this.cards.values()) { card.node.classList.toggle('selected', card.object.id === id); card.node.style.zIndex = String(card.object.id === id ? 100000 : card.object.zIndex); } }
  setCamera(camera: Camera, save = true) {
    this.camera = { ...camera }; this.world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
    this.viewport.style.backgroundPosition = `${camera.x}px ${camera.y}px`; this.viewport.style.backgroundSize = `${24 * camera.zoom}px ${24 * camera.zoom}px`;
    this.world.classList.toggle('overview', camera.zoom < .4);
    document.querySelector('#zoom-level')!.textContent = `${Math.round(camera.zoom * 100)}%`;
    this.drawMinimap(); if (save && this.threadId) this.onCamera(this.camera);
  }
  zoom(factor: number) { this.setCamera(zoomAt(this.camera, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2, this.camera.zoom * factor)); }
  fit() { this.remember(); this.setCamera(fit([...this.cards.values()].map(c => c.object).filter(o => this.visible(o)), this.viewport.clientWidth, this.viewport.clientHeight)); }
  maximize(id: string) {
    const card = this.cards.get(id); if (!card || !this.visible(card.object)) return;
    this.select(id); this.reader.open(id, card.node);
  }
  maximizeSelection() {
    const selected = this.selected && this.cards.get(this.selected);
    const card = selected && this.visible(selected.object) ? selected : [...this.cards.values()].find(c => c.object.type === 'conversation');
    if (card) this.maximize(card.object.id);
  }
  focus(id: string) {
    if (this.reader.id) { this.maximize(id); return; }
    const card = this.cards.get(id); if (!card) return;
    if (card.object.hidden) this.patch(id, { hidden: false });
    this.remember(); this.select(id); this.setCamera(fit([card.object], this.viewport.clientWidth, this.viewport.clientHeight));
  }
  focusConversation() { const card = [...this.cards.values()].find(c => c.object.type === 'conversation'); if (card) this.focus(card.object.id); }
  dock(id: string) { const { camera: c } = this; this.patch(id, { x: (28 - c.x) / c.zoom, y: (28 - c.y) / c.zoom, manuallyPositioned: true }); }
  reset() { this.setCamera({ x: 0, y: 0, zoom: 1 }); }
  private remember() { this.history = this.history.slice(0, this.historyIndex + 1); this.history.push({ ...this.camera }); this.historyIndex = this.history.length - 1; }
  navigate(direction: number) {
    if (direction < 0 && this.historyIndex >= 0) { if (this.historyIndex === this.history.length - 1) this.history.push({ ...this.camera }); this.setCamera(this.history[this.historyIndex--]!); }
    else if (direction > 0 && this.historyIndex + 2 < this.history.length) this.setCamera(this.history[(this.historyIndex += 1) + 1]!);
  }
  highlightTurn(turnId?: string) {
    for (const card of this.cards.values()) card.node.classList.toggle('related', !!turnId && card.object.turnId === turnId);
    for (const turn of document.querySelectorAll<HTMLElement>('.turn')) turn.classList.toggle('related', !!turnId && turn.dataset.turnId === turnId);
  }
  private gesture(event: PointerEvent, move: (dx: number, dy: number) => void, done: () => void) {
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const onMove = (e: PointerEvent) => move(e.clientX - event.clientX, e.clientY - event.clientY);
    const onUp = () => { target.removeEventListener('pointermove', onMove); target.removeEventListener('pointerup', onUp); target.removeEventListener('pointercancel', onUp); if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); done(); };
    target.addEventListener('pointermove', onMove); target.addEventListener('pointerup', onUp); target.addEventListener('pointercancel', onUp);
  }
  private drawConnectors() {
    this.connectors.replaceChildren(); const conversation = [...this.cards.values()].find(c => c.object.type === 'conversation')?.object; if (!conversation) return;
    const groups = [...new Set([...this.cards.values()].filter(c => this.visible(c.object)).map(c => c.object.turnId).filter(Boolean))];
    for (const { object: o } of this.cards.values()) {
      if (o.type === 'conversation' || !this.visible(o)) continue;
      const x = conversation.x + conversation.width, y = conversation.y + 80 + groups.indexOf(o.turnId) * 28;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x},${y} C${x + 40},${y} ${o.x - 40},${o.y + 23} ${o.x},${o.y + 23}`); this.connectors.append(path);
    }
  }
  private drawMinimap() {
    const map = document.querySelector<HTMLElement>('#minimap'); if (!map) return; map.replaceChildren();
    const objects = [...this.cards.values()].map(c => c.object).filter(o => this.visible(o)); map.hidden = objects.length < 2;
    if (!objects.length) return;
    const left = Math.min(0, ...objects.map(o => o.x)), top = Math.min(0, ...objects.map(o => o.y));
    const width = Math.max(...objects.map(o => o.x + o.width)) - left + 60, height = Math.max(...objects.map(o => o.y + (o.collapsed ? 46 : o.height))) - top + 60;
    const scale = Math.min(160 / width, 100 / height);
    for (const o of objects) { const dot = button('', () => this.focus(o.id), `map-object ${o.type === 'conversation' ? 'map-conversation' : ''}`); dot.title = o.type; Object.assign(dot.style, { left: `${(o.x - left) * scale + 8}px`, top: `${(o.y - top) * scale + 8}px`, width: `${o.width * scale}px`, height: `${(o.collapsed ? 46 : o.height) * scale}px` }); map.append(dot); }
    const view = el('div', 'map-viewport'); Object.assign(view.style, { left: `${(-this.camera.x / this.camera.zoom - left) * scale + 8}px`, top: `${(-this.camera.y / this.camera.zoom - top) * scale + 8}px`, width: `${this.viewport.clientWidth / this.camera.zoom * scale}px`, height: `${this.viewport.clientHeight / this.camera.zoom * scale}px` }); map.append(view);
  }
}
