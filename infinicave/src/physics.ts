import {
  RADIUS,
  TILE,
  SPEED,
  type World,
  type Vec,
  type Hazard,
} from "./domain";
export function intersectsRect(
  p: Vec,
  radius: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  return (
    (p.x - Math.max(x, Math.min(p.x, x + w))) ** 2 +
      (p.y - Math.max(y, Math.min(p.y, y + h))) ** 2 <
    radius * radius - 1e-9
  );
}
export function solid(world: World, p: Vec, mask = 0, radius = RADIUS) {
  if (
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) ||
    p.x - radius < 0 ||
    p.y - radius < 0 ||
    p.x + radius > world.width ||
    p.y + radius > world.height
  )
    return true;
  for (
    let y = Math.floor((p.y - radius) / TILE);
    y <= Math.floor((p.y + radius) / TILE);
    y++
  )
    for (
      let x = Math.floor((p.x - radius) / TILE);
      x <= Math.floor((p.x + radius) / TILE);
      x++
    ) {
      if (
        world.cells[y * world.cols + x] !== 0 &&
        intersectsRect(p, radius, x * TILE, y * TILE, TILE, TILE)
      )
        return true;
    }
  return world.gates.some(
    (g) =>
      (mask & g.requires) !== g.requires &&
      intersectsRect(
        p,
        radius,
        g.x - g.width / 2,
        g.y - g.height / 2,
        g.width,
        g.height,
      ),
  );
}
export function hazardActive(h: Hazard, time: number) {
  return (((time + h.phase) % h.period) + h.period) % h.period < h.active;
}
export function hazardRect(h: Hazard, time: number) {
  if (!hazardActive(h, time)) return null;
  const phase = (((time + h.phase) % h.period) + h.period) % h.period;
  let length = h.length,
    offset = 0;
  if (h.kind === "slider") {
    length = 1.8;
    offset = ((phase / h.active) * 2 - 1) * (h.length / 2 + length / 2);
  }
  if (h.kind === "barrier") {
    length *= Math.min(1, phase / 0.25, (h.active - phase) / 0.25);
    offset = (length - h.length) / 2;
  }
  const width = h.horizontal ? length : 1.4,
    height = h.horizontal ? 1.4 : length;
  return {
    x: h.x + (h.horizontal ? offset : 0),
    y: h.y + (h.horizontal ? 0 : offset),
    width,
    height,
  };
}
export function hazardHits(h: Hazard, p: Vec, time: number, radius = RADIUS) {
  const rect = hazardRect(h, time);
  return (
    !!rect &&
    intersectsRect(
      p,
      radius,
      rect.x - rect.width / 2,
      rect.y - rect.height / 2,
      rect.width,
      rect.height,
    )
  );
}
export function move(
  world: World,
  p: Vec,
  dx: number,
  dy: number,
  mask: number,
  radius = RADIUS,
  time?: number,
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius * 0.45)));
  const result = { x: p.x, y: p.y, hitX: false, hitY: false };
  const blocked = (q: Vec) =>
    solid(world, q, mask, radius) ||
    (time !== undefined &&
      world.hazards.some(
        (h) => h.kind !== "beam" && hazardHits(h, q, time, radius),
      ));
  for (let i = 0; i < steps; i++) {
    const x = { x: result.x + dx / steps, y: result.y };
    if (!blocked(x)) result.x = x.x;
    else result.hitX = true;
    const y = { x: result.x, y: result.y + dy / steps };
    if (!blocked(y)) result.y = y.y;
    else result.hitY = true;
  }
  return result;
}
export function velocity(
  vx: number,
  vy: number,
  ix: number,
  iy: number,
  dt: number,
) {
  const magnitude = Math.hypot(ix, iy);
  if (magnitude > 1) {
    ix /= magnitude;
    iy /= magnitude;
  }
  const blend = 1 - Math.exp(-9 * dt);
  return {
    vx: vx + (ix * SPEED - vx) * blend,
    vy: vy + (iy * SPEED - vy) * blend,
  };
}
export function lineClear(world: World, a: Vec, b: Vec, mask: number) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5);
  for (let i = 0; i <= n; i++)
    if (
      solid(
        world,
        {
          x: a.x + ((b.x - a.x) * i) / Math.max(n, 1),
          y: a.y + ((b.y - a.y) * i) / Math.max(n, 1),
        },
        mask,
        0.12,
      )
    )
      return false;
  return true;
}
