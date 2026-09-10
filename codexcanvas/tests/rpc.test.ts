import { test, expect } from 'bun:test';
import { CodexRpcClient } from '../src/server/codex/CodexRpcClient';
import { CodexProcess } from '../src/server/codex/CodexProcess';
test('RPC matches out-of-order IDs, fragmented JSONL, notifications and server requests', async () => {
  const writes: string[] = [], notifications: unknown[] = [], requests: unknown[] = [];
  const rpc = new CodexRpcClient(line => { writes.push(line); });
  rpc.onNotification = (method, params) => notifications.push({ method, params }); rpc.onRequest = request => requests.push(request);
  const first = rpc.request('first'), second = rpc.request('second');
  expect(JSON.parse(writes[0]!).id).toBe(1);
  rpc.feed('{"id":2,"result":"second"}\n{"method":"event",');
  rpc.feed('"params":{"x":1}}\n{"method":"approve","id":"approval-1","params":{}}\n{"id":1,"result":"first"}\n');
  expect(await first).toBe('first'); expect(await second).toBe('second'); expect(notifications).toHaveLength(1); expect(requests).toHaveLength(1);
  rpc.respond('approval-1', { decision: 'accept' }); expect(JSON.parse(writes.at(-1)!)).toEqual({ id: 'approval-1', result: { decision: 'accept' } }); rpc.close();
});
test('RPC handles malformed lines, errors, timeouts and process exit', async () => {
  const rpc = new CodexRpcClient(() => {}, 10); let malformed = 0; rpc.onMalformed = () => malformed++;
  rpc.feed('not json\nnull\n{}\n'); expect(malformed).toBe(3);
  const error = rpc.request('error'); rpc.feed('{"id":1,"error":{"message":"failed"}}\n'); await expect(error).rejects.toThrow('failed');
  await expect(rpc.request('timeout')).rejects.toThrow('timed out');
  const pending = rpc.request('pending'); rpc.close(); await expect(pending).rejects.toThrow('exited'); await expect(rpc.request('closed')).rejects.toThrow('disconnected');
});
test('process initializes once and can reconnect after exit', async () => {
  const process = new CodexProcess([Bun.which('bun')!, 'tests/fixtures/rpc-process.ts']);
  await process.start(); expect(await process.rpc!.request<{ ok: boolean }>('ping')).toEqual({ ok: true });
  process.stop(); await process.start(); expect(await process.rpc!.request<{ ok: boolean }>('ping')).toEqual({ ok: true }); process.stop();
});
