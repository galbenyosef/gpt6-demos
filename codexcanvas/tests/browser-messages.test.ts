import { expect, test } from 'bun:test';
import { BrowserMessages } from '../src/server/BrowserMessages';
import type { ClientMessage, ServerMessage } from '../src/shared/types';

const start: ClientMessage = { type: 'turn.start', threadId: 'thread', text: 'Commit changes', clientId: 'draft' };

test('an approval reply unblocks a pending request without waiting behind it', async () => {
  const decision = Promise.withResolvers<void>(), order: string[] = [], errors: ServerMessage[] = [];
  const messages = new BrowserMessages(async message => {
    order.push(message.type);
    if (message.type === 'turn.start') { await decision.promise; order.push('acknowledged'); }
    if (message.type === 'approval.respond') decision.resolve();
  }, message => errors.push(message));
  const running = messages.receive(JSON.stringify(start));
  const layout = messages.receive(JSON.stringify({ type: 'canvas.viewport', threadId: 'thread', camera: { x: 0, y: 0, zoom: 1 } }));
  await Promise.resolve(); expect(order).toEqual(['turn.start']);
  await messages.receive(JSON.stringify({ type: 'approval.respond', threadId: 'thread', requestId: 'request', decision: 'accept' }));
  await Promise.all([running, layout]);
  expect(order).toEqual(['turn.start', 'approval.respond', 'acknowledged', 'canvas.viewport']); expect(errors).toEqual([]);
});

test('Stop is dispatched while another request is pending', async () => {
  const gate = Promise.withResolvers<void>(), order: string[] = [];
  const messages = new BrowserMessages(async message => {
    order.push(message.type);
    if (message.type === 'turn.start') await gate.promise;
    if (message.type === 'turn.stop') gate.resolve();
  }, () => {});
  const running = messages.receive(JSON.stringify(start)); await Promise.resolve();
  await messages.receive(JSON.stringify({ type: 'turn.stop', threadId: 'thread' })); await running;
  expect(order).toEqual(['turn.start', 'turn.stop']);
});

test('request failures retain client correlation and do not poison the next message', async () => {
  const seen: string[] = [], errors: ServerMessage[] = [];
  const messages = new BrowserMessages(async message => {
    seen.push(message.type); if (message.type === 'turn.start') throw new Error('Codex request failed');
  }, message => errors.push(message));
  await messages.receive(JSON.stringify(start));
  await messages.receive('not json');
  await messages.receive(JSON.stringify({ type: 'app.init' }));
  expect(errors[0]).toMatchObject({ type: 'error', clientId: 'draft', threadId: 'thread', message: 'Codex request failed' });
  expect(errors).toHaveLength(2); expect(seen).toEqual(['turn.start', 'app.init']);
});
