import { expect, test } from "bun:test";
import { RenderService } from "../../src/backend/render/RenderService";
const request = (renderer: RenderService, suffix = "", token?: string, body?: unknown) => renderer.fetch(new Request(`http://localhost/api/render/tasks${suffix}`, { method: token ? "POST" : "GET", headers: token ? { "X-Render-Token": token } : {}, body: body === undefined ? undefined : JSON.stringify(body) }));
test("browser claims image inspection and returns validated dimensions without Playwright", async () => {
  const renderer = new RenderService();
  try {
    const result = renderer.inspectImage(new Uint8Array([1]), "image/png");
    const task = await (await request(renderer)).json();
    expect(task.operation).toBe("inspectImage");
    expect((await request(renderer)).status).toBe(204);
    expect((await request(renderer, `/${task.id}`, "wrong", { result: { width: 1, height: 2 } })).status).toBe(409);
    await request(renderer, `/${task.id}`, task.token, { result: { width: 1, height: 2 } });
    expect(await result).toEqual({ width: 1, height: 2 });
  } finally { await renderer.close(); }
});
test("refresh reassigns abandoned work and rejects stale tab results", async () => {
  const renderer = new RenderService(1000, 10);
  try {
    const result = renderer.inspectImage(new Uint8Array([1]), "image/png");
    const first = await (await request(renderer)).json();
    await Bun.sleep(20);
    const next = await (await request(renderer)).json();
    expect(next.id).toBe(first.id); expect(next.token).not.toBe(first.token);
    expect((await request(renderer, `/${first.id}`, first.token, { result: { width: 1, height: 1 } })).status).toBe(409);
    await request(renderer, `/${next.id}`, next.token, { result: { width: 2, height: 2 } });
    expect(await result).toEqual({ width: 2, height: 2 });
  } finally { await renderer.close(); }
});
test("invalid results, closed tabs, and cancellation fail cleanly", async () => {
  const renderer = new RenderService(30);
  try {
    const invalid = renderer.inspectImage(new Uint8Array([1]), "image/png").catch(error => error);
    const task = await (await request(renderer)).json();
    await request(renderer, `/${task.id}`, task.token, { result: { width: 10000, height: 2 } }); expect((await invalid).message).toBe("Invalid browser render result");
    await expect(renderer.inspectImage(new Uint8Array([1]), "image/png")).rejects.toThrow("Keep Assemblavatar open");
    const controller = new AbortController();
    const cancelled = renderer.render({ scene: {}, diagnostics: {} as any, metadata: {} }, [], {}, controller.signal).catch(error => error);
    controller.abort(); expect((await cancelled).message).toContain("cancelled");
    expect((await request(renderer)).status).toBe(204);
  } finally { await renderer.close(); }
});
