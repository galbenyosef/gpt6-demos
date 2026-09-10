import type { ClientMessage } from '../shared/types';
/** Allowlist, not a JSON-RPC tunnel. Unknown fields are never forwarded to Codex. */
export function parseClientMessage(input: string): ClientMessage {
  if (input.length > 256 * 1024) throw new Error('Browser message exceeds 256 KB');
  const m = JSON.parse(input);
  if (!m || typeof m !== 'object' || typeof m.type !== 'string') throw new Error('Invalid browser message');
  const required: Record<string, string[]> = {
    'app.init': [], 'codex.restart': [], 'auth.login': [], 'workspace.add': ['name', 'path'],
    'workspace.open': ['workspaceId'], 'session.open': ['workspaceId', 'threadId'], 'session.create': ['workspaceId'],
    'turn.start': ['threadId', 'text', 'clientId'], 'turn.steer': ['threadId', 'text', 'clientId'], 'turn.stop': ['threadId'],
    'approval.respond': ['threadId', 'requestId', 'decision'], 'canvas.update': ['threadId', 'objectId'],
    'canvas.viewport': ['threadId'], 'canvas.remove': ['workspaceId', 'threadId'], 'file.open': ['threadId', 'turnId', 'path'],
  };
  if (!Object.hasOwn(required, m.type)) throw new Error('Unknown browser operation');
  for (const key of required[m.type]!) if (typeof m[key] !== 'string') throw new Error(`Invalid ${key}`);
  for (const key of ['search', 'cursor', 'model', 'effort']) if (m[key] !== undefined && typeof m[key] !== 'string') throw new Error(`Invalid ${key}`);
  if (m.type === 'canvas.update') {
    if (!m.patch || typeof m.patch !== 'object') throw new Error('Invalid canvas patch');
    const keys = ['x', 'y', 'width', 'height', 'collapsed', 'hidden', 'manuallyPositioned', 'zIndex'];
    if (Object.keys(m.patch).some(k => !keys.includes(k))) throw new Error('Unsupported canvas field');
  }
  if (m.type === 'canvas.viewport' && (!m.camera || typeof m.camera !== 'object')) throw new Error('Invalid camera');
  return m;
}
export function trustedRequest(request: Request, port: number): boolean {
  const url = new URL(request.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || Number(url.port || 80) !== port) return false;
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}
