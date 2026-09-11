import { test, expect } from 'bun:test';
import OpenAI from 'openai';
import { AstraAgent } from '../src/openai/AstraAgent';
import { fixture } from './fixtures';

test('Astra uses stateless strict function calls and preserves replayable tool output', async () => {
  let body: any;
  const client = new OpenAI({ apiKey: 'test-key', maxRetries: 0, fetch: (async (_url: unknown, options: RequestInit) => {
    body = JSON.parse(options.body as string);
    return Response.json({ id: 'resp_test', object: 'response', status: 'completed', output: [{ type: 'function_call', id: 'fc_test', call_id: 'call_test', status: 'completed', name: 'set_lighting', arguments: JSON.stringify({ input: { lighting: 'golden' }, explicitUserRequest: true }) }] });
  }) as unknown as typeof fetch });
  const f = fixture(); const result = await new AstraAgent(client).respond(f.registration, [{ role: 'user', content: 'Show it at sunset.' }], new AbortController().signal);
  expect(body.model).toBe('gpt-6-astra'); expect(body.store).toBe(false); expect(body.parallel_tool_calls).toBe(false); expect(body.tools[0].strict).toBe(true);
  expect(body.tools[0].parameters.required).toEqual(['input', 'explicitUserRequest']);
  expect(result.calls).toEqual([{ id: 'call_test', name: 'set_lighting', arguments: { lighting: 'golden' }, explicitUserRequest: true }]);
  expect(result.output[0]).toMatchObject({ type: 'function_call', call_id: 'call_test' });
});

test('incomplete reasoning cannot be mistaken for a completed application goal', async () => {
  const client = new OpenAI({ apiKey: 'test-key', fetch: (async () => Response.json({ id: 'resp_test', object: 'response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] })) as unknown as typeof fetch });
  await expect(new AstraAgent(client).respond(fixture().registration, [], new AbortController().signal)).rejects.toThrow('Reasoning did not complete');
});
