import type { Approval } from '../../shared/types';
import type { Rpc, RpcRequest } from './CodexRpcClient';
interface Pending { wire: RpcRequest; view: Approval }
export class Approvals {
  private pending = new Map<string, Pending>();
  constructor(private rpc: () => Rpc, private publish: (approval: Approval) => void, private resolved: (id: string, threadId: string) => void) {}
  receive(wire: RpcRequest) {
    const p = wire.params ?? {}, base = { id: crypto.randomUUID(), threadId: p.threadId, turnId: p.turnId, cwd: p.cwd, reason: p.reason, decisions: ['decline', 'accept', 'acceptForSession'] };
    let view: Approval;
    if (wire.method === 'item/commandExecution/requestApproval') {
      const network = p.networkApprovalContext;
      view = { ...base, kind: network ? 'network' : 'command', title: network ? 'Network access requested' : 'Run command', detail: network ? `${network.host}\n${String(network.protocol).toUpperCase()}` : p.command ?? 'Command approval requested', decisions: p.availableDecisions ? p.availableDecisions.filter((d: unknown) => typeof d === 'string' && ['accept', 'acceptForSession', 'decline', 'cancel'].includes(d as string)) : base.decisions };
    } else if (wire.method === 'item/fileChange/requestApproval') view = { ...base, kind: 'file', title: 'Approve file changes', detail: p.reason ?? 'Codex requests permission to apply the file changes for this turn.' };
    else if (wire.method === 'item/permissions/requestApproval') view = { ...base, kind: 'permissions', title: 'Additional permissions requested', detail: JSON.stringify(p.permissions, null, 2) };
    else if (wire.method === 'item/tool/requestUserInput') view = { ...base, kind: 'input', title: 'Codex needs your input', detail: '', questions: p.questions, decisions: ['accept'] };
    else if (wire.method === 'mcpServer/elicitation/request') view = { ...base, kind: 'mcp', title: `${p.serverName} requests input`, detail: p.message, schema: p.requestedSchema, url: p.url, decisions: ['decline', 'accept', 'cancel'] };
    else { this.rpc().reject(wire.id, `Codex Canvas does not implement client request: ${wire.method}`); return; }
    if (typeof view.threadId !== 'string') { this.rpc().reject(wire.id, 'Approval has no thread scope'); return; }
    this.pending.set(view.id, { wire, view }); this.publish(view);
  }
  list(threadId: string) { return [...this.pending.values()].filter(p => p.view.threadId === threadId).map(p => p.view); }
  respond(id: string, threadId: string, decision: string, answers?: Record<string, string>, content?: unknown) {
    const pending = this.pending.get(id);
    if (!pending || pending.view.threadId !== threadId) throw new Error('Approval is no longer pending in this session');
    if (!pending.view.decisions.includes(decision)) throw new Error('Unsupported approval decision');
    const { wire, view } = pending;
    let result: unknown = { decision };
    if (view.kind === 'permissions') {
      const requested = wire.params.permissions;
      result = { permissions: decision.startsWith('accept') ? Object.fromEntries(Object.entries(requested).filter(([, value]) => value !== null)) : {}, scope: decision === 'acceptForSession' ? 'session' : 'turn' };
    } else if (view.kind === 'input') {
      const entries = (view.questions ?? []).map(q => {
        const answer = answers?.[q.id]; if (typeof answer !== 'string' || !answer.trim()) throw new Error('Please answer every question');
        return [q.id, { answers: [answer] }];
      });
      result = { answers: Object.fromEntries(entries) };
    } else if (view.kind === 'mcp') result = { action: decision, content: decision === 'accept' ? content ?? null : null, _meta: null };
    this.rpc().respond(wire.id, result);
    this.pending.delete(id); this.resolved(id, threadId);
  }
  resolveWire(requestId: string | number) {
    for (const [id, p] of this.pending) if (p.wire.id === requestId) { this.pending.delete(id); this.resolved(id, p.view.threadId); }
  }
  clear() { for (const [id, p] of this.pending) this.resolved(id, p.view.threadId); this.pending.clear(); }
}
