import { test, expect } from 'bun:test';
import { Approvals } from '../src/server/codex/Approvals';
import type { Approval } from '../src/shared/types';
test('command, file, network and permissions approval decisions preserve original IDs and thread scope', () => {
  const writes: any[] = [], published: Approval[] = [], resolved: string[] = [];
  const approvals = new Approvals(() => ({ request: async () => ({} as any), respond: (id, result) => { writes.push({ id, result }); }, reject: () => {} }), a => published.push(a), id => resolved.push(id));
  for (const [index, method] of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/commandExecution/requestApproval', 'item/permissions/requestApproval'].entries()) {
    approvals.receive({ id: `server-${index}`, method, params: { threadId: `thread-${index}`, turnId: 'turn', command: 'bun install', networkApprovalContext: index === 2 ? { host: 'registry.npmjs.org', protocol: 'https' } : null, permissions: { network: { enabled: true }, fileSystem: null } } });
  }
  expect(published[2]!.kind).toBe('network'); expect(published[2]!.detail).toContain('registry.npmjs.org'); expect(approvals.list('thread-0')).toHaveLength(1);
  expect(() => approvals.respond(published[0]!.id, 'thread-1', 'accept')).toThrow('this session'); expect(writes).toHaveLength(0);
  approvals.respond(published[0]!.id, 'thread-0', 'acceptForSession'); expect(writes[0]).toEqual({ id: 'server-0', result: { decision: 'acceptForSession' } });
  expect(approvals.list('thread-1')).toHaveLength(1); expect(approvals.list('thread-0')).toHaveLength(0);
  approvals.respond(published[1]!.id, 'thread-1', 'decline'); approvals.respond(published[2]!.id, 'thread-2', 'accept'); approvals.respond(published[3]!.id, 'thread-3', 'accept');
  expect(writes[3].result).toEqual({ permissions: { network: { enabled: true } }, scope: 'turn' }); expect(resolved).toHaveLength(4);
  expect(() => approvals.respond(published[0]!.id, 'thread-0', 'accept')).toThrow('no longer pending');
});
test('server resolution clears request; unsupported requests fail explicitly', () => {
  const rejected: any[] = [], published: Approval[] = [];
  const approvals = new Approvals(() => ({ request: async () => ({} as any), respond: () => {}, reject: (id, message) => rejected.push({ id, message }) }), a => published.push(a), () => {});
  approvals.receive({ id: 12, method: 'item/tool/call', params: {} }); expect(rejected).toHaveLength(1);
  approvals.receive({ id: 13, method: 'item/fileChange/requestApproval', params: { threadId: 'thread' } }); approvals.resolveWire(13); expect(approvals.list('thread')).toHaveLength(0);
});
