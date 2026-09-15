import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { startServer } from "../apps/server/server";
let app: Awaited<ReturnType<typeof startServer>> | null = null;
let dir = "";
afterEach(async () => {
  await app?.close();
  app = null;
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  dir = await mkdtemp("/tmp/omm-server-");
  app = await startServer({ port: 0, dataDir: dir });
  const base = `http://127.0.0.1:${app.server.port}/api/v1`;
  const auth = await fetch(base + "/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const cookie = auth.headers.get("set-cookie")!.split(";")[0]!;
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
  ) =>
    fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { base, cookie, request };
}
test("session validation, idempotent create, ready, finished result and rematch", async () => {
  const { base, request } = await fixture();
  expect((await fetch(base + "/profile")).status).toBe(401);
  expect(
    (
      await request(
        "/matches",
        "POST",
        { country: "NOPE", opponent: "BRA", difficulty: "normal" },
        "bad",
      )
    ).status,
  ).toBe(400);
  const setup = { country: "ARG", opponent: "BRA", difficulty: "normal" };
  const a = await (await request("/matches", "POST", setup, "one")).json();
  const b = await (await request("/matches", "POST", setup, "one")).json();
  expect(a.id).toBe(b.id);
  expect(a.phase).toBe("loading");
  await request(`/matches/${a.id}/ready`, "POST", {});
  expect(app!.simulation!.state.phase).toBe("kickoff");
  await request(`/matches/${a.id}/pause`, "POST", {});
  expect(app!.simulation!.state.phase).toBe("paused");
  await request(`/matches/${a.id}/resume`, "POST", {});
  expect(app!.simulation!.state.phase).toBe("kickoff");
  app!.simulation!.state.half = 2;
  app!.simulation!.state.elapsed = 299.999;
  app!.simulation!.phase("playing");
  app!.simulation!.step();
  const next = await (
    await request(`/matches/${a.id}/rematch`, "POST", {}, "next")
  ).json();
  expect(next.id).not.toBe(a.id);
  expect(next.setup.country).toBe("ARG");
  expect(next.opponent).toBe("BRA");
  expect(next.score).toEqual([0, 0]);
  expect((await app!.storage.results.list()).length).toBe(1);
  expect((await request(`/matches/${a.id}/ready`, "POST", {})).status).toBe(
    404,
  );
});
test("host and cross-origin checks reject unrelated pages", async () => {
  const { base, cookie } = await fixture();
  expect(
    (
      await fetch(base + "/profile", {
        headers: { Cookie: cookie, Origin: "https://attacker.invalid" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(base + "/profile", {
        headers: { Cookie: cookie, Host: "attacker.invalid" },
      })
    ).status,
  ).toBe(403);
});
test("authenticated socket receives state, rejects stale inputs, pauses on disconnect", async () => {
  const { base, cookie, request } = await fixture();
  const s = await (
    await request(
      "/matches",
      "POST",
      { country: "ARG", opponent: "BRA", difficulty: "normal" },
      "socket",
    )
  ).json();
  await request(`/matches/${s.id}/ready`, "POST", {});
  const ws = new WebSocket(
    base.replace("http", "ws") + `/play?version=1&match=${s.id}`,
    { headers: { Cookie: cookie } } as any,
  );
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = reject;
  });
  await new Promise((r) => setTimeout(r, 20));
  ws.send(
    JSON.stringify({
      type: "input",
      matchId: s.id,
      seq: 1,
      x: 1,
      z: 0,
      sprint: false,
      shoot: false,
      pass: 1,
      switch: 0,
    }),
  );
  await new Promise((r) => setTimeout(r, 70));
  expect(app!.simulation!.state.ack).toBe(1);
  expect(app!.simulation!.state.phase).toBe("playing");
  ws.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(app!.simulation!.state.phase).toBe("paused");
});
