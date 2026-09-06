import { describe, test, expect } from "bun:test";
import {
  generateWorld,
  validateWorld,
  normalizeSeed,
  worldHash,
  digest,
} from "../src/generation";
import { copy, DT, TILE, type Envelope } from "../src/domain";
import { createContext, tick, recover } from "../src/simulation";
import { move, solid } from "../src/physics";
import { validateEnvelope } from "../src/validation";
const w = await generateWorld("CORE-TEST", "small");
const envelope = async (
  payload: ReturnType<typeof createContext>,
): Promise<Envelope> => ({
  payload,
  checksum: await digest(payload),
  previousRevision: null,
});
describe("deterministic finite caves", () => {
  test("normalizes Unicode, trims whitespace, and preserves case", () => {
    expect(normalizeSeed("  e\u0301Ab  ")).toBe("éAb");
  });
  test("canonical hashes are identical and metadata does not influence worlds", async () => {
    const repeat = await generateWorld(" CORE-TEST ", "small");
    expect(repeat.hash).toBe(w.hash);
    expect(createContext(w, "A").id).not.toBe(createContext(w, "B").id);
    expect((await generateWorld("core-test", "small")).hash).not.toBe(w.hash);
  });
  test("all sizes stay in bounds and pass physical/progression validation", async () => {
    for (const size of ["small", "standard", "large"] as const) {
      const world = await generateWorld("BOUNDS", size);
      expect(validateWorld(world)).toEqual([]);
      expect(world.fallback).toBeUndefined();
    }
  });
  test("retry exhaustion uses a verified bounded fallback", async () => {
    const a = await generateWorld("EXHAUSTED", "small", undefined, {
        rejectCandidates: true,
      }),
      b = await generateWorld("EXHAUSTED", "small", undefined, {
        forceFallback: true,
      });
    expect(a.attempt).toBe(32);
    expect(a.fallback).toBe("safe-small-v1");
    expect(a.hash).toBe(b.hash);
    expect(validateWorld(a)).toEqual([]);
  });
  test("detects disconnected goals and narrow approaches", () => {
    const world = copy(w),
      target = world.relays[0]!;
    for (
      let y = Math.floor(target.y / TILE) - 2;
      y <= Math.floor(target.y / TILE) + 2;
      y++
    )
      for (
        let x = Math.floor(target.x / TILE) - 2;
        x <= Math.floor(target.x / TILE) + 2;
        x++
      )
        world.cells[y * world.cols + x] = 1;
    expect(validateWorld(world).some((e) => e.includes("inaccessible"))).toBe(
      true,
    );
  });
  test("detects a switch behind its own gate", () => {
    const world = copy(w),
      room = world.rooms.find((r) => r.stage === 1)!;
    Object.assign(world.relays[0]!, { x: room.x, y: room.y, roomId: room.id });
    expect(
      validateWorld(world).some((e) => e.includes("prerequisite inaccessible")),
    ).toBe(true);
  });
  test("detects physical gate bypasses", () => {
    const world = copy(w);
    world.gates.splice(0, 1);
    expect(validateWorld(world).some((e) => e.includes("Gate bypass"))).toBe(
      true,
    );
  });
  test("detects unsafe checkpoints and impossible timed crossings", () => {
    const world = copy(w);
    world.checkpoints[0]!.x = 1;
    expect(
      validateWorld(world).some((e) => e.includes("Unsafe checkpoint")),
    ).toBe(true);
    const hazards = copy(w);
    hazards.hazards[0]!.active = 6.8;
    expect(
      validateWorld(hazards).some((e) => e.includes("crossing template")),
    ).toBe(true);
  });
  test("swept movement cannot tunnel through outer walls", () => {
    const p = move(w, w.spawn, -1000, 0, 0);
    expect(p.x).toBeGreaterThan(0);
    expect(solid(w, p, 0)).toBe(false);
    expect(p.hitX).toBe(true);
  });
});
describe("simulation and portable saves", () => {
  test("hover damping, speed bound, normalized diagonals and fixed clock", () => {
    const c = createContext(w, "Flight");
    for (let i = 0; i < 25; i++)
      tick(c, { x: 1, y: 1, fire: false, interact: false });
    expect(
      Math.hypot(c.runtime.player.vx, c.runtime.player.vy),
    ).toBeLessThanOrEqual(8);
    for (let i = 0; i < 90; i++)
      tick(c, { x: 0, y: 0, fire: false, interact: false });
    expect(Math.hypot(c.runtime.player.vx, c.runtime.player.vy)).toBeLessThan(
      0.001,
    );
    expect(c.runtime.time).toBe(c.runtime.tick * DT);
  });
  test("a mid-flight save restores the exact next controlled simulation step", async () => {
    const c = createContext(w, "Roundtrip");
    for (let i = 0; i < 50; i++)
      tick(c, { x: 1, y: 0, fire: true, interact: false });
    const loaded = await validateEnvelope(
      JSON.parse(JSON.stringify(await envelope(c))),
    );
    const input = { x: -0.3, y: 0.5, fire: true, interact: false };
    tick(c, input);
    tick(loaded, input);
    expect(loaded.runtime).toEqual(c.runtime);
    expect(loaded.stats).toEqual(c.stats);
  });
  test("checkpoint rollback restores gameplay and keeps cumulative time/deaths", () => {
    const c = createContext(w, "Recovery");
    tick(c, { x: 0, y: 0, fire: false, interact: true });
    const checkpoint = copy(c.checkpoint);
    c.runtime.relays = 1;
    c.runtime.player.health = 20;
    c.runtime.explored.push(w.rooms[1]!.id);
    c.stats.playTime = 200;
    recover(c, true);
    expect(c.runtime.relays).toBe(checkpoint.relays);
    expect(c.runtime.explored).toEqual(checkpoint.explored);
    expect(c.runtime.player.health).toBe(100);
    expect(c.stats).toEqual({ playTime: 200, deaths: 1, completedAt: null });
    recover(c);
    expect(c.stats.deaths).toBe(1);
  });
  test("rejects corruption, future versions, nonfinite state and unknown references", async () => {
    const c = createContext(w, "Validation");
    const bad = await envelope(c);
    bad.payload.name = "Tampered";
    await expect(validateEnvelope(bad)).rejects.toThrow("checksum");
    const future = copy(c);
    future.schema = 999;
    await expect(validateEnvelope(await envelope(future))).rejects.toThrow(
      "Unsupported",
    );
    const nan = copy(c);
    nan.runtime.player.x = NaN;
    await expect(validateEnvelope(await envelope(nan))).rejects.toThrow(
      "Invalid save",
    );
    const id = copy(c);
    id.runtime.checkpointId = "checkpoint-no-such";
    await expect(validateEnvelope(await envelope(id))).rejects.toThrow(
      "references",
    );
  });
  test("loads the stored geometry independently of the installed generator version", async () => {
    const c = createContext(copy(w), "Old map");
    c.world.generator = "0.9.0";
    c.world.hash = await worldHash(c.world);
    const loaded = await validateEnvelope(await envelope(c));
    expect(loaded.world.generator).toBe("0.9.0");
    expect(loaded.world.cells).toEqual(w.cells);
  });
});
