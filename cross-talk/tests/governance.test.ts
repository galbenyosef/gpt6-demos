import { describe, test, expect } from 'bun:test';
import { fixture, invocation } from './fixtures';
import { ToolExecutor } from '../src/client/ToolExecutor';
import { ApplicationRegistry, RegisteredApplication } from '../src/server/ApplicationRegistry';
import { ToolRouter } from '../src/server/ToolRouter';
import { validateRegistration, strictInputSchema, normalizeArguments, validate } from '../src/protocol/validation';
import type { ServerMessage } from '../src/protocol';

describe('application contract and execution boundary', () => {
  test('rejects malformed manifests, duplicate tools, open schemas and invalid initial state', () => {
    const { registration } = fixture(); validateRegistration(registration);
    for (const invalid of [ { ...registration, manifest: {} }, { ...registration, tools: [...registration.tools, ...registration.tools] }, { ...registration, tools: [{ ...registration.tools[0], inputSchema: { type: 'object' } }] }, { ...registration, state: { ready: 'yes' } } ]) expect(() => validateRegistration(invalid)).toThrow();
  });
  test('unknown tools, invalid enums and extra arguments never reach the application', async () => {
    const f = fixture(), executor = new ToolExecutor(f.application, 'session-1');
    for (const call of [invocation({ tool: 'execute_javascript' }), invocation({ arguments: { lighting: 'sunset' } }), invocation({ arguments: { lighting: 'golden', code: 'unsafe' } })]) expect((await executor.execute(call)).ok).toBe(false);
    expect(f.executions()).toBe(0);
  });
  test('simultaneous and completed duplicate external invocations execute once', async () => {
    const f = fixture(); f.definition.effect = 'external'; f.definition.confirmation = 'when-not-explicit';
    const executor = new ToolExecutor(f.application, 'session-1'), call = invocation();
    const results = await Promise.all([executor.execute(call), executor.execute(call), executor.execute(call)]);
    expect(results.every(r => r.ok)).toBe(true); expect(f.executions()).toBe(1);
    expect(await executor.execute(call)).toEqual(results[0]);
    expect((await executor.execute({ ...call, arguments: { lighting: 'blue' } })).ok).toBe(false);
  });
  test('always confirmation requires local approval for exactly this tool and input', async () => {
    const f = fixture(); f.definition.confirmation = 'always'; const executor = new ToolExecutor(f.application, 'session-1');
    expect((await executor.execute(invocation({ confirmed: true }))).ok).toBe(false);
    const call = invocation({ confirmed: true }); executor.approve(call.invocationId, 'another_tool', call.arguments);
    expect((await executor.execute(call)).ok).toBe(false);
    const approved = invocation({ confirmed: true }); executor.approve(approved.invocationId, approved.tool, approved.arguments);
    expect((await executor.execute(approved)).ok).toBe(true); expect(f.executions()).toBe(1);
  });
  test('implicit external calls, unready apps, expired and wrong-session invocations fail closed', async () => {
    const f = fixture(); f.definition.confirmation = 'when-not-explicit'; f.definition.effect = 'external'; const executor = new ToolExecutor(f.application, 'session-1');
    for (const call of [invocation({ explicitUserRequest: false }), invocation({ expiresAt: Date.now() - 1 }), invocation({ sessionId: 'another-tab' })]) expect((await executor.execute(call)).ok).toBe(false);
    f.state.ready = false; expect((await executor.execute(invocation())).ok).toBe(false);
    expect(f.executions()).toBe(0);
  });
  test('cancelled delegations and disposed executors cannot perform late actions', async () => {
    const f = fixture(), executor = new ToolExecutor(f.application, 'session-1'); executor.cancelDelegation('delegation-1');
    expect((await executor.execute(invocation())).ok).toBe(false);
    executor.dispose(); expect((await executor.execute(invocation({ delegationId: 'new' }))).ok).toBe(false); expect(f.executions()).toBe(0);
  });
  test('strict Responses schemas retain optional adapter inputs using nullable fields', () => {
    const f = fixture(); f.definition.inputSchema = { type: 'object', properties: { direction: { type: 'string' }, amount: { type: 'string' } }, required: ['direction'], additionalProperties: false };
    const schema = strictInputSchema(f.definition); expect(schema.required).toEqual(['direction', 'amount']);
    validate(schema, { direction: 'closer', amount: null }); expect(normalizeArguments(f.definition, { direction: 'closer', amount: null })).toEqual({ direction: 'closer' });
  });
});

describe('server routing', () => {
  test('confirmation refusal does not invoke and success pulls fresh state', async () => {
    const f = fixture(); f.definition.confirmation = 'always'; const sent: ServerMessage[] = []; let approve = false;
    const app = new RegisteredApplication('instance', 'session-1', f.registration, message => {
      sent.push(message);
      if (message.type === 'confirmation.request') queueMicrotask(() => app.receive(message.requestId, 'confirmation', approve));
      if (message.type === 'tool.invoke') queueMicrotask(() => app.receive(message.invocationId, 'tool', { ok: true, data: { lighting: 'golden' }, stateChanged: true }));
      if (message.type === 'state.request') queueMicrotask(() => app.receive(message.requestId, 'state', { ready: true, lighting: 'golden' }));
    });
    const router = new ToolRouter();
    expect((await router.invoke(app, 'd', 'set_lighting', { lighting: 'golden' }, true, new AbortController().signal)).ok).toBe(false);
    expect(sent.some(m => m.type === 'tool.invoke')).toBe(false);
    approve = true;
    expect((await router.invoke(app, 'd', 'set_lighting', { lighting: 'golden' }, true, new AbortController().signal)).ok).toBe(true);
    expect(app.lastKnownState).toEqual({ ready: true, lighting: 'golden' });
    expect((await router.invoke(app, 'd', 'unknown_tool', {}, true, new AbortController().signal)).ok).toBe(false);
    expect((await router.invoke(app, 'd', 'set_lighting', { lighting: 'invalid' }, true, new AbortController().signal)).ok).toBe(false);
  });
  test('requests time out, ignore wrong response kinds, and reject on disconnect', async () => {
    const f = fixture(), app = new RegisteredApplication('instance', 's', f.registration, () => {});
    const pending = app.request('id', 'state', { type: 'state.request', requestId: 'id' }, 15);
    app.receive('id', 'confirmation', true);
    await expect(pending).rejects.toThrow('did not respond'); expect(app.pending.size).toBe(0);
    const disconnected = app.requestState(); app.disconnect(); await expect(disconnected).rejects.toThrow('disconnected'); expect(app.pending.size).toBe(0);
  });
  test('registration cannot replace another tab and responses stay bound to their socket', async () => {
    const f = fixture(), registry = new ApplicationRegistry();
    const a = registry.register('a', 'one', f.registration, () => {}); const b = registry.register('b', 'two', f.registration, () => {});
    expect(() => registry.register('a', 'three', f.registration, () => {})).toThrow();
    const pending = a.request('id', 'state', { type: 'state.request', requestId: 'id' }, 15);
    b.receive('id', 'state', { ready: true, lighting: 'golden' }); await expect(pending).rejects.toThrow();
    registry.unregister('a'); expect(a.closed).toBe(true); expect(b.closed).toBe(false);
  });
});

test('browser rejects malformed invocation envelopes before executing a known tool', async () => {
  const f = fixture(), executor = new ToolExecutor(f.application, 'session-1');
  const call: any = invocation(); delete call.expiresAt;
  expect((await executor.execute(call)).ok).toBe(false);
  expect((await executor.execute({ ...invocation(), confirmed: 'yes' } as any)).ok).toBe(false);
  expect(f.executions()).toBe(0);
});

test('browser timeout settles even when an application handler ignores cancellation', async () => {
  const f = fixture(); f.application.tools[0]!.execute = () => new Promise(() => {});
  const executor = new ToolExecutor(f.application, 'session-1');
  const result = await executor.execute(invocation({ expiresAt: Date.now() + 25 }));
  expect(result).toMatchObject({ ok: false, error: { code: 'TOOL_TIMEOUT' } });
});

test('async schemas cannot bypass synchronous validation', () => {
  const f = fixture(); f.definition.inputSchema.$async = true;
  expect(() => validateRegistration(f.registration)).toThrow('Async schemas');
});

test('a completed effect is not reported as retryable when the state refresh fails', async () => {
  const f = fixture(); const app = new RegisteredApplication('instance', 's', f.registration, message => {
    if (message.type === 'tool.invoke') queueMicrotask(() => app.receive(message.invocationId, 'tool', { ok: true, data: {} }));
    if (message.type === 'state.request') queueMicrotask(() => app.pending.get(message.requestId)?.reject(new Error('State unavailable')));
  });
  const result = await new ToolRouter().invoke(app, 'd', 'set_lighting', { lighting: 'golden' }, true, new AbortController().signal);
  expect(result).toMatchObject({ ok: false, error: { code: 'STATE_UNAVAILABLE_AFTER_ACTION', retryable: false } });
});
