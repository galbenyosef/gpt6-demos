export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: any) => unknown | Promise<unknown>;
}
export interface ToolContext {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
}
export function registerLabTools(
  context: ToolContext | undefined,
  actions: {
    read: () => unknown;
    assemble: (source: string) => Promise<unknown>;
    step: (count: number, kind: string) => Promise<unknown>;
  },
) {
  if (!context) return () => {};
  const controller = new AbortController();
  const tools: Tool[] = [
    {
      name: "read_h16_machine",
      title: "Read H16 machine",
      description:
        "Read the currently visible H16 registers, CPU phase, ALU and run state.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => actions.read(),
    },
    {
      name: "assemble_h16_program",
      title: "Assemble and load H16 source",
      description:
        "Pause the machine, update the visible assembly editor and assemble the supplied source. Valid code replaces program ROM and resets the CPU; diagnostics leave the loaded program intact.",
      inputSchema: {
        type: "object",
        properties: { source: { type: "string", maxLength: 200000 } },
        required: ["source"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        if (typeof input?.source !== "string" || input.source.length > 200000)
          throw new Error(
            "source must be a string of at most 200000 characters",
          );
        return actions.assemble(input.source);
      },
    },
    {
      name: "step_h16_machine",
      title: "Step H16 execution",
      description:
        "Pause continuous execution and advance 1–100 instructions or CPU phases, updating the visible hardware and debugger.",
      inputSchema: {
        type: "object",
        properties: {
          count: { type: "integer", minimum: 1, maximum: 100 },
          kind: { type: "string", enum: ["instruction", "phase"] },
        },
        required: ["count", "kind"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        if (
          !Number.isInteger(input?.count) ||
          input.count < 1 ||
          input.count > 100 ||
          !["instruction", "phase"].includes(input?.kind)
        )
          throw new Error("Choose count 1–100 and kind instruction or phase");
        return actions.step(input.count, input.kind);
      },
    },
  ];
  for (const tool of tools)
    try {
      Promise.resolve(
        context.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    } catch {}
  return () => controller.abort();
}
