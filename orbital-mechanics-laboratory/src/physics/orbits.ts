import {
  v,
  add,
  mul,
  dot,
  cross,
  norm,
  unit,
  clamp,
  type StateVector,
  type Vec3,
} from "./math";
export interface OrbitalElements {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  longitudeAscendingNode: number;
  argumentOfPeriapsis: number;
  trueAnomaly: number;
  period: number | null;
  periapsis: number;
  apoapsis: number | null;
  energy: number;
  angularMomentum: number;
}
const tau = 2 * Math.PI;
const positive = (a: number) => ((a % tau) + tau) % tau;
const angle = (a: Vec3, b: Vec3, n: Vec3) =>
  positive(Math.atan2(dot(cross(a, b), unit(n)), dot(a, b)));
export function elements(s: StateVector, mu: number): OrbitalElements {
  const r = norm(s.position),
    speed = norm(s.velocity),
    h = cross(s.position, s.velocity),
    hn = norm(h),
    n = cross(v(0, 0, 1), h);
  const evec = add(mul(cross(s.velocity, h), 1 / mu), mul(s.position, -1 / r)),
    e = norm(evec),
    energy = (speed * speed) / 2 - mu / r,
    a = -mu / (2 * energy);
  const inc = Math.acos(clamp(h.z / hn, -1, 1));
  const equatorial = norm(n) < hn * 1e-10,
    circular = e < 1e-9;
  const lan = equatorial ? 0 : positive(Math.atan2(n.y, n.x));
  const arg = circular
    ? 0
    : equatorial
      ? positive(Math.atan2(evec.y, evec.x) * (h.z >= 0 ? 1 : -1))
      : angle(n, evec, h);
  const anomaly = circular
    ? equatorial
      ? positive(Math.atan2(s.position.y, s.position.x) * (h.z >= 0 ? 1 : -1))
      : angle(n, s.position, h)
    : angle(evec, s.position, h);
  return {
    semiMajorAxis: a,
    eccentricity: e,
    inclination: inc,
    longitudeAscendingNode: lan,
    argumentOfPeriapsis: arg,
    trueAnomaly: anomaly,
    period: energy < 0 ? tau * Math.sqrt(a ** 3 / mu) : null,
    periapsis: (hn * hn) / mu / (1 + e),
    apoapsis: e < 1 ? (hn * hn) / mu / (1 - e) : null,
    energy,
    angularMomentum: hn,
  };
}
export function fromElements(
  e: Pick<
    OrbitalElements,
    | "semiMajorAxis"
    | "eccentricity"
    | "inclination"
    | "longitudeAscendingNode"
    | "argumentOfPeriapsis"
    | "trueAnomaly"
  >,
  mu: number,
): StateVector {
  const {
      semiMajorAxis: a,
      eccentricity: ec,
      inclination: i,
      longitudeAscendingNode: O,
      argumentOfPeriapsis: w,
      trueAnomaly: f,
    } = e,
    p = a * (1 - ec * ec),
    r = p / (1 + ec * Math.cos(f));
  const transform = (x: number, y: number): Vec3 =>
    v(
      (Math.cos(O) * Math.cos(w) - Math.sin(O) * Math.sin(w) * Math.cos(i)) *
        x +
        (-Math.cos(O) * Math.sin(w) - Math.sin(O) * Math.cos(w) * Math.cos(i)) *
          y,
      (Math.sin(O) * Math.cos(w) + Math.cos(O) * Math.sin(w) * Math.cos(i)) *
        x +
        (-Math.sin(O) * Math.sin(w) + Math.cos(O) * Math.cos(w) * Math.cos(i)) *
          y,
      Math.sin(w) * Math.sin(i) * x + Math.cos(w) * Math.sin(i) * y,
    );
  return {
    position: transform(r * Math.cos(f), r * Math.sin(f)),
    velocity: transform(
      -Math.sqrt(mu / p) * Math.sin(f),
      Math.sqrt(mu / p) * (ec + Math.cos(f)),
    ),
  };
}
export const escapeVelocity = (mu: number, r: number) =>
  Math.sqrt((2 * mu) / r);
export function hohmann(mu: number, r1: number, r2: number) {
  if (!(mu > 0 && r1 > 0 && r2 > 0))
    throw Error("Orbit radii must be positive.");
  const a = (r1 + r2) / 2;
  const first = Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1),
    second = Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  return {
    first,
    second,
    duration: Math.PI * Math.sqrt(a ** 3 / mu),
    total: Math.abs(first) + Math.abs(second),
  };
}
function stumpff(z: number): [number, number] {
  if (z > 1e-7) {
    const q = Math.sqrt(z);
    return [(1 - Math.cos(q)) / z, (q - Math.sin(q)) / q ** 3];
  }
  if (z < -1e-7) {
    const q = Math.sqrt(-z);
    return [(Math.cosh(q) - 1) / -z, (Math.sinh(q) - q) / q ** 3];
  }
  return [1 / 2 - z / 24 + (z * z) / 720, 1 / 6 - z / 120 + (z * z) / 5040];
}
// Universal-variable f/g solution, including elliptic, parabolic and hyperbolic states.
export function kepler(s: StateVector, mu: number, dt: number): StateVector {
  if (dt === 0) return structuredClone(s);
  const r = norm(s.position),
    rv = dot(s.position, s.velocity) / Math.sqrt(mu),
    alpha = 2 / r - dot(s.velocity, s.velocity) / mu;
  let t = dt;
  if (alpha > 0) {
    const period = tau / Math.sqrt(mu * alpha ** 3);
    t = dt % period;
  }
  let x = alpha > 1e-12 ? Math.sqrt(mu) * t * alpha : (Math.sqrt(mu) * t) / r;
  if (alpha < -1e-12)
    x =
      Math.sign(t) *
      Math.sqrt(-1 / alpha) *
      Math.log(1 + Math.abs(t) * Math.sqrt(mu) * (-alpha) ** 1.5);
  for (let k = 0; k < 100; k++) {
    const [c, ss] = stumpff(alpha * x * x),
      f =
        rv * x * x * c +
        (1 - alpha * r) * x ** 3 * ss +
        r * x -
        Math.sqrt(mu) * t,
      df = rv * x * (1 - alpha * x * x * ss) + (1 - alpha * r) * x * x * c + r;
    const dx = f / df;
    x -= dx;
    if (Math.abs(dx) < 1e-8) break;
  }
  const [c, ss] = stumpff(alpha * x * x),
    f = 1 - ((x * x) / r) * c,
    g = t - (x ** 3 / Math.sqrt(mu)) * ss,
    position = add(mul(s.position, f), mul(s.velocity, g)),
    rn = norm(position);
  const velocity = add(
    mul(s.position, (Math.sqrt(mu) / (r * rn)) * (alpha * x ** 3 * ss - x)),
    mul(s.velocity, 1 - ((x * x) / rn) * c),
  );
  if (!Number.isFinite(norm(position)))
    throw Error("Kepler solver did not converge");
  return { position, velocity };
}
export type Acceleration = (position: Vec3, velocity: Vec3, t: number) => Vec3;
export interface Integrator {
  step(s: StateVector, t: number, dt: number, a: Acceleration): StateVector;
}
export class RK4 implements Integrator {
  step(s: StateVector, t: number, h: number, a: Acceleration): StateVector {
    const k1p = s.velocity,
      k1v = a(s.position, s.velocity, t);
    const k2p = add(s.velocity, mul(k1v, h / 2)),
      k2v = a(add(s.position, mul(k1p, h / 2)), k2p, t + h / 2);
    const k3p = add(s.velocity, mul(k2v, h / 2)),
      k3v = a(add(s.position, mul(k2p, h / 2)), k3p, t + h / 2);
    const k4p = add(s.velocity, mul(k3v, h)),
      k4v = a(add(s.position, mul(k3p, h)), k4p, t + h);
    const sum = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) =>
      mul(add(add(a, mul(add(b, c), 2)), d), h / 6);
    return {
      position: add(s.position, sum(k1p, k2p, k3p, k4p)),
      velocity: add(s.velocity, sum(k1v, k2v, k3v, k4v)),
    };
  }
}
