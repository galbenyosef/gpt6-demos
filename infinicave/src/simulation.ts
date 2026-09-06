import {
  DT,
  RADIUS,
  SIM_VERSION,
  SCHEMA,
  SPEED,
  WALL_GRACE,
  copy,
  distance,
  objective,
  allRelays,
  type Context,
  type World,
  type Runtime,
  type Vec,
  type Projectile,
} from "./domain";
import { solid, move, velocity, hazardHits, lineClear } from "./physics";
import { seedHash } from "./generation";
export interface Input {
  x: number;
  y: number;
  fire: boolean;
  interact: boolean;
}
export type GameEvent = {
  type:
    | "shot"
    | "enemyShot"
    | "hit"
    | "enemy"
    | "checkpoint"
    | "relay"
    | "death"
    | "complete"
    | "discovery";
  position: Vec;
  text?: string;
};
export function initialRuntime(world: World): Runtime {
  const runtime: Runtime = {
    tick: 0,
    time: 0,
    rng: seedHash(world.seed + "|simulation") || 1,
    player: {
      ...world.spawn,
      vx: 0,
      vy: 0,
      facing: 1,
      health: 100,
      protection: 2,
      cooldown: 0,
      wallContact: 0,
      wallImpact: 0,
    },
    enemies: world.enemies.map((e) => ({
      id: e.id,
      x: e.x,
      y: e.y,
      health: e.kind === "emitter" ? 45 : 30,
      cooldown: 1.5,
      direction: 1,
      mode: 0,
    })),
    projectiles: [],
    nextProjectile: 0,
    relays: 0,
    checkpointId: world.checkpoints[0]!.id,
    activatedCheckpoints: [world.checkpoints[0]!.id],
    explored: [world.rooms[0]!.id],
    discoveries: [],
    status: "active",
    objective: "",
  };
  runtime.objective = objective(world, runtime);
  return runtime;
}
export function createContext(world: World, name: string): Context {
  const now = new Date().toISOString(),
    runtime = initialRuntime(world);
  return {
    schema: SCHEMA,
    simulation: SIM_VERSION,
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 60) || "Untitled expedition",
    created: now,
    updated: now,
    lastPlayed: now,
    world,
    runtime,
    checkpoint: copy(runtime),
    stats: { playTime: 0, deaths: 0, completedAt: null },
    revision: 0,
  };
}
export function recover(context: Context, death = false) {
  context.runtime = copy(context.checkpoint);
  context.runtime.player.vx = 0;
  context.runtime.player.vy = 0;
  context.runtime.player.protection = 3;
  context.runtime.player.wallContact = 0;
  context.runtime.player.wallImpact = 0;
  context.runtime.projectiles = [];
  if (death) context.stats.deaths++;
}
function random(state: Runtime) {
  let x = state.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
export function interactable(context: Context): {
  type: "relay" | "checkpoint" | "heart";
  id: string;
  label: string;
  position: Vec;
} | null {
  const { world: w, runtime: s } = context,
    p = s.player;
  const relay = w.relays.find(
    (r) => !(r.bit & s.relays) && distance(p, r) < 3.5,
  );
  if (relay)
    return {
      type: "relay",
      id: relay.id,
      label: "Activate relay",
      position: relay,
    };
  const cp = w.checkpoints.find((c) => distance(p, c) < 3.5);
  if (cp)
    return {
      type: "checkpoint",
      id: cp.id,
      label: "Repair & set checkpoint",
      position: cp,
    };
  if (s.relays === allRelays(w) && distance(p, w.heart) < 4)
    return {
      type: "heart",
      id: "heart",
      label: "Shut down the heart",
      position: w.heart,
    };
  return null;
}
export function tick(context: Context, input: Input): GameEvent[] {
  const { world: w, runtime: s } = context,
    p = s.player,
    events: GameEvent[] = [];
  if (s.status === "completed") return events;
  s.tick++;
  s.time = s.tick * DT;
  context.stats.playTime += DT;
  p.protection = Math.max(0, p.protection - DT);
  p.cooldown = Math.max(0, p.cooldown - DT);
  ({ vx: p.vx, vy: p.vy } = velocity(p.vx, p.vy, input.x, input.y, DT));
  if (Math.abs(input.x) > 0.05) p.facing = input.x > 0 ? 1 : -1;
  const next = move(w, p, p.vx * DT, p.vy * DT, s.relays, RADIUS, s.time);
  p.x = next.x;
  p.y = next.y;
  // Moving machinery retains its own damage rules. Static walls and closed gates share this cushion.
  const wallX = next.hitX && solid(w, { x: p.x + p.vx * DT, y: p.y }, s.relays);
  const wallY = next.hitY && solid(w, { x: p.x, y: p.y + p.vy * DT }, s.relays);
  const normalX = wallX ? Math.sign(p.vx) : 0,
    normalY = wallY ? Math.sign(p.vy) : 0;
  const impact = Math.min(
    SPEED,
    Math.hypot(wallX ? p.vx : 0, wallY ? p.vy : 0),
  );
  const pushing = input.x * normalX + input.y * normalY > 0.15;
  if (next.hitX) p.vx = 0;
  if (next.hitY) p.vy = 0;
  function damage(amount: number, text?: string) {
    if (p.protection > 0) return false;
    p.health = Math.max(0, p.health - amount);
    p.protection = 1.1;
    events.push({
      type: "hit",
      position: { x: p.x, y: p.y },
      ...(text ? { text } : {}),
    });
    return true;
  }
  if ((wallX || wallY) && (pushing || impact > 2)) {
    p.wallContact = Math.min(WALL_GRACE, p.wallContact + DT);
    p.wallImpact = Math.max(p.wallImpact, impact);
    if (
      p.wallContact >= WALL_GRACE &&
      damage(
        Math.round(12 + (22 * p.wallImpact) / SPEED),
        "Hull scrape · pull away from the wall",
      )
    ) {
      const rebound = 1.6 + p.wallImpact * 0.18;
      if (wallX) p.vx = -normalX * rebound;
      if (wallY) p.vy = -normalY * rebound;
      p.wallContact = 0;
      p.wallImpact = 0;
    }
  } else {
    p.wallContact = Math.max(0, p.wallContact - DT * 2.5);
    p.wallImpact = Math.max(0, p.wallImpact - DT * 6);
  }
  function bullet(position: Vec, vx: number, vy: number, hostile: boolean) {
    s.projectiles.push({
      id: s.nextProjectile++,
      ...position,
      vx,
      vy,
      hostile,
      life: hostile ? 3 : 1.5,
    });
  }
  if (input.fire && p.cooldown === 0) {
    bullet(
      { x: p.x + p.facing * 0.65, y: p.y - 0.03 },
      p.facing * 32,
      0,
      false,
    );
    p.cooldown = 0.18;
    events.push({ type: "shot", position: { x: p.x, y: p.y } });
  }
  for (const h of w.hazards) if (hazardHits(h, p, s.time)) damage(20);
  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i]!,
      def = w.enemies[i]!;
    if (e.health <= 0 || distance(e, p) > 65) continue;
    e.cooldown = Math.max(0, e.cooldown - DT);
    let target = e.direction > 0 ? def.end : def;
    if (
      def.kind === "pursuer" &&
      distance(e, p) < 18 &&
      lineClear(w, e, p, s.relays)
    ) {
      target = p;
      e.mode = 1;
    } else e.mode = 0;
    if (def.kind !== "emitter") {
      const d = distance(e, target);
      if (d < 0.4 && !e.mode) e.direction *= -1;
      if (d > 0.05) {
        const pos = move(
          w,
          e,
          ((target.x - e.x) / d) * 2 * DT,
          ((target.y - e.y) / d) * 2 * DT,
          s.relays,
          0.5,
          s.time,
        );
        e.x = pos.x;
        e.y = pos.y;
        if (pos.hitX || pos.hitY) e.direction *= -1;
      }
    }
    if (distance(e, p) < 1) damage(12);
    if (
      distance(e, p) < 18 &&
      e.cooldown === 0 &&
      lineClear(w, e, p, s.relays)
    ) {
      const d = distance(e, p),
        dx =
          def.kind === "emitter" ? def.facing : (p.x - e.x) / Math.max(d, 0.1),
        dy = def.kind === "emitter" ? 0 : (p.y - e.y) / Math.max(d, 0.1);
      bullet({ x: e.x + dx * 0.8, y: e.y + dy * 0.8 }, dx * 8, dy * 8, true);
      events.push({ type: "enemyShot", position: { x: e.x, y: e.y } });
      e.cooldown = 2.2 + random(s) * 1.2;
    }
  }
  const live: Projectile[] = [];
  for (const b of s.projectiles) {
    b.life -= DT;
    if (b.life <= 0) continue;
    const steps = Math.ceil((Math.hypot(b.vx, b.vy) * DT) / 0.2);
    let hit = false;
    for (let i = 0; i < steps && !hit; i++) {
      b.x += (b.vx * DT) / steps;
      b.y += (b.vy * DT) / steps;
      if (
        solid(w, b, s.relays, 0.1) ||
        w.hazards.some(
          (h) => h.kind !== "beam" && hazardHits(h, b, s.time, 0.1),
        )
      ) {
        hit = true;
        break;
      }
      if (b.hostile) {
        if (distance(b, p) < 0.6) {
          damage(8);
          hit = true;
        }
      } else {
        const enemy = s.enemies.find(
          (e) => e.health > 0 && distance(e, b) < 0.8,
        );
        if (enemy) {
          enemy.health = Math.max(0, enemy.health - 15);
          hit = true;
          if (enemy.health === 0)
            events.push({
              type: "enemy",
              position: { x: enemy.x, y: enemy.y },
            });
        }
      }
    }
    if (!hit) live.push(b);
  }
  s.projectiles = live;
  for (const room of w.rooms)
    if (
      Math.abs(room.x - p.x) < room.width / 2 + 3 &&
      Math.abs(room.y - p.y) < room.height / 2 + 3 &&
      !s.explored.includes(room.id)
    ) {
      s.explored.push(room.id);
      if (room.kind === "optional") {
        s.discoveries.push(room.id);
        events.push({
          type: "discovery",
          position: room,
          text: "Hidden gallery discovered",
        });
      }
    }
  if (p.health <= 0) {
    recover(context, true);
    events.push({ type: "death", position: context.runtime.player });
    return events;
  }
  if (input.interact) {
    const target = interactable(context);
    if (target?.type === "relay") {
      s.relays |= w.relays.find((r) => r.id === target.id)!.bit;
      events.push({
        type: "relay",
        position: target.position,
        text:
          s.relays === allRelays(w)
            ? "All relays online · the heart is open"
            : "Relay online · passage unsealed",
      });
    } else if (target?.type === "checkpoint") {
      p.health = 100;
      p.protection = 2;
      p.vx = 0;
      p.vy = 0;
      p.wallContact = 0;
      p.wallImpact = 0;
      s.checkpointId = target.id;
      if (!s.activatedCheckpoints.includes(target.id))
        s.activatedCheckpoints.push(target.id);
      s.projectiles = [];
      context.checkpoint = copy(s);
      events.push({
        type: "checkpoint",
        position: target.position,
        text: "Checkpoint secured · hull restored",
      });
    } else if (target?.type === "heart") {
      s.status = "completed";
      s.projectiles = [];
      context.stats.completedAt = new Date().toISOString();
      events.push({
        type: "complete",
        position: w.heart,
        text: "The mountain falls silent",
      });
    }
  }
  s.objective = objective(w, s);
  return events;
}
