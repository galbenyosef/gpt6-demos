#!/usr/bin/env bun
/** Deterministic test-only App Server. Never imported by production code. */
import { resolve } from 'node:path';
const file = Bun.file(resolve(process.env.CODEX_CANVAS_DATA_DIR!, 'fixture-threads.json'));
const threads: any[] = await file.exists() ? await file.json() : [];
let initialized = false, counter = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<number, () => void>();
const save = () => Bun.write(file, JSON.stringify(threads));
const emit = (method: string, params: unknown) => console.log(JSON.stringify({ method, params }));
const result = (id: number | string, value: unknown) => console.log(JSON.stringify({ id, result: value }));
const context = (thread: any) => ({ thread, model: 'fixture-codex', reasoningEffort: 'high', sandbox: { type: 'workspaceWrite', networkAccess: false }, approvalPolicy: 'on-request' });
const models = [{ id: 'fixture', model: 'fixture-codex', displayName: 'Codex (test fixture)', isDefault: true, hidden: false, defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Low' }, { reasoningEffort: 'high', description: 'High' }] }];
function item(thread: any, turn: any, value: any, completed = false) {
  const index = turn.items.findIndex((i: any) => i.id === value.id); if (index >= 0) turn.items[index] = value; else turn.items.push(value);
  emit(completed ? 'item/completed' : 'item/started', { threadId: thread.id, turnId: turn.id, item: value });
}
function finish(thread: any, turn: any) {
  if (turn.status !== 'inProgress') return;
  item(thread, turn, { id: `${turn.id}-command`, type: 'commandExecution', command: 'bun test export', cwd: thread.cwd, status: 'completed', aggregatedOutput: '✓ 47 tests passed\n0 failures\n', exitCode: 0, durationMs: 1420 }, true);
  const diff = 'diff --git a/export.ts b/export.ts\n--- a/export.ts\n+++ b/export.ts\n@@ -1 +1 @@\n-const timestamp = index / fps;\n+const timestamp = (index * 1000) / fps;\n';
  item(thread, turn, { id: `${turn.id}-change`, type: 'fileChange', status: 'completed', changes: [{ path: 'export.ts', kind: { type: 'update' }, diff }] }, true);
  emit('turn/diff/updated', { threadId: thread.id, turnId: turn.id, diff });
  item(thread, turn, { id: `${turn.id}-web`, type: 'webSearch', query: 'WebCodecs timestamp units', action: { type: 'openPage', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API' } }, true);
  item(thread, turn, { id: `${turn.id}-tool`, type: 'mcpToolCall', server: 'docs', tool: 'lookup', status: 'completed', arguments: { query: 'timestamps' }, result: { content: [{ text: 'Timestamps use microseconds.' }] } }, true);
  item(thread, turn, { id: `${turn.id}-agent`, type: 'agentMessage', text: 'Fixed the timestamp calculation. **All 47 tests pass.**\n\n| Check | Result |\n| --- | --- |\n| Export | Passed |\n\n```ts\nconst timestamp = (index * 1000) / fps;\n```\n\n<script>window.injected = true</script>' }, true);
  item(thread, turn, { id: `${turn.id}-plan`, type: 'plan', text: '- [x] Inspect export pipeline\n- [x] Fix timestamps\n- [x] Run tests' }, true);
  emit('turn/plan/updated', { threadId: thread.id, turnId: turn.id, plan: [{ step: 'Inspect export pipeline', status: 'completed' }, { step: 'Fix timestamps', status: 'completed' }, { step: 'Run tests', status: 'completed' }] });
  turn.status = 'completed'; emit('turn/completed', { threadId: thread.id, turn: { ...turn, items: [] } }); void save();
}
async function handle(msg: any) {
  if (!msg.method) { const callback = pending.get(msg.id); if (callback) { pending.delete(msg.id); callback(); } return; }
  const p = msg.params ?? {}, thread = threads.find(t => t.id === p.threadId);
  if (msg.method === 'initialize') { result(msg.id, { userAgent: 'fixture' }); return; }
  if (msg.method === 'initialized') { initialized = true; return; }
  if (!initialized) throw new Error('Initialize first');
  switch (msg.method) {
    case 'account/read': result(msg.id, { account: { type: 'chatgpt', email: 'local@example.test' }, requiresOpenaiAuth: true }); break;
    case 'model/list': result(msg.id, { data: models, nextCursor: null }); break;
    case 'config/read': result(msg.id, { config: { web_search: 'live' } }); break;
    case 'thread/list': result(msg.id, { data: threads.filter(t => t.cwd === p.cwd && (!p.searchTerm || t.name.includes(p.searchTerm))), nextCursor: null }); break;
    case 'thread/read': case 'thread/resume': if (!thread) throw new Error('Thread not found'); result(msg.id, context(thread)); break;
    case 'thread/start': {
      const created = { id: crypto.randomUUID(), name: 'New session', cwd: p.cwd, updatedAt: Date.now() / 1000, historyMode: 'legacy', turns: [] }; threads.unshift(created); await save(); result(msg.id, context(created)); break;
    }
    case 'turn/start': {
      if (p.input[0].text === '/exit-fixture') { result(msg.id, {}); process.exit(1); }
      thread.name = thread.turns.length ? thread.name : 'Fix animation export';
      const turn = { id: crypto.randomUUID(), status: 'inProgress', items: [] as any[] }; thread.turns.push(turn);
      result(msg.id, { turn }); emit('turn/started', { threadId: thread.id, turn: { ...turn, items: [] } }); emit('thread/name/updated', { threadId: thread.id, threadName: thread.name });
      item(thread, turn, { id: `${turn.id}-user`, type: 'userMessage', content: p.input }, true);
      item(thread, turn, { id: `${turn.id}-agent`, type: 'agentMessage', text: '' });
      const text = 'I’ll inspect the animation export pipeline first.';
      turn.items.find(i => i.id === `${turn.id}-agent`).text = text;
      emit('item/agentMessage/delta', { threadId: thread.id, turnId: turn.id, itemId: `${turn.id}-agent`, delta: text });
      emit('turn/plan/updated', { threadId: thread.id, turnId: turn.id, plan: [{ step: 'Inspect export pipeline', status: 'inProgress' }, { step: 'Fix timestamps', status: 'pending' }, { step: 'Run tests', status: 'pending' }] });
      item(thread, turn, { id: `${turn.id}-command`, type: 'commandExecution', command: 'bun test export', cwd: thread.cwd, status: 'inProgress', aggregatedOutput: '' });
      emit('item/commandExecution/outputDelta', { threadId: thread.id, turnId: turn.id, itemId: `${turn.id}-command`, delta: 'Running export tests…\n' });
      turn.items.find(i => i.id === `${turn.id}-command`).aggregatedOutput = 'Running export tests…\n';
      if (p.input[0].text.toLowerCase().includes('approval')) {
        const requestId = ++counter; pending.set(requestId, () => finish(thread, turn));
        setTimeout(() => console.log(JSON.stringify({ id: requestId, method: 'item/commandExecution/requestApproval', params: { threadId: thread.id, turnId: turn.id, itemId: `${turn.id}-command`, command: 'bun install', cwd: thread.cwd, networkApprovalContext: { host: 'registry.npmjs.org', protocol: 'https' }, reason: 'Install the project dependencies.' } })), 300);
      } else timers.set(turn.id, setTimeout(() => finish(thread, turn), p.input[0].text.toLowerCase().includes('slow') ? 60000 : 1500));
      await save(); break;
    }
    case 'turn/steer': {
      const turn = thread.turns.find((t: any) => t.id === p.expectedTurnId); if (!turn || turn.status !== 'inProgress') throw new Error('Turn no longer running'); item(thread, turn, { id: `steer-${counter++}`, type: 'userMessage', content: p.input }, true); result(msg.id, { turnId: turn.id }); await save(); break;
    }
    case 'turn/interrupt': { const turn = thread.turns.find((t: any) => t.id === p.turnId); clearTimeout(timers.get(turn.id)); turn.status = 'interrupted'; emit('turn/completed', { threadId: thread.id, turn: { ...turn, items: [] } }); result(msg.id, {}); await save(); break; }
    default: throw new Error(`Unexpected fixture RPC ${msg.method}`);
  }
}
const decoder = new TextDecoder(); let buffer = '';
for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk, { stream: true });
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n'), line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line) continue;
    const msg = JSON.parse(line);
    try { await handle(msg); } catch (error) { console.log(JSON.stringify({ id: msg.id, error: { code: -1, message: String(error) } })); }
  }
}
