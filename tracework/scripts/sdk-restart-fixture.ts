// Deterministic compatibility fixture only; production AgentRuntime never imports this file.
import { Agent, Runner, RunState, tool, Usage } from "@openai/agents";
import type {
  Model,
  ModelRequest,
  ModelResponse,
  StreamEvent,
} from "@openai/agents";
import { z } from "zod";
const id = () => crypto.randomUUID();
class ScriptedModel implements Model {
  constructor(
    readonly outputs: Extract<
      StreamEvent,
      { type: "response_done" }
    >["response"]["output"][],
  ) {}
  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    request.signal?.throwIfAborted();
    return {
      usage: new Usage({
        requests: 1,
        inputTokens: 5,
        outputTokens: 5,
        totalTokens: 10,
      }),
      output: this.outputs.shift() ?? [],
    };
  }
  async *getStreamedResponse(
    request: ModelRequest,
  ): AsyncIterable<StreamEvent> {
    const response = await this.getResponse(request);
    yield { type: "response_started" as const };
    yield {
      type: "response_done" as const,
      response: {
        ...response,
        id: id(),
        output: response.output as Extract<
          StreamEvent,
          { type: "response_done" }
        >["response"]["output"],
      },
    };
  }
}
const message = (
  text: string,
): Extract<StreamEvent, { type: "response_done" }>["response"]["output"] => [
  {
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text }],
  },
];

const [mode, path] = process.argv.slice(2);
let executions = 0;
const model = new ScriptedModel(
  mode === "pause"
    ? [
        [
          {
            type: "function_call",
            name: "request_evidence_access",
            callId: "exact-call",
            arguments: JSON.stringify({
              sourceVersionIds: ["fixed-version"],
              reason: "Required passage",
            }),
          },
        ],
      ]
    : [message("Resumed exact request")],
);
const agent = new Agent({
  name: "Restart fixture",
  model,
  tools: [
    tool({
      name: "request_evidence_access",
      description: "Request fixed evidence",
      parameters: z.object({
        sourceVersionIds: z.array(z.string()),
        reason: z.string(),
      }),
      needsApproval: true,
      execute: async (args) => {
        if (args.sourceVersionIds.join() !== "fixed-version")
          throw new Error("Changed arguments");
        executions++;
        return { granted: args.sourceVersionIds };
      },
    }),
  ],
});
const runner = new Runner({ tracingDisabled: true });
if (mode === "pause") {
  const paused = await runner.run(agent, "Request scope");
  if (paused.interruptions.length !== 1 || executions !== 0)
    throw new Error("Approval did not stop tool");
  await Bun.write(path!, paused.state.toString());
  console.log("paused");
} else {
  const state = await RunState.fromString(agent, await Bun.file(path!).text());
  for (const i of state.getInterruptions()) state.approve(i);
  const result = await runner.run(agent, state);
  if (executions !== 1 || result.finalOutput !== "Resumed exact request")
    throw new Error("Resume failed");
  console.log("resumed");
}
