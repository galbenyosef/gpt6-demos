import type { CrosstalkApplication, CrosstalkToolDefinition, ToolInvocation } from '../src/protocol';
export function fixture() {
  const state = { ready: true, lighting: 'day' };
  let executions = 0;
  const definition: CrosstalkToolDefinition = {
    name: 'set_lighting', title: 'Change lighting', description: 'Set scene lighting.',
    inputSchema: { type: 'object', properties: { lighting: { type: 'string', enum: ['day', 'golden', 'blue'] } }, required: ['lighting'], additionalProperties: false },
    effect: 'navigation', confirmation: 'never', interruptible: false,
  };
  const application: CrosstalkApplication = {
    manifest: { schemaVersion: '1.0', application: { id: 'test-app', name: 'Test app', version: '1', summary: 'Test scene.', purpose: 'Explore lighting.' }, domain: { concepts: [], knowledge: [], limitations: ['No screen feed.'] }, interaction: {},
      stateSchema: { type: 'object', properties: { ready: { type: 'boolean' }, lighting: { type: 'string' } }, required: ['ready', 'lighting'], additionalProperties: false } },
    getState: () => ({ ...state }), tools: [{ definition, async execute({ lighting }) { executions++; state.lighting = lighting; return { lighting }; } }],
  };
  return { state, application, definition, executions: () => executions, registration: { manifest: application.manifest, tools: [definition], state: { ...state } } };
}
export const invocation = (overrides: Partial<ToolInvocation> = {}): ToolInvocation => ({
  type: 'tool.invoke', invocationId: crypto.randomUUID(), sessionId: 'session-1', delegationId: 'delegation-1', tool: 'set_lighting', arguments: { lighting: 'golden' }, explicitUserRequest: true, confirmed: false, expiresAt: Date.now() + 5000, ...overrides,
});
