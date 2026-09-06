import "fake-indexeddb/auto";
import { test, expect } from "bun:test";
import { IDBObjectStore } from "fake-indexeddb";
import { generateWorld } from "../src/generation";
import { createContext, tick } from "../src/simulation";
import {
  getRecord,
  writeContext,
  SaveQueue,
  loadContext,
  importContext,
} from "../src/persistence";
const world = await generateWorld("STORAGE-TEST", "small");
async function mutateRecord(id: string, fn: (record: any) => void) {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const req = indexedDB.open("infinicave-v1");
    req.onsuccess = () => resolve(req.result);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("contexts", "readwrite"),
      store = tx.objectStore("contexts"),
      req = store.get(id);
    req.onsuccess = () => {
      fn(req.result);
      store.put(req.result);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
test("save ordering and coalescing never let an older manual snapshot overwrite newer progress", async () => {
  const c = createContext(world, "Ordered"),
    queue = new SaveQueue();
  c.stats.playTime = 1;
  const a = queue.save(c, true);
  c.stats.playTime = 2;
  const b = queue.save(c);
  c.stats.playTime = 3;
  const d = queue.save(c, true);
  c.stats.playTime = 4;
  const e = queue.save(c, true);
  await Promise.all([a, b, d, e]);
  await queue.flush();
  const record = await getRecord(c.id);
  expect(record!.current.payload.stats.playTime).toBe(4);
  expect(record!.previous!.payload.stats.playTime).toBe(2);
  expect(record!.current.payload.revision).toBe(3);
  expect(record!.current.previousRevision).toBe(2);
});
test("corrupt newest revision offers the prior valid snapshot, then preserves it when committing recovery", async () => {
  const c = createContext(world, "Recovery");
  c.revision = await writeContext(c);
  tick(c, { x: 1, y: 0, fire: false, interact: false });
  c.revision = await writeContext(c);
  await mutateRecord(c.id, (r) => {
    r.current.checksum = "corrupt";
  });
  const loaded = await loadContext(c.id);
  expect(loaded.recovered).toBe(true);
  expect(loaded.context.runtime.tick).toBe(0);
  await writeContext(loaded.context);
  const record = await getRecord(c.id);
  expect(record!.current.payload.revision).toBe(3);
  expect(record!.previous!.payload.revision).toBe(1);
  expect((await loadContext(c.id)).recovered).toBe(false);
});
test("quota failure preserves committed revision and a later retry succeeds", async () => {
  const c = createContext(world, "Quota"),
    queue = new SaveQueue();
  await queue.save(c);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    throw new DOMException("Test quota exceeded", "QuotaExceededError");
  };
  c.stats.playTime = 40;
  try {
    await expect(queue.save(c)).rejects.toThrow("quota");
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  expect((await getRecord(c.id))!.current.payload.stats.playTime).toBe(0);
  await queue.save(c);
  expect((await getRecord(c.id))!.current.payload.stats.playTime).toBe(40);
});
test("aborted transaction cannot publish metadata or a partial revision", async () => {
  const c = createContext(world, "Interrupted");
  await writeContext(c);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    const req = original.apply(this, args);
    this.transaction.abort();
    return req;
  };
  c.name = "Must not commit";
  try {
    await expect(writeContext(c)).rejects.toThrow();
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  expect((await getRecord(c.id))!.current.payload.name).toBe("Interrupted");
});
test("oversized and unsupported imports leave existing contexts intact", async () => {
  const c = createContext(world, "Import safety");
  await writeContext(c);
  const huge = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.json");
  await expect(importContext(huge)).rejects.toThrow("25 MiB");
  const future = new File(
    [JSON.stringify({ payload: { schema: 99, simulation: 1 } })],
    "future.json",
  );
  await expect(importContext(future)).rejects.toThrow("Unsupported");
  expect((await getRecord(c.id))!.current.payload.name).toBe("Import safety");
});

test("normal flight can save midway, shut down the heart, and reload a preserved completion", async () => {
  const { playthrough } = await import("../scripts/playthrough");
  const { context: c, roundtripped } = await playthrough(
    "SAVE-TO-HEART",
    "small",
  );
  expect(roundtripped).toBe(true);
  expect(c.runtime.status).toBe("completed");
  await writeContext(c);
  const { context: restored } = await loadContext(c.id);
  expect(restored.runtime.status).toBe("completed");
  expect(restored.stats.completedAt).not.toBeNull();
  const tickBefore = restored.runtime.tick;
  tick(restored, { x: 1, y: 1, fire: true, interact: true });
  expect(restored.runtime.tick).toBe(tickBefore);
});

test("damaged listing metadata does not hide other contexts or prevent previous-revision recovery", async () => {
  const { listContexts } = await import("../src/persistence");
  const c = createContext(world, "Metadata recovery");
  await writeContext(c);
  await writeContext(c);
  await mutateRecord(c.id, (r) => {
    r.current.payload = null;
  });
  const listed = (await listContexts()).find((r) => r.id === c.id)!;
  expect(listed.current.payload.name).toBe("Metadata recovery");
  expect((await loadContext(c.id)).recovered).toBe(true);
  await mutateRecord(c.id, (r) => {
    r.previous = null;
  });
  expect((await listContexts()).find((r) => r.id === c.id)!.unreadable).toBe(
    true,
  );
});

test("unsupported future revisions are not replaced with an older revision", async () => {
  const c = createContext(world, "Future");
  await writeContext(c);
  await writeContext(c);
  await mutateRecord(c.id, (r) => {
    r.current.payload.schema = 999;
  });
  await expect(loadContext(c.id)).rejects.toThrow("Unsupported");
  expect((await getRecord(c.id))!.current.payload.schema).toBe(999);
});
