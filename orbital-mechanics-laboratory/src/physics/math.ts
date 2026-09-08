export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface StateVector {
  position: Vec3;
  velocity: Vec3;
}
export const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 =>
  v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 =>
  v(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: Vec3, s: number): Vec3 => v(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const unit = (a: Vec3) => mul(a, 1 / (norm(a) || 1));
export const clamp = (x: number, a: number, b: number) =>
  Math.max(a, Math.min(b, x));
export const relative = (s: StateVector, b: StateVector): StateVector => ({
  position: sub(s.position, b.position),
  velocity: sub(s.velocity, b.velocity),
});
export const absolute = (s: StateVector, b: StateVector): StateVector => ({
  position: add(s.position, b.position),
  velocity: add(s.velocity, b.velocity),
});
export const rotateZ = (p: Vec3, a: number): Vec3 =>
  v(
    p.x * Math.cos(a) - p.y * Math.sin(a),
    p.x * Math.sin(a) + p.y * Math.cos(a),
    p.z,
  );
export function localBasis(s: StateVector) {
  const radial = unit(s.position),
    normal = unit(cross(s.position, s.velocity));
  return { prograde: unit(s.velocity), normal, radial };
}
// Components: prograde, normal, radial. This basis is nonorthogonal on eccentric orbits.
export function localToInertial(d: Vec3, s: StateVector): Vec3 {
  const b = localBasis(s);
  return add(add(mul(b.prograde, d.x), mul(b.normal, d.y)), mul(b.radial, d.z));
}
export function inertialToLocal(d: Vec3, s: StateVector): Vec3 {
  const { prograde: p, normal: n, radial: r } = localBasis(s),
    q = dot(p, r),
    den = 1 - q * q;
  return v(
    (dot(d, p) - q * dot(d, r)) / den,
    dot(d, n),
    (dot(d, r) - q * dot(d, p)) / den,
  );
}
export function rotatingState(
  s: StateVector,
  angle: number,
  omega: number,
): StateVector {
  return {
    position: rotateZ(s.position, -angle),
    velocity: rotateZ(
      sub(s.velocity, cross(v(0, 0, omega), s.position)),
      -angle,
    ),
  };
}
export function inertialState(
  s: StateVector,
  angle: number,
  omega: number,
): StateVector {
  const position = rotateZ(s.position, angle);
  return {
    position,
    velocity: add(rotateZ(s.velocity, angle), cross(v(0, 0, omega), position)),
  };
}
