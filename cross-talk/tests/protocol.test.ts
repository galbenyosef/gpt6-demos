import { test, expect } from 'bun:test';
import { CrosstalkServer, type CrosstalkSocketData } from '../src/server';
import type { ServerMessage } from '../src/protocol';
import { fixture } from './fixtures';
import type { LiveEvent } from '../src/openai/OpenAILiveAdapter';

test('Bun handshake, origin, session binding, delegation and disconnect lifecycle', async () => {
  let onLiveEvent: ((event: LiveEvent) => void) | undefined, closed = 0, replies = 0;
  const commentary: string[] = [];
  const crosstalk = new CrosstalkServer({ logger: () => {}, liveAdapter: { async connect(sdp, onEvent) { expect(sdp).toBe('browser-offer'); onLiveEvent = onEvent; return { id: 'live_opaque', sdp: 'answer', commentary(_, text) { commentary.push(text); }, async close() { closed++; } }; } }, astraAgent: { async respond(_, input) {
    if (++replies === 1) { expect(JSON.stringify(input)).toContain('sunset'); return { output: [], text: '', calls: [{ id: 'call', name: 'set_lighting', arguments: { lighting: 'golden' }, explicitUserRequest: true }] }; }
    expect(JSON.stringify(input)).toContain('golden'); return { output: [], text: 'Golden hour is visible.', calls: [] };
  } } });
  const server = Bun.serve<CrosstalkSocketData>({ hostname: '127.0.0.1', port: 0, fetch: crosstalk.handler, websocket: crosstalk.websocket });
  const origin = `http://127.0.0.1:${server.port}`;
  const Socket = WebSocket as unknown as { new(url: string, options: Bun.WebSocketOptions): WebSocket };
  const ws = new Socket(origin.replace('http', 'ws') + '/crosstalk/ws', { headers: { Origin: origin } });
  const f = fixture(); const instanceId = crypto.randomUUID(); let token = ''; let sessionId = '';
  const waiters = new Map<string, (m: ServerMessage) => void>();
  const waitFor = (type: string) => new Promise<ServerMessage>((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Timed out: ${type}`)), 2000); waiters.set(type, m => { clearTimeout(timer); resolve(m); }); });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data) as ServerMessage; waiters.get(message.type)?.(message);
    if (message.type === 'server.hello') { token = message.token; sessionId = message.sessionId; ws.send(JSON.stringify({ type: 'application.register', ...f.registration })); }
    if (message.type === 'state.request') ws.send(JSON.stringify({ type: 'state.result', requestId: message.requestId, state: f.state }));
    if (message.type === 'tool.invoke') { f.state.lighting = (message.arguments as any).lighting; ws.send(JSON.stringify({ type: 'tool.result', invocationId: message.invocationId, result: { ok: true, data: { lighting: 'golden' }, stateChanged: true } })); }
  };
  try {
    await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error('WebSocket failed')); });
    const registered = waitFor('application.registered'); ws.send(JSON.stringify({ type: 'client.hello', protocolVersion: '1.0', instanceId, application: { id: 'test-app', version: '1' } })); await registered;
    expect(sessionId).not.toBe('');
    const body = JSON.stringify({ applicationInstanceId: instanceId, sdp: 'browser-offer' });
    const request = (auth: string, originHeader = origin) => fetch(origin + '/crosstalk/live/session', { method: 'POST', headers: { Origin: originHeader, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body });
    expect((await request(token, 'https://evil.example')).status).toBe(403); expect((await request('another-tab-token')).status).toBe(403);
    const started = await request(token); expect(started.status).toBe(201); expect(await started.json()).toEqual({ sdp: 'answer' });
    onLiveEvent!({ type: 'transcript', role: 'user', text: 'Show it at sunset.', startMs: 0, endMs: 500 });
    const done = new Promise<void>((resolve, reject) => { const start = Date.now(); const timer = setInterval(() => { if (commentary.length) { clearInterval(timer); resolve(); } else if (Date.now() - start > 2000) { clearInterval(timer); reject(new Error('Delegation timed out')); } }, 5); });
    onLiveEvent!({ type: 'delegation', id: 'item_sunset', offsetMs: 600 }); await done;
    expect(f.state.lighting).toBe('golden'); expect(commentary).toEqual(['Golden hour is visible.']);
    const error = waitFor('error'); ws.send(JSON.stringify({ type: 'execute_javascript', source: 'bad' })); await error;
    ws.close(); await new Promise(resolve => setTimeout(resolve, 20)); expect(closed).toBe(1); expect(() => crosstalk.registry.get(instanceId)).toThrow();
  } finally { ws.close(); await crosstalk.dispose(); server.stop(true); }
});
