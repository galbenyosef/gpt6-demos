import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, id } from "../../src/backend/persistence/store";
import { WorkspaceService } from "../../src/backend/services/WorkspaceService";

test("reopening an assemblage exposes the newest job for progress recovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assemblavatar-job-recovery-"));
  try {
    const store = new Store(dir), workspaces = new WorkspaceService(store);
    const a = await workspaces.create("Martest fixture", "avatar");
    const oldId = id("job"), activeId = id("job");
    await store.jobs.put({ id: oldId, assemblageId: a.id, status: "failed", phase: "failed", error: "Previous timeout", iteration: 0, maxIterations: 2, progress: 1, createdAt: "2026-09-15T10:00:00Z", updatedAt: "2026-09-15T10:03:00Z" });
    await store.jobs.put({ id: activeId, assemblageId: a.id, status: "running", phase: "generating", iteration: 0, maxIterations: 2, progress: .1, createdAt: "2026-09-15T11:00:00Z", updatedAt: "2026-09-15T11:00:01Z" });
    const reopened = new WorkspaceService(new Store(dir));
    expect((await reopened.detail(a.id)).latestJob).toMatchObject({ id: activeId, status: "running", phase: "generating" });
    const job = await store.jobs.require(activeId); job.status = "failed"; job.error = "Astra timeout"; await store.jobs.put(job);
    expect((await reopened.detail(a.id)).latestJob?.error).toBe("Astra timeout");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
