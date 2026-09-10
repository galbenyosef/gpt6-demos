import type { Thread, SessionEvent, Turn, Item } from './types';
/** In-memory event projection only. No transcript is written to the Canvas database. */
export function applyEvent(thread: Thread, event: SessionEvent): void {
  if (thread.id !== event.threadId) return;
  if (event.kind === 'name') { thread.name = event.name; return; }
  const turnId = event.kind === 'turn' ? event.turn.id : event.turnId;
  let turn = thread.turns.find(t => t.id === turnId);
  if (!turn) { turn = { id: turnId, status: 'inProgress', items: [] }; thread.turns.push(turn); }
  if (event.kind === 'turn') {
    // Lifecycle notifications frequently have empty items. Never erase streamed history.
    const items = turn.items;
    Object.assign(turn, event.turn);
    turn.items = items;
    for (const item of event.turn.items) upsert(turn, item);
  } else if (event.kind === 'item') {
    upsert(turn, event.item);
  } else {
    let item = turn.items.find(i => i.id === event.itemId);
    if (!item) { item = { id: event.itemId, type: event.itemType }; turn.items.push(item); }
    item[event.field] = (item[event.field] ?? '') + event.delta;
  }
}
function upsert(turn: Turn, item: Item) {
  const index = turn.items.findIndex(i => i.id === item.id);
  if (index < 0) turn.items.push(item); else turn.items[index] = item;
}
export function activeTurn(thread?: Thread) { return thread?.turns.findLast(t => t.status === 'inProgress'); }
