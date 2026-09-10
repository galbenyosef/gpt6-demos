import type { Item, Turn } from '../../shared/types';
import { activityItems, failedItem, itemStatus } from '../../shared/presentation';
import { button, el, itemLabel, terminal } from '../ui/render';
export class ActivityView {
  private rows = new Map<string, { node: HTMLDetailsElement; label: HTMLElement; state: HTMLElement; content: HTMLElement; keep: HTMLButtonElement; source?: Item; revision?: string }>();
  private count = el('p', 'activity-count');
  private list = el('div', 'activity-list');
  private turn?: Turn;
  constructor(body: HTMLElement, private render: (item: Item, body: HTMLElement) => void, private keep: (item: Item) => void, private isKept: (item: Item) => boolean) {
    body.replaceChildren(this.count, this.list);
  }
  update(turn: Turn) {
    this.turn = turn;
    const items = activityItems(turn.items);
    const counts = new Map<string, number>();
    for (const item of items) { const category = this.category(item); counts.set(category, (counts.get(category) ?? 0) + 1); }
    this.count.textContent = [...counts].map(([name, count]) => `${count} ${name}`).join(' · ');
    for (const item of items) this.updateItem(item);
  }
  updateItem(item: Item) {
    let row = this.rows.get(item.id);
    if (!row) {
      const node = el('details', 'activity-entry'), summary = el('summary'); node.dataset.itemId = item.id;
      const label = el('span', 'activity-label'), state = el('span', 'activity-state'); summary.append(label, state);
      const keep = button('Keep on canvas', () => this.keep(row!.source!), 'keep-activity');
      const content = el('div', 'activity-content'); node.append(summary, keep, content); this.list.append(node);
      row = { node, label, state, content, keep }; this.rows.set(item.id, row);
      node.addEventListener('toggle', () => { if (node.open && row!.source) this.refreshContent(row!); });
    }
    row.source = item;
    row.label.textContent = itemLabel(item);
    const status = this.turn ? itemStatus(item, this.turn) : item.status;
    row.state.textContent = status === 'inProgress' ? 'Running' : status ?? this.category(item);
    row.node.classList.toggle('failed', failedItem(item));
    row.keep.disabled = this.isKept(item); row.keep.textContent = row.keep.disabled ? 'Kept on canvas' : 'Keep on canvas';
    if (row.node.open) this.refreshContent(row);
  }
  private refreshContent(row: NonNullable<ReturnType<typeof this.rows.get>>) {
    const revision = JSON.stringify([row.source, this.turn?.status]);
    if (row.revision === revision) return;
    // Streaming commands mutate their output node without resetting expansion or scroll.
    const output = row.content.querySelector<HTMLElement>('.terminal-output');
    if (output && row.source!.type === 'commandExecution' && row.source!.status === 'inProgress' && this.turn?.status === 'inProgress') {
      const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 60;
      output.textContent = terminal(row.source!.output ?? '');
      if (nearBottom) output.scrollTop = output.scrollHeight;
    } else this.render(row.source!, row.content);
    row.revision = revision;
  }
  focusItem(id: string) {
    const row = this.rows.get(id); if (!row) return;
    row.node.open = true; this.refreshContent(row);
    row.node.scrollIntoView({ block: 'nearest' }); row.node.querySelector('summary')?.focus({ preventScroll: true });
  }
  private category(item: Item) {
    if (item.type === 'commandExecution') return 'commands';
    if (item.type === 'webSearch') return 'web actions';
    if (item.type.startsWith('image')) return 'images';
    if (item.type.includes('Review')) return 'reviews';
    return 'tool actions';
  }
}
