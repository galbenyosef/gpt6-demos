import { Simulation, dominant, type Snapshot } from "./Simulation";
import { bodyState, type Mission } from "../mission/model";
import { elements } from "../physics/orbits";
import { relative, norm, type Vec3 } from "../physics/math";
export interface Point {
  t: number;
  position: Vec3;
  altitude: number;
  speed: number;
  energy: number;
  distance: number;
}
export interface Prediction {
  id: number;
  points: Point[];
  baseline: Point[];
  events: Snapshot["events"];
  encounter: {
    bodyId: string;
    distance: number;
    velocity: number;
    time: number;
    soiEntry: number | null;
    periapsis: number;
  } | null;
  final: Snapshot;
  initial: Snapshot;
}
let sim: Simulation,
  generation = 0,
  predictionId = 0;
const delay = () => new Promise((r) => setTimeout(r, 0));
async function advanceAsync(
  s: Simulation,
  target: number,
  valid: () => boolean,
) {
  let steps = 0;
  while (!s.stepTo(target)) {
    if (++steps % 300 === 0) {
      await delay();
      if (!valid()) return false;
    }
    if (steps > 3000000)
      throw Error("Calculation limit reached. Choose a shorter horizon.");
  }
  return valid();
}
self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === "load" || msg.type === "seek") {
      const g = ++generation;
      predictionId++;
      const m: Mission = msg.mission ?? sim.mission;
      const candidate = new Simulation(m);
      if (
        await advanceAsync(
          candidate,
          Math.max(0, msg.time ?? 0),
          () => g === generation,
        )
      ) {
        sim = candidate;
        postMessage({ type: "state", snapshot: sim.snapshot(), loaded: true });
      }
    }
    if (msg.type === "advance" && sim) {
      const g = generation;
      const candidate = sim.clone();
      if (
        await advanceAsync(candidate, sim.time + msg.dt, () => g === generation)
      ) {
        sim = candidate;
        postMessage({ type: "state", snapshot: sim.snapshot() });
      }
    }
    if (msg.type === "predict" && sim) {
      const id = msg.id;
      predictionId = id;
      const g = generation,
        valid = () => predictionId === id && g === generation,
        planned = sim.clone(),
        baseline = sim.clone();
      baseline.mission = { ...baseline.mission, manoeuvres: [] };
      const initial = sim.snapshot(),
        start = sim.time,
        craftId = msg.craftId,
        target =
          sim.mission.bodies.find((b) => b.id === msg.targetId) ??
          sim.mission.bodies.find((b) => b.id === "moon") ??
          sim.mission.bodies[0]!;
      const craft = sim.crafts.find((c) => c.id === craftId)!;
      const body = dominant(craft.state, start, sim.mission.bodies),
        el = elements(
          relative(craft.state, bodyState(body, start, sim.mission.bodies)),
          body.mu,
        ),
        horizon = msg.horizon || el.period || 86400;
      const points: Point[] = [],
        base: Point[] = [];
      let encounter: Prediction["encounter"] = null;
      const sample = (s: Simulation): Point => {
        const c = s.crafts.find((c) => c.id === craftId)!,
          b = dominant(c.state, s.time, s.mission.bodies),
          rel = relative(c.state, bodyState(b, s.time, s.mission.bodies)),
          tr = relative(c.state, bodyState(target, s.time, s.mission.bodies)),
          ee = elements(rel, b.mu);
        return {
          t: s.time,
          position: c.state.position,
          altitude: norm(rel.position) - b.radiusM,
          speed: norm(rel.velocity),
          energy: ee.energy,
          distance: norm(tr.position),
        };
      };
      // Keep the integration schedule independent of display sampling. Sample
      // short-lived clones between canonical steps; never commit sample boundaries.
      const preceding = new Map<Simulation, Simulation>();
      const sampleAt = async (engine: Simulation, time: number) => {
        let steps = 0;
        while (engine.time < time - 1e-7) {
          preceding.set(engine, engine.clone());
          engine.stepTo(start + horizon);
          if (++steps % 300 === 0) {
            await delay();
            if (!valid()) return null;
          }
        }
        if (Math.abs(engine.time - time) < 1e-7) return engine;
        const sampled = preceding.get(engine)!.clone();
        if (!(await advanceAsync(sampled, time, valid))) return null;
        return sampled;
      };
      let t = start;
      while (t <= start + horizon + 1e-5) {
        const plannedSample = await sampleAt(planned, t);
        const baselineSample = await sampleAt(baseline, t);
        if (!plannedSample || !baselineSample || !valid()) return;
        const p = sample(plannedSample);
        points.push(p);
        base.push(sample(baselineSample));
        const tc = plannedSample.crafts.find((c) => c.id === craftId)!,
          targetRel = relative(
            tc.state,
            bodyState(target, t, sim.mission.bodies),
          );
        if (!encounter || p.distance < encounter.distance)
          encounter = {
            bodyId: target.id,
            distance: p.distance,
            velocity: norm(targetRel.velocity),
            time: t,
            soiEntry: null,
            periapsis:
              elements(targetRel, target.mu).periapsis - target.radiusM,
          };
        if (tc.collided || t >= start + horizon - 1e-5) break;
        // Sample more tightly where angular velocity is high; bounded for long horizons.
        const cb = dominant(tc.state, t, sim.mission.bodies),
          rr = relative(tc.state, bodyState(cb, t, sim.mission.bodies));
        const curved =
          (norm(rr.position) / Math.max(norm(rr.velocity), 1)) * 0.06;
        const step = Math.max(horizon / 2400, Math.min(horizon / 300, curved));
        t = Math.min(start + horizon, t + step);
        if (points.length % 40 === 0) {
          postMessage({
            type: "progress",
            id,
            progress: (t - start) / horizon,
          });
          await delay();
          if (!valid()) return;
        }
      }
      if (encounter)
        encounter.soiEntry =
          planned.events.find(
            (e) =>
              e.type === "SOI_ENTER" &&
              e.bodyId === target.id &&
              e.spacecraftId === craftId &&
              e.time >= start,
          )?.time ?? null;
      if (valid())
        postMessage({
          type: "prediction",
          prediction: {
            id,
            points,
            baseline: base,
            events: planned.events.filter((e) => e.time >= start),
            encounter,
            final: planned.snapshot(),
            initial,
          } satisfies Prediction,
        });
    }
  } catch (error) {
    postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
