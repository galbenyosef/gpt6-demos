import { test, expect } from "bun:test";
import {
  v,
  add,
  sub,
  mul,
  norm,
  relative,
  absolute,
  localToInertial,
  inertialToLocal,
  rotatingState,
  inertialState,
} from "../physics/math";
import {
  elements,
  fromElements,
  escapeVelocity,
  hohmann,
  kepler,
  RK4,
} from "../physics/orbits";
import {
  preset,
  bodyState,
  soi,
  BODIES,
  G0,
  createCraft,
} from "../mission/model";
import { parseMission } from "../mission/serialization";
import { Simulation, dominant } from "../simulation/Simulation";
const earth = BODIES[1]!,
  mu = earth.mu,
  r = earth.radiusM + 300000,
  circular = { position: v(r), velocity: v(0, Math.sqrt(mu / r)) },
  period = 2 * Math.PI * Math.sqrt(r ** 3 / mu);
const closeVec = (
  a: ReturnType<typeof v>,
  b: ReturnType<typeof v>,
  tolerance = 1e-5,
) => expect(norm(sub(a, b))).toBeLessThan(tolerance);
test("300 km circular orbit has expected altitude, speed, period and energy", () => {
  const e = elements(circular, mu);
  expect(e.eccentricity).toBeLessThan(1e-12);
  expect(e.semiMajorAxis).toBeCloseTo(r, 6);
  expect(e.period!).toBeCloseTo(period, 7);
  expect(e.period!).toBeGreaterThan(5400);
  expect(e.period!).toBeLessThan(5500);
  expect(e.energy).toBeCloseTo(-mu / (2 * r), 5);
});
test("universal Kepler propagation closes and reverses an orbit", () => {
  closeVec(kepler(circular, mu, period).position, circular.position);
  const next = kepler(circular, mu, 1234);
  expect(norm(next.position)).toBeCloseTo(r, 5);
  const back = kepler(next, mu, -1234);
  closeVec(back.position, circular.position);
  closeVec(back.velocity, circular.velocity);
});
test("RK4 circular orbit radius and energy drift remain bounded over ten orbits", () => {
  const rk = new RK4();
  let s = structuredClone(circular),
    t = 0;
  const dt = 5;
  while (t < period * 10) {
    s = rk.step(s, t, dt, (p) => mul(p, -mu / norm(p) ** 3));
    t += dt;
  }
  expect(Math.abs(norm(s.position) - r)).toBeLessThan(0.01);
  expect(
    Math.abs(
      (elements(s, mu).energy - elements(circular, mu).energy) /
        elements(circular, mu).energy,
    ),
  ).toBeLessThan(1e-9);
});
test("escape velocity gives zero specific energy", () => {
  const speed = escapeVelocity(mu, r);
  expect(speed).toBeCloseTo(Math.sqrt(2) * norm(circular.velocity), 8);
  expect(
    Math.abs(elements({ position: v(r), velocity: v(0, speed) }, mu).energy),
  ).toBeLessThan(1e-7);
});
test("universal propagation handles parabolic and hyperbolic escape", () => {
  for (const factor of [1, 1.3]) {
    const state = {
      position: v(r),
      velocity: v(0, escapeVelocity(mu, r) * factor),
    };
    const next = kepler(state, mu, 5000);
    expect(norm(next.position)).toBeGreaterThan(r);
    expect(
      Math.abs(elements(next, mu).energy - elements(state, mu).energy),
    ).toBeLessThan(0.01);
    closeVec(kepler(next, mu, -5000).position, state.position, 0.01);
  }
});
test("Hohmann transfer agrees with vis-viva and closes on target radius", () => {
  const r2 = 42164000,
    h = hohmann(mu, r, r2),
    a = (r + r2) / 2;
  expect(h.first).toBeCloseTo(
    Math.sqrt(mu * (2 / r - 1 / a)) - Math.sqrt(mu / r),
    8,
  );
  expect(h.second).toBeCloseTo(
    Math.sqrt(mu / r2) - Math.sqrt(mu * (2 / r2 - 1 / a)),
    8,
  );
  const arrival = kepler(
    { position: v(r), velocity: v(0, Math.sqrt(mu / r) + h.first) },
    mu,
    h.duration,
  );
  expect(norm(arrival.position)).toBeCloseTo(r2, 4);
  expect(h.total).toBeCloseTo(h.first + h.second, 8);
});
test("elliptic and hyperbolic state-element-state conversions", () => {
  for (const eccentricity of [0, 0.4, 1.4])
    for (const inclination of [0, 0.5, Math.PI]) {
      const input = {
        semiMajorAxis: eccentricity > 1 ? -2e7 : 2e7,
        eccentricity,
        inclination,
        longitudeAscendingNode: 0.6,
        argumentOfPeriapsis: 0.9,
        trueAnomaly: 0.7,
      };
      const s = fromElements(input, mu),
        round = fromElements(elements(s, mu), mu);
      closeVec(round.position, s.position, 1e-5);
      closeVec(round.velocity, s.velocity, 1e-6);
    }
});
test("body-centred, rotating and local transforms are reversible", () => {
  const body = bodyState(earth, 1234, BODIES),
    state = absolute(circular, body);
  closeVec(relative(state, body).position, circular.position, 1e-4);
  const rot = rotatingState(circular, 0.4, 0.0001);
  closeVec(inertialState(rot, 0.4, 0.0001).velocity, circular.velocity);
  const eccentric = { position: v(r), velocity: v(1200, 7800, 300) },
    delta = v(120, -35, 80);
  closeVec(
    inertialToLocal(localToInertial(delta, eccentric), eccentric),
    delta,
  );
});
test("Moon sphere of influence and moving ephemerides are physical", () => {
  expect(soi(BODIES[2]!, BODIES) / 1000).toBeGreaterThan(65000);
  expect(soi(BODIES[2]!, BODIES) / 1000).toBeLessThan(67000);
  const lunar = relative(
    bodyState(BODIES[2]!, 50000, BODIES),
    bodyState(earth, 50000, BODIES),
  );
  expect(norm(lunar.position)).toBeCloseTo(384400000, 3);
});
test("120 m/s prograde burn raises apoapsis and consumes rocket-equation fuel", () => {
  const m = preset();
  m.manoeuvres.push({
    id: "burn",
    craftId: "explorer-1",
    time: 60,
    type: "impulse",
    frame: "LOCAL_ORBITAL",
    deltaV: v(120),
    durationS: 30,
    throttle: 1,
  });
  const sim = new Simulation(m);
  sim.advance(60);
  const c = sim.crafts[0]!,
    e = elements(relative(c.state, bodyState(earth, 60, m.bodies)), mu);
  expect(e.apoapsis! - earth.radiusM).toBeGreaterThan(700000);
  expect(e.periapsis - earth.radiusM).toBeCloseTo(300000, 1);
  expect(c.fuelMassKg).toBeCloseTo(2000 * Math.exp(-120 / (450 * G0)) - 800, 7);
  expect(sim.events.filter((e) => e.type === "MANEUVER_START")).toHaveLength(1);
  sim.advance(65);
  expect(sim.events.filter((e) => e.type === "MANEUVER_START")).toHaveLength(1);
});
test("finite burn integrates thrust and continuous mass flow", () => {
  const m = preset();
  m.manoeuvres.push({
    id: "finite",
    craftId: "explorer-1",
    time: 0,
    type: "finite",
    frame: "LOCAL_ORBITAL",
    deltaV: v(1),
    durationS: 10,
    throttle: 0.5,
  });
  const sim = new Simulation(m);
  sim.advance(5);
  expect(sim.crafts[0]!.fuelMassKg).toBeCloseTo(
    1200 - (5 * 10000) / (450 * G0),
    7,
  );
  sim.advance(10);
  expect(sim.crafts[0]!.fuelMassKg).toBeCloseTo(
    1200 - (10 * 10000) / (450 * G0),
    7,
  );
  expect(sim.events.some((e) => e.type === "MANEUVER_END")).toBe(true);
  expect(sim.diagnostics["explorer-1"]!.propagator).toContain("RK4");
});
test("fuel exhaustion caps an impulse and never gives negative mass", () => {
  const m = preset();
  m.spacecraft[0]!.fuelMassKg = 1;
  m.manoeuvres.push({
    id: "excess",
    craftId: "explorer-1",
    time: 0,
    type: "impulse",
    frame: "LOCAL_ORBITAL",
    deltaV: v(100000),
    durationS: 1,
    throttle: 1,
  });
  const s = new Simulation(m);
  s.advance(0);
  expect(s.crafts[0]!.fuelMassKg).toBe(0);
  expect(s.events.some((e) => e.type === "FUEL_EMPTY")).toBe(true);
});
test("adaptive stepping resolves collision", () => {
  const m = preset();
  m.spacecraft[0]!.state = absolute(
    { position: v(earth.radiusM + 1000), velocity: v(-500, 0, 0) },
    bodyState(earth, 0, m.bodies),
  );
  const s = new Simulation(m);
  s.advance(10);
  expect(s.crafts[0]!.collided).toBe("earth");
  expect(s.events.some((e) => e.type === "COLLISION")).toBe(true);
});
test("same mission and time-step configuration deterministically replays", () => {
  const m = preset(),
    a = new Simulation(m),
    b = new Simulation(m);
  expect(a.advance(86400)).toEqual(b.advance(86400));
});
test("mission serialization preserves values and rejects malformed state", () => {
  const m = preset();
  expect(parseMission(JSON.stringify(m))).toEqual(m);
  expect(() => parseMission("{}")).toThrow();
  const bad = structuredClone(m);
  bad.bodies[1]!.parentId = "moon";
  expect(() => parseMission(JSON.stringify(bad))).toThrow("acyclic");
  const badFuel = structuredClone(m);
  badFuel.spacecraft[0]!.fuelMassKg = -1;
  expect(() => parseMission(JSON.stringify(badFuel))).toThrow("spacecraft");
});
test("multiple spacecraft propagate independently", () => {
  const m = preset();
  m.spacecraft.push(createCraft(m.bodies, "moon", 100000, 0, 0, "explorer-2"));
  const s = new Simulation(m);
  s.advance(300);
  expect(dominant(s.crafts[1]!.state, 300, m.bodies).id).toBe("moon");
  expect(dominant(s.crafts[0]!.state, 300, m.bodies).id).toBe("earth");
});
test("a tuned lunar transfer enters the SOI and captures near a 100 km orbit; a bad burn misses", () => {
  const m = preset("moon");
  m.manoeuvres = [
    {
      id: "tli",
      craftId: "explorer-1",
      time: 0,
      type: "impulse",
      frame: "LOCAL_ORBITAL",
      deltaV: v(3108.8374),
      durationS: 30,
      throttle: 1,
    },
    {
      id: "capture",
      craftId: "explorer-1",
      time: 391870,
      type: "impulse",
      frame: "LOCAL_ORBITAL",
      deltaV: v(-816.63254),
      durationS: 30,
      throttle: 1,
    },
  ];
  const sim = new Simulation(m);
  sim.advance(401870);
  const moon = m.bodies[2]!,
    c = sim.crafts[0]!,
    e = elements(
      relative(c.state, bodyState(moon, sim.time, m.bodies)),
      moon.mu,
    );
  expect(dominant(c.state, sim.time, m.bodies).id).toBe("moon");
  expect(e.eccentricity).toBeLessThan(0.005);
  expect(e.periapsis - moon.radiusM).toBeGreaterThan(95000);
  expect(e.apoapsis! - moon.radiusM).toBeLessThan(105000);
  expect(c.fuelMassKg).toBeGreaterThan(0);
  expect(
    sim.events.some((e) => e.type === "SOI_ENTER" && e.bodyId === "moon"),
  ).toBe(true);
  const miss = preset("moon");
  miss.manoeuvres = [{ ...m.manoeuvres[0]!, deltaV: v(3150) }];
  const bad = new Simulation(miss);
  bad.advance(604800);
  expect(
    bad.events.some((e) => e.type === "SOI_ENTER" && e.bodyId === "moon"),
  ).toBe(false);
});
test("Mars preset begins outside Earth SOI and coasts in a solar orbit", () => {
  const m = preset("mars"),
    s = new Simulation(m);
  s.advance(86400);
  expect(s.crafts[0]!.collided).toBeUndefined();
  expect(dominant(s.crafts[0]!.state, s.time, m.bodies).id).toBe("sun");
});
