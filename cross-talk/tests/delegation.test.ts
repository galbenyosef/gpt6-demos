import { test, expect } from 'bun:test';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { fixture } from './fixtures';
import { RegisteredApplication } from '../src/server/ApplicationRegistry';
import { ToolRouter } from '../src/server/ToolRouter';
import { DelegationEngine } from '../src/server/DelegationEngine';
import type { AgentResponse, ReasoningAgent } from '../src/openai/AstraAgent';
import { normalizeLiveEvent } from '../src/openai/OpenAILiveAdapter';
const response = (text: string, light?: string): AgentResponse => ({ text, output: [], calls: light ? [{ id: crypto.randomUUID(), name: 'set_lighting', arguments: { lighting: light }, explicitUserRequest: true }] : [] });
function harness(agent: ReasoningAgent, maxCalls = 12) {
  const f = fixture(), calls: string[] = [], commentary: { id: string; text: string }[] = [];
  const app = new RegisteredApplication('instance', 'session', f.registration, message => {
    if (message.type === 'state.request') queueMicrotask(() => app.receive(message.requestId, 'state', { ...f.state }));
    if (message.type === 'tool.invoke') { f.state.lighting = (message.arguments as any).lighting; calls.push(f.state.lighting); queueMicrotask(() => app.receive(message.invocationId, 'tool', { ok: true, data: { lighting: f.state.lighting }, stateChanged: true })); }
  });
  const engine = new DelegationEngine(app, agent, new ToolRouter(), (id, text) => commentary.push({ id, text }), () => {}, maxCalls);
  return { app, engine, calls, commentary };
}
test('sunset tool flow passes manifest and fresh state and returns verified completion', async () => {
  const inputs: ResponseInputItem[][] = [];
  const h = harness({ async respond(registration, input) { expect(registration.manifest.application.id).toBe('test-app'); inputs.push(structuredClone(input)); return inputs.length === 1 ? response('', 'golden') : response('The lighting is now golden hour.'); } });
  await h.engine.handle('sunset', [{ role: 'user', text: 'Show it at sunset.', startMs: 0, endMs: 100 }]);
  expect(h.calls).toEqual(['golden']); expect(JSON.stringify(inputs[0])).toContain('day'); expect(JSON.stringify(inputs[1])).toContain('golden'); expect(h.commentary.at(-1)?.text).toContain('golden hour');
});
test('state-only questions need no application tool and duplicate delegations do not replay', async () => {
  let runs = 0; const h = harness({ async respond() { runs++; return response('You are in daylight.'); } });
  await h.engine.handle('view', []); await h.engine.handle('view', []); expect(runs).toBe(1); expect(h.calls).toEqual([]);
});
test('multi-step work stays sequential and uses one delegation ID for commentary', async () => {
  let step = 0;
  const h = harness({ async respond() { step++; return step === 1 ? response('', 'golden') : step === 2 ? response('The warm light is now visible.', 'blue') : response('Now it is blue hour.'); } });
  await h.engine.handle('tour', []); expect(h.calls).toEqual(['golden', 'blue']); expect(h.commentary.map(c => c.id)).toEqual(['tour', 'tour']);
});
test('new intent cancels old reasoning and suppresses late old actions and commentary', async () => {
  let resolveOld!: (r: AgentResponse) => void, started!: () => void;
  const ready = new Promise<void>(r => started = r); let run = 0;
  const h = harness({ async respond() { if (++run === 1) { started(); return new Promise(r => resolveOld = r); } return response('New request complete.'); } });
  const old = h.engine.handle('old', []); await ready; await h.engine.handle('new', []);
  resolveOld(response('Stale success.', 'blue')); await old;
  expect(h.calls).toEqual([]); expect(h.commentary).toEqual([{ id: 'new', text: 'New request complete.' }]);
});
test('tool-call limit stops runaway model loops', async () => {
  const h = harness({ async respond() { return response('', 'golden'); } }, 2);
  await h.engine.handle('loop', []); expect(h.calls).toHaveLength(2); expect(h.commentary.at(-1)?.text).toContain('limit');
});
test('Live events preserve opaque delegation IDs and timestamped transcript fragments', () => {
  expect(normalizeLiveEvent({ type: 'session.delegation.created', event_id: 'e', offset_ms: 1200, delegation: { type: 'delegation', id: 'item_opaque', target: 'client' } })).toEqual({ type: 'delegation', id: 'item_opaque', offsetMs: 1200 });
  expect(normalizeLiveEvent({ type: 'session.input_transcript.delta', event_id: 'e', delta: 'entrance', start_ms: 100, end_ms: 700 })).toEqual({ type: 'transcript', role: 'user', text: 'entrance', startMs: 100, endMs: 700 });
});
