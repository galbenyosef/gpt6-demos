import {
  add,
  sub,
  mul,
  norm,
  unit,
  dot,
  relative,
  absolute,
  localToInertial,
  v,
  type Vec3,
  type StateVector,
} from "../physics/math";
import { elements, kepler, RK4 } from "../physics/orbits";
import {
  bodyState,
  soi,
  G0,
  type Body,
  type Craft,
  type Mission,
  type Maneuver,
} from "../mission/model";
export interface SimEvent {
  time: number;
  type:
    | "SOI_ENTER"
    | "SOI_EXIT"
    | "PERIAPSIS"
    | "APOAPSIS"
    | "COLLISION"
    | "MANEUVER_START"
    | "MANEUVER_END"
    | "FUEL_EMPTY";
  bodyId?: string;
  spacecraftId: string;
}
export interface Diagnostic {
  bodyId: string;
  propagator: string;
  step: number;
  energyDrift: number;
  momentumDrift: number;
  acceleration: Vec3;
}
export interface Snapshot {
  time: number;
  crafts: Craft[];
  events: SimEvent[];
  diagnostics: Record<string, Diagnostic>;
}
const rk = new RK4();
export function dominant(s: StateVector, t: number, bodies: Body[]): Body {
  return (
    [...bodies]
      .sort((a, b) => soi(a, bodies) - soi(b, bodies))
      .find(
        (b) =>
          norm(sub(s.position, bodyState(b, t, bodies).position)) <
          soi(b, bodies),
      ) ?? bodies.find((b) => !b.parentId)!
  );
}
export function gravity(position: Vec3, t: number, bodies: Body[]): Vec3 {
  let acc = v();
  for (const b of bodies) {
    const d = sub(bodyState(b, t, bodies).position, position),
      r = norm(d);
    acc = add(acc, mul(d, b.mu / Math.max(r, 1) ** 3));
  }
  return acc;
}
function ephemerisAcceleration(b: Body, t: number, bodies: Body[]): Vec3 {
  if (!b.parentId) return v();
  const p = bodies.find((x) => x.id === b.parentId)!;
  const d = sub(
    bodyState(b, t, bodies).position,
    bodyState(p, t, bodies).position,
  );
  return add(
    ephemerisAcceleration(p, t, bodies),
    mul(d, -(p.mu + b.mu) / b.orbitRadiusM! ** 3),
  );
}
export class Simulation {
  time = 0;
  crafts: Craft[];
  events: SimEvent[] = [];
  diagnostics: Record<string, Diagnostic> = {};
  applied = new Set<string>();
  constructor(public mission: Mission) {
    this.crafts = structuredClone(mission.spacecraft);
  }
  snapshot(): Snapshot {
    return {
      time: this.time,
      crafts: structuredClone(this.crafts),
      events: this.events.slice(-200),
      diagnostics: structuredClone(this.diagnostics),
    };
  }
  clone(): Simulation {
    const s = new Simulation(this.mission);
    s.time = this.time;
    s.crafts = structuredClone(this.crafts);
    s.events = this.events.slice();
    s.applied = new Set(this.applied);
    s.diagnostics = structuredClone(this.diagnostics);
    return s;
  }
  event(type: SimEvent["type"], c: Craft, bodyId?: string, time = this.time) {
    this.events.push({ time, type, spacecraftId: c.id, bodyId });
  }
  applyNodes() {
    for (const n of this.mission.manoeuvres) {
      if (this.applied.has(n.id) || n.time > this.time + 1e-7) continue;
      const c = this.crafts.find((c) => c.id === n.craftId);
      if (!c || c.collided) continue;
      this.applied.add(n.id);
      this.event("MANEUVER_START", c);
      if (n.type === "impulse") {
        const b = dominant(c.state, this.time, this.mission.bodies),
          rel = relative(c.state, bodyState(b, this.time, this.mission.bodies)),
          delta =
            n.frame === "INERTIAL" ? n.deltaV : localToInertial(n.deltaV, rel),
          requested = norm(delta),
          exhaust = c.engine.ispSeconds * G0,
          max = exhaust * Math.log((c.dryMassKg + c.fuelMassKg) / c.dryMassKg),
          dv = Math.min(requested, max);
        c.state.velocity = add(c.state.velocity, mul(unit(delta), dv));
        c.fuelMassKg = Math.max(
          0,
          (c.dryMassKg + c.fuelMassKg) * Math.exp(-dv / exhaust) - c.dryMassKg,
        );
        this.event("MANEUVER_END", c);
        if (dv + 1e-7 < requested) this.event("FUEL_EMPTY", c);
      }
    }
  }
  activeBurn(c: Craft): Maneuver | undefined {
    return this.mission.manoeuvres.find(
      (n) =>
        n.craftId === c.id &&
        n.type === "finite" &&
        n.time <= this.time + 1e-7 &&
        n.time + n.durationS > this.time + 1e-7 &&
        c.fuelMassKg > 1e-9,
    );
  }
  stepTo(target: number): boolean {
    if (target < this.time)
      throw Error("Reverse propagation requires mission replay.");
    this.applyNodes();
    if (this.time >= target - 1e-7) return true;
    let dt = Math.min(
      this.mission.simulationSettings.maxStep,
      target - this.time,
    );
    for (const n of this.mission.manoeuvres) {
      for (const boundary of [
        n.time,
        ...(n.type === "finite" ? [n.time + n.durationS] : []),
      ])
        if (boundary > this.time + 1e-7)
          dt = Math.min(dt, boundary - this.time);
    }
    const config = this.crafts
      .filter((c) => !c.collided)
      .map((c) => {
        const b = dominant(c.state, this.time, this.mission.bodies),
          bs = bodyState(b, this.time, this.mission.bodies),
          rel = relative(c.state, bs),
          r = norm(rel.position),
          el = elements(rel, b.mu),
          burn = this.activeBurn(c),
          central = mul(rel.position, -b.mu / r ** 3),
          total = sub(
            gravity(c.state.position, this.time, this.mission.bodies),
            ephemerisAcceleration(b, this.time, this.mission.bodies),
          );
        const numerical =
          !!burn ||
          norm(sub(total, central)) / norm(central) >
            this.mission.simulationSettings.perturbationThreshold;
        if (numerical)
          dt = Math.min(
            dt,
            Math.max(0.1, 0.025 * Math.sqrt(r ** 3 / b.mu)),
            r < 2 * b.radiusM ? 10 : 120,
          );
        if (el.periapsis < b.radiusM + 100000 || numerical)
          dt = Math.min(
            dt,
            Math.max(
              0.02,
              ((r - b.radiusM) / Math.max(norm(rel.velocity), 1)) * 0.2,
            ),
          );
        // Resolve crossings even when coasting analytically.
        for (const body of this.mission.bodies) {
          if (body.id === b.id || !body.parentId) continue;
          const rs = relative(
              c.state,
              bodyState(body, this.time, this.mission.bodies),
            ),
            distance = norm(rs.position),
            boundary = soi(body, this.mission.bodies);
          if (distance < boundary * 2)
            dt = Math.min(
              dt,
              Math.max(
                0.1,
                (Math.abs(distance - boundary) /
                  Math.max(norm(rs.velocity), 1)) *
                  0.2,
              ),
            );
        }
        if (burn) {
          dt = Math.min(dt, 0.5);
          const flow =
            (c.engine.maxThrustN * burn.throttle) / (c.engine.ispSeconds * G0);
          if (flow > 0) dt = Math.min(dt, c.fuelMassKg / flow);
        }
        return { c, b, rel, el, burn, numerical };
      });
    dt = Math.max(Math.min(dt, target - this.time), 1e-8);
    for (const { c, b, rel, el, burn, numerical } of config) {
      const beforeFuel = c.fuelMassKg,
        flow = burn
          ? (c.engine.maxThrustN * burn.throttle) / (c.engine.ispSeconds * G0)
          : 0;
      let next: StateVector;
      if (numerical) {
        next = rk.step(rel, this.time, dt, (p, vel, t) => {
          const center = bodyState(b, t, this.mission.bodies);
          let a = sub(
            gravity(add(p, center.position), t, this.mission.bodies),
            ephemerisAcceleration(b, t, this.mission.bodies),
          );
          if (burn) {
            const direction =
              burn.frame === "INERTIAL"
                ? burn.deltaV
                : localToInertial(burn.deltaV, { position: p, velocity: vel });
            a = add(
              a,
              mul(
                unit(direction),
                (c.engine.maxThrustN * burn.throttle) /
                  (c.dryMassKg +
                    Math.max(0, beforeFuel - flow * (t - this.time))),
              ),
            );
          }
          return a;
        });
      } else next = kepler(rel, b.mu, dt);
      c.state = absolute(
        next,
        bodyState(b, this.time + dt, this.mission.bodies),
      );
      c.fuelMassKg = Math.max(0, beforeFuel - flow * dt);
      if (burn && c.fuelMassKg < 1e-8) {
        c.fuelMassKg = 0;
        this.event("FUEL_EMPTY", c, undefined, this.time + dt);
      }
      const nb = dominant(c.state, this.time + dt, this.mission.bodies);
      if (nb.id !== b.id) {
        this.event("SOI_EXIT", c, b.id, this.time + dt);
        this.event("SOI_ENTER", c, nb.id, this.time + dt);
      }
      const radialBefore = dot(rel.position, rel.velocity),
        radialAfter = dot(next.position, next.velocity);
      if (el.eccentricity > 1e-5 && radialBefore * radialAfter < 0)
        this.event(
          radialBefore < 0 ? "PERIAPSIS" : "APOAPSIS",
          c,
          b.id,
          this.time + dt,
        );
      for (const body of this.mission.bodies) {
        if (
          norm(
            sub(
              c.state.position,
              bodyState(body, this.time + dt, this.mission.bodies).position,
            ),
          ) <= body.radiusM
        ) {
          c.collided = body.id;
          this.event("COLLISION", c, body.id, this.time + dt);
        }
      }
      const ne = elements(next, b.mu);
      this.diagnostics[c.id] = {
        bodyId: nb.id,
        propagator: numerical ? "RK4 · multi-body" : "Kepler · universal",
        step: dt,
        energyDrift: (ne.energy - el.energy) / Math.max(Math.abs(el.energy), 1),
        momentumDrift:
          (ne.angularMomentum - el.angularMomentum) / el.angularMomentum,
        acceleration: gravity(
          c.state.position,
          this.time + dt,
          this.mission.bodies,
        ),
      };
    }
    const old = this.time;
    this.time += dt;
    for (const n of this.mission.manoeuvres)
      if (
        n.type === "finite" &&
        n.time + n.durationS > old + 1e-7 &&
        n.time + n.durationS <= this.time + 1e-7
      ) {
        const c = this.crafts.find((c) => c.id === n.craftId);
        if (c) this.event("MANEUVER_END", c);
      }
    this.applyNodes();
    return this.time >= target - 1e-7;
  }
  advance(target: number) {
    let count = 0;
    while (!this.stepTo(target)) {
      if (++count > 5000000)
        throw Error("Integration limit reached; reduce the time horizon.");
    }
    return this.snapshot();
  }
}
