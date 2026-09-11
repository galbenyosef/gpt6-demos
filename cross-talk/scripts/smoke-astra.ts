// Opt-in network smoke test; reads OPENAI_API_KEY from Bun's environment/.env.
import OpenAI from 'openai';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { AstraAgent } from '../src/openai/AstraAgent';
import { europaManifest } from '../../edificio-europa/crosstalk/manifest';
import { EuropaController } from '../../edificio-europa/crosstalk/EuropaController';
import { createEuropaCrosstalkAdapter } from '../../edificio-europa/crosstalk/adapter';
if (!process.env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY in .env.');
const controller = new EuropaController({ async setPerspective() {}, setLighting() {}, setAutoRotate() {}, adjustZoom() {}, capture() {}, getZoomLevel: () => 'normal' });
controller.setReady(true);
const adapter = createEuropaCrosstalkAdapter(controller);
const agent = new AstraAgent(new OpenAI({ maxRetries: 0, timeout: 60_000 }), process.env.CROSSTALK_REASONING_MODEL ?? 'gpt-6-astra');
const registration = { manifest: europaManifest, tools: adapter.tools.map(t => t.definition), state: controller.getState() };
const cases = [
  { request: 'Show it at sunset.', tool: 'set_lighting', input: { lighting: 'golden' } },
  { request: 'Go back to the entrance.', tool: 'show_perspective', input: { perspective: 'street' } },
  { request: 'What view am I looking at?', tool: undefined },
];
for (const item of cases) {
  const reply = await agent.respond(registration, [{ role: 'user', content: JSON.stringify({ conversation: [{ role: 'user', text: item.request }], currentState: controller.getState() }) }], AbortSignal.timeout(60_000));
  if (item.tool) {
    const call = reply.calls[0];
    if (call?.name !== item.tool || JSON.stringify(call.arguments) !== JSON.stringify(item.input)) throw new Error(`Unexpected routing for ${item.request}: ${JSON.stringify(reply.calls)}`);
    if (item.tool === 'set_lighting') {
      const continuation = await agent.respond(registration, [{ role: 'user', content: 'Show it at sunset.' }, ...reply.output as ResponseInputItem[], { type: 'function_call_output', call_id: call.id, output: JSON.stringify({ result: { ok: true, data: { lighting: 'golden' } }, currentState: { ...controller.getState(), lighting: 'golden' } }) }], AbortSignal.timeout(60_000));
      if (!continuation.text || continuation.calls.length) throw new Error('Expected a spoken completion after the tool result.');
    }
  } else if (reply.calls.length || !reply.text) throw new Error('Expected a grounded state answer without a tool.');
  console.log(JSON.stringify({ case: item.request, passed: true, tools: reply.calls.map(c => c.name) }));
}
