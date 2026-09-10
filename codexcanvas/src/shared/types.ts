/** Browser-facing projections. Protocol-specific normalization lives on the host. */
export type ObjectType = 'conversation' | 'plan' | 'command' | 'diff' | 'file' | 'web-search' | 'image' | 'tool' | 'review';
export interface Workspace { id: string; name: string; path: string }
export interface Camera { x: number; y: number; zoom: number }
export interface CanvasObject {
  id: string; threadId: string; turnId?: string; itemId?: string; type: ObjectType;
  x: number; y: number; width: number; height: number; collapsed: boolean; hidden: boolean;
  manuallyPositioned: boolean; zIndex: number;
}
export interface Canvas { threadId: string; viewportInitialized: boolean; camera: Camera; objects: CanvasObject[] }
export interface Model { id: string; model: string; displayName: string; isDefault: boolean;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[]; defaultReasoningEffort: string }
export interface Item {
  id: string; type: string; text?: string; status?: string;
  command?: string; cwd?: string; output?: string; exitCode?: number | null; durationMs?: number | null;
  changes?: { path: string; kind: string; diff: string }[];
  plan?: { step: string; status: string }[]; diff?: string;
  query?: string; url?: string; action?: string; path?: string; details?: string;
}
export interface Turn { id: string; status: string; items: Item[]; error?: string }
export interface Thread { id: string; name: string; cwd: string; updatedAt: number; turns: Turn[]; model?: string; effort?: string }
export interface Context { model: string; effort?: string; sandbox: string; shellNetwork: string; webSearch: string; approvalPolicy: string }
export interface Approval {
  id: string; threadId: string; turnId?: string; kind: 'command' | 'file' | 'network' | 'permissions' | 'input' | 'mcp';
  title: string; detail: string; reason?: string; cwd?: string; decisions: string[];
  questions?: { id: string; question: string; options?: { label: string; description?: string }[]; isSecret?: boolean }[];
  schema?: Record<string, unknown>; url?: string;
}
export type SessionEvent =
  | { kind: 'turn'; threadId: string; turn: Turn }
  | { kind: 'item'; threadId: string; turnId: string; item: Item }
  | { kind: 'delta'; threadId: string; turnId: string; itemId: string; field: 'text' | 'output'; delta: string; itemType: string }
  | { kind: 'name'; threadId: string; name: string };
export type ObjectPatch = Partial<Pick<CanvasObject, 'x' | 'y' | 'width' | 'height' | 'collapsed' | 'hidden' | 'manuallyPositioned' | 'zIndex'>>;
export type ClientMessage =
  | { type: 'app.init' | 'codex.restart' | 'auth.login' }
  | { type: 'workspace.add'; name: string; path: string }
  | { type: 'workspace.open'; workspaceId: string; search?: string; cursor?: string }
  | { type: 'session.open'; workspaceId: string; threadId: string }
  | { type: 'session.create'; workspaceId: string; model?: string }
  | { type: 'turn.start' | 'turn.steer'; threadId: string; text: string; model?: string; effort?: string; clientId: string }
  | { type: 'turn.stop'; threadId: string }
  | { type: 'approval.respond'; threadId: string; requestId: string; decision: string; answers?: Record<string, string>; content?: unknown }
  | { type: 'canvas.update'; threadId: string; objectId: string; patch: ObjectPatch }
  | { type: 'canvas.viewport'; threadId: string; camera: Camera }
  | { type: 'canvas.remove'; workspaceId: string; threadId: string }
  | { type: 'file.open'; threadId: string; turnId: string; path: string };
export type ServerMessage =
  | { type: 'connection.state'; status: 'starting' | 'ready' | 'disconnected'; detail?: string }
  | { type: 'app.state'; workspaces: Workspace[]; models: Model[]; account: string | null; requiresAuth: boolean }
  | { type: 'auth.url'; url: string }
  | { type: 'workspace.state'; workspaceId: string; threads: Thread[]; nextCursor: string | null; append: boolean; orphans: string[] }
  | { type: 'session.state'; workspaceId: string; thread: Thread; canvas: Canvas; context: Context; approvals: Approval[] }
  | { type: 'codex.event'; event: SessionEvent }
  | { type: 'canvas.state'; canvas: Canvas }
  | { type: 'canvas.object'; object: CanvasObject }
  | { type: 'approval.request'; approval: Approval }
  | { type: 'approval.resolved'; requestId: string; threadId: string }
  | { type: 'turn.accepted'; threadId: string; clientId: string }
  | { type: 'error'; category: string; message: string; clientId?: string; threadId?: string };
export function preferredModel(models: Model[]) { return models.find(m => m.model === 'gpt-6-astra') ?? models.find(m => m.isDefault) ?? models[0]; }
export function artifactType(item: Item): ObjectType | null {
  return ({ plan: 'plan', commandExecution: 'command', fileChange: 'diff', turnDiff: 'diff', webSearch: 'web-search', imageView: 'image', imageGeneration: 'image', mcpToolCall: 'tool', dynamicToolCall: 'tool', functionCallOutput: 'tool', collabAgentToolCall: 'tool', enteredReviewMode: 'review', exitedReviewMode: 'review', file: 'file' } as Record<string, ObjectType>)[item.type] ?? null;
}
export function objectId(threadId: string, turnId: string, item: Item) {
  const type = artifactType(item);
  return `${threadId}:${turnId}:${type === 'diff' || type === 'plan' ? type : item.id}`;
}
