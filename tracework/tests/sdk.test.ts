import { test, expect } from "bun:test";
import { Agent, Runner, tool, RunState, Usage } from "@openai/agents";
import type {
  Model,
  ModelRequest,
  ModelResponse,
  StreamEvent,
} from "@openai/agents";
import { z } from "zod";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, id } from "../apps/server/src/storage/store";
import { createWorkspace } from "../apps/server/src/modules/model";
import { SQLiteSession } from "../apps/server/src/modules/agent-runtime";
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
test("actual SDK under Bun: typed tool, structured streaming and persistent session", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracework-sdk-"));
  const s = new Store(dir),
    w = createWorkspace(s, { name: "SDK fixture" });
  let invoked = 0;
  const model = new ScriptedModel([
    [
      {
        type: "function_call",
        name: "read_evidence",
        callId: "call-1",
        arguments: JSON.stringify({ id: "evidence-1" }),
      },
    ],
    message(
      JSON.stringify({ answer: "Grounded answer", citations: ["evidence-1"] }),
    ),
  ]);
  const agent = new Agent({
    name: "Compatibility fixture",
    model,
    tools: [
      tool({
        name: "read_evidence",
        description: "Read fixed synthetic evidence",
        parameters: z.object({ id: z.string() }),
        execute: async ({ id }) => {
          invoked++;
          return { id, excerpt: "Synthetic source" };
        },
      }),
    ],
    outputType: z.object({
      answer: z.string(),
      citations: z.array(z.string()),
    }),
  });
  const result = await new Runner({ tracingDisabled: true }).run(
    agent,
    "Read evidence-1",
    { stream: true, session: new SQLiteSession(s, w.id, "session") },
  );
  let events = 0;
  for await (const _ of result) events++;
  await result.completed;
  expect(invoked).toBe(1);
  expect(result.finalOutput?.citations).toEqual(["evidence-1"]);
  expect(events).toBeGreaterThan(0);
  expect(
    (await new SQLiteSession(s, w.id, "session").getItems()).length,
  ).toBeGreaterThan(1);
  s.close();
  rmSync(dir, { recursive: true, force: true });
});
test("SDK approval serializes without executing, restores, and rejects or approves exact arguments", async () => {
  let accesses = 0;
  const build = (model: Model) =>
    new Agent({
      name: "Approval fixture",
      model,
      tools: [
        tool({
          name: "request_evidence_access",
          description: "Approval-required source access",
          parameters: z.object({
            sourceVersionIds: z.array(z.string()),
            reason: z.string(),
          }),
          needsApproval: true,
          execute: async (args) => {
            accesses++;
            return { granted: args.sourceVersionIds };
          },
        }),
      ],
    });
  const model = new ScriptedModel([
    [
      {
        type: "function_call",
        name: "request_evidence_access",
        callId: "scope-1",
        arguments: JSON.stringify({
          sourceVersionIds: ["v1"],
          reason: "Required source",
        }),
      },
    ],
    message("Granted scoped access"),
  ]);
  const runner = new Runner({ tracingDisabled: true });
  const agent = build(model);
  const paused = await runner.run(agent, "Request extra evidence");
  expect(accesses).toBe(0);
  expect(paused.interruptions).toHaveLength(1);
  const serialized = paused.state.toString();
  const freshAgent = build(model);
  const restored = await RunState.fromString(freshAgent, serialized);
  expect(restored.getInterruptions()).toHaveLength(1);
  restored.approve(restored.getInterruptions()[0]!);
  const resumed = await runner.run(freshAgent, restored);
  expect(accesses).toBe(1);
  expect(resumed.finalOutput).toContain("Granted");
});
test("SDK cancellation propagates under Bun", async () => {
  const controller = new AbortController();
  controller.abort();
  const model = new ScriptedModel([message("Should not finish")]);
  await expect(
    new Runner({ tracingDisabled: true }).run(
      new Agent({ name: "Cancel fixture", model }),
      "Stop",
      { signal: controller.signal },
    ),
  ).rejects.toThrow();
});
