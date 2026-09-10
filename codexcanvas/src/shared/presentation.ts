import { artifactType, objectId, type CanvasObject, type Item, type ObjectType, type Turn } from './types';
export const isSummary = (type: ObjectType) => ['plan', 'diff', 'activity'].includes(type);
export function automaticType(item: Item): ObjectType | null {
  const type = artifactType(item);
  return !type ? null : type === 'plan' || type === 'diff' || type === 'file' ? type : 'activity';
}
export function automaticId(threadId: string, turnId: string, item: Item) {
  return automaticType(item) === 'activity' ? `${threadId}:${turnId}:activity` : objectId(threadId, turnId, item);
}
export function isVisible(object: CanvasObject, turnId?: string) {
  return !object.hidden && (object.type === 'conversation' || object.pinned || (isSummary(object.type) && object.turnId === turnId));
}
export function failedItem(item: Item) { return item.status === 'failed' || (item.type === 'commandExecution' && item.exitCode != null && item.exitCode !== 0); }
export function activityItems(items: Item[]) { return items.filter(item => automaticType(item) === 'activity'); }

export function itemStatus(item: Item, turn: Turn): string {
  if (item.status === 'inProgress' && ['interrupted', 'failed', 'completed'].includes(turn.status)) return `Turn ${turn.status} · outcome unconfirmed`;
  return failedItem(item) ? 'failed' : item.status ?? turn.status;
}

export function commandFailureHint(item: Item): string | undefined {
  if (!failedItem(item)) return;
  if (/index\.lock/i.test(item.output ?? '') && /operation not permitted|permission denied/i.test(item.output ?? '')) {
    return 'Git could not write to its repository metadata. A workspace inside a larger repository may not include the parent .git directory in its write permissions. A retry may require Codex approval. This error does not establish that a stale lock file exists.';
  }
}
