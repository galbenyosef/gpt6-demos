import { test, expect } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Host, type Peer } from '../src/server/Host';
import { Store } from '../src/server/persistence/Store';
import { parseClientMessage, trustedRequest } from '../src/server/validation';
import type { ServerMessage } from '../src/shared/types';
test('sessions use cwd filtering, create/resume mapping, workspace isolation and persistent metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'canvas-host-')); const store = new Store(':memory:');
  const calls: { method: string; params: any }[] = [], out: ServerMessage[] = [];
  const canonical = await realpath(dir);
  const raw = { id: 'thread', cwd: canonical, preview: 'Original conversation', updatedAt: 1, historyMode: 'legacy', turns: [{ id: 'turn', status: 'completed', items: [{ id: 'user', type: 'userMessage', content: [{ type: 'text', text: 'Original prompt' }] }] }] };
  const rpc = { async request<T>(method: string, params: any): Promise<T> { calls.push({ method, params });
    return (method === 'thread/list' ? { data: [raw], nextCursor: null } : method === 'config/read' ? { config: { web_search: 'live' } } : method === 'turn/start' ? { turn: { id: 'new-turn', status: 'inProgress', items: [] } } : { thread: raw, model: 'discovered', sandbox: { type: 'workspaceWrite', networkAccess: false } }) as T;
  }, respond() {}, reject() {} };
  const host = new Host(store, () => rpc); const peer: Peer = { send: m => out.push(m) }; host.peers.add(peer); host.status = 'ready';
  host.models = [{ id: 'id', model: 'discovered', displayName: 'Discovered model', isDefault: true, defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'high', description: '' }] }];
  try {
    const workspace = await store.addWorkspace('Test', dir), other = await store.addWorkspace('Other', process.cwd());
    await host.handle(peer, { type: 'workspace.open', workspaceId: workspace.id }); expect(calls.at(-1)).toEqual({ method: 'thread/list', params: { cwd: canonical, limit: 50, sortKey: 'updated_at' } });
    await expect(host.handle(peer, { type: 'session.open', workspaceId: other.id, threadId: raw.id })).rejects.toThrow('another workspace'); expect(calls.filter(c => c.method === 'thread/resume')).toHaveLength(0);
    await host.handle(peer, { type: 'session.open', workspaceId: workspace.id, threadId: raw.id }); expect(calls.filter(c => c.method === 'thread/resume')).toHaveLength(1);
    await host.handle(peer, { type: 'session.open', workspaceId: workspace.id, threadId: raw.id }); expect(host.sessions.get(raw.id)!.thread.turns).toHaveLength(1); expect(calls.filter(c => c.method === 'thread/resume')).toHaveLength(1);
    await host.handle(peer, { type: 'turn.start', threadId: raw.id, text: 'Continue', model: 'discovered', effort: 'high', clientId: 'user-id' });
    expect(calls.at(-1)!.params).toMatchObject({ threadId: raw.id, model: 'discovered', effort: 'high', input: [{ type: 'text', text: 'Continue', text_elements: [] }] });
    await host.handle(peer, { type: 'turn.steer', threadId: raw.id, text: 'Keep the API', clientId: 'steer-id' }); expect(calls.at(-1)!.params.expectedTurnId).toBe('new-turn');
    await host.handle(peer, { type: 'turn.stop', threadId: raw.id }); expect(calls.at(-1)).toEqual({ method: 'turn/interrupt', params: { threadId: raw.id, turnId: 'new-turn' } });
    const stranger: Peer = { send() {}, workspaceId: other.id, threadId: raw.id };
    await expect(host.handle(stranger, { type: 'turn.start', threadId: raw.id, text: 'Wrong workspace', clientId: 'no' })).rejects.toThrow('workspace first');
    await host.handle(peer, { type: 'session.create', workspaceId: workspace.id, model: 'discovered' }); expect(calls.find(c => c.method === 'thread/start')!.params).toEqual({ cwd: canonical, model: 'discovered' });
    expect(store.canvas(raw.id).objects.filter(o => o.type === 'conversation')).toHaveLength(1);
  } finally { store.close(); await rm(dir, { recursive: true }); }
});
test('local protocol rejects arbitrary RPC, geometry field injection and cross-origin access', () => {
  expect(() => parseClientMessage('{"method":"command/exec","params":{}}')).toThrow();
  expect(() => parseClientMessage('{"type":"command.exec"}')).toThrow();
  expect(() => parseClientMessage('{"type":"canvas.update","threadId":"a","objectId":"b","patch":{"threadId":"c"}}')).toThrow();
  expect(trustedRequest(new Request('http://127.0.0.1:3030/api/bootstrap', { headers: { origin: 'https://evil.example' } }), 3030)).toBe(false);
  expect(trustedRequest(new Request('http://attacker.example:3030/api/bootstrap'), 3030)).toBe(false);
  expect(trustedRequest(new Request('http://127.0.0.1:3030/api/bootstrap', { headers: { origin: 'http://127.0.0.1:3030' } }), 3030)).toBe(true);
});
test('paginated histories hydrate all turns and resume without duplicate items', async () => {
  const store = new Store(':memory:'); const workspace = await store.addWorkspace('Repository', process.cwd());
  const calls: { method: string; params: any }[] = [];
  const rawTurn = (id: string, text: string) => ({ id, status: 'completed', items: [{ id: `item-${id}`, type: 'agentMessage', text }] });
  const raw = { id: 'paginated-thread', cwd: workspace.path, historyMode: 'paginated', turns: [], updatedAt: 0 };
  const rpc = { async request<T>(method: string, params: any): Promise<T> {
    calls.push({ method, params });
    if (method === 'thread/read') { if (params.includeTurns) throw new Error('Full read unavailable for paginated history'); return { thread: raw } as T; }
    if (method === 'thread/turns/list') return { data: [rawTurn(params.cursor ? 'two' : 'one', 'History')], nextCursor: params.cursor ? null : 'page-two' } as T;
    if (method === 'thread/resume') return { thread: { ...raw, turns: [rawTurn('two', 'Authoritative latest item')] }, model: 'codex', sandbox: {} } as T;
    return { config: {} } as T;
  }, respond() {}, reject() {} };
  try {
    const host = new Host(store, () => rpc); host.status = 'ready'; const peer: Peer = { send() {} };
    await host.handle(peer, { type: 'session.open', workspaceId: workspace.id, threadId: raw.id });
    const thread = host.sessions.get(raw.id)!.thread;
    expect(thread.turns).toHaveLength(2); expect(thread.turns[1]!.items).toHaveLength(1); expect(thread.turns[1]!.items[0]!.text).toBe('Authoritative latest item');
    expect(calls.filter(c => c.method === 'thread/turns/list')).toHaveLength(2); expect(calls.find(c => c.method === 'thread/resume')!.params).toEqual({ threadId: raw.id });
  } finally { store.close(); }
});
test('authentication remains available if the signed-out model catalog fails', async () => {
  const store = new Store(':memory:'); const out: ServerMessage[] = [];
  const rpc = { async request<T>(method: string): Promise<T> {
    if (method === 'account/read') return { account: null, requiresOpenaiAuth: true } as T;
    if (method === 'model/list') throw new Error('Authenticate to list models');
    if (method === 'account/login/start') return { authUrl: 'https://auth.openai.com/authorize' } as T;
    throw new Error('Unexpected RPC');
  }, respond() {}, reject() {} };
  try {
    const host = new Host(store, () => rpc); const peer: Peer = { send: message => out.push(message) }; host.peers.add(peer);
    await host.refresh(); host.state('ready'); expect(host.requiresAuth).toBe(true);
    await host.handle(peer, { type: 'auth.login' }); expect(out.at(-1)).toEqual({ type: 'auth.url', url: 'https://auth.openai.com/authorize' });
  } finally { store.close(); }
});
