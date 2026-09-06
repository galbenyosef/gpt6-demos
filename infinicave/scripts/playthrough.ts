import { generateWorld, digest, canonical } from "../src/generation";
import { createContext, tick, interactable } from "../src/simulation";
import { distance, type Vec, type Context, type Envelope } from "../src/domain";
import { validateEnvelope } from "../src/validation";
export async function playthrough(
  seed: string,
  size: "small" | "standard" | "large",
) {
  const world = await generateWorld(seed, size);
  let c = createContext(world, "Automated flight");
  const path = world.rooms
    .filter((r) => r.kind !== "optional")
    .sort((a, b) => a.index - b.index);
  let ticks = 0,
    roundtripped = false;
  function step(x: number, y: number, interact = false) {
    const deaths = c.stats.deaths;
    tick(c, { x, y, fire: true, interact });
    ticks++;
    if (c.stats.deaths !== deaths)
      throw new Error(
        `Flight lost at ${c.runtime.checkpointId}, ${seed}/${size}`,
      );
    if (ticks > 180000) throw new Error("Flight exceeded time budget");
  }
  function go(goal: Vec) {
    for (let i = 0; i < 2000 && distance(c.runtime.player, goal) > 0.15; i++) {
      const p = c.runtime.player,
        dx = goal.x - p.x,
        dy = goal.y - p.y;
      step(
        Math.max(-1, Math.min(1, dx * 0.8 - p.vx * 0.04)),
        Math.max(-1, Math.min(1, dy * 0.8 - p.vy * 0.04)),
      );
    }
    if (distance(c.runtime.player, goal) > 0.2)
      throw new Error(
        `Could not reach ${JSON.stringify(goal)} from ${JSON.stringify(c.runtime.player)}`,
      );
  }
  for (let i = 0; i < path.length; i++) {
    const room = path[i]!,
      prev = path[i - 1];
    if (prev) {
      const h = world.hazards.find((h) => h.roomId === room.id);
      if (h) {
        const [a, b] = [...h.crossing].sort(
          (a, b) => distance(prev, a) - distance(prev, b),
        );
        go(a!);
        for (let j = 0; j < 900; j++) {
          const phase = (c.runtime.time + h.phase) % h.period;
          if (
            phase >= h.active &&
            h.period - phase >= 2.8 &&
            Math.hypot(c.runtime.player.vx, c.runtime.player.vy) < 0.05
          )
            break;
          step(0, 0);
        }
        go(b!);
      }
    }
    go(room);
    if (interactable(c)) step(0, 0, true);
    if (!roundtripped && i >= path.length / 2) {
      const envelope: Envelope = {
        payload: c,
        checksum: await digest(c),
        previousRevision: null,
      };
      const restored = await validateEnvelope(
        JSON.parse(JSON.stringify(envelope)),
      );
      const snapshot = structuredClone(c);
      tick(snapshot, { x: 0.25, y: -0.5, fire: true, interact: false });
      tick(restored, { x: 0.25, y: -0.5, fire: true, interact: false });
      if (canonical(snapshot.runtime) !== canonical(restored.runtime))
        throw new Error("Mid-flight state diverged");
      c = restored;
      roundtripped = true;
    }
  }
  if (c.runtime.status !== "completed")
    throw new Error("Heart did not complete");
  return {
    seed,
    size,
    seconds: Math.round(c.stats.playTime),
    deaths: c.stats.deaths,
    health: c.runtime.player.health,
    rooms: c.runtime.explored.length,
    roundtripped,
    context: c,
  };
}
if (import.meta.main) {
  const results = [];
  for (const size of ["small", "standard", "large"] as const)
    for (let i = 0; i < 3; i++) {
      const { context: _context, ...result } = await playthrough(
        `flight-v1-${i}`,
        size,
      );
      results.push(result);
      console.log(result);
    }
  await Bun.write(
    "tests/playthrough-report.json",
    JSON.stringify(
      {
        automated: true,
        note: "Real controls, collisions, damage and hazards; this is not human playtesting.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
