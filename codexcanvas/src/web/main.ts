import type { ClientMessage, ServerMessage, Workspace, Thread, Model, Approval, Item, ObjectType, Turn } from '../shared/types';
import { artifactType, objectId, preferredModel } from '../shared/types';
import { automaticId, automaticType, activityItems, failedItem, isSummary, itemStatus, commandFailureHint } from '../shared/presentation';
import { Delivery, type DeliveryState } from './ui/Delivery';
import { ActivityView } from './canvas/ActivityView';
import { applyEvent, activeTurn } from '../shared/state';
import { CanvasWorld } from './canvas/CanvasWorld';
import { el, button, markdown, codeBlock, diffView, terminal, safeUrl, itemLabel } from './ui/render';
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const canvas = new CanvasWorld($('#viewport'), $('#world'), document.querySelector<SVGElement>('#connectors')!);
// Codex state is transient and authoritative from the host; UI preferences contain no conversation.
const codexState: { thread?: Thread; models: Model[]; approvals: Approval[]; ready: boolean; requiresAuth: boolean } = { models: [], approvals: [], ready: false, requiresAuth: false };
const uiState = { workspaces: [] as Workspace[], workspaceId: localStorage.getItem('canvas.workspace') ?? '', threadId: localStorage.getItem('canvas.thread') ?? '', threads: [] as Thread[], nextCursor: null as string | null, loading: false, token: '', submitting: false, draftByThread: new Map<string, string>() };
const activityViews = new Map<string, ActivityView>();
let selectedTurnId: string | null = null;
let socket: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let cameraTimer: ReturnType<typeof setTimeout> | undefined;
let viewportSave: ClientMessage | undefined;
let reconnectDelay = 500;
let restoring = false;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const itemNodes = new Map<string, HTMLElement>();
const turnNodes = new Map<string, HTMLElement>();
const provisional = new Map<string, { node: HTMLElement; text: string; delivery: Delivery }>();
let composer: HTMLTextAreaElement | undefined;
let messages: HTMLElement | undefined;
let sendButton: HTMLButtonElement | undefined;
let stopButton: HTMLButtonElement | undefined;
function send(message: ClientMessage): boolean {
  if (socket?.readyState !== WebSocket.OPEN) { toast('Browser connection lost. Reconnecting…'); return false; }
  socket.send(JSON.stringify(message)); return true;
}
function toast(message: string) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 9000);
}
async function connect() {
  try {
    const bootstrap = await fetch('/api/bootstrap', { cache: 'no-store' }).then(r => r.json()) as { token: string };
    uiState.token = bootstrap.token;
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?token=${encodeURIComponent(bootstrap.token)}`);
    socket.onopen = () => { reconnectDelay = 500; restoring = true; send({ type: 'app.init' }); };
    socket.onmessage = event => { try { receive(JSON.parse(event.data)); } catch (error) { console.error(error); toast(`Display error: ${error}`); } };
    socket.onclose = () => { codexState.ready = false; for (const pending of provisional.values()) pending.delivery.unconfirmed(); updateControls(); $('#connection-label').textContent = 'Reconnecting'; $('#connection-dot').className = ''; $('#status-text').textContent = 'Browser disconnected · waiting to reconnect'; scheduleReconnect(); };
  } catch { scheduleReconnect(); }
}
function scheduleReconnect() { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => { void connect(); }, reconnectDelay); reconnectDelay = Math.min(10_000, reconnectDelay * 2); }
function restore() {
  if (!restoring || !codexState.ready || !uiState.workspaces.length) return;
  restoring = false;
  const workspace = uiState.workspaces.find(w => w.id === uiState.workspaceId) ?? uiState.workspaces[0]!;
  const previous = uiState.threadId;
  openWorkspace(workspace.id, false);
  if (previous) { uiState.threadId = previous; send({ type: 'session.open', workspaceId: workspace.id, threadId: previous }); }
}
function receive(message: ServerMessage) {
  switch (message.type) {
    case 'connection.state':
      codexState.ready = message.status === 'ready';
      $('#connection-label').textContent = message.status === 'ready' ? 'Codex connected' : message.status === 'starting' ? 'Starting Codex' : 'Codex offline';
      $('#connection-dot').className = message.status === 'ready' ? 'connected' : '';
      $('#disconnect-banner').hidden = message.status !== 'disconnected';
      $('#disconnect-detail').textContent = message.detail ?? 'Codex is disconnected.';
      if (message.status === 'ready') { if (!codexState.thread) restoring = true; restore(); }
      else if (message.status === 'disconnected') { restoring = true; codexState.approvals = []; renderApproval(); }
      updateControls(); break;
    case 'app.state': {
      const previousCount = uiState.workspaces.length;
      uiState.workspaces = message.workspaces; codexState.models = message.models; codexState.requiresAuth = message.requiresAuth;
      $('#account-label').replaceChildren(document.createTextNode(message.account ?? 'Codex account'), el('span', '', message.account ? 'Connected through Codex' : 'Sign in to begin'));
      $('#auth-banner').hidden = !message.requiresAuth || !codexState.ready;
      renderWorkspaces(); renderModels(); updateWelcome(); restore(); updateControls();
      if (uiState.workspaces.length > previousCount && $('#workspace-dialog').hasAttribute('open')) {
        $<HTMLDialogElement>('#workspace-dialog').close(); openWorkspace(uiState.workspaces.at(-1)!.id);
      }
      break;
    }
    case 'auth.url': {
      const url = safeUrl(message.url); if (!url) { toast('Codex returned an invalid sign-in URL'); break; }
      const link = $<HTMLAnchorElement>('#login-link'); link.href = url; link.hidden = false; link.textContent = 'Continue to ChatGPT ↗'; link.click(); break;
    }
    case 'workspace.state':
      if (message.workspaceId !== uiState.workspaceId) break;
      uiState.threads = message.append ? [...uiState.threads, ...message.threads.filter(t => !uiState.threads.some(old => old.id === t.id))] : message.threads;
      uiState.nextCursor = message.nextCursor; renderSessions();
      for (const id of message.orphans) { const row = el('div', 'orphan'); row.append(el('span', '', `Missing Codex thread · ${id.slice(0, 8)}`), button('Remove local layout', () => { send({ type: 'canvas.remove', threadId: id, workspaceId: message.workspaceId }); row.remove(); })); $('#sessions').append(row); }
      break;
    case 'session.state': {
      if (message.workspaceId !== uiState.workspaceId || (uiState.threadId && message.thread.id !== uiState.threadId)) break;
      uiState.loading = false; uiState.submitting = false; uiState.threadId = message.thread.id; localStorage.setItem('canvas.thread', message.thread.id);
      codexState.thread = message.thread; codexState.approvals = message.approvals;
      if (!uiState.threads.some(t => t.id === message.thread.id)) uiState.threads.unshift(message.thread);
      selectedTurnId = message.canvas.selectedTurnId; activityViews.clear();
      canvas.load(message.canvas); canvas.setTurn(viewedTurn()?.id); itemNodes.clear(); turnNodes.clear(); for (const pending of provisional.values()) pending.delivery.dispose(); provisional.clear();
      $('#session-title').textContent = message.thread.name;
      $('#execution-context').textContent = `${message.context.sandbox} · Approval: ${message.context.approvalPolicy} · Web search: ${message.context.webSearch} · Shell network: ${message.context.shellNetwork}`;
      renderModels(message.context.model, message.context.effort);
      buildConversation(); renderThread(); renderAllArtifacts(); renderSessions(); renderApproval(); updateWelcome(); updateControls(); updateCount();
      if (!message.canvas.viewportInitialized) canvas.focusConversation();
      break;
    }
    case 'codex.event': {
      if (codexState.thread?.id !== message.event.threadId) break;
      if (message.event.kind === 'turn' && message.event.turn.status === 'inProgress' && message.event.turn.id !== viewedTurn()?.id && selectedTurnId === null && canvas.reader.id && canvas.reader.id !== `${codexState.thread.id}:conversation`) {
        selectedTurnId = viewedTurn()?.id ?? null;
        send({ type: 'canvas.turn', threadId: codexState.thread.id, turnId: selectedTurnId });
      }
      applyEvent(codexState.thread, message.event);
      canvas.setTurn(viewedTurn()?.id);
      if (message.event.kind === 'name') { $('#session-title').textContent = message.event.name; renderSessions(); }
      else if (message.event.kind === 'delta') {
        const event = message.event; const item = codexState.thread.turns.find(t => t.id === event.turnId)?.items.find(i => i.id === event.itemId);
        if (item) { if (event.itemType === 'agentMessage') renderMessage(event.turnId, item, true); else renderArtifactForItem(event.turnId, item, true); }
      } else {
        if (message.event.kind === 'item' && message.event.item.type === 'userMessage') {
          // First authoritative user item replaces the matching provisional entry.
          for (const [id, pending] of provisional) if (pending.text === message.event.item.text) { pending.delivery.dispose(); pending.node.remove(); provisional.delete(id); uiState.submitting = [...provisional.values()].some(p => p.delivery.state === 'sending'); break; }
        }
        renderThread();
        if (message.event.kind === 'item') renderArtifactForItem(message.event.turnId, message.event.item);
        else renderAllArtifacts(message.event.turn.id);
      }
      updateControls(); updateCount(); break;
    }
    case 'canvas.state': if (message.canvas.threadId === codexState.thread?.id) { selectedTurnId = message.canvas.selectedTurnId; activityViews.clear(); canvas.load(message.canvas); canvas.setTurn(viewedTurn()?.id); buildConversation(); renderThread(); renderAllArtifacts(); updateCount(); } break;
    case 'canvas.object': {
      if (message.object.threadId !== codexState.thread?.id) break;
      canvas.upsert(message.object);
      if (message.object.type !== 'conversation') renderArtifact(message.object.id);
      if (message.object.turnId) renderActivity(message.object.turnId);
      updateCount(); updateControls(); break;
    }
    case 'approval.request': if (message.approval.threadId === codexState.thread?.id) { codexState.approvals.push(message.approval); renderApproval(); updateControls(); } break;
    case 'approval.resolved': codexState.approvals = codexState.approvals.filter(a => a.id !== message.requestId); renderApproval(); updateControls(); break;
    case 'turn.accepted':
      if (message.threadId === codexState.thread?.id) { uiState.submitting = false; provisional.get(message.clientId)?.delivery.accept(); updateControls(); } break;
    case 'error': {
      toast(`${message.category}: ${message.message}`); uiState.loading = false; uiState.submitting = false;
      if (message.clientId) { const pending = provisional.get(message.clientId); if (pending) { pending.delivery.dispose(); pending.node.remove(); if (composer && !composer.value) composer.value = pending.text; provisional.delete(message.clientId); } }
      else if (!message.threadId || message.threadId === codexState.thread?.id) for (const pending of provisional.values()) pending.delivery.unconfirmed();
      if (/thread.*not found|no rollout|does not exist/i.test(message.message) && !codexState.thread) { uiState.threadId = ''; localStorage.removeItem('canvas.thread'); }
      updateControls(); break;
    }
  }
}
function viewedTurn(): Turn | undefined {
  const turns = codexState.thread?.turns ?? [];
  return turns.find(turn => turn.id === selectedTurnId) ?? turns.at(-1);
}
function selectTurn(id: string | null) {
  selectedTurnId = id;
  if (codexState.thread) send({ type: 'canvas.turn', threadId: codexState.thread.id, turnId: id });
  canvas.setTurn(viewedTurn()?.id); renderAllArtifacts(); renderTurnNavigation(); updateAttention(); updateCount();
}
function renderTurnNavigation() {
  const turns = codexState.thread?.turns ?? [], select = $<HTMLSelectElement>('#turn-selector');
  $('#turn-navigation').hidden = !codexState.thread;
  const signature = turns.map(t => `${t.id}:${t.status}:${t.items.find(i => i.type === 'userMessage')?.text ?? ''}`).join('|');
  if (select.dataset.signature !== signature) {
    select.dataset.signature = signature; select.replaceChildren();
    turns.forEach((turn, index) => { const option = el('option', '', `Turn ${index + 1} · ${(turn.items.find(i => i.type === 'userMessage')?.text ?? turn.status).slice(0, 64)}`); option.value = turn.id; select.append(option); });
  }
  select.value = viewedTurn()?.id ?? ''; select.disabled = !turns.length;
  $('#turn-follow-state').textContent = selectedTurnId === null ? 'Following latest turn' : 'Browsing history';
  $('#latest-turn').hidden = selectedTurnId === null;
  $('#latest-turn').textContent = `Go to latest · Turn ${turns.length}`;
}
function renderActivity(turnId: string, deltaItem?: Item) {
  const thread = codexState.thread, turn = thread?.turns.find(t => t.id === turnId);
  if (!thread || !turn) return;
  const id = `${thread.id}:${turnId}:activity`, card = canvas.cards.get(id); if (!card) return;
  let view = activityViews.get(id);
  if (!view) {
    view = new ActivityView(card.body, (item, body) => renderContent(body, artifactType(item)!, turn, [item]),
      item => send({ type: 'canvas.keep', threadId: thread.id, turnId, itemId: item.id }),
      item => { const object = canvas.cards.get(objectId(thread.id, turnId, item))?.object; return !!object?.pinned && !object.hidden; });
    activityViews.set(id, view);
  }
  card.turnLink.textContent = `Turn ${thread.turns.indexOf(turn) + 1}`;
  card.status.textContent = turn.status === 'inProgress' ? '● WORKING' : `${activityItems(turn.items).length} actions`;
  card.status.className = `card-status ${turn.status === 'inProgress' ? 'running' : ''}`;
  if (deltaItem) view.updateItem(deltaItem); else view.update(turn);
}
function navigateItem(turnId: string, item: Item) {
  const thread = codexState.thread; if (!thread) return;
  const reading = !!canvas.reader.id; selectTurn(turnId);
  const individual = canvas.cards.get(objectId(thread.id, turnId, item));
  const id = individual?.object.pinned ? individual.object.id : automaticId(thread.id, turnId, item);
  if (item.type === 'file' && canvas.cards.has(id)) canvas.patch(id, { pinned: true, hidden: false });
  else if (canvas.cards.get(id)?.object.hidden) canvas.patch(id, { hidden: false });
  if (reading) canvas.maximize(id); else canvas.focus(id);
  if (automaticType(item) === 'activity' && id === automaticId(thread.id, turnId, item)) activityViews.get(id)?.focusItem(item.id);
}
function attentionFailures() {
  const turns = codexState.thread?.turns ?? [], latest = turns.at(-1);
  return turns.filter(t => t.id === latest?.id || t.id === viewedTurn()?.id).flatMap(turn => {
    const items = turn.items.filter(failedItem);
    return items.length ? items.map(item => ({ turn, item: item as Item | undefined })) : turn.status === 'failed' || turn.error ? [{ turn, item: undefined }] : [];
  });
}
function updateAttention() {
  const count = codexState.approvals.length + attentionFailures().length;
  for (const id of ['attention-button', 'reader-attention']) { const node = $('#' + id); node.hidden = !count; node.textContent = codexState.approvals.length ? `Review approval · ${codexState.approvals.length}` : `Past failures · ${count}`; }
  if ($<HTMLDialogElement>('#attention-dialog').open) renderAttention();
}
function renderAttention() {
  const dialog = $<HTMLDialogElement>('#attention-dialog');
  const signature = JSON.stringify([codexState.approvals.map(a => [a.id,a.title]),attentionFailures().map(({turn,item}) => [turn.id,item?.id,turn.error])]);
  if (dialog.dataset.signature === signature) return;
  dialog.dataset.signature = signature; dialog.replaceChildren();
  const heading = el('div', 'dialog-title'); heading.append(el('h2', '', 'Needs attention'), button('Close', () => dialog.close())); dialog.append(heading);
  for (const approval of codexState.approvals) dialog.append(button(`Review request · ${approval.title}`, () => {
    dialog.close(); codexState.approvals = [approval, ...codexState.approvals.filter(a => a.id !== approval.id)]; renderApproval(true);
  }, 'attention-entry'));
  for (const { turn, item } of attentionFailures()) dialog.append(button(`Turn ${codexState.thread!.turns.indexOf(turn) + 1} · Failed · ${item ? itemLabel(item) : turn.error ?? 'Turn failed'}`, () => {
    dialog.close(); if (item && artifactType(item)) navigateItem(turn.id, item); else canvas.onTurn(turn.id);
  }, 'attention-entry'));
  if (!codexState.approvals.length && !attentionFailures().length) dialog.append(el('p', '', 'Nothing needs attention.'));
}
function showAttention() { renderAttention(); $<HTMLDialogElement>('#attention-dialog').showModal(); }
function renderWorkspaces() {
  const nav = $('#workspaces'); nav.replaceChildren();
  for (const workspace of uiState.workspaces) {
    const row = button('', () => openWorkspace(workspace.id), `workspace-row ${workspace.id === uiState.workspaceId ? 'active' : ''}`);
    row.append(el('span', 'workspace-icon', workspace.name.slice(0, 1).toUpperCase()), el('span', '', workspace.name), el('span', 'workspace-arrow', '↗')); row.title = workspace.path; nav.append(row);
  }
  if (!uiState.workspaces.length) nav.append(el('p', 'sidebar-empty', 'Your projects will appear here.'));
}
function renderSessions() {
  const nav = $('#sessions'); nav.replaceChildren();
  for (const thread of uiState.threads) {
    const row = button('', () => openSession(thread.id), `session-row ${thread.id === uiState.threadId ? 'active' : ''}`);
    row.append(el('span', 'session-dot', '◦'), el('span', 'session-name', thread.name), el('span', 'session-time', relativeTime(thread.updatedAt))); nav.append(row);
  }
  if (!uiState.threads.length) nav.append(el('p', 'sidebar-empty', 'A fresh start. Create your first session.'));
  $('#more-sessions').hidden = !uiState.nextCursor;
}
function relativeTime(seconds: number) { const days = (Date.now() / 1000 - seconds) / 86400; return !seconds ? '' : days < 1 ? 'Today' : days < 2 ? 'Yesterday' : new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function flushCamera() { clearTimeout(cameraTimer); if (viewportSave) { send(viewportSave); viewportSave = undefined; } }
function clearSession() {
  selectedTurnId = null; activityViews.clear();
  for (const pending of provisional.values()) pending.delivery.dispose(); provisional.clear();
  canvas.reader.restore(false);
  if (composer && codexState.thread) uiState.draftByThread.set(codexState.thread.id, composer.value);
  codexState.thread = undefined; codexState.approvals = []; renderApproval();
  for (const card of canvas.cards.values()) card.node.remove(); canvas.cards.clear(); $('#connectors').replaceChildren(); $('#minimap').replaceChildren(); $('#minimap').hidden = true; canvas.threadId = ''; uiState.submitting = false;
  composer = undefined; messages = undefined; updateCount();
}
function openWorkspace(id: string, resetThread = true) {
  flushCamera(); clearSession(); uiState.workspaceId = id; localStorage.setItem('canvas.workspace', id);
  if (resetThread) { uiState.threadId = ''; localStorage.removeItem('canvas.thread'); }
  const workspace = uiState.workspaces.find(w => w.id === id)!;
  $('#workspace-name').textContent = workspace.name; $('#workspace-path').textContent = workspace.path;
  $('#session-title').textContent = 'A new perspective on your work.'; $('#execution-context').textContent = 'Create a session, or pick up where you left off.';
  uiState.threads = []; $<HTMLInputElement>('#session-search').value = ''; renderWorkspaces(); renderSessions(); updateWelcome(); updateControls();
  send({ type: 'workspace.open', workspaceId: id });
}
function openSession(threadId: string) {
  flushCamera(); clearSession(); uiState.threadId = threadId; uiState.loading = true;
  $('#welcome').hidden = true; $('#session-title').textContent = 'Restoring session…';
  send({ type: 'session.open', workspaceId: uiState.workspaceId, threadId }); renderSessions(); updateControls();
}
function createSession() {
  if (!uiState.workspaceId) { $<HTMLDialogElement>('#workspace-dialog').showModal(); return; }
  flushCamera(); clearSession(); uiState.threadId = ''; uiState.loading = true; updateControls();
  send({ type: 'session.create', workspaceId: uiState.workspaceId, model: $<HTMLSelectElement>('#model').value || undefined });
}
function renderModels(selected?: string, effort?: string) {
  const select = $<HTMLSelectElement>('#model'), current = selected ?? select.value;
  select.replaceChildren();
  for (const model of codexState.models) { const option = el('option', '', model.displayName); option.value = model.model; select.append(option); }
  select.value = codexState.models.some(m => m.model === current) ? current : preferredModel(codexState.models)?.model ?? '';
  renderEfforts(effort);
}
function renderEfforts(selected?: string) {
  const model = codexState.models.find(m => m.model === $<HTMLSelectElement>('#model').value), select = $<HTMLSelectElement>('#effort');
  const previous = selected ?? select.value; select.replaceChildren();
  for (const effort of model?.supportedReasoningEfforts ?? []) { const option = el('option', '', effort.reasoningEffort[0]!.toUpperCase() + effort.reasoningEffort.slice(1)); option.value = effort.reasoningEffort; option.title = effort.description; select.append(option); }
  select.value = model?.supportedReasoningEfforts.some(e => e.reasoningEffort === previous) ? previous : model?.defaultReasoningEffort ?? '';
}
function updateWelcome() {
  $('#welcome').hidden = !!codexState.thread || uiState.loading;
  $('#welcome-start').textContent = uiState.workspaces.length ? 'Start a new session ↗' : 'Add a workspace ↗';
  $('#auth-banner').hidden = !codexState.requiresAuth || !codexState.ready;
}
function updateControls() {
  $('#auth-banner').hidden = !codexState.requiresAuth || !codexState.ready;
  const active = activeTurn(codexState.thread), available = codexState.ready && !codexState.requiresAuth;
  $<HTMLButtonElement>('#new-session').disabled = !available || uiState.loading;
  $<HTMLButtonElement>('#welcome-start').disabled = uiState.workspaces.length > 0 && !available;
  $<HTMLSelectElement>('#model').disabled = !!active || !available;
  $<HTMLSelectElement>('#effort').disabled = !!active || !available;
  if (composer) composer.disabled = !available;
  if (sendButton) { sendButton.disabled = !available || uiState.submitting; sendButton.textContent = active ? 'Add to current turn ↑' : 'Send ↑'; }
  if (stopButton) { stopButton.hidden = !active; stopButton.disabled = !available; }
  for (const id of ['stop-turn', 'reader-stop']) { const stop = $<HTMLButtonElement>('#' + id); stop.hidden = !active; stop.disabled = !available; }
  const pendingNotice = document.getElementById('pending-approval');
  if (pendingNotice) pendingNotice.hidden = !codexState.approvals.length;
  renderTurnNavigation();
  updateAttention();
  $('#status-text').textContent = codexState.approvals.length ? `Waiting for your approval · use Review approval to continue` : uiState.submitting ? 'Sending message to Codex…' : active ? 'Codex is working · you can add instructions' : codexState.ready ? viewedTurn()?.status === 'interrupted' ? 'Turn interrupted · you can send another message' : 'Ready · canvas saved locally' : 'Waiting for Codex connection';
  const conversation = canvas.cards.get(`${codexState.thread?.id}:conversation`);
  if (conversation) { conversation.status.textContent = active ? '● WORKING' : '● READY'; conversation.status.className = `card-status ${active ? 'running' : ''}`; }
}
function buildConversation() {
  const card = canvas.cards.get(`${codexState.thread?.id}:conversation`); if (!card) return;
  card.body.replaceChildren(); card.body.classList.add('conversation-body');
  messages = el('div', 'messages'); card.body.append(messages);
  const pendingNotice = el('div', 'pending-approval'); pendingNotice.id = 'pending-approval'; pendingNotice.hidden = true; pendingNotice.setAttribute('role', 'status');
  pendingNotice.append(el('span', '', 'Codex is waiting for your approval.'), button('Review approval', showAttention)); card.body.append(pendingNotice);
  const form = el('form', 'composer'); composer = el('textarea'); composer.rows = 3; composer.placeholder = 'What would you like to work on?'; composer.setAttribute('aria-label', 'Message Codex'); composer.value = uiState.draftByThread.get(codexState.thread!.id) ?? '';
  const actions = el('div', 'composer-actions'); actions.append(el('span', '', '↵ Send  ·  Shift ↵ New line'));
  stopButton = button('■ Stop', () => send({ type: 'turn.stop', threadId: codexState.thread!.id }), 'stop-button'); stopButton.hidden = true;
  sendButton = el('button', 'primary', 'Send ↑'); sendButton.type = 'submit'; actions.append(stopButton, sendButton); form.append(composer, actions); card.body.append(form);
  form.onsubmit = event => { event.preventDefault(); submit(); };
  composer.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(); } };
}
function submit() {
  if (!composer || !codexState.thread || !codexState.ready || uiState.submitting || !composer.value.trim()) return;
  if (!activeTurn(codexState.thread)) selectTurn(null);
  const text = composer.value.trim(), id = crypto.randomUUID();
  const pending = el('div', 'message user-message provisional'); pending.append(el('div', 'message-role', 'YOU · SENDING'), el('div', 'message-text', text)); messages?.append(pending);
  const delivery = new Delivery(state => updateDelivery(id, state)); provisional.set(id, { node: pending, text, delivery });
  const sent = send({ type: activeTurn(codexState.thread) ? 'turn.steer' : 'turn.start', threadId: codexState.thread.id, text, model: $<HTMLSelectElement>('#model').value, effort: $<HTMLSelectElement>('#effort').value || undefined, clientId: id });
  if (sent) { composer.value = ''; uiState.draftByThread.delete(codexState.thread.id); uiState.submitting = true; updateControls(); messages?.scrollTo({ top: messages.scrollHeight }); }
  else { delivery.dispose(); pending.remove(); provisional.delete(id); }
}
function updateDelivery(id: string, state: DeliveryState) {
  const pending = provisional.get(id); if (!pending) return;
  pending.node.classList.remove('provisional');
  pending.node.querySelector('.message-role')!.textContent = state === 'accepted' ? 'YOU · SENT' : 'YOU · DELIVERY NOT CONFIRMED';
  pending.node.querySelector('.delivery-notice')?.remove();
  if (state === 'unconfirmed') pending.node.append(el('p', 'delivery-notice', 'Codex has not confirmed this message. Check the conversation before sending it again.'));
  uiState.submitting = [...provisional.values()].some(p => p.delivery.state === 'sending'); updateControls();
}
function ensureTurn(turnId: string) {
  if (turnNodes.has(turnId)) return turnNodes.get(turnId)!;
  const node = el('section', 'turn'); node.dataset.turnId = turnId;
  const number = codexState.thread!.turns.findIndex(t => t.id === turnId) + 1;
  const marker = button(`TURN ${String(number).padStart(2, '0')}`, () => { selectTurn(turnId); const first = [...canvas.cards.values()].find(c => c.object.turnId === turnId && canvas.visible(c.object)); if (first) canvas.focus(first.object.id); }, 'turn-marker');
  marker.onmouseenter = () => canvas.highlightTurn(turnId); marker.onmouseleave = () => canvas.highlightTurn(); node.append(marker); messages!.append(node); turnNodes.set(turnId, node); return node;
}
function renderThread() {
  if (!codexState.thread || !messages) return;
  messages.querySelector('.conversation-empty')?.remove();
  if (!codexState.thread.turns.length && !provisional.size) {
    const empty = el('div', 'conversation-empty'); empty.append(el('span', 'empty-cross', '＋'), el('h2', '', 'What are we building?'), el('p', '', 'Ask Codex to explore an idea, fix a bug, or make something new. The work will unfold around this conversation.')); messages.append(empty);
  }
  for (const turn of codexState.thread.turns) {
    const node = ensureTurn(turn.id);
    for (const item of turn.items) renderMessage(turn.id, item);
    let state = node.querySelector<HTMLElement>('.turn-state'); if (!state) { state = el('div', 'turn-state'); node.append(state); }
    state.textContent = turn.error ? `Failed · ${turn.error}` : turn.status === 'inProgress' ? 'Codex is working…' : turn.status;
    node.append(state); // Keep the lifecycle marker after newly inserted items.
  }
}
function renderMessage(turnId: string, item: Item, streaming = false) {
  if (!messages || !codexState.thread) return;
  if (item.type === 'reasoning' && !item.text) return;
  const type = automaticType(item);
  const key = type ? automaticId(codexState.thread.id, turnId, item) : `${turnId}:${item.id}`;
  let node = itemNodes.get(key);
  const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100;
  if (!node) {
    node = el('div', `message ${item.type === 'userMessage' ? 'user-message' : ''}`); itemNodes.set(key, node); ensureTurn(turnId).append(node);
    if (type) {
      node.className = 'artifact-reference'; node.append(button('', () => navigateItem(turnId, item)));
    } else { node.append(el('div', 'message-role', item.type === 'userMessage' ? 'YOU' : item.type === 'agentMessage' ? 'CODEX' : 'PROGRESS'), el('div', 'message-text markdown')); }
  }
  if (type) { const count = activityItems(codexState.thread.turns.find(t => t.id === turnId)?.items ?? []).length; node.querySelector('button')!.textContent = type === 'activity' ? `↗ Activity · ${count} actions` : type === 'diff' ? '↗ Changes' : type === 'plan' ? '↗ Plan' : `↗ File · ${item.path ?? ''}`; }
  if (!type) {
    const textNode = node.querySelector<HTMLElement>('.message-text')!;
    if (textNode.dataset.source !== item.text || (!streaming && textNode.dataset.streaming === 'true')) {
      if (streaming || item.type === 'userMessage') textNode.textContent = item.text ?? '';
      else markdown(textNode, item.text ?? '');
      textNode.dataset.source = item.text ?? ''; textNode.dataset.streaming = String(streaming);
    }
  }
  if (nearBottom) messages.scrollTop = messages.scrollHeight;
}
function renderArtifactForItem(turnId: string, item: Item, streaming = false) {
  if (!codexState.thread || !artifactType(item)) return;
  if (automaticType(item) === 'activity') renderActivity(turnId, streaming ? item : undefined);
  const id = objectId(codexState.thread.id, turnId, item);
  if (streaming && item.type === 'commandExecution') {
    const output = canvas.cards.get(id)?.body.querySelector<HTMLElement>('.terminal-output');
    if (output) { const bottom = output.scrollHeight - output.scrollTop - output.clientHeight < 60; output.textContent = terminal(item.output ?? ''); if (bottom) output.scrollTop = output.scrollHeight; return; }
  }
  renderArtifact(id);
}
function renderAllArtifacts(turnId?: string) { for (const card of canvas.cards.values()) if (canvas.visible(card.object) && card.object.type !== 'conversation' && (!turnId || card.object.turnId === turnId)) renderArtifact(card.object.id); }
function renderArtifact(id: string) {
  const card = canvas.cards.get(id), thread = codexState.thread; if (!card || !thread) return;
  const turn = thread.turns.find(t => t.id === card.object.turnId); if (!turn) return;
  if (card.object.type === 'activity') { renderActivity(turn.id); return; }
  const items = turn.items.filter(i => objectId(thread.id, turn.id, i) === id && artifactType(i));
  const item = items.at(-1); if (!item) { card.body.replaceChildren(el('p', 'muted', 'This artifact is not available in the restored Codex history.')); return; }
  card.turnLink.textContent = `Turn ${thread.turns.indexOf(turn) + 1}`;
  const status = itemStatus(item, turn);
  card.status.textContent = status === 'inProgress' ? '● RUNNING' : status === 'completed' ? '✓' : status;
  card.status.className = `card-status ${status === 'inProgress' ? 'running' : status === 'failed' ? 'failed' : ''}`;
  renderContent(card.body, card.object.type, turn, items);
}
function renderContent(body: HTMLElement, type: ObjectType, turn: Turn, items: Item[]) {
  const thread = codexState.thread!, item = items.at(-1)!;
  const status = itemStatus(item, turn);
  const previousScroll = body.scrollTop; body.replaceChildren();
  switch (type) {
    case 'plan': {
      const structured = items.findLast(i => i.plan?.length);
      if (structured) {
        if (structured.text) { const intro = el('div', 'markdown'); markdown(intro, structured.text); body.append(intro); }
        for (const step of structured.plan!) { const row = el('div', `plan-step ${step.status}`); row.append(el('span', '', step.status === 'completed' ? '✓' : step.status === 'inProgress' ? '◉' : '○'), el('span', '', step.step)); body.append(row); }
        const done = structured.plan!.filter(s => s.status === 'completed').length;
        body.append(el('div', 'plan-summary', `${done} of ${structured.plan!.length} steps complete`));
      } else markdown(body, item.text ?? 'Plan in progress…'); break;
    }
    case 'command': {
      const hint = commandFailureHint(item); if (hint) body.append(el('p', 'command-warning', hint));
      body.append(el('div', 'command-line', `$ ${item.command ?? 'Running command…'}`));
      const output = el('pre', 'terminal-output', terminal(item.output ?? '')); body.append(output);
      const footer = el('div', 'command-footer'); footer.append(el('span', '', item.cwd ?? ''), el('span', '', `${item.exitCode !== null && item.exitCode !== undefined ? `Exit ${item.exitCode}` : status}${item.durationMs != null ? ` · ${(item.durationMs / 1000).toFixed(2)}s` : ''}`)); body.append(footer); break;
    }
    case 'diff': renderDiff(body, turn.id, items); break;
    case 'web-search': {
      body.append(el('div', 'web-action', (item.action ?? 'search').replace(/([A-Z])/g, ' $1').toUpperCase()), el('h3', '', item.query || item.url || 'Web research'));
      if (item.text) body.append(el('p', '', item.text));
      const url = item.url && safeUrl(item.url); if (url) { const link = el('a', 'web-link', `${new URL(url).hostname} ↗`); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; body.append(link); }
      body.append(el('p', 'muted', 'Search activity from Codex')); break;
    }
    case 'image': {
      const image = el('img', 'artifact-image'); image.src = `/api/image?token=${encodeURIComponent(uiState.token)}&thread=${encodeURIComponent(thread.id)}&item=${encodeURIComponent(item.id)}`; image.alt = item.path ?? 'Codex image'; image.loading = 'lazy'; image.onerror = () => { image.replaceWith(el('p', 'muted', 'Image preview unavailable. The file may be outside the workspace or no longer exist.')); }; body.append(image, el('div', 'file-path', typeof item.path === 'string' ? item.path : 'Image')); break;
    }
    case 'file': {
      const actions = el('div', 'file-actions'); actions.append(button('Copy path', () => { void navigator.clipboard.writeText(item.path ?? ''); }), button('Insert reference', () => { if (composer) { composer.value += `Look at \`${item.path}\`:\n`; canvas.focusConversation(); composer.focus(); } }));
      body.append(el('div', 'file-path', item.path ?? ''), actions);
      const source = el('div', 'file-source'); source.append(el('pre', 'file-gutter', (item.text ?? '').split('\n').map((_, index) => index + 1).join('\n')), codeBlock(item.text ?? '', item.path)); body.append(source); break;
    }
    case 'review': markdown(body, item.text ?? 'Review in progress…'); break;
    case 'tool': body.append(el('h3', '', item.text ?? 'Tool activity'), codeBlock(item.details ?? '', 'result.json')); break;
  }
  body.scrollTop = previousScroll;
}
function renderDiff(body: HTMLElement, turnId: string, items: Item[]) {
  const changes = new Map<string, { path: string; kind: string; diff: string }>();
  for (const item of items) for (const change of item.changes ?? []) changes.set(change.path, change);
  const aggregate = items.findLast(i => i.type === 'turnDiff')?.diff;
  const tabs = el('div', 'diff-tabs'), content = el('div');
  const showUnified = (path?: string) => {
    content.replaceChildren();
    if (!path && aggregate) content.append(diffView(aggregate));
    else for (const change of changes.values()) if (!path || change.path === path) { content.append(el('div', 'diff-file-heading', change.path), diffView(change.diff), button('Open file on canvas ↗', () => send({ type: 'file.open', threadId: codexState.thread!.id, turnId, path: change.path }), 'open-file')); }
    if (!content.childNodes.length) content.append(el('p', 'muted', 'Waiting for the diff…'));
  };
  tabs.append(button('Unified', () => showUnified()), button(`Files${changes.size ? ` · ${changes.size}` : ''}`, () => {
    content.replaceChildren();
    if (!changes.size) { content.append(el('p', 'muted', 'File details will appear when Codex reports file changes.')); return; }
    for (const change of changes.values()) {
      const added = change.diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
      const removed = change.diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length;
      content.append(button(`${change.path}  +${added} −${removed}`, () => showUnified(change.path), 'file-change-row'));
    }
  }));
  body.append(tabs, content); showUnified();
}
function renderApproval(open = false) {
  const dialog = $<HTMLDialogElement>('#approval-dialog'), approval = codexState.approvals[0];
  if (!approval) { dialog.close(); dialog.replaceChildren(); return; }
  if (!open && !dialog.open) return;
  if (dialog.dataset.requestId === approval.id && dialog.open) return;
  dialog.dataset.requestId = approval.id; dialog.replaceChildren();
  const form = el('form'); form.append(el('div', 'eyebrow', `APPROVAL REQUIRED · ${codexState.thread?.name ?? 'Session'}`), el('h2', '', approval.title), el('pre', 'approval-detail', approval.detail));
  if (approval.cwd) form.append(el('div', 'file-path', approval.cwd));
  if (approval.reason) form.append(el('p', '', approval.reason));
  const answers = new Map<string, HTMLInputElement>();
  for (const question of approval.questions ?? []) {
    const label = el('label', '', question.question), input = el('input'); input.type = question.isSecret ? 'password' : 'text'; input.required = true; label.append(input); answers.set(question.id, input); form.append(label);
    if (question.options) { const choices = el('div', 'answer-options'); for (const option of question.options) { const b = button(option.label, () => { input.value = option.label; }); b.title = option.description ?? ''; choices.append(b); } form.append(choices); }
  }
  const fields = new Map<string, HTMLInputElement | HTMLSelectElement>();
  if (approval.schema) {
    const schema = approval.schema as { properties?: Record<string, { title?: string; description?: string; type?: string; enum?: string[] }>; required?: string[] };
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      const label = el('label', '', value.title ?? key), input = value.enum ? el('select') : el('input');
      if (input instanceof HTMLInputElement) input.type = value.type === 'boolean' ? 'checkbox' : value.type === 'number' || value.type === 'integer' ? 'number' : 'text';
      if (value.enum) for (const choice of value.enum) { const option = el('option', '', choice); option.value = choice; input.append(option); }
      input.required = schema.required?.includes(key) ?? false; label.append(input); if (value.description) label.append(el('small', '', value.description)); form.append(label); fields.set(key, input);
    }
  }
  if (approval.url && safeUrl(approval.url)) { const link = el('a', 'web-link', 'Open requested authorization page ↗'); link.href = safeUrl(approval.url)!; link.target = '_blank'; link.rel = 'noopener noreferrer'; form.append(link); }
  const actions = el('div', 'dialog-actions'); actions.append(button('Review later', () => dialog.close()));
  for (const decision of approval.decisions) actions.append(button(({ accept: approval.kind === 'input' ? 'Submit answers' : 'Allow', acceptForSession: 'Allow for session', decline: 'Decline', cancel: 'Cancel' } as Record<string, string>)[decision] ?? decision, () => {
    if (decision.startsWith('accept') && !form.reportValidity()) return;
    const content: Record<string, unknown> = {};
    for (const [key, input] of fields) content[key] = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input instanceof HTMLInputElement && input.type === 'number' ? Number(input.value) : input.value;
    send({ type: 'approval.respond', threadId: approval.threadId, requestId: approval.id, decision, answers: Object.fromEntries([...answers].map(([key, input]) => [key, input.value])), ...(fields.size ? { content } : {}) });
  }, decision === 'accept' ? 'primary' : ''));
  form.append(actions); form.onsubmit = event => event.preventDefault(); dialog.append(form); if (!dialog.open) dialog.showModal();
}
function updateCount() { const visible = [...canvas.cards.values()].filter(c => canvas.visible(c.object)); $('#object-count').textContent = `${visible.length} cards · ${visible.filter(c => c.object.pinned).length} kept`; }
canvas.onPatch = (objectId, patch) => { $('#status-text').textContent = 'Saving canvas…'; send({ type: 'canvas.update', threadId: canvas.threadId, objectId, patch }); };
canvas.onCamera = camera => { viewportSave = { type: 'canvas.viewport', threadId: canvas.threadId, camera }; clearTimeout(cameraTimer); cameraTimer = setTimeout(flushCamera, 180); };
canvas.onTurn = turnId => { const reading = !!canvas.reader.id; selectTurn(turnId); if (reading) canvas.maximize(`${canvas.threadId}:conversation`); else canvas.focusConversation(); turnNodes.get(turnId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); canvas.highlightTurn(turnId); };
$('#add-workspace').onclick = () => $<HTMLDialogElement>('#workspace-dialog').showModal();
$('#cancel-workspace').onclick = () => $<HTMLDialogElement>('#workspace-dialog').close();
$<HTMLFormElement>('#workspace-form').onsubmit = event => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); send({ type: 'workspace.add', name: String(data.get('name')), path: String(data.get('path')) }); };
$('#new-session').onclick = createSession; $('#welcome-start').onclick = createSession;
$('#login').onclick = () => send({ type: 'auth.login' });
$('#restart').onclick = () => { restoring = true; send({ type: 'codex.restart' }); };
$('#model').onchange = () => renderEfforts();
$('#refresh-sessions').onclick = () => { if (uiState.workspaceId) { send({ type: 'workspace.open', workspaceId: uiState.workspaceId }); } };
let searchTimer: ReturnType<typeof setTimeout>;
$('#session-search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (uiState.workspaceId) { send({ type: 'workspace.open', workspaceId: uiState.workspaceId, search: $<HTMLInputElement>('#session-search').value }); } }, 300); };
$('#more-sessions').onclick = () => { if (uiState.nextCursor) { send({ type: 'workspace.open', workspaceId: uiState.workspaceId, cursor: uiState.nextCursor, search: $<HTMLInputElement>('#session-search').value }); } };
$('#zoom-in').onclick = () => canvas.zoom(1.2); $('#zoom-out').onclick = () => canvas.zoom(1 / 1.2); $('#zoom-level').onclick = () => canvas.reset();
$('#maximize-card').onclick = () => canvas.maximizeSelection();
$('#fit').onclick = () => canvas.fit(); $('#focus-conversation').onclick = () => canvas.focusConversation(); $('#back').onclick = () => canvas.navigate(-1); $('#forward').onclick = () => canvas.navigate(1);
$('#show-hidden').onclick = () => { for (const card of canvas.cards.values()) if (card.object.hidden && (card.object.pinned || (isSummary(card.object.type) && card.object.turnId === viewedTurn()?.id))) canvas.patch(card.object.id, { hidden: false }); };
function openSearch() { $<HTMLDialogElement>('#search-dialog').showModal(); $<HTMLInputElement>('#content-search').focus(); }
$('#find-content').onclick = openSearch; $('#close-search').onclick = () => $<HTMLDialogElement>('#search-dialog').close();
$('#content-search').oninput = () => {
  const query = $<HTMLInputElement>('#content-search').value.trim().toLowerCase(), results = $('#search-results'); results.replaceChildren();
  if (!query || !codexState.thread) return;
  let count = 0;
  for (const turn of codexState.thread.turns) for (const item of turn.items) if (JSON.stringify(item).toLowerCase().includes(query) && count++ < 100) {
    results.append(button(`Turn ${codexState.thread.turns.indexOf(turn) + 1} · ${itemLabel(item)}`, () => { $<HTMLDialogElement>('#search-dialog').close(); if (artifactType(item)) navigateItem(turn.id, item); else canvas.onTurn(turn.id); }, 'search-result'));
  }
  if (!count) results.append(el('p', 'muted', 'No matches in this session.'));
};
$('#turn-selector').onchange = () => selectTurn($<HTMLSelectElement>('#turn-selector').value);
$('#latest-turn').onclick = () => selectTurn(null);
$('#attention-button').onclick = showAttention;
const readerAttention = button('Needs attention', showAttention); readerAttention.id = 'reader-attention'; readerAttention.hidden = true; readerAttention.setAttribute('aria-live','polite'); $('.reader-toolbar').append(readerAttention);
$('#stop-turn').onclick = () => send({ type: 'turn.stop', threadId: canvas.threadId });
const readerStop = button('Stop turn', () => send({ type: 'turn.stop', threadId: canvas.threadId })); readerStop.id = 'reader-stop'; readerStop.hidden = true; $('.reader-toolbar').append(readerStop);
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); openSearch(); } });
window.addEventListener('pagehide', flushCamera);
void connect();
