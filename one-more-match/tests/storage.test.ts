import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createFileStorage, type StorageProvider } from "../packages/storage";
import { defaultProfile, resultOf } from "../packages/contracts";
import { createMatch } from "../packages/simulation";
const roots: string[] = [];
const stores: StorageProvider[] = [];
async function fixture() {
  const root = await mkdtemp("/tmp/omm-storage-");
  roots.push(root);
  const store = await createFileStorage(root);
  stores.push(store);
  return { root, store };
}
afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
  for (const r of roots.splice(0))
    await rm(r, { recursive: true, force: true });
});
test("profile revision and persistence survive reopen", async () => {
  const { root, store } = await fixture();
  const p = await store.profiles.get();
  const next = await store.profiles.update(
    { ...p, setup: { ...p.setup, country: "BRA" } },
    p.revision,
  );
  expect(next.revision).toBe(1);
  await expect(store.profiles.update(p, 0)).rejects.toThrow("Settings changed");
  await store.close();
  const reopened = await createFileStorage(root);
  stores.push(reopened);
  expect((await reopened.profiles.get()).setup.country).toBe("BRA");
});
test("exclusive ownership rejects concurrent process data access", async () => {
  const { root } = await fixture();
  await expect(createFileStorage(root)).rejects.toThrow(
    "Another One More Match",
  );
});
test("corrupt save recovers backup and keeps damaged evidence", async () => {
  const { root, store } = await fixture();
  const p = await store.profiles.update(defaultProfile(), 0);
  await store.profiles.update(
    { ...p, setup: { ...p.setup, country: "BRA" } },
    1,
  );
  await writeFile(join(root, "profile.json"), "{bad");
  expect((await store.profiles.get()).setup.country).toBe("ARG");
  expect((await readdir(root)).some((n) => n.includes("corrupt"))).toBe(true);
  expect(store.warning).toContain("damaged");
});
test("results are idempotent; result commit wins over old checkpoint", async () => {
  const { store } = await fixture();
  const s = createMatch({
    country: "ARG",
    opponent: "BRA",
    difficulty: "normal",
  });
  await store.matches.save(s);
  expect((await store.matches.latest())?.id).toBe(s.id);
  s.phase = "finished";
  s.finishedAt = new Date().toISOString();
  await store.results.record(resultOf(s));
  await store.results.record(resultOf(s));
  expect((await store.results.list()).length).toBe(1);
  expect(await store.matches.latest()).toBeNull();
});
test("checkpoint isolation, validation and old revisions", async () => {
  const { store } = await fixture();
  const s = createMatch({
    country: "ARG",
    opponent: "BRA",
    difficulty: "normal",
  });
  s.revision = 2;
  await store.matches.save(s);
  s.score[0] = 99;
  s.revision = 1;
  await store.matches.save(s);
  expect((await store.matches.load(s.id))?.score[0]).toBe(0);
  s.revision = 3;
  s.ball.x = NaN;
  await expect(store.matches.save(s)).rejects.toThrow();
  expect((await store.matches.load(s.id))?.revision).toBe(2);
});
test("future schemas are refused without overwriting records", async () => {
  const { root, store } = await fixture();
  const raw = { ...defaultProfile(), schemaVersion: 99 };
  await writeFile(join(root, "profile.json"), JSON.stringify(raw));
  await expect(store.profiles.get()).rejects.toThrow("newer version");
  expect(
    (await Bun.file(join(root, "profile.json")).json()).schemaVersion,
  ).toBe(99);
});
