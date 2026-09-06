import { z } from "zod";
import {
  SCHEMA,
  SIM_VERSION,
  WALL_GRACE,
  SPEED,
  allRelays,
  type Context,
  type Envelope,
} from "./domain";
import { digest, validateWorld, worldHash } from "./generation";
import { solid } from "./physics";
const n = z.number().finite(),
  pos = n.min(0).max(10000),
  id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  vec = z.object({ x: pos, y: pos });
const runtime = z.object({
  tick: n.int().min(0).max(1e12),
  time: n.min(0).max(1e12),
  rng: n.int().min(0).max(0xffffffff),
  player: vec.extend({
    vx: n.min(-9).max(9),
    vy: n.min(-9).max(9),
    facing: z.union([z.literal(-1), z.literal(1)]),
    health: n.min(0).max(100),
    protection: n.min(0).max(5),
    cooldown: n.min(0).max(1),
    wallContact: n.min(0).max(WALL_GRACE),
    wallImpact: n.min(0).max(SPEED),
  }),
  enemies: z
    .array(
      vec.extend({
        id,
        health: n.min(0).max(100),
        cooldown: n.min(0).max(10),
        direction: z.union([z.literal(-1), z.literal(1)]),
        mode: n.int().min(0).max(1),
      }),
    )
    .max(200),
  projectiles: z
    .array(
      vec.extend({
        id: n.int().min(0).max(1e12),
        vx: n.min(-40).max(40),
        vy: n.min(-40).max(40),
        life: n.min(0).max(5),
        hostile: z.boolean(),
      }),
    )
    .max(1000),
  nextProjectile: n.int().min(0).max(1e12),
  relays: n.int().min(0).max(15),
  checkpointId: id,
  activatedCheckpoints: z.array(id).min(1).max(10),
  explored: z.array(id).max(48),
  discoveries: z.array(id).max(48),
  status: z.enum(["active", "completed"]),
  objective: z.string().max(200),
});
const world = z.object({
  generator: z.string().max(40),
  content: z.string().max(40),
  seed: z.string().min(1).max(128),
  size: z.enum(["small", "standard", "large"]),
  attempt: n.int().min(0).max(32),
  fallback: z.string().max(50).optional(),
  width: pos.max(600),
  height: pos.max(450),
  cols: n.int().min(4).max(600),
  rows: n.int().min(4).max(450),
  cells: z.array(z.union([z.literal(0), z.literal(1)])).max(270000),
  rooms: z
    .array(
      vec.extend({
        id,
        index: n.int().min(0).max(47),
        stage: n.int().min(0).max(4),
        kind: z.enum([
          "entrance",
          "cavern",
          "relay",
          "checkpoint",
          "heart",
          "optional",
        ]),
        name: z.string().max(100),
        width: n.min(1).max(50),
        height: n.min(1).max(50),
      }),
    )
    .min(12)
    .max(48),
  edges: z
    .array(
      z.object({
        id,
        a: id,
        b: id,
        width: n.min(1).max(12),
        gateId: id.optional(),
      }),
    )
    .max(150),
  gates: z
    .array(
      vec.extend({
        id,
        width: n.min(0.1).max(12),
        height: n.min(0.1).max(12),
        requires: n.int().min(1).max(15),
      }),
    )
    .max(10),
  relays: z
    .array(vec.extend({ id, roomId: id, bit: n.int().min(1).max(8) }))
    .min(2)
    .max(4),
  checkpoints: z
    .array(vec.extend({ id, roomId: id }))
    .min(1)
    .max(10),
  hazards: z
    .array(
      vec.extend({
        id,
        kind: z.enum(["beam", "barrier", "slider"]),
        roomId: id,
        horizontal: z.boolean(),
        length: n.min(1).max(8),
        period: n.min(0.1).max(20),
        active: n.min(0).max(20),
        phase: n.min(0).max(20),
        crossing: z.tuple([vec, vec]),
      }),
    )
    .max(50),
  enemies: z
    .array(
      vec.extend({
        id,
        kind: z.enum(["patrol", "pursuer", "emitter"]),
        roomId: id,
        end: vec,
        facing: z.union([z.literal(-1), z.literal(1)]),
      }),
    )
    .max(200),
  heart: vec,
  spawn: vec,
  witness: z.array(z.string().max(100)).max(200),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
const contextSchema = z.object({
  schema: z.literal(SCHEMA),
  simulation: z.literal(SIM_VERSION),
  id: z.uuid(),
  sourceId: z.uuid().optional(),
  name: z.string().min(1).max(60),
  created: z.iso.datetime(),
  updated: z.iso.datetime(),
  lastPlayed: z.iso.datetime(),
  world,
  runtime,
  checkpoint: runtime,
  stats: z.object({
    playTime: n.min(0).max(1e12),
    deaths: n.int().min(0).max(1e9),
    completedAt: z.iso.datetime().nullable(),
  }),
  revision: n.int().min(0).max(1e12),
});
const legacyRuntime = runtime.extend({
  player: runtime.shape.player.omit({ wallContact: true, wallImpact: true }),
});
const legacyContext = contextSchema.extend({
  schema: z.literal(1),
  simulation: z.literal(1),
  runtime: legacyRuntime,
  checkpoint: legacyRuntime,
});
function upgradeLegacy(source: z.infer<typeof legacyContext>): Context {
  const upgrade = (state: z.infer<typeof legacyRuntime>) => ({
    ...state,
    player: { ...state.player, wallContact: 0, wallImpact: 0 },
  });
  return {
    ...source,
    schema: SCHEMA,
    simulation: SIM_VERSION,
    runtime: upgrade(source.runtime),
    checkpoint: upgrade(source.checkpoint),
  };
}
export async function validateEnvelope(
  value: unknown,
  checkGeometry = true,
): Promise<Context> {
  if (!value || typeof value !== "object" || !("payload" in value))
    throw new Error("This is not an InfiniCave save.");
  const envelope = value as Envelope;
  if (
    !envelope.payload ||
    typeof envelope.payload !== "object" ||
    typeof envelope.payload.schema !== "number" ||
    typeof envelope.payload.simulation !== "number"
  )
    throw new Error("The save payload is incomplete or damaged.");
  const legacy =
    envelope.payload.schema === 1 && envelope.payload.simulation === 1;
  if (
    !legacy &&
    (envelope.payload.schema !== SCHEMA ||
      envelope.payload.simulation !== SIM_VERSION)
  )
    throw new Error(
      "Unsupported save or simulation version. The original file has been left intact.",
    );
  const parsed = (legacy ? legacyContext : contextSchema).safeParse(
    envelope.payload,
  );
  if (!parsed.success)
    throw new Error(
      `Invalid save data: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
    );
  if (
    typeof envelope.checksum !== "string" ||
    (await digest(envelope.payload)) !== envelope.checksum
  )
    throw new Error(
      "The save checksum does not match. The file may be incomplete or damaged.",
    );
  // Verify the original checksum above, then migrate a parsed copy. Storage changes only on commit.
  const c = legacy
    ? upgradeLegacy(parsed.data as z.infer<typeof legacyContext>)
    : (parsed.data as Context);
  if ((await worldHash(c.world)) !== c.world.hash)
    throw new Error("The stored cave failed its integrity check.");
  if (checkGeometry) {
    const errors = validateWorld(c.world);
    if (errors.length) throw new Error(`Unsafe stored cave: ${errors[0]}`);
  }
  for (const s of [c.runtime, c.checkpoint]) {
    if (
      Math.abs(s.time - s.tick / 60) > 1e-7 ||
      s.relays > allRelays(c.world) ||
      s.enemies.length !== c.world.enemies.length ||
      !c.world.checkpoints.some((cp) => cp.id === s.checkpointId) ||
      !s.activatedCheckpoints.includes(s.checkpointId) ||
      new Set(s.activatedCheckpoints).size !== s.activatedCheckpoints.length ||
      s.activatedCheckpoints.some(
        (id) => !c.world.checkpoints.some((cp) => cp.id === id),
      ) ||
      solid(c.world, s.player, s.relays) ||
      s.enemies.some(
        (e, i) =>
          e.id !== c.world.enemies[i]!.id || solid(c.world, e, s.relays, 0.5),
      ) ||
      s.explored.some((id) => !c.world.rooms.some((r) => r.id === id)) ||
      s.discoveries.some(
        (id) =>
          !c.world.rooms.some((r) => r.id === id && r.kind === "optional"),
      ) ||
      new Set(s.explored).size !== s.explored.length ||
      new Set(s.discoveries).size !== s.discoveries.length ||
      new Set(s.projectiles.map((p) => p.id)).size !== s.projectiles.length ||
      s.projectiles.some(
        (p) =>
          p.id >= s.nextProjectile ||
          p.x >= c.world.width ||
          p.y >= c.world.height,
      ) ||
      (s.status === "completed" && s.relays !== allRelays(c.world))
    )
      throw new Error(
        "The save contains invalid gameplay state or references.",
      );
  }
  if (
    c.checkpoint.status !== "active" ||
    (c.runtime.status === "completed" && !c.stats.completedAt)
  )
    throw new Error("Invalid completion state.");
  return c;
}

export function listingContext(value: unknown): Context | null {
  const result = contextSchema.safeParse(value);
  if (result.success) return result.data;
  const legacy = legacyContext.safeParse(value);
  return legacy.success ? upgradeLegacy(legacy.data) : null;
}
