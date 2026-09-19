import { AppError, ensure } from "../../../../packages/contracts";
import type { Run } from "../../../../packages/contracts";
import { Store, id, now } from "../storage/store";
export type JobHandler = (
  run: Run,
  signal: AbortSignal,
  fence: () => void,
) => Promise<unknown>;
export class Jobs {
  readonly owner = id();
  readonly controllers = new Map<string, AbortController>();
  readonly handlers = new Map<string, JobHandler>();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  constructor(readonly s: Store) {}
  register(kind: string, handler: JobHandler) {
    this.handlers.set(kind, handler);
  }
  enqueue(
    w: string,
    kind: string,
    payload: Record<string, unknown>,
    extra: Partial<Run> = {},
  ) {
    this.s.getWorkspace(w);
    const run: Run = {
      id: id(),
      workspaceId: w,
      kind,
      payload,
      status: "queued",
      attempt: 0,
      leaseToken: 0,
      leaseOwner: null,
      leaseExpiry: null,
      cancelRequested: false,
      createdAt: now(),
      updatedAt: now(),
      ...extra,
    };
    this.s.insert("run", w, run);
    this.s.event(run.id, { type: "queued", message: "Waiting for a worker" });
    return run;
  }
  recover() {
    for (const r of this.s.allRuns())
      if (
        r.status === "running" &&
        (!r.leaseExpiry || r.leaseExpiry < Date.now())
      ) {
        this.s.update("run", r.workspaceId, {
          ...r,
          status: "interrupted",
          leaseOwner: null,
          leaseExpiry: null,
          error: {
            code: "PROCESS_INTERRUPTED",
            message:
              "The prior attempt ended without a confirmed result. Retry explicitly.",
          },
          updatedAt: now(),
        });
        this.s.event(r.id, {
          type: "interrupted",
          message: "Recovered after an interrupted process",
        });
      }
  }
  start() {
    this.recover();
    this.timer = setInterval(() => void this.tick(), 350);
    this.timer.unref();
  }
  async tick() {
    if (this.stopped) return;
    this.recover();
    while (this.controllers.size < 2) {
      const executing = this.s
        .allRuns()
        .some((r) => r.kind === "execute" && r.status === "running");
      const candidate = this.s
        .allRuns()
        .find(
          (r) =>
            r.status === "queued" &&
            (!executing || r.kind !== "execute") &&
            this.handlers.has(r.kind),
        );
      if (!candidate) break;
      const run = this.s.tx(() => {
        const r = this.s.get<Run>("run", candidate.workspaceId, candidate.id);
        if (r.status !== "queued") return null;
        const next = {
          ...r,
          status: "running" as const,
          attempt: r.attempt + 1,
          leaseToken: r.leaseToken + 1,
          leaseOwner: this.owner,
          leaseExpiry: Date.now() + 60000,
          updatedAt: now(),
        };
        this.s.update("run", r.workspaceId, next);
        this.s.insert("attempt", r.workspaceId, {
          id: id(),
          runId: r.id,
          attempt: next.attempt,
          startedAt: now(),
          leaseToken: next.leaseToken,
        });
        return next;
      });
      if (run) void this.execute(run);
      else break;
    }
  }
  fence(run: Run) {
    const current = this.s.get<Run>("run", run.workspaceId, run.id);
    ensure(
      current.status === "running" &&
        !current.cancelRequested &&
        current.leaseToken === run.leaseToken &&
        current.leaseOwner === this.owner &&
        (current.leaseExpiry ?? 0) > Date.now(),
      "LEASE_LOST",
      "This attempt no longer owns the job",
      409,
    );
  }
  private async execute(run: Run) {
    const ac = new AbortController();
    this.controllers.set(run.id, ac);
    const heartbeat = setInterval(() => {
      try {
        this.fence(run);
        const current = this.s.get<Run>("run", run.workspaceId, run.id);
        this.s.update("run", run.workspaceId, {
          ...current,
          leaseExpiry: Date.now() + 60000,
        });
      } catch {
        ac.abort();
      }
    }, 10000);
    const deadline = setTimeout(
      () => ac.abort(new Error("Task exceeded its ten-minute deadline")),
      600000,
    );
    this.s.event(run.id, {
      type: "running",
      message: `Started attempt ${run.attempt}`,
    });
    try {
      const result = await this.handlers.get(run.kind)!(run, ac.signal, () =>
        this.fence(run),
      );
      const current = this.s.get<Run>("run", run.workspaceId, run.id);
      if (current.status === "awaiting-approval") return;
      this.s.tx(() => {
        this.fence(run);
        this.s.update("run", run.workspaceId, {
          ...current,
          status: "completed",
          result,
          leaseOwner: null,
          leaseExpiry: null,
          updatedAt: now(),
        });
        this.s.event(run.id, {
          type: "completed",
          message: "Result saved for review",
        });
      });
    } catch (e) {
      const current = this.s.get<Run>("run", run.workspaceId, run.id);
      if (
        current.status === "running" &&
        current.leaseToken === run.leaseToken
      ) {
        const error = classifyError(e, ac.signal);
        this.s.update("run", run.workspaceId, {
          ...current,
          status: current.cancelRequested ? "cancelled" : "failed",
          error,
          leaseOwner: null,
          leaseExpiry: null,
          updatedAt: now(),
        });
        this.s.event(run.id, { type: "failed", message: error.message });
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      this.controllers.delete(run.id);
    }
  }
  cancel(w: string, rid: string) {
    const r = this.s.get<Run>("run", w, rid);
    ensure(
      ["queued", "running", "awaiting-approval"].includes(r.status),
      "RUN_FINISHED",
      "This task is no longer running",
      409,
    );
    this.s.update("run", w, {
      ...r,
      cancelRequested: true,
      status: "cancelled",
      updatedAt: now(),
    });
    this.controllers.get(rid)?.abort();
    this.s.event(rid, {
      type: "cancelled",
      message: "Cancellation requested; late results will not publish",
    });
    return { ok: true };
  }
  retry(w: string, rid: string) {
    const r = this.s.get<Run>("run", w, rid);
    ensure(
      ["failed", "interrupted", "cancelled"].includes(r.status),
      "RETRY_CONFLICT",
      "Only failed, interrupted, or cancelled tasks may be retried",
      409,
    );
    this.s.insert("attempt-result", w, {
      id: id(),
      runId: r.id,
      attempt: r.attempt,
      status: r.status,
      error: r.error,
      result: r.result,
      createdAt: now(),
    });
    this.s.update("run", w, {
      ...r,
      status: "queued",
      cancelRequested: false,
      error: undefined,
      sdkState: undefined,
      sdkStateHash: undefined,
      approval: undefined,
      approvalDecision: undefined,
      updatedAt: now(),
    });
    this.s.event(rid, {
      type: "queued",
      message:
        "Explicit retry requested; a new attempt may incur inference usage",
    });
    return r;
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const ac of this.controllers.values()) ac.abort();
    for (const r of this.s.allRuns())
      if (r.status === "running" && r.leaseOwner === this.owner)
        this.s.update("run", r.workspaceId, {
          ...r,
          status: "interrupted",
          leaseOwner: null,
          leaseExpiry: null,
          updatedAt: now(),
        });
  }
}
export function safeError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 1000);
}

export function classifyError(e: unknown, signal?: AbortSignal) {
  if (e instanceof AppError) return { code: e.code, message: e.message };
  const raw = e as { status?: number; code?: string; name?: string };
  const message = safeError(e);
  let code = "TASK_FAILED";
  if (signal?.aborted)
    code = String(signal.reason).includes("deadline")
      ? "DEADLINE_EXCEEDED"
      : "CANCELLED";
  else if (raw?.status === 429) code = "RATE_LIMIT";
  else if (raw?.status === 401) code = "INVALID_CREDENTIALS";
  else if (raw?.code === "model_not_found" || raw?.status === 404)
    code = "MODEL_UNAVAILABLE";
  else if (/MaxTurns|turn limit/i.test(raw?.name ?? message))
    code = "TURN_LIMIT";
  else if (/refusal|refused/i.test(message)) code = "MODEL_REFUSAL";
  else if (
    /ModelBehavior|ZodError|output.*schema|structured output/i.test(
      (raw?.name ?? "") + message,
    )
  )
    code = "INVALID_OUTPUT";
  else if (/connection|network|fetch failed|ECONN|ETIMEDOUT/i.test(message))
    code = "NETWORK_ERROR";
  else if (/tool/i.test(raw?.name ?? "")) code = "TOOL_FAILED";
  return { code, message };
}
