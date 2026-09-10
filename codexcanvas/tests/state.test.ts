import { test, expect } from 'bun:test';
import { applyEvent, activeTurn } from '../src/shared/state';
import { normalizeEvent, normalizeItem } from '../src/server/codex/CodexProtocol';
import { itemStatus, commandFailureHint } from '../src/shared/presentation';
import { preferredModel, type Thread, type Model } from '../src/shared/types';
const thread = (): Thread => ({ id: 'thread', cwd: '/tmp', name: 'Test', updatedAt: 0, turns: [] });
test('streaming is replaced by authoritative completed items and never duplicates turns', () => {
  const t = thread();
  for (const [method, params] of [
    ['turn/started', { turn: { id: 'turn', status: 'inProgress', items: [] } }],
    ['item/started', { turnId: 'turn', item: { id: 'agent', type: 'agentMessage', text: '' } }],
    ['item/agentMessage/delta', { turnId: 'turn', itemId: 'agent', delta: 'Provisional' }],
    ['item/commandExecution/outputDelta', { turnId: 'turn', itemId: 'cmd', delta: 'partial' }],
    ['item/completed', { turnId: 'turn', item: { id: 'cmd', type: 'commandExecution', command: 'bun test', aggregatedOutput: 'all tests passed', status: 'completed', exitCode: 0 } }],
    ['item/completed', { turnId: 'turn', item: { id: 'agent', type: 'agentMessage', text: 'Final response' } }],
    ['turn/completed', { turn: { id: 'turn', status: 'completed', items: [] } }],
  ] as const) { const event = normalizeEvent(method, { threadId: 'thread', ...params }); applyEvent(t, event!); }
  expect(t.turns).toHaveLength(1); expect(t.turns[0]!.items).toHaveLength(2); expect(t.turns[0]!.items[0]!.text).toBe('Final response'); expect(t.turns[0]!.items[1]!.output).toBe('all tests passed'); expect(activeTurn(t)).toBeUndefined();
  applyEvent(t, { kind: 'turn', threadId: 'other', turn: { id: 'bad', status: 'inProgress', items: [] } }); expect(t.turns).toHaveLength(1);
});
test('normalization excludes raw reasoning and updates one plan/diff per turn', () => {
  expect(normalizeItem({ id: 'r', type: 'reasoning', summary: ['Visible progress'], content: ['private'] })).toEqual({ id: 'r', type: 'reasoning', text: 'Visible progress', status: undefined });
  const t = thread();
  for (let n = 0; n < 3; n++) { applyEvent(t, normalizeEvent('turn/plan/updated', { threadId: t.id, turnId: 'turn', plan: [{ step: 'Build', status: n === 2 ? 'completed' : 'inProgress' }] })!); applyEvent(t, normalizeEvent('turn/diff/updated', { threadId: t.id, turnId: 'turn', diff: String(n) })!); }
  expect(t.turns[0]!.items).toHaveLength(2); expect(t.turns[0]!.items[1]!.diff).toBe('2');
});
test('Astra preference has a catalog-driven default fallback', () => {
  const models = [{ model: 'fallback', isDefault: true }, { model: 'gpt-6-astra' }] as Model[];
  expect(preferredModel(models)?.model).toBe('gpt-6-astra'); expect(preferredModel(models.slice(0, 1))?.model).toBe('fallback'); expect(preferredModel([])).toBeUndefined();
});

test('a terminal turn does not present unfinished commands as still running or invent their outcome', () => {
  const turn = { id: 'turn', status: 'interrupted', items: [] };
  const item = { id: 'git', type: 'commandExecution', command: 'git commit', status: 'inProgress', output: '' };
  expect(itemStatus(item, turn)).toBe('Turn interrupted · outcome unconfirmed');
  expect(item.status).toBe('inProgress');
  expect(itemStatus(item, { ...turn, status: 'inProgress' })).toBe('inProgress');
  expect(itemStatus({ ...item, status: 'completed', exitCode: 0 }, turn)).toBe('completed');
  expect(itemStatus({ ...item, status: 'completed', exitCode: 128 }, turn)).toBe('failed');
});

test('Git metadata permission failures explain approval without claiming an existing stale lock', () => {
  const item = { id: 'git', type: 'commandExecution', exitCode: 128, output: "fatal: Unable to create '/repo/.git/index.lock': Operation not permitted" };
  expect(commandFailureHint(item)).toContain('parent .git directory');
  expect(commandFailureHint(item)).toContain('require Codex approval');
  expect(commandFailureHint({ ...item, output: 'index.lock: File exists' })).toBeUndefined();
});
