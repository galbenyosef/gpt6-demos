interface ModelContext { registerTool(tool: { name: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean }; execute(input: unknown): Promise<unknown> }, options: { signal: AbortSignal }): void | Promise<void> }
export function registerWorkspaceTools(actions: { list(): Promise<unknown>; open(id: string): Promise<void> }) {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  const lifecycle = new AbortController(); if (!context?.registerTool) return () => lifecycle.abort();
  const tools = [
    { name: "list_assemblages", description: "List saved Assemblavatar workspaces and their revision numbers.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: async () => actions.list() },
    { name: "open_assemblage", description: "Load a saved assemblage in the visible 3D studio.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async (input: unknown) => { if (!input || typeof input !== "object" || !("id" in input) || typeof input.id !== "string" || !/^asm_[a-f0-9-]{36}$/.test(input.id)) throw Error("Provide a valid assemblage ID"); await actions.open(input.id); return { opened: input.id }; } },
  ];
  for (const tool of tools) { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} }
  return () => lifecycle.abort();
}
