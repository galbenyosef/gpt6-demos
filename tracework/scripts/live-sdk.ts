import { Agent, Runner, RunState, tool } from "@openai/agents";
import { z } from "zod";
import { SQLiteSession } from "../apps/server/src/modules/agent-runtime";
import { Store } from "../apps/server/src/storage/store";
export async function qualifyLiveSDK(s: Store, w: string) {
  let invoked = 0;
  const model = process.env.OPENAI_MODEL || "gpt-6-astra";
  const build = () =>
    new Agent({
      name: "Tracework live compatibility",
      model,
      instructions:
        'Call request_evidence_access exactly once with sourceVersionIds ["synthetic-v1"] and reason "qualification". After its result answer with summary "qualified" and citations ["synthetic-v1"]. This is a synthetic compatibility test.',
      tools: [
        tool({
          name: "request_evidence_access",
          description: "Request a synthetic source",
          parameters: z.object({
            sourceVersionIds: z.array(z.string()),
            reason: z.string(),
          }),
          needsApproval: true,
          execute: async (args) => {
            if (args.sourceVersionIds.join() !== "synthetic-v1")
              throw new Error("Unexpected scope");
            invoked++;
            return { passage: "Synthetic qualification source" };
          },
        }),
      ],
      outputType: z.object({
        summary: z.string(),
        citations: z.array(z.string()),
      }),
    });
  const runner = new Runner({ tracingDisabled: true });
  const sessionId = "live-sdk-qualification";
  const streamed = await runner.run(build(), "Begin qualification", {
    stream: true,
    maxTurns: 3,
    session: new SQLiteSession(s, w, sessionId),
  });
  let events = 0;
  for await (const event of streamed) events++;
  await streamed.completed;
  if (!events || streamed.interruptions.length !== 1 || invoked)
    throw new Error("Live streaming approval failed");
  const stateText = streamed.state.toString();
  const reopened = new Store(s.root);
  try {
    if (!(await new SQLiteSession(reopened, w, sessionId).getItems()).length)
      throw new Error("Live session persistence failed");
    const agent = build();
    const state = await RunState.fromString(agent, stateText);
    for (const interruption of state.getInterruptions())
      state.approve(interruption);
    const done = await runner.run(agent, state, { maxTurns: 5 });
    if (invoked !== 1 || !done.finalOutput?.citations.includes("synthetic-v1"))
      throw new Error("Live approval resume failed");
  } finally {
    reopened.close();
  }
  const cancellation = new AbortController();
  const timer = setTimeout(() => cancellation.abort(), 100);
  let aborted = false;
  try {
    await runner.run(
      new Agent({ name: "Cancellation qualification", model }),
      "Explain the supplied synthetic concept in detail.",
      { signal: cancellation.signal, maxTurns: 1 },
    );
  } catch {
    aborted = cancellation.signal.aborted;
  } finally {
    clearTimeout(timer);
  }
  if (!aborted) throw new Error("Live cancellation was not observed");
  return {
    streamEvents: events,
    typedToolCalls: invoked,
    structuredOutput: true,
    sessionReopened: true,
    approvalResumed: true,
    cancelled: true,
  };
}
