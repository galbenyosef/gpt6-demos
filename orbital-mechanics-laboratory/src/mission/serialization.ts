import type { Mission } from "./model";
export function parseMission(json: string): Mission {
  const m = JSON.parse(json);
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  const positive = (n: unknown) => finite(n) && (n as number) > 0;
  const vector = (v: any) => v && ["x", "y", "z"].every((k) => finite(v[k]));
  if (
    m?.version !== 1 ||
    typeof m.name !== "string" ||
    !finite(m.epoch) ||
    !Array.isArray(m.bodies) ||
    !m.bodies.length ||
    m.bodies.length > 50 ||
    !Array.isArray(m.spacecraft) ||
    !m.spacecraft.length ||
    m.spacecraft.length > 30 ||
    !Array.isArray(m.manoeuvres) ||
    m.manoeuvres.length > 500
  )
    throw Error("Invalid or unsupported mission file.");
  const ids = new Set<string>();
  for (const b of m.bodies) {
    if (
      typeof b.id !== "string" ||
      ids.has(b.id) ||
      typeof b.name !== "string" ||
      !positive(b.mu) ||
      !positive(b.massKg) ||
      !positive(b.radiusM) ||
      !positive(b.rotationPeriodS) ||
      typeof b.color !== "string"
    )
      throw Error("Invalid celestial body.");
    ids.add(b.id);
    if (
      b.parentId &&
      (!positive(b.orbitRadiusM) ||
        (b.phase !== undefined && !finite(b.phase)) ||
        (b.inclination !== undefined && !finite(b.inclination)))
    )
      throw Error("Invalid ephemeris.");
  }
  for (const b of m.bodies) {
    const seen = new Set([b.id]);
    let p = b.parentId;
    while (p) {
      if (!ids.has(p) || seen.has(p))
        throw Error("Body hierarchy must be acyclic.");
      seen.add(p);
      p = m.bodies.find((x: any) => x.id === p).parentId;
    }
  }
  const craftIds = new Set<string>();
  for (const c of m.spacecraft) {
    if (
      typeof c.id !== "string" ||
      craftIds.has(c.id) ||
      typeof c.name !== "string" ||
      !positive(c.dryMassKg) ||
      !finite(c.fuelMassKg) ||
      c.fuelMassKg < 0 ||
      !vector(c.state?.position) ||
      !vector(c.state?.velocity) ||
      !positive(c.engine?.maxThrustN) ||
      !positive(c.engine?.ispSeconds)
    )
      throw Error("Invalid spacecraft.");
    craftIds.add(c.id);
  }
  const nodes = new Set<string>();
  for (const n of m.manoeuvres) {
    if (
      typeof n.id !== "string" ||
      nodes.has(n.id) ||
      !craftIds.has(n.craftId) ||
      !finite(n.time) ||
      n.time < 0 ||
      !["impulse", "finite"].includes(n.type) ||
      !["LOCAL_ORBITAL", "INERTIAL"].includes(n.frame) ||
      !vector(n.deltaV) ||
      !positive(n.durationS) ||
      !finite(n.throttle) ||
      n.throttle < 0 ||
      n.throttle > 1
    )
      throw Error("Invalid manoeuvre.");
    nodes.add(n.id);
  }
  for (const c of m.spacecraft) {
    const ns = m.manoeuvres
      .filter((n: any) => n.craftId === c.id)
      .sort((a: any, b: any) => a.time - b.time);
    for (let i = 1; i < ns.length; i++) {
      const p = ns[i - 1];
      if (p.type === "finite" && p.time + p.durationS > ns[i].time)
        throw Error("Overlapping burns are not supported.");
    }
  }
  if (
    !positive(m.simulationSettings?.maxStep) ||
    m.simulationSettings.maxStep > 3600 ||
    !positive(m.simulationSettings?.perturbationThreshold) ||
    m.simulationSettings.perturbationThreshold > 0.01
  )
    throw Error("Invalid integration settings.");
  return m as Mission;
}
