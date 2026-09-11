// Test-only host: no OpenAI calls; browser tools execute through the real router.
import page from '../../edificio-europa/index.html';
import { CrosstalkServer, type CrosstalkSocketData } from '../src/server';
import { ToolRouter } from '../src/server/ToolRouter';
process.env.CROSSTALK_DEBUG = 'true';
const logs: { event: string; fields?: Record<string, unknown> }[] = [];
const crosstalk = new CrosstalkServer({ logger: (event, fields) => { logs.push({ event, fields }); if (process.env.CROSSTALK_LIVE_SMOKE === '1' || event.includes('error') || event.includes('failed')) console.error(event, fields); } });
const instances = new Set<string>();
const active = new Map<string, { controller: AbortController; delegationId: string }>();
const router = new ToolRouter();
Bun.serve<CrosstalkSocketData>({
  hostname: '127.0.0.1', port: 3019, routes: { '/': page },
  websocket: { ...crosstalk.websocket,
    message(ws, raw) { crosstalk.websocket.message(ws, raw); if (ws.data.app) instances.add(ws.data.app.instanceId); },
    close(ws, code, reason) { if (ws.data.app) instances.delete(ws.data.app.instanceId); crosstalk.websocket.close?.(ws, code, reason); },
  },
  async fetch(req, server) {
    const path = new URL(req.url).pathname;
    if (path === '/test/logs') return Response.json(logs);
    if (path === '/test/sunset.wav') return new Response(Bun.file(new URL('./fixtures/sunset.wav', import.meta.url)));
    if (path === '/test/instances') return Response.json([...instances]);
    if (path === '/test/invoke') {
      const { instanceId, tool, args, explicit = true } = await req.json();
      const app = crosstalk.registry.get(instanceId);
      const old = active.get(instanceId); if (old) { old.controller.abort(); app.send({ type: 'delegation.cancel', delegationId: old.delegationId }); }
      const controller = new AbortController(), delegationId = crypto.randomUUID(); active.set(instanceId, { controller, delegationId });
      const result = await router.invoke(app, delegationId, tool, args, explicit, controller.signal);
      if (active.get(instanceId)?.controller === controller) active.delete(instanceId);
      return Response.json({ result, state: app.lastKnownState });
    }
    if (path === '/test/state') return Response.json(await crosstalk.registry.get(new URL(req.url).searchParams.get('id')!).requestState());
    if (path.startsWith('/crosstalk/')) return crosstalk.handler(req, server);
    if (path.startsWith('/stock-images/') && !path.includes('..')) return new Response(Bun.file(new URL('../../edificio-europa' + path, import.meta.url)));
    return new Response('Not found', { status: 404 });
  },
});
