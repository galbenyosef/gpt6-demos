import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, relative, extname } from 'node:path';
import type { ClientMessage, ServerMessage, Thread, Context, Model, SessionEvent } from '../shared/types';
import { preferredModel } from '../shared/types';
import { activeTurn, applyEvent } from '../shared/state';
import { Store } from './persistence/Store';
import type { Rpc } from './codex/CodexRpcClient';
import { normalizeContext, normalizeEvent, normalizeItem, normalizeThread } from './codex/CodexProtocol';
import { Approvals } from './codex/Approvals';
export interface Peer { send: (message: ServerMessage) => void; workspaceId?: string; threadId?: string }
interface Loaded { thread: Thread; workspaceId: string; context: Context }
export class Host {
  peers = new Set<Peer>();
  sessions = new Map<string, Loaded>();
  private opening = new Map<string, Promise<Loaded>>();
  private startingTurns = new Set<string>();
  models: Model[] = [];
  account: string | null = null;
  requiresAuth = true;
  status: 'starting' | 'ready' | 'disconnected' = 'starting';
  detail?: string;
  approvals: Approvals;
  restart: () => Promise<void> = async () => {};
  constructor(readonly store: Store, private rpc: () => Rpc) {
    this.approvals = new Approvals(rpc, approval => this.broadcast({ type: 'approval.request', approval }, approval.threadId), (requestId, threadId) => this.broadcast({ type: 'approval.resolved', requestId, threadId }, threadId));
  }
  broadcast(message: ServerMessage, threadId?: string) { for (const peer of this.peers) if (!threadId || peer.threadId === threadId) peer.send(message); }
  state(status: typeof this.status, detail?: string) {
    this.status = status; this.detail = detail;
    if (status === 'disconnected') { this.approvals.clear(); this.sessions.clear(); }
    this.broadcast({ type: 'connection.state', status, detail });
  }
  async refresh() {
    const [account, models] = await Promise.all([this.rpc().request('account/read', {}), this.pages('model/list', {}).catch(error => { this.broadcast({ type: 'error', category: 'Model discovery', message: String(error) }); return []; })]);
    this.models = models.filter((m: any) => !m.hidden).map((m: any) => ({ id: m.id, model: m.model, displayName: m.displayName, isDefault: m.isDefault, supportedReasoningEfforts: m.supportedReasoningEfforts, defaultReasoningEffort: m.defaultReasoningEffort }));
    this.account = account.account?.type === 'chatgpt' ? account.account.email ?? 'ChatGPT account' : account.account ? `Codex · ${account.account.type}` : null;
    this.requiresAuth = account.requiresOpenaiAuth !== false && !account.account;
    this.broadcastApp();
  }
  private async pages(method: string, params: Record<string, unknown>): Promise<any[]> {
    const all: any[] = []; let cursor: string | undefined; const seen = new Set<string>();
    do {
      const page = await this.rpc().request(method, { ...params, limit: 100, ...(cursor ? { cursor } : {}) });
      all.push(...page.data); cursor = page.nextCursor ?? undefined;
      if (cursor && seen.has(cursor)) throw new Error(`Repeated pagination cursor from ${method}`);
      if (cursor) seen.add(cursor);
    } while (cursor);
    return all;
  }
  private appState(): ServerMessage { return { type: 'app.state', workspaces: this.store.workspaces(), models: this.models, account: this.account, requiresAuth: this.requiresAuth }; }
  private broadcastApp() { this.broadcast(this.appState()); }
  notification(method: string, params: any) {
    if (method === 'account/updated' || method === 'account/login/completed') {
      if (params.success === false) this.broadcast({ type: 'error', category: 'Authentication', message: params.error ?? 'Codex sign-in failed' });
      void this.refresh().catch(error => this.broadcast({ type: 'error', category: 'Authentication', message: String(error) }));
    }
    if (method === 'serverRequest/resolved') this.approvals.resolveWire(params.requestId);
    if (method === 'error') this.broadcast({ type: 'error', category: 'Codex turn', message: params.error?.message ?? 'Codex reported a turn error', threadId: params.threadId }, params.threadId);
    const event = normalizeEvent(method, params); if (!event) return;
    this.event(event);
  }
  private event(event: SessionEvent) {
    const loaded = this.sessions.get(event.threadId);
    if (!loaded) return;
    applyEvent(loaded.thread, event);
    if (event.kind === 'item') {
      try { const object = this.store.reconcile(event.threadId, event.turnId, event.item); if (object) this.broadcast({ type: 'canvas.object', object }, event.threadId); }
      catch (error) { this.broadcast({ type: 'error', category: 'Canvas persistence', message: String(error) }, event.threadId); }
    }
    this.broadcast({ type: 'codex.event', event }, event.threadId);
  }
  private requireSession(peer: Peer, threadId: string) {
    const loaded = this.sessions.get(threadId);
    if (!loaded || peer.threadId !== threadId || peer.workspaceId !== loaded.workspaceId) throw new Error('Open this session in its workspace first');
    return loaded;
  }
  private async checkCwd(cwd: string, workspaceId: string) {
    const workspace = this.store.workspace(workspaceId);
    if (await realpath(cwd) !== workspace.path) throw new Error('Codex thread belongs to another workspace');
    return workspace;
  }
  private async load(threadId: string, workspaceId: string): Promise<Loaded> {
    const cached = this.sessions.get(threadId);
    if (cached) { if (cached.workspaceId !== workspaceId) throw new Error('Session belongs to another workspace'); return cached; }
    const inflight = this.opening.get(threadId);
    if (inflight) { const result = await inflight; if (result.workspaceId !== workspaceId) throw new Error('Session belongs to another workspace'); return result; }
    const promise = (async () => {
      // Validate metadata before any resume, so a browser cannot override another thread's cwd.
      const metadata = await this.rpc().request('thread/read', { threadId, includeTurns: false });
      const workspace = await this.checkCwd(metadata.thread.cwd, workspaceId);
      let rawHistory = metadata.thread;
      if (rawHistory.historyMode === 'paginated') {
        rawHistory = { ...rawHistory, turns: await this.pages('thread/turns/list', { threadId, sortDirection: 'asc', itemsView: 'full' }) };
      } else rawHistory = (await this.rpc().request('thread/read', { threadId, includeTurns: true })).thread;
      const config = await this.rpc().request('config/read', { cwd: workspace.path, includeLayers: false }).catch(() => ({ config: {} }));
      this.store.attach(threadId, workspaceId);
      const resumed = await this.rpc().request('thread/resume', { threadId });
      // Metadata was canonicalized before resume. No async gap between snapshot and live subscription.
      if (resumed.thread.cwd !== metadata.thread.cwd) throw new Error('Codex changed the thread workspace while resuming');
      const raw = { ...resumed.thread, turns: rawHistory.turns ?? [] };
      const loaded = { thread: normalizeThread(raw), workspaceId, context: normalizeContext(resumed, config.config) };
      for (const rawTurn of resumed.thread.turns ?? []) {
        const event = normalizeEvent('turn/started', { threadId, turn: rawTurn });
        if (event) applyEvent(loaded.thread, event);
      }
      for (const turn of loaded.thread.turns) for (const item of turn.items) this.store.reconcile(threadId, turn.id, item);
      this.sessions.set(threadId, loaded);
      // Recreate optional file views from their Codex-reported paths, never a saved copy of contents.
      for (const object of this.store.canvas(threadId).objects) {
        if (object.type !== 'file' || !object.itemId?.startsWith('file:')) continue;
        const path = object.itemId.slice(5), turn = loaded.thread.turns.find(t => t.id === object.turnId);
        if (!turn?.items.some(i => i.changes?.some(c => c.path === path))) continue;
        try {
          const file = Bun.file(await this.safePath(loaded, path));
          if (file.size <= 2 * 1024 * 1024) applyEvent(loaded.thread, { kind: 'item', threadId, turnId: turn.id, item: { id: object.itemId, type: 'file', path, text: await file.text() } });
        } catch { /* Missing/deleted files keep their layout and show an unavailable state. */ }
      }
      return loaded;
    })();
    this.opening.set(threadId, promise);
    try { return await promise; } finally { this.opening.delete(threadId); }
  }
  async handle(peer: Peer, message: ClientMessage) {
    if (message.type === 'app.init') { peer.send({ type: 'connection.state', status: this.status, detail: this.detail }); peer.send(this.appState()); return; }
    if (message.type === 'codex.restart') { if (this.status === 'disconnected') await this.restart(); return; }
    if (message.type === 'workspace.add') {
      await this.store.addWorkspace(message.name, message.path); this.broadcastApp(); return;
    }
    if (this.status !== 'ready') throw new Error('Codex is disconnected. Restart Codex before continuing.');
    switch (message.type) {
      case 'auth.login': {
        const response = await this.rpc().request('account/login/start', { type: 'chatgpt' });
        if (typeof response.authUrl !== 'string') throw new Error('Codex did not return a sign-in URL');
        peer.send({ type: 'auth.url', url: response.authUrl }); break;
      }
      case 'workspace.open': {
        const workspace = this.store.workspace(message.workspaceId);
        if (peer.workspaceId !== workspace.id) peer.threadId = undefined;
        peer.workspaceId = workspace.id;
        const page = await this.rpc().request('thread/list', { cwd: workspace.path, limit: 50, sortKey: 'updated_at', ...(message.search ? { searchTerm: message.search } : {}), ...(message.cursor ? { cursor: message.cursor } : {}) });
        // Absence from one list page is not evidence that a thread has been deleted.
        const orphans: string[] = [];
        if (!message.cursor && !message.search) for (const id of this.store.canvasIds(workspace.id)) {
          if (page.data.some((t: any) => t.id === id) || this.sessions.has(id)) continue;
          try { await this.rpc().request('thread/read', { threadId: id, includeTurns: false }); }
          catch (error) { if (/not found|does not exist|no rollout/i.test(String(error))) orphans.push(id); }
        }
        peer.send({ type: 'workspace.state', workspaceId: workspace.id, threads: page.data.filter((t: any) => t.cwd === workspace.path).map(normalizeThread), nextCursor: page.nextCursor ?? null, append: !!message.cursor, orphans }); break;
      }
      case 'session.create': {
        const workspace = this.store.workspace(message.workspaceId);
        const model = message.model ? this.models.find(m => m.model === message.model) : preferredModel(this.models);
        if (!model) throw new Error('No supported model available. Check Codex authentication.');
        const response = await this.rpc().request('thread/start', { cwd: workspace.path, model: model.model });
        await this.checkCwd(response.thread.cwd, workspace.id);
        const config = await this.rpc().request('config/read', { cwd: workspace.path, includeLayers: false }).catch(() => ({ config: {} }));
        const loaded = { thread: normalizeThread(response.thread), workspaceId: workspace.id, context: normalizeContext(response, config.config) };
        this.sessions.set(loaded.thread.id, loaded); this.store.attach(loaded.thread.id, workspace.id);
        peer.workspaceId = workspace.id; peer.threadId = loaded.thread.id; this.sendSession(peer, loaded); break;
      }
      case 'session.open': {
        const loaded = await this.load(message.threadId, message.workspaceId);
        peer.workspaceId = message.workspaceId; peer.threadId = message.threadId; this.sendSession(peer, loaded); break;
      }
      case 'turn.start': case 'turn.steer': {
        const loaded = this.requireSession(peer, message.threadId);
        if (!message.text.trim()) throw new Error('Message cannot be empty');
        const active = activeTurn(loaded.thread);
        const input = [{ type: 'text', text: message.text, text_elements: [] }];
        if (message.type === 'turn.steer') {
          if (!active) throw new Error('That turn has finished. Send your message as a new turn.');
          await this.rpc().request('turn/steer', { threadId: message.threadId, expectedTurnId: active.id, input, clientUserMessageId: message.clientId });
        } else {
          if (active || this.startingTurns.has(message.threadId)) throw new Error('A turn is already running. Add to the current turn or stop it.');
          const model = this.models.find(m => m.model === (message.model ?? loaded.context.model));
          if (!model) throw new Error('Select a supported model');
          if (message.effort && !model.supportedReasoningEfforts.some(e => e.reasoningEffort === message.effort)) throw new Error('Unsupported reasoning effort');
          this.startingTurns.add(message.threadId);
          try {
            const result = await this.rpc().request('turn/start', { threadId: message.threadId, input, clientUserMessageId: message.clientId, model: model.model, ...(message.effort ? { effort: message.effort } : {}) });
            loaded.context.model = model.model; loaded.context.effort = message.effort;
            const turn = loaded.thread.turns.find(t => t.id === result.turn.id);
            if (!turn) this.event({ kind: 'turn', threadId: message.threadId, turn: { id: result.turn.id, status: result.turn.status, items: (result.turn.items ?? []).map(normalizeItem) } });
          } finally { this.startingTurns.delete(message.threadId); }
        }
        peer.send({ type: 'turn.accepted', threadId: message.threadId, clientId: message.clientId }); break;
      }
      case 'turn.stop': {
        const loaded = this.requireSession(peer, message.threadId), turn = activeTurn(loaded.thread);
        if (turn) await this.rpc().request('turn/interrupt', { threadId: message.threadId, turnId: turn.id }); break;
      }
      case 'approval.respond': this.requireSession(peer, message.threadId); this.approvals.respond(message.requestId, message.threadId, message.decision, message.answers, message.content); break;
      case 'canvas.update': {
        this.requireSession(peer, message.threadId); const object = this.store.update(message.threadId, message.objectId, message.patch);
        this.broadcast({ type: 'canvas.object', object }, message.threadId); break;
      }
      case 'canvas.viewport': this.requireSession(peer, message.threadId); this.store.viewport(message.threadId, message.camera); break;
      case 'canvas.remove': {
        this.store.workspace(message.workspaceId);
        try { await this.rpc().request('thread/read', { threadId: message.threadId, includeTurns: false }); throw new Error('Codex thread still exists; its canvas cannot be removed as orphaned metadata'); }
        catch (error) { if (!/not found|does not exist|no rollout/i.test(String(error))) throw error; }
        this.store.remove(message.threadId, message.workspaceId); break;
      }
      case 'file.open': {
        const loaded = this.requireSession(peer, message.threadId);
        const turn = loaded.thread.turns.find(t => t.id === message.turnId);
        if (!turn?.items.some(i => i.changes?.some(c => c.path === message.path))) throw new Error('This file is not part of the selected turn');
        const path = await this.safePath(loaded, message.path);
        const file = Bun.file(path); if (file.size > 2 * 1024 * 1024) throw new Error('File preview is limited to 2 MB');
        this.event({ kind: 'item', threadId: message.threadId, turnId: message.turnId, item: { id: `file:${message.path}`, type: 'file', path: message.path, text: await file.text() } }); break;
      }
    }
  }
  private sendSession(peer: Peer, loaded: Loaded) { peer.send({ type: 'session.state', ...loaded, canvas: this.store.canvas(loaded.thread.id), approvals: this.approvals.list(loaded.thread.id) }); }
  private async safePath(loaded: Loaded, path: string) {
    const root = this.store.workspace(loaded.workspaceId).path;
    const target = await realpath(isAbsolute(path) ? path : resolve(root, path));
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('File preview is outside the workspace');
    if (!(await stat(target)).isFile()) throw new Error('Preview path is not a file');
    return target;
  }
  async image(threadId: string, itemId: string) {
    const loaded = this.sessions.get(threadId); if (!loaded) throw new Error('Open this session first');
    const item = loaded.thread.turns.flatMap(t => t.items).find(i => i.id === itemId && ['imageView', 'imageGeneration'].includes(i.type));
    if (!item || typeof item.path !== 'string') throw new Error('Image not found');
    // Only a Codex-produced image item can authorize a preview, including generated images in /tmp.
    const target = await realpath(resolve(this.store.workspace(loaded.workspaceId).path, item.path));
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(extname(target).toLowerCase())) throw new Error('Unsupported image format');
    const file = Bun.file(target); if (file.size > 25 * 1024 * 1024) throw new Error('Image exceeds 25 MB');
    return file;
  }
}
