import { v, add, absolute, type StateVector, type Vec3 } from "../physics/math";
import { fromElements, hohmann } from "../physics/orbits";
export const G = 6.6743e-11,
  G0 = 9.80665,
  AU = 149597870700;
export interface Body {
  id: string;
  name: string;
  mu: number;
  massKg: number;
  radiusM: number;
  parentId?: string;
  orbitRadiusM?: number;
  phase?: number;
  inclination?: number;
  rotationPeriodS: number;
  color: string;
}
export interface Craft {
  id: string;
  name: string;
  dryMassKg: number;
  fuelMassKg: number;
  state: StateVector;
  engine: { maxThrustN: number; ispSeconds: number };
  collided?: string;
}
export interface Maneuver {
  id: string;
  craftId: string;
  time: number;
  type: "impulse" | "finite";
  frame: "LOCAL_ORBITAL" | "INERTIAL";
  deltaV: Vec3;
  durationS: number;
  throttle: number;
}
export interface Mission {
  version: 1;
  name: string;
  epoch: number;
  bodies: Body[];
  spacecraft: Craft[];
  manoeuvres: Maneuver[];
  simulationSettings: { maxStep: number; perturbationThreshold: number };
}
export const BODIES: Body[] = [
  {
    id: "sun",
    name: "Sun",
    mu: 1.32712440018e20,
    massKg: 1.98847e30,
    radiusM: 696340000,
    rotationPeriodS: 2160000,
    color: "#e6b964",
  },
  {
    id: "earth",
    name: "Earth",
    mu: 3.986004418e14,
    massKg: 5.9722e24,
    radiusM: 6371000,
    parentId: "sun",
    orbitRadiusM: AU,
    phase: 0,
    rotationPeriodS: 86164.1,
    color: "#688daa",
  },
  {
    id: "moon",
    name: "Moon",
    mu: 4.9048695e12,
    massKg: 7.342e22,
    radiusM: 1737400,
    parentId: "earth",
    orbitRadiusM: 384400000,
    phase: 2.03,
    rotationPeriodS: 2360591.5,
    color: "#babdbd",
  },
  {
    id: "mars",
    name: "Mars",
    mu: 4.282837e13,
    massKg: 6.4171e23,
    radiusM: 3389500,
    parentId: "sun",
    orbitRadiusM: 1.523679 * AU,
    phase: 0.774,
    rotationPeriodS: 88642.7,
    color: "#b47a60",
  },
];
export function bodyState(body: Body, t: number, bodies: Body[]): StateVector {
  if (!body.parentId) return { position: v(), velocity: v() };
  const p = bodies.find((b) => b.id === body.parentId)!;
  const r = body.orbitRadiusM!,
    n = Math.sqrt((p.mu + body.mu) / r ** 3),
    a = (body.phase ?? 0) + n * t,
    i = body.inclination ?? 0;
  return absolute(
    {
      position: v(
        r * Math.cos(a),
        r * Math.sin(a) * Math.cos(i),
        r * Math.sin(a) * Math.sin(i),
      ),
      velocity: v(
        -r * n * Math.sin(a),
        r * n * Math.cos(a) * Math.cos(i),
        r * n * Math.cos(a) * Math.sin(i),
      ),
    },
    bodyState(p, t, bodies),
  );
}
export function soi(b: Body, bodies: Body[]): number {
  const parent = bodies.find((p) => p.id === b.parentId);
  return parent
    ? b.orbitRadiusM! * (b.massKg / parent.massKg) ** 0.4
    : Infinity;
}
export function createCraft(
  bodies: Body[],
  bodyId = "earth",
  altitude = 300000,
  inclination = (28.5 * Math.PI) / 180,
  t = 0,
  id = "explorer-1",
): Craft {
  const b = bodies.find((b) => b.id === bodyId)!;
  return {
    id,
    name:
      id === "explorer-1" ? "Explorer 1" : `Explorer ${id.split("-").at(-1)}`,
    dryMassKg: 800,
    fuelMassKg: 1200,
    engine: { maxThrustN: 20000, ispSeconds: 450 },
    state: absolute(
      fromElements(
        {
          semiMajorAxis: b.radiusM + altitude,
          eccentricity: 0,
          inclination,
          longitudeAscendingNode: 0,
          argumentOfPeriapsis: 0,
          trueAnomaly: 0,
        },
        b.mu,
      ),
      bodyState(b, t, bodies),
    ),
  };
}
export function preset(kind = "earth"): Mission {
  const bodies = structuredClone(BODIES);
  let name = "Earth orbit · Explorer 1",
    craft = createCraft(bodies);
  if (kind === "moon") {
    name = "Earth → Moon · Lunar laboratory";
    craft = createCraft(bodies, "earth", 300000, 0);
  }
  if (kind === "mars") {
    name = "Earth → Mars · Heliocentric transfer";
    craft = createCraft(bodies, "sun", AU - bodies[0]!.radiusM, 0);
    craft.name = "Odyssey 1";
    craft.state = fromElements(
      {
        semiMajorAxis: AU,
        eccentricity: 0,
        inclination: 0,
        longitudeAscendingNode: 0,
        argumentOfPeriapsis: 0,
        trueAnomaly: -0.02,
      },
      bodies[0]!.mu,
    );
  }
  return {
    version: 1,
    name,
    epoch: Date.UTC(2026, 8, 8, 0, 0),
    bodies,
    spacecraft: [craft],
    manoeuvres: [],
    simulationSettings: { maxStep: 3600, perturbationThreshold: 0.001 },
  };
}
export function lagrange(
  primary: Body,
  secondary: Body,
  t: number,
  bodies: Body[],
): { name: string; position: Vec3 }[] {
  const p = bodyState(primary, t, bodies).position,
    s = bodyState(secondary, t, bodies).position,
    dx = s.x - p.x,
    dy = s.y - p.y,
    q = (secondary.massKg / (3 * primary.massKg)) ** (1 / 3);
  return [
    { name: "L1", position: v(p.x + dx * (1 - q), p.y + dy * (1 - q), p.z) },
    { name: "L2", position: v(p.x + dx * (1 + q), p.y + dy * (1 + q), p.z) },
    {
      name: "L3",
      position: v(
        p.x - dx * (1 + (5 * secondary.massKg) / (12 * primary.massKg)),
        p.y - dy * (1 + (5 * secondary.massKg) / (12 * primary.massKg)),
        p.z,
      ),
    },
    {
      name: "L4",
      position: add(
        p,
        v(
          dx / 2 - (dy * Math.sqrt(3)) / 2,
          dy / 2 + (dx * Math.sqrt(3)) / 2,
          0,
        ),
      ),
    },
    {
      name: "L5",
      position: add(
        p,
        v(
          dx / 2 + (dy * Math.sqrt(3)) / 2,
          dy / 2 - (dx * Math.sqrt(3)) / 2,
          0,
        ),
      ),
    },
  ];
}
