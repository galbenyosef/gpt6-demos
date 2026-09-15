import { expect, test } from "bun:test";
import { AstraClient, type AIContext } from "../../src/backend/ai/AstraClient";
const context: AIContext = { prompt: "Build a head", kind: "avatar", profile: "avatar-head-stylised", jobId: "test-job", iteration: 1, images: [] };
const waitingRequest = (async (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  const signal = init!.signal!; if (signal.aborted) reject(signal.reason);
  else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
})) as typeof fetch;
test("AI deadline gives an actionable error and correlated failure metric", async () => {
  const metrics: Record<string, unknown>[] = [];
  const client = new AstraClient(async value => { metrics.push(value); }, waitingRequest, { timeoutMs: 15, apiKey: "test-only" });
  await expect(client.generate(context)).rejects.toThrow("AI_REQUEST_TIMEOUT_MS");
  expect(metrics).toHaveLength(1); expect(metrics[0]).toMatchObject({ jobId: "test-job", iteration: 1, success: false, failureKind: "timeout", timeoutMs: 15 });
});
test("user cancellation is not reported as a timeout", async () => {
  const metrics: Record<string, unknown>[] = [], abort = new AbortController();
  const client = new AstraClient(async value => { metrics.push(value); }, waitingRequest, { timeoutMs: 1000, apiKey: "test-only" });
  const pending = client.generate(context, abort.signal); abort.abort(new Error("User cancelled"));
  await expect(pending).rejects.toThrow("User cancelled"); expect(metrics[0]?.failureKind).toBe("cancelled");
});

test("background generation polls the same response and validates the final output", async () => {
  const calls: string[] = [], metrics: Record<string, unknown>[] = [];
  const output = { code: "source", summary: "A head", assumptions: [], expectedLimitations: [], objectStructure: [] };
  const request = (async (url: unknown, init?: RequestInit) => {
    calls.push(String(url));
    if (init?.method === "POST") {
      expect(JSON.parse(String(init.body))).toMatchObject({ background: true, store: false, model: "gpt-6-astra" });
      return Response.json({ id: "resp_test", status: "queued" });
    }
    return Response.json(calls.length === 2 ? { id: "resp_test", status: "in_progress" } : { id: "resp_test", status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] });
  }) as typeof fetch;
  const client = new AstraClient(async value => { metrics.push(value); }, request, { apiKey: "test-only", pollIntervalMs: 1 });
  expect(await client.generate(context)).toEqual(output);
  expect(calls.slice(1)).toEqual(["https://api.openai.com/v1/responses/resp_test", "https://api.openai.com/v1/responses/resp_test"]);
  expect(metrics.at(-1)).toMatchObject({ requestId: "resp_test", success: true });
});

test("cancelling while polling cancels the provider response", async () => {
  const abort = new AbortController(), calls: string[] = [];
  const request = (async (url: unknown) => { calls.push(String(url)); return Response.json({ id: "resp_test", status: "queued" }); }) as typeof fetch;
  const client = new AstraClient(async () => { abort.abort(new Error("User cancelled")); }, request, { apiKey: "test-only", pollIntervalMs: 1 });
  await expect(client.generate(context, abort.signal)).rejects.toThrow("User cancelled");
  expect(calls.at(-1)).toBe("https://api.openai.com/v1/responses/resp_test/cancel");
});

test("failed background response explains exhausted credits", async () => {
  const request = (async (_url: unknown) => Response.json({ id: "resp_test", status: "failed", error: { code: "credit_balance_exhausted" } })) as typeof fetch;
  const client = new AstraClient(undefined, request, { apiKey: "test-only" });
  await expect(client.generate(context)).rejects.toThrow("credits or quota exhausted (credit_balance_exhausted)");
});
