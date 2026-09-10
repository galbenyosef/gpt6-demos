/** Adapter for the stable app-server surface. Checked against codex-cli 0.154.0 generate-ts.
 * Unknown wire fields are intentionally kept out of the browser protocol. */
import type { Item, Turn, Thread, SessionEvent, Context } from '../../shared/types';
export function normalizeItem(raw: any): Item {
  const item: Item = { id: raw.id, type: raw.type, status: raw.status };
  switch (raw.type) {
    case 'userMessage': item.text = (raw.content ?? []).map((c: any) => c.type === 'text' ? c.text : `[${c.type}]`).join('\n'); break;
    case 'agentMessage': case 'plan': item.text = raw.text ?? ''; break;
    case 'reasoning': item.text = (raw.summary ?? []).join('\n'); break; // Never expose raw reasoning content.
    case 'commandExecution': Object.assign(item, { command: raw.command, cwd: raw.cwd, output: raw.aggregatedOutput ?? '', exitCode: raw.exitCode, durationMs: raw.durationMs }); break;
    case 'fileChange': item.changes = (raw.changes ?? []).map((c: any) => ({ path: c.path, kind: typeof c.kind === 'string' ? c.kind : c.kind?.type ?? 'update', diff: c.diff ?? '' })); break;
    case 'webSearch': item.query = raw.query ?? raw.action?.query ?? raw.action?.queries?.join(', ') ?? ''; item.action = raw.action?.type ?? 'search'; item.url = raw.action?.url; item.text = raw.action?.pattern; break;
    case 'imageView': item.path = raw.path; break;
    case 'imageGeneration': item.path = raw.savedPath ?? raw.result?.path ?? raw.result; item.text = raw.revisedPrompt; break;
    case 'enteredReviewMode': case 'exitedReviewMode': item.text = raw.review; break;
    case 'mcpToolCall': case 'dynamicToolCall': case 'collabAgentToolCall': case 'functionCallOutput':
      item.text = [raw.server, raw.namespace, raw.tool ?? raw.name].filter(Boolean).join(' · ');
      item.details = JSON.stringify({ arguments: raw.arguments, result: raw.result ?? raw.contentItems ?? raw.output, error: raw.error }, null, 2); break;
    case 'contextCompaction': item.text = 'Context compacted'; break;
  }
  return item;
}
export function normalizeTurn(raw: any): Turn { return { id: raw.id, status: raw.status, items: (raw.items ?? []).map(normalizeItem), error: raw.error?.message }; }
export function normalizeThread(raw: any): Thread { return { id: raw.id, name: raw.name || raw.preview || 'New session', cwd: raw.cwd, updatedAt: raw.updatedAt, model: raw.model ?? undefined, effort: raw.reasoningEffort ?? undefined, turns: (raw.turns ?? []).map(normalizeTurn) }; }
export function normalizeContext(response: any, config: any): Context {
  const sandbox = response.sandbox ?? {};
  return { model: response.model, effort: response.reasoningEffort ?? undefined, sandbox: sandbox.type ?? 'Inherited', approvalPolicy: typeof response.approvalPolicy === 'string' ? response.approvalPolicy : 'Custom', shellNetwork: typeof sandbox.networkAccess === 'boolean' ? (sandbox.networkAccess ? 'Enabled' : 'Disabled') : sandbox.type === 'dangerFullAccess' ? 'Enabled' : 'Inherited', webSearch: config?.web_search ?? 'Inherited' };
}
export function normalizeEvent(method: string, p: any): SessionEvent | undefined {
  if (typeof p.threadId !== 'string') return;
  if (method === 'thread/name/updated') return { kind: 'name', threadId: p.threadId, name: p.threadName ?? p.name };
  if (method === 'turn/started' || method === 'turn/completed') return { kind: 'turn', threadId: p.threadId, turn: normalizeTurn(p.turn) };
  if (method === 'item/started' || method === 'item/completed') return { kind: 'item', threadId: p.threadId, turnId: p.turnId, item: normalizeItem(p.item) };
  if (method === 'item/fileChange/patchUpdated') return { kind: 'item', threadId: p.threadId, turnId: p.turnId, item: normalizeItem({ id: p.itemId, type: 'fileChange', status: 'inProgress', changes: p.changes }) };
  if (method === 'turn/plan/updated') return { kind: 'item', threadId: p.threadId, turnId: p.turnId, item: { id: `plan:${p.turnId}`, type: 'plan', text: p.explanation ?? '', plan: p.plan } };
  if (method === 'turn/diff/updated') return { kind: 'item', threadId: p.threadId, turnId: p.turnId, item: { id: `diff:${p.turnId}`, type: 'turnDiff', diff: p.diff } };
  const deltas: Record<string, [string, 'text' | 'output']> = { 'item/agentMessage/delta': ['agentMessage', 'text'], 'item/commandExecution/outputDelta': ['commandExecution', 'output'], 'item/plan/delta': ['plan', 'text'] };
  const delta = deltas[method];
  if (delta) return { kind: 'delta', threadId: p.threadId, turnId: p.turnId, itemId: p.itemId, itemType: delta[0], field: delta[1], delta: p.delta };
}
