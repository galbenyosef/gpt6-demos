import {
  BUDGETS,
  GENERATOR_VERSION,
  CONTENT_VERSION,
  TILE,
  RADIUS,
  DT,
  type Size,
  type World,
  type Room,
  type Vec,
} from "./domain";
import { solid, move, velocity, hazardHits, hazardActive } from "./physics";
// FNV-1a UTF-16 seed hash + mulberry32-v1; all arithmetic explicitly uint32.
export function seedHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function stream(seed: string) {
  let a = seedHash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function normalizeSeed(seed: string) {
  return seed.normalize("NFC").trim();
}
export function freshSeed() {
  return Array.from(crypto.getRandomValues(new Uint8Array(5)), (x) =>
    x.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
}
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(value)),
  );
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function worldHash(world: World) {
  return digest({ ...world, hash: "" });
}
const NAMES = [
  "The sunken archive",
  "Basalt gallery",
  "The quiet foundry",
  "Hollow of echoes",
  "Copper cathedral",
  "The old aqueduct",
  "Obsidian vault",
  "The broken furnace",
  "Luminous hollow",
  "The deep crossing",
  "Forgotten cistern",
  "The winding descent",
];
function build(
  seed: string,
  size: Size,
  attempt: number,
  fallback = false,
): World {
  const b = BUDGETS[size],
    topology = stream(`${seed}|${attempt}|topology`),
    geometry = stream(`${seed}|${attempt}|geometry`),
    entities = stream(`${seed}|${attempt}|entities`);
  const width = b.columns * 48 + 8,
    height = b.rows * 38 + 8;
  const world: World = {
    generator: GENERATOR_VERSION,
    content: CONTENT_VERSION,
    seed,
    size,
    attempt,
    ...(fallback ? { fallback: `safe-${size}-v1` } : {}),
    width,
    height,
    cols: width / TILE,
    rows: height / TILE,
    cells: Array((width * height) / TILE ** 2).fill(1),
    rooms: [],
    edges: [],
    gates: [],
    relays: [],
    checkpoints: [],
    hazards: [],
    enemies: [],
    heart: { x: 0, y: 0 },
    spawn: { x: 0, y: 0 },
    witness: [],
    hash: "",
  };
  const mainCols = b.columns - 1,
    count = mainCols * b.rows;
  const relayIndices = Array.from({ length: b.relays }, (_, k) =>
    Math.floor(((count - 2) * (k + 1)) / (b.relays + 1)),
  );
  const carve = (x: number, y: number) => {
    if (x > 0 && y > 0 && x < world.cols - 1 && y < world.rows - 1)
      world.cells[y * world.cols + x] = 0;
  };
  function room(col: number, row: number, index: number, optional = false) {
    const x = 28 + col * 48,
      y = height - 24 - row * 38;
    const stage = relayIndices.filter((n) => n < index).length;
    const kind = optional
      ? "optional"
      : index === 0
        ? "entrance"
        : index === count - 1
          ? "heart"
          : relayIndices.includes(index)
            ? "relay"
            : relayIndices.includes(index - 1)
              ? "checkpoint"
              : "cavern";
    const r: Room = {
      id: `room-${index}`,
      index,
      stage,
      kind,
      x,
      y,
      width: 28,
      height: 24,
      name:
        kind === "entrance"
          ? "The threshold"
          : kind === "heart"
            ? "Heart of the mountain"
            : kind === "relay"
              ? `Relay ${relayIndices.indexOf(index) + 1} · ${NAMES[index % NAMES.length]}`
              : kind === "checkpoint"
                ? "Wayfarer station"
                : NAMES[index % NAMES.length]!,
    };
    for (let gy = Math.floor((y - 12) / TILE); gy < (y + 12) / TILE; gy++)
      for (let gx = Math.floor((x - 14) / TILE); gx < (x + 14) / TILE; gx++) {
        const dx = Math.abs((gx + 0.5) * TILE - x),
          dy = Math.abs((gy + 0.5) * TILE - y);
        if (
          (dx < 11 && dy < 8) ||
          dx / 14 + dy / 15 < (fallback ? 1.25 : 1.12 + geometry() * 0.32)
        )
          carve(gx, gy);
      }
    world.rooms.push(r);
    if (!optional && (kind === "entrance" || kind === "checkpoint"))
      world.checkpoints.push({ id: `checkpoint-${index}`, roomId: r.id, x, y });
    if (kind === "relay")
      world.relays.push({
        id: `relay-${world.relays.length}`,
        roomId: r.id,
        x,
        y,
        bit: 1 << world.relays.length,
      });
    return r;
  }
  const main: Room[] = [];
  for (let row = 0; row < b.rows; row++)
    for (let n = 0; n < mainCols; n++)
      main.push(room(row % 2 ? mainCols - 1 - n : n, row, main.length));
  function connect(a: Room, z: Room, gate = false, hazard = false) {
    const id = `edge-${world.edges.length}`,
      horizontal = a.y === z.y,
      x = (a.x + z.x) / 2,
      y = (a.y + z.y) / 2;
    const passage = fallback ? 6 : topology() < 0.4 ? 6 : 4;
    for (
      let gy = Math.floor(
        (Math.min(a.y, z.y) - (horizontal ? passage / 2 : 2)) / TILE,
      );
      gy < (Math.max(a.y, z.y) + (horizontal ? passage / 2 : 2)) / TILE;
      gy++
    )
      for (
        let gx = Math.floor(
          (Math.min(a.x, z.x) - (horizontal ? 2 : passage / 2)) / TILE,
        );
        gx < (Math.max(a.x, z.x) + (horizontal ? 2 : passage / 2)) / TILE;
        gx++
      )
        carve(gx, gy);
    let gateId: string | undefined;
    if (gate) {
      gateId = `gate-${world.gates.length}`;
      world.gates.push({
        id: gateId,
        x,
        y,
        width: horizontal ? 2 : passage + 2,
        height: horizontal ? passage + 2 : 2,
        requires: (1 << z.stage) - 1,
      });
    }
    world.edges.push({
      id,
      a: a.id,
      b: z.id,
      width: passage,
      ...(gateId ? { gateId } : {}),
    });
    if (hazard) {
      const kind = (["beam", "barrier", "slider"] as const)[
        world.hazards.length % 3
      ]!;
      world.hazards.push({
        id: `hazard-${world.hazards.length}`,
        kind,
        roomId: z.id,
        x,
        y,
        horizontal: !horizontal,
        length: passage,
        period: 7,
        active: 1.6,
        phase: Math.floor(entities() * 420) / 60,
        crossing: horizontal
          ? [
              { x: x - 4, y },
              { x: x + 4, y },
            ]
          : [
              { x, y: y - 4 },
              { x, y: y + 4 },
            ],
      });
    }
  }
  for (let i = 1; i < main.length; i++)
    connect(
      main[i - 1]!,
      main[i]!,
      main[i]!.stage > main[i - 1]!.stage,
      i > 2 &&
        main[i]!.stage === main[i - 1]!.stage &&
        (i % 4 === 0 || i === main.length - 1),
    );
  for (let row = 0; row < b.rows; row++) {
    const parent = main.find(
      (r) => r.x === 28 + (mainCols - 1) * 48 && r.y === height - 24 - row * 38,
    )!;
    const branch = room(mainCols, row, count + row, true);
    branch.stage = parent.stage;
    connect(parent, branch);
  }
  // Extra physical connections only within the same unlocked progression region.
  if (!fallback)
    for (const a of main)
      for (const z of main)
        if (
          a.index < z.index &&
          a.x === z.x &&
          Math.abs(a.y - z.y) === 38 &&
          a.stage === z.stage &&
          !world.edges.some((e) => e.a === a.id && e.b === z.id) &&
          topology() < 0.22
        )
          connect(a, z);
  if (!fallback)
    for (let stage = 0; stage <= b.relays; stage++) {
      const options = main.flatMap((a) =>
        main
          .filter(
            (z) =>
              a.index < z.index &&
              a.stage === stage &&
              z.stage === stage &&
              Math.abs(a.x - z.x) === 48 &&
              Math.abs(a.y - z.y) === 38,
          )
          .map((z) => [a, z] as const),
      );
      if (!options.length || topology() > 0.65) continue;
      const [a, z] = options[Math.floor(topology() * options.length)]!;
      const dx = z.x - a.x,
        dy = z.y - a.y,
        lengthSquared = dx * dx + dy * dy;
      for (
        let y = Math.floor((Math.min(a.y, z.y) - 4) / TILE);
        y <= (Math.max(a.y, z.y) + 4) / TILE;
        y++
      )
        for (
          let x = Math.floor((Math.min(a.x, z.x) - 4) / TILE);
          x <= (Math.max(a.x, z.x) + 4) / TILE;
          x++
        ) {
          const px = (x + 0.5) * TILE,
            py = (y + 0.5) * TILE,
            t = Math.max(
              0,
              Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared),
            );
          if (Math.hypot(px - a.x - t * dx, py - a.y - t * dy) < 3) carve(x, y);
        }
      world.edges.push({
        id: `edge-${world.edges.length}`,
        a: a.id,
        b: z.id,
        width: 6,
      });
    }
  world.spawn = { x: main[0]!.x, y: main[0]!.y };
  world.heart = { x: main.at(-1)!.x, y: main.at(-1)!.y };
  // The final enclosure has its own all-relay gate, even if an earlier stage gate already enforces this.
  const last = world.edges.find((e) => e.b === main.at(-1)!.id)!;
  if (!last.gateId) {
    const a = main.at(-2)!,
      z = main.at(-1)!,
      horizontal = a.y === z.y;
    // Put the heart seal at the room mouth, leaving a separate validated timed crossing.
    const p = horizontal
      ? { x: z.x + Math.sign(a.x - z.x) * 15, y: z.y }
      : { x: z.x, y: z.y + Math.sign(a.y - z.y) * 13 };
    last.gateId = "gate-heart";
    world.gates.push({
      id: "gate-heart",
      ...p,
      width: horizontal ? 2 : last.width + 2,
      height: horizontal ? last.width + 2 : 2,
      requires: (1 << b.relays) - 1,
    });
  }
  for (const r of world.rooms) {
    if (
      r.kind === "entrance" ||
      r.kind === "checkpoint" ||
      r.kind === "relay" ||
      r.kind === "heart"
    )
      continue;
    const n = r.kind === "optional" ? 1 : entities() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = r.x + (i ? -7 : 7),
        y = r.y + 4;
      world.enemies.push({
        id: `enemy-${world.enemies.length}`,
        roomId: r.id,
        kind: (["patrol", "pursuer", "emitter"] as const)[
          Math.floor(entities() * 3)
        ]!,
        x,
        y,
        end: { x: r.x - 7, y: r.y + 4 },
        facing: -1,
      });
    }
  }
  world.witness = main.flatMap((room, index) => {
    const edge = index
      ? world.edges.find((e) => e.a === main[index - 1]!.id && e.b === room.id)
      : undefined;
    const gate = edge?.gateId
      ? world.gates.find((g) => g.id === edge.gateId)
      : undefined;
    const hazard = world.hazards.find((h) => h.roomId === room.id);
    return [
      ...(gate ? [`gate:${gate.id}:requires:${gate.requires}`] : []),
      ...(hazard ? [`crossing:${hazard.id}`] : []),
      room.id,
    ];
  });
  return world;
}
function reachable(world: World, mask: number) {
  const visited = new Uint8Array(world.cells.length),
    queue = new Int32Array(world.cells.length);
  const start =
    Math.floor(world.spawn.y / TILE) * world.cols +
    Math.floor(world.spawn.x / TILE);
  let head = 0,
    tail = 0;
  const p = (i: number) => ({
    x: ((i % world.cols) + 0.5) * TILE,
    y: (Math.floor(i / world.cols) + 0.5) * TILE,
  });
  if (solid(world, p(start), mask)) return visited;
  visited[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++]!;
    for (const j of [i - 1, i + 1, i - world.cols, i + world.cols])
      if (
        j >= 0 &&
        j < visited.length &&
        !visited[j] &&
        !world.cells[j] &&
        Math.abs((i % world.cols) - (j % world.cols)) <= 1 &&
        !solid(world, p(j), mask, RADIUS + 0.12)
      ) {
        visited[j] = 1;
        queue[tail++] = j;
      }
  }
  return visited;
}
export function validateWorld(world: World): string[] {
  const errors: string[] = [],
    b = BUDGETS[world.size];
  if (
    !b ||
    !Number.isInteger(world.cols) ||
    !Number.isInteger(world.rows) ||
    world.width !== world.cols * TILE ||
    world.height !== world.rows * TILE ||
    world.width > b.maxWidth ||
    world.height > b.maxHeight ||
    world.cols < 4 ||
    world.rows < 4 ||
    world.cells.length !== world.cols * world.rows ||
    world.cells.some((c) => c !== 0 && c !== 1)
  )
    return ["Invalid finite world bounds or collision cells"];
  for (let x = 0; x < world.cols; x++)
    if (!world.cells[x] || !world.cells[(world.rows - 1) * world.cols + x])
      errors.push("Open outer boundary");
  for (let y = 0; y < world.rows; y++)
    if (
      !world.cells[y * world.cols] ||
      !world.cells[y * world.cols + world.cols - 1]
    )
      errors.push("Open outer boundary");
  const defs = [
    ...world.rooms,
    ...world.gates,
    ...world.relays,
    ...world.checkpoints,
    ...world.hazards,
    ...world.enemies,
  ];
  const ids = new Set<string>();
  for (const d of defs) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(d.id) || ids.has(d.id))
      errors.push("Invalid or duplicate ID");
    ids.add(d.id);
    if (
      !Number.isFinite(d.x) ||
      !Number.isFinite(d.y) ||
      d.x < 1 ||
      d.y < 1 ||
      d.x >= world.width - 1 ||
      d.y >= world.height - 1
    )
      errors.push(`Out of bounds: ${d.id}`);
  }
  const full = (1 << world.relays.length) - 1;
  if (
    world.relays.length !== b.relays ||
    world.relays.some((r, i) => r.bit !== 1 << i)
  )
    errors.push("Invalid relay set");
  if (
    world.gates.some(
      (g) =>
        g.requires < 1 ||
        g.requires > full ||
        g.width <= 0 ||
        g.height <= 0 ||
        g.width > 12 ||
        g.height > 12,
    )
  )
    errors.push("Invalid gate");
  if (
    world.edges.some(
      (e) =>
        !world.rooms.some((r) => r.id === e.a) ||
        !world.rooms.some((r) => r.id === e.b) ||
        e.width < RADIUS * 4 ||
        (e.gateId && !world.gates.some((g) => g.id === e.gateId)),
    )
  )
    errors.push("Invalid connection");
  if (
    [
      ...world.relays,
      ...world.checkpoints,
      ...world.hazards,
      ...world.enemies,
    ].some((e) => !world.rooms.some((r) => r.id === e.roomId))
  )
    errors.push("Unknown room reference");
  if (solid(world, world.spawn, 0) || solid(world, world.heart, full))
    errors.push("Unsafe entrance or heart");
  const has = (visited: Uint8Array, p: Vec) =>
    !!visited[Math.floor(p.y / TILE) * world.cols + Math.floor(p.x / TILE)] &&
    !solid(world, p, full);
  let mask = 0;
  for (let stage = 0; stage <= world.relays.length; stage++) {
    const visited = reachable(world, mask);
    if (world.rooms.some((r) => r.stage > stage && has(visited, r)))
      errors.push(`Gate bypass at stage ${stage}`);
    if (stage < world.relays.length) {
      const relay = world.relays[stage]!;
      if (!has(visited, relay))
        errors.push(`Relay prerequisite inaccessible: ${relay.id}`);
      mask |= relay.bit;
    } else {
      if (!has(visited, world.heart)) errors.push("Disconnected heart");
      for (const room of world.rooms)
        if (!has(visited, room)) errors.push(`Disconnected room: ${room.id}`);
    }
  }
  for (const cp of world.checkpoints) {
    const r = world.rooms.find((r) => r.id === cp.roomId)!;
    if (
      !r ||
      solid(world, cp, (1 << r.stage) - 1, 2) ||
      !has(reachable(world, (1 << r.stage) - 1), cp) ||
      world.enemies.some((e) => Math.hypot(cp.x - e.x, cp.y - e.y) < 6) ||
      world.hazards.some((h) => Math.hypot(cp.x - h.x, cp.y - h.y) < 6)
    )
      errors.push(`Unsafe checkpoint: ${cp.id}`);
  }
  for (const e of world.enemies)
    if (
      solid(world, e, full, 0.5) ||
      solid(world, e.end, full, 0.5) ||
      !["patrol", "pursuer", "emitter"].includes(e.kind)
    )
      errors.push(`Invalid enemy: ${e.id}`);
  for (const h of world.hazards) {
    if (
      !["beam", "barrier", "slider"].includes(h.kind) ||
      h.period !== 7 ||
      h.active !== 1.6 ||
      h.length < 4 ||
      h.length > 8 ||
      !Number.isFinite(h.phase) ||
      h.phase < 0 ||
      h.phase >= h.period ||
      h.crossing.length !== 2
    ) {
      errors.push(`Invalid crossing template: ${h.id}`);
      continue;
    }
    const [a, z] = h.crossing;
    if (
      Math.abs(Math.hypot(a.x - z.x, a.y - z.y) - 8) > 0.01 ||
      Math.hypot((a.x + z.x) / 2 - h.x, (a.y + z.y) / 2 - h.y) > 0.01 ||
      solid(world, a, full, RADIUS + 0.2) ||
      solid(world, z, full, RADIUS + 0.2) ||
      hazardHits(h, a, 0) ||
      hazardHits(h, z, 0)
    ) {
      errors.push(`Unsafe waiting area: ${h.id}`);
      continue;
    }
    for (const reverse of [false, true])
      for (let phase = 0; phase < 7; phase += 0.7) {
        let p = { ...(reverse ? z : a) },
          end = reverse ? a : z,
          vx = 0,
          vy = 0,
          t = phase,
          started = false,
          passed = false;
        const length = Math.hypot(end.x - p.x, end.y - p.y),
          ix = (end.x - p.x) / length,
          iy = (end.y - p.y) / length;
        for (let i = 0; i < 600; i++, t += DT) {
          const phaseNow = (t + h.phase) % h.period;
          if (!started && !hazardActive(h, t) && h.period - phaseNow >= 2)
            started = true;
          if (!started) continue;
          ({ vx, vy } = velocity(vx, vy, ix, iy, DT));
          p = move(world, p, vx * DT, vy * DT, full, RADIUS, t);
          if (world.hazards.some((other) => hazardHits(other, p, t))) break;
          if ((end.x - p.x) * ix + (end.y - p.y) * iy <= 0.12) {
            passed = true;
            break;
          }
        }
        if (!passed) {
          errors.push(`Impossible timed crossing: ${h.id}`);
          break;
        }
      }
  }
  if (
    world.witness.filter((id) => world.rooms.some((r) => r.id === id)).length <
      2 ||
    world.hazards.some((h) => !world.witness.includes(`crossing:${h.id}`))
  )
    errors.push("Incomplete witness route");
  return [...new Set(errors)];
}
export async function generateWorld(
  rawSeed: string,
  size: Size,
  progress: (phase: string) => void = () => {},
  options: { forceFallback?: boolean; rejectCandidates?: boolean } = {},
): Promise<World> {
  const seed = normalizeSeed(rawSeed) || freshSeed();
  if (seed.length > 128)
    throw new Error("Seeds must be 128 characters or fewer.");
  if (!BUDGETS[size]) throw new Error("Unknown expedition size.");
  for (let attempt = 0; attempt < 32 && !options.forceFallback; attempt++) {
    progress(`Building chambers · attempt ${attempt + 1}`);
    const world = build(seed, size, attempt);
    progress("Checking clearance, relay paths & timed crossings");
    const errors = options.rejectCandidates
      ? ["Forced rejection"]
      : validateWorld(world);
    if (!errors.length) {
      progress("Sealing the world");
      world.hash = await worldHash(world);
      return world;
    }
  }
  progress("Assembling validated reserve layout");
  const fallback = build("fallback-v1", size, 32, true);
  fallback.seed = seed;
  const errors = validateWorld(fallback);
  if (errors.length)
    throw new Error(
      `Generation could not produce a safe expedition: ${errors.join(", ")}`,
    );
  fallback.hash = await worldHash(fallback);
  return fallback;
}
