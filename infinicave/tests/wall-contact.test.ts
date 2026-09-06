import { describe, expect, test } from "bun:test";
import { generateWorld, digest } from "../src/generation";
import { createContext, tick, recover, type Input } from "../src/simulation";
import { move, solid, wallCushion } from "../src/physics";
import { validateEnvelope, listingContext } from "../src/validation";
import {
  copy,
  DT,
  WALL_GRACE,
  WALL_MARGIN,
  SCHEMA,
  SIM_VERSION,
  type Context,
} from "../src/domain";
const world = await generateWorld("WALL-CONTACT", "small");
const into: Input = { x: -1, y: 0, fire: false, interact: false };
function atWall(speed = 0) {
  const c = createContext(world, "Wall test"),
    p = c.runtime.player;
  const stop = move(world, world.spawn, -1000, 0, 0);
  let free = stop.x,
    blocked = free - 0.5;
  for (let i = 0; i < 20; i++) {
    const mid = (free + blocked) / 2;
    if (solid(world, { x: mid, y: stop.y }, 0)) blocked = mid;
    else free = mid;
  }
  Object.assign(p, { x: free + 0.002, y: stop.y, vx: -speed, protection: 0 });
  c.runtime.enemies.forEach((e) => (e.health = 0));
  return c;
}
async function envelope(c: Context) {
  return { payload: c, checksum: await digest(c), previousRevision: null };
}
function firstHit(c: Context) {
  for (let i = 0; i < 120; i++) {
    const events = tick(c, into);
    if (events.some((e) => e.type === "hit")) return events;
  }
  throw new Error("Sustained wall pressure never damaged the hull");
}
describe("forgiving wall impacts", () => {
  test("sprite contact has a spatial cushion outside the solid core", () => {
    const c = atWall(),
      p = c.runtime.player;
    expect(solid(world, p, 0)).toBe(false);
    const contact = { ...p, x: p.x + WALL_MARGIN * 0.5 };
    expect(solid(world, contact, 0)).toBe(false);
    expect(wallCushion(world, contact, 0).x).toBeLessThan(-0.4);
    expect(wallCushion(world, { ...p, x: p.x + WALL_MARGIN + 0.05 }, 0).x).toBe(
      0,
    );
  });
  test("even a fast first contact and a brief brush leave the hull intact", () => {
    const c = atWall(8);
    for (let i = 0; i < 8; i++) tick(c, into);
    expect(c.runtime.player.health).toBe(100);
    expect(c.runtime.player.wallContact).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) tick(c, { ...into, x: 1 });
    expect(c.runtime.player.health).toBe(100);
    expect(c.runtime.player.wallContact).toBe(0);
    expect(c.stats.deaths).toBe(0);
  });
  test("continuous pressure gets its full grace period, then damages and rebounds", () => {
    const c = atWall(8);
    for (let i = 0; i < Math.floor(WALL_GRACE / DT) - 1; i++) tick(c, into);
    expect(c.runtime.player.health).toBe(100);
    const hits = firstHit(c).filter((e) => e.type === "hit");
    expect(hits).toHaveLength(1);
    expect(c.runtime.player.health).toBeGreaterThanOrEqual(66);
    expect(c.runtime.player.health).toBeLessThan(100);
    expect(c.runtime.player.vx).toBeGreaterThan(0);
    expect(c.runtime.player.wallContact).toBe(0);
    expect(solid(world, c.runtime.player, 0)).toBe(false);
    const health = c.runtime.player.health;
    for (let i = 0; i < 50; i++) tick(c, into);
    expect(c.runtime.player.health).toBe(health);
  });
  test("damage depends on normal impact speed, not tangential speed", () => {
    const gentle = atWall(),
      fast = atWall(8);
    firstHit(gentle);
    firstHit(fast);
    expect(gentle.runtime.player.health).toBeGreaterThan(
      fast.runtime.player.health,
    );
    const graze = atWall();
    for (let i = 0; i < 15; i++) tick(graze, { ...into, x: -0.05, y: 0.7 });
    expect(graze.runtime.player.y).toBeGreaterThan(world.spawn.y);
    expect(graze.runtime.player.wallContact).toBe(0);
    expect(graze.runtime.player.health).toBe(100);
  });
  test("repeated wall impacts can crash and recover at the checkpoint", () => {
    const c = atWall(8);
    for (let i = 0; i < 1200 && !c.stats.deaths; i++) tick(c, into);
    expect(c.stats.deaths).toBe(1);
    expect(c.runtime.player.health).toBe(100);
    expect(c.runtime.player.x).toBe(c.checkpoint.player.x);
    expect(c.runtime.player.wallContact).toBe(0);
    expect(c.runtime.player.wallImpact).toBe(0);
    expect(c.stats.playTime).toBeGreaterThan(WALL_GRACE);
  });
  test("saving during grace preserves the exact next tick and damage timing", async () => {
    const c = atWall(8);
    for (let i = 0; i < 18; i++) tick(c, into);
    const loaded = await validateEnvelope(await envelope(c));
    expect(loaded.runtime.player.wallContact).toBe(
      c.runtime.player.wallContact,
    );
    for (let i = 0; i < 20; i++) {
      expect(tick(loaded, into)).toEqual(tick(c, into));
      expect(loaded.runtime).toEqual(c.runtime);
    }
    recover(loaded);
    expect(loaded.runtime.player.wallContact).toBe(0);
    expect(loaded.runtime.player.wallImpact).toBe(0);
  });
  test("invalid saved wall-contact values are rejected", async () => {
    const c = atWall();
    c.runtime.player.wallContact = WALL_GRACE + 1;
    await expect(validateEnvelope(await envelope(c))).rejects.toThrow(
      "Invalid save",
    );
  });
});
test("version 1 saves migrate on a copy without changing their world or progress", async () => {
  const current = createContext(world, "Old expedition"),
    old: any = copy(current);
  old.schema = old.simulation = 1;
  for (const state of [old.runtime, old.checkpoint]) {
    delete state.player.wallContact;
    delete state.player.wallImpact;
  }
  const original = copy(old),
    raw = { payload: old, checksum: await digest(old), previousRevision: null };
  const upgraded = await validateEnvelope(raw);
  expect(upgraded.schema).toBe(SCHEMA);
  expect(upgraded.simulation).toBe(SIM_VERSION);
  expect(upgraded.world).toEqual(current.world);
  expect(upgraded.runtime).toEqual(current.runtime);
  expect(upgraded.checkpoint).toEqual(current.checkpoint);
  expect(upgraded.stats).toEqual(current.stats);
  expect(raw.payload).toEqual(original);
  expect(listingContext(old)?.name).toBe("Old expedition");
  old.name = "Tampered";
  await expect(validateEnvelope(raw)).rejects.toThrow("checksum");
});
