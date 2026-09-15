import RAPIER from "@dimforge/rapier3d-compat";
import { countries, kitsFor, TUNING as T } from "../catalogue";
import {
  idleInput,
  type Input,
  type Match,
  type Player,
  type Phase,
  type Setup,
} from "../contracts";
let ready: Promise<void> | undefined;
export const initPhysics = () => (ready ??= RAPIER.init() as Promise<void>);
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export const direction = (team: number, half: number) =>
  (team === 0 ? 1 : -1) * (half === 1 ? 1 : -1);
const anchors = [
  [-32, 0],
  [-20, -10],
  [-20, 10],
  [-5, -15],
  [-8, 0],
  [-5, 15],
  [11, 0],
];
export function createMatch(
  setup: Setup,
  seed = crypto.getRandomValues(new Uint32Array(1))[0]!,
): Match {
  const other = countries.filter((c) => c.id !== setup.country);
  const opponent =
    setup.opponent === "random"
      ? other[seed % other.length]!.id
      : setup.opponent;
  const s: Match = {
    schemaVersion: 1,
    simulationVersion: 1,
    id: crypto.randomUUID(),
    revision: 0,
    setup: { ...setup },
    opponent,
    kits: kitsFor(setup.country, opponent),
    seed,
    randomState: seed || 1,
    tick: 0,
    seq: 0,
    ack: 0,
    phase: "loading",
    previousPhase: "kickoff",
    pauseReason: "",
    half: 1,
    elapsed: 0,
    phaseTime: 0,
    score: [0, 0],
    players: [],
    ball: {
      x: 0,
      y: T.ballRadius,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      owner: null,
      lastTouch: 0,
      lock: 0,
      passTeam: null,
      shotTeam: null,
    },
    controlled: 6,
    restart: { kind: "Kick off", team: 0, x: 0, z: 0 },
    stats: {
      shots: [0, 0],
      onTarget: [0, 0],
      passes: [0, 0],
      completed: [0, 0],
      possession: [0, 0],
    },
    event: { id: 0, kind: "ready", text: "Ready for kick off" },
    startedAt: new Date().toISOString(),
    charge: 0,
  };
  for (let team = 0; team < 2; team++)
    for (let role = 0; role < 7; role++) {
      const [x, z] = anchors[role]!;
      s.players.push({
        id: team * 7 + role,
        team: team as 0 | 1,
        role,
        x: x! * (team === 0 ? 1 : -1),
        z: z!,
        vx: 0,
        vz: 0,
        angle: team === 0 ? Math.PI / 2 : -Math.PI / 2,
        stamina: 1,
        action: "idle",
        actionTime: 0,
        cooldown: 0,
        hold: 0,
        tx: 0,
        tz: 0,
      });
    }
  return s;
}
export class Simulation {
  state: Match;
  world: RAPIER.World;
  body: RAPIER.RigidBody;
  input: Input;
  lastPass = 0;
  lastSwitch = 0;
  shooting = false;
  constructor(state: Match) {
    this.state = state;
    this.input = idleInput(state.id);
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = T.dt;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 0.1, 35)
        .setTranslation(0, -0.1, 0)
        .setFriction(0.75)
        .setRestitution(0.55),
    );
    for (const x of [-35, 35]) {
      for (const z of [-2.55, 2.55])
        this.world.createCollider(
          RAPIER.ColliderDesc.cylinder(1, 0.05)
            .setTranslation(x, 1, z)
            .setRestitution(0.7),
        );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.05, 0.05, 2.55)
          .setTranslation(x, 2.05, 0)
          .setRestitution(0.7),
      );
    }
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(state.ball.x, state.ball.y, state.ball.z)
        .setCcdEnabled(true)
        .setLinearDamping(0.12),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(T.ballRadius)
        .setDensity(0.3)
        .setRestitution(0.55)
        .setFriction(0.65),
      this.body,
    );
    this.syncBall();
  }
  dispose() {
    this.world.free();
  }
  random() {
    let v = this.state.randomState;
    v ^= v << 13;
    v ^= v >>> 17;
    v ^= v << 5;
    this.state.randomState = v >>> 0;
    return (v >>> 0) / 4294967296;
  }
  syncBall() {
    const b = this.state.ball;
    this.body.setTranslation({ x: b.x, y: b.y, z: b.z }, true);
    this.body.setLinvel({ x: b.vx, y: b.vy, z: b.vz }, true);
  }
  emit(kind: string, text: string) {
    const s = this.state;
    s.event = { id: s.event.id + 1, kind, text };
  }
  phase(p: Phase) {
    this.state.phase = p;
    this.state.phaseTime = 0;
  }
  ready() {
    if (this.state.phase === "loading") this.restart("Kick off", 0, 0, 0, true);
  }
  pause(reason = "user") {
    const s = this.state;
    if (
      !["paused", "finished", "abandoned", "loading", "halfTime"].includes(
        s.phase,
      )
    ) {
      s.previousPhase = s.phase;
      s.pauseReason = reason;
      this.phase("paused");
    }
    this.clearInput();
  }
  resume() {
    const s = this.state;
    if (s.phase === "halfTime") {
      s.half = 2;
      this.restart("Kick off", 1, 0, 0, true);
    } else if (s.phase === "paused") {
      this.phase(s.previousPhase === "loading" ? "kickoff" : s.previousPhase);
      s.pauseReason = "";
    }
    this.clearInput();
  }
  clearInput() {
    this.input = idleInput(this.state.id);
    this.input.seq = this.state.ack;
    this.shooting = false;
    this.state.charge = 0;
    this.lastPass = 0;
    this.lastSwitch = 0;
  }
  accept(input: Input) {
    if (
      input.matchId !== this.state.id ||
      input.seq <= this.state.ack ||
      input.seq > this.state.ack + 10000
    )
      return;
    this.input = input;
    this.state.ack = input.seq;
  }
  restart(kind: string, team: 0 | 1, x: number, z: number, formation = false) {
    const s = this.state;
    const d = direction(team, s.half);
    if (formation)
      for (const p of s.players) {
        const a = anchors[p.role]!;
        p.x = a[0]! * direction(p.team, s.half);
        p.z = a[1]!;
        p.vx = p.vz = 0;
        p.hold = 0;
        p.action = "idle";
        if (p.role !== 0)
          p.x =
            clamp(p.x * direction(p.team, s.half), -32, -2) *
            direction(p.team, s.half);
      }
    s.restart = {
      kind,
      team,
      x: clamp(x, -34.6, 34.6),
      z: clamp(z, -22.2, 22.2),
    };
    const taker =
      kind === "Goal kick"
        ? s.players[team * 7]!
        : s.players
            .filter((p) => p.team === team && p.role !== 0)
            .sort(
              (a, b) => dist(a, { x, z }) - dist(b, { x, z }) || a.id - b.id,
            )[0]!;
    for (const p of s.players)
      if (p.id !== taker.id && dist(p, { x, z }) < 4) {
        p.x = clamp(x + (p.team === team ? -4 : 4) * d, -34, 34);
        p.z = clamp(p.z + (p.id % 2 ? 3 : -3), -21, 21);
      }
    taker.x = s.restart.x - 0.6 * d;
    taker.z = s.restart.z;
    taker.angle = (d * Math.PI) / 2;
    taker.vx = taker.vz = 0;
    taker.hold = 0;
    Object.assign(s.ball, {
      x: s.restart.x,
      y: T.ballRadius,
      z: s.restart.z,
      vx: 0,
      vy: 0,
      vz: 0,
      owner: taker.id,
      lastTouch: team,
      lock: 0,
      passTeam: null,
      shotTeam: null,
    });
    if (team === 0 && taker.role !== 0) s.controlled = taker.id;
    this.phase(kind === "Kick off" ? "kickoff" : "stoppage");
    this.emit("whistle", kind);
    this.syncBall();
    this.clearInput();
  }
  switchPlayer() {
    const s = this.state;
    const b = s.ball;
    const candidates = s.players.filter(
      (p) => p.team === 0 && p.role !== 0 && p.id !== s.controlled,
    );
    candidates.sort(
      (a, c) =>
        dist(a, { x: b.x + b.vx * 0.3, z: b.z + b.vz * 0.3 }) -
          dist(c, { x: b.x + b.vx * 0.3, z: b.z + b.vz * 0.3 }) || a.id - c.id,
    );
    s.controlled = candidates[0]!.id;
  }
  pass(p: Player, aim = { x: 0, z: 0 }) {
    const s = this.state;
    if (s.ball.owner !== p.id || p.cooldown > 0) return;
    const d = direction(p.team, s.half);
    const al = Math.hypot(aim.x, aim.z);
    const teammates = s.players.filter(
      (q) => q.team === p.team && q.id !== p.id && q.role !== 0,
    );
    const score = (q: Player) => {
      const dx = q.x - p.x,
        dz = q.z - p.z,
        l = Math.hypot(dx, dz);
      const alignment =
        al > 0.1 ? (dx * aim.x + dz * aim.z) / (l * al) : (dx * d) / l;
      const risk = s.players
        .filter((r) => r.team !== p.team)
        .reduce((n, r) => n + (dist(r, q) < 4 ? 5 : 0), 0);
      return alignment * 20 - l * 0.2 - risk;
    };
    teammates.sort((a, b) => score(b) - score(a));
    const q = teammates[0];
    if (!q) return;
    const dx = q.x + q.vx * 0.3 - p.x,
      dz = q.z + q.vz * 0.3 - p.z,
      l = Math.hypot(dx, dz) || 1;
    this.kick(p, dx / l, dz / l, clamp(l * 1.1, 12, 23), 0.8, "pass");
    s.stats.passes[p.team]++;
    s.ball.passTeam = p.team;
    s.ball.shotTeam = null;
  }
  shoot(p: Player, power = 0.65, aim = { x: 0, z: 0 }) {
    const s = this.state;
    if (s.ball.owner !== p.id || p.cooldown > 0) return;
    const d = direction(p.team, s.half);
    let targetZ = clamp(p.z * 0.1 + aim.z * 1.5, -2, 2);
    if (p.team === 1)
      targetZ +=
        (this.random() - 0.5) *
        (s.setup.difficulty === "easy"
          ? 3
          : s.setup.difficulty === "hard"
            ? 0.4
            : 1.3);
    let dx = 35 * d - p.x,
      dz = targetZ - p.z;
    if (aim.x * d < -0.3) {
      dx = aim.x * 15;
      dz = aim.z * 15;
    }
    const l = Math.hypot(dx, dz) || 1;
    this.kick(p, dx / l, dz / l, 19 + power * 15, 1.4 + power * 2.4, "shot");
    s.stats.shots[p.team]++;
    s.ball.shotTeam = p.team;
    s.ball.passTeam = null;
  }
  kick(
    p: Player,
    dx: number,
    dz: number,
    speed: number,
    vy: number,
    kind: string,
  ) {
    const b = this.state.ball;
    b.owner = null;
    b.lastTouch = p.team;
    b.lock = 0.18;
    b.x = p.x + dx * 0.9;
    b.z = p.z + dz * 0.9;
    b.y = 0.28;
    b.vx = dx * speed;
    b.vz = dz * speed;
    b.vy = vy;
    p.angle = Math.atan2(dx, dz);
    p.action = kind;
    p.actionTime = 0.32;
    p.cooldown = 0.28;
    p.hold = 0;
    this.emit("kick", kind);
    this.syncBall();
    if (this.state.phase === "kickoff" || this.state.phase === "stoppage")
      this.phase("playing");
  }
  tackle(p: Player) {
    const s = this.state;
    if (p.cooldown > 0) return;
    p.cooldown = T.tackleCooldown;
    p.action = "tackle";
    p.actionTime = 0.3;
    const o = s.ball.owner === null ? null : s.players[s.ball.owner];
    if (o && o.team !== p.team && dist(p, o) < T.tackleReach) {
      const dx = o.x - p.x,
        dz = o.z - p.z;
      if (Math.sin(p.angle) * dx + Math.cos(p.angle) * dz > -0.3) {
        s.ball.owner = p.id;
        s.ball.lastTouch = p.team;
        s.ball.passTeam = null;
        s.ball.shotTeam = null;
        p.hold = 0;
        this.emit("tackle", "Ball won");
      }
    }
  }
  ai() {
    const s = this.state,
      b = s.ball;
    const owner = b.owner === null ? null : s.players[b.owner]!;
    for (const team of [0, 1] as const) {
      const d = direction(team, s.half);
      const list = s.players.filter((p) => p.team === team && p.role !== 0);
      const nearest = [...list].sort((a, c) => dist(a, b) - dist(c, b));
      for (const p of s.players.filter((p) => p.team === team)) {
        const a = anchors[p.role]!;
        p.tx = clamp(a[0]! * d + b.x * 0.3, -32, 32);
        p.tz = clamp(a[1]! + b.z * 0.24, -20.5, 20.5);
        if (p.role === 0) {
          p.tx = -d * 32.5 + clamp((b.x * d + 35) * 0.04, 0, 1.4) * d;
          p.tz = clamp(b.z * 0.22, -2.7, 2.7);
          p.action = "positioning";
          if (owner?.id === p.id && p.hold > 1.2) this.pass(p);
          continue;
        }
        if (p.id === s.controlled) continue;
        if (owner?.id === p.id) {
          p.tx = 33 * d;
          p.tz = p.z * 0.65;
          p.action = "carrying";
          const pressure = s.players.some(
            (q) => q.team !== team && dist(p, q) < 3.5,
          );
          const wait =
            team === 1
              ? s.setup.difficulty === "easy"
                ? 1.2
                : s.setup.difficulty === "hard"
                  ? 0.45
                  : 0.75
              : 0.65;
          if (p.hold > wait) {
            if (p.x * d > 18 && Math.abs(p.z) < 13)
              this.shoot(p, 0.5 + this.random() * 0.4);
            else if ((pressure || p.hold > 3.2) && p.cooldown <= 0)
              this.pass(p);
          }
        } else if (owner?.team === team) {
          p.tx = clamp(a[0]! * d + b.x * 0.5 + 8 * d, -30, 31);
          p.tz = clamp(a[1]! + b.z * 0.3, -20, 20);
          p.action = "supporting";
        } else if (
          nearest[0]?.id === p.id ||
          (!owner && nearest[1]?.id === p.id)
        ) {
          p.tx = b.x + b.vx * 0.18;
          p.tz = b.z + b.vz * 0.18;
          p.action = "pressing";
          if (owner && dist(p, owner) < 1.5) this.tackle(p);
        } else if (nearest[1]?.id === p.id) {
          p.tx = b.x - 5 * d;
          p.tz = b.z * 0.65;
          p.action = "covering";
        } else p.action = "holding";
      }
    }
  }
  step(dt: number = T.dt) {
    const s = this.state;
    if (
      ["paused", "finished", "abandoned", "loading", "halfTime"].includes(
        s.phase,
      )
    )
      return;
    s.tick++;
    s.phaseTime += dt;
    if (s.phase === "goalCelebration") {
      if (s.phaseTime >= 2.5)
        this.restart("Kick off", s.restart.team, 0, 0, true);
      return;
    }
    const input = this.input;
    if (input.switch > this.lastSwitch) {
      this.lastSwitch = input.switch;
      this.switchPlayer();
    }
    if (s.phase === "kickoff" || s.phase === "stoppage") {
      const taker = s.players[s.ball.owner ?? s.restart.team * 7]!;
      taker.cooldown = 0;
      if (input.pass > this.lastPass && taker.team === 0) {
        this.lastPass = input.pass;
        this.pass(taker, { x: input.x, z: input.z });
      } else if (s.phaseTime > (taker.team === 0 ? 5 : 1.2)) this.pass(taker);
      return;
    }
    const remaining = (s.half === 1 ? T.half : T.half * 2) - s.elapsed;
    dt = Math.min(dt, Math.max(0, remaining));
    if (s.tick % 6 === 0) this.ai();
    const controlled = s.players[s.controlled]!;
    if (input.pass > this.lastPass) {
      this.lastPass = input.pass;
      if (s.ball.owner === controlled.id)
        this.pass(controlled, { x: input.x, z: input.z });
      else this.tackle(controlled);
    }
    if (input.shoot && s.ball.owner === controlled.id)
      s.charge = clamp(s.charge + dt, 0, T.shotMaxCharge);
    if (this.shooting && !input.shoot) {
      if (s.ball.owner === controlled.id)
        this.shoot(controlled, s.charge / T.shotMaxCharge, {
          x: input.x,
          z: input.z,
        });
      s.charge = 0;
    }
    this.shooting = input.shoot;
    for (const p of s.players) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.actionTime = Math.max(0, p.actionTime - dt);
      p.hold = s.ball.owner === p.id ? p.hold + dt : 0;
      let dx = p.tx - p.x,
        dz = p.tz - p.z;
      let sprint = false;
      if (p.id === s.controlled) {
        dx = input.x;
        dz = input.z;
        sprint = input.sprint && p.stamina > 0.03;
      } else {
        const l = Math.hypot(dx, dz);
        if (l < 0.25) {
          dx = dz = 0;
        }
        sprint = p.action === "pressing" && l > 5 && p.stamina > 0.25;
      }
      const l = Math.hypot(dx, dz);
      if (l > 0) {
        dx /= Math.max(1, l);
        dz /= Math.max(1, l);
      }
      const speed = p.role === 0 ? 5.8 : sprint ? T.sprint : T.run;
      const f = Math.min(1, dt * 12);
      p.vx += (dx * speed - p.vx) * f;
      p.vz += (dz * speed - p.vz) * f;
      p.x = clamp(p.x + p.vx * dt, -34.5, 34.5);
      p.z = clamp(p.z + p.vz * dt, -22, 22);
      if (Math.hypot(p.vx, p.vz) > 0.2 && p.actionTime <= 0)
        p.angle = Math.atan2(p.vx, p.vz);
      p.stamina = clamp(p.stamina + (sprint ? -0.13 : 0.085) * dt, 0, 1);
      if (p.id === s.controlled && p.actionTime <= 0)
        p.action = l > 0.1 ? (sprint ? "sprint" : "run") : "idle";
    }
    for (let i = 0; i < s.players.length; i++)
      for (let j = i + 1; j < s.players.length; j++) {
        const a = s.players[i]!,
          b = s.players[j]!,
          l = dist(a, b);
        if (l > 0.001 && l < 0.65) {
          const overlap = (0.65 - l) * 0.5;
          const x = ((a.x - b.x) / l) * overlap,
            z = ((a.z - b.z) / l) * overlap;
          a.x += x;
          a.z += z;
          b.x -= x;
          b.z -= z;
        }
      }
    const b = s.ball;
    b.lock = Math.max(0, b.lock - dt);
    if (b.owner !== null) {
      const p = s.players[b.owner]!;
      s.stats.possession[p.team] += dt;
      b.lastTouch = p.team;
      const pace = Math.hypot(p.vx, p.vz);
      const touch = 0.6 + Math.sin(s.tick * 0.28) * 0.12 * (pace > 1 ? 1 : 0);
      b.x = p.x + Math.sin(p.angle) * touch;
      b.z = p.z + Math.cos(p.angle) * touch;
      b.y =
        p.role === 0
          ? 0.85
          : T.ballRadius + Math.abs(Math.sin(s.tick * 0.25)) * 0.06;
      b.vx = p.vx;
      b.vz = p.vz;
      b.vy = 0;
      this.syncBall();
      if (p.role === 0 && p.hold >= 4) {
        p.cooldown = 0;
        this.pass(p);
      }
    } else {
      const old = { x: b.x, y: b.y, z: b.z };
      this.syncBall();
      this.world.timestep = Math.max(0.0001, dt);
      this.world.step();
      const v = this.body.linvel(),
        pos = this.body.translation();
      Object.assign(b, {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: v.x,
        vy: v.y,
        vz: v.z,
      });
      if (b.y < 0.28) {
        b.vx *= Math.exp(-0.9 * dt);
        b.vz *= Math.exp(-0.9 * dt);
      }
      // Swept player capture: test the segment rather than only the final ball position.
      if (b.lock === 0) {
        const claims = s.players
          .map((p) => {
            const dx = b.x - old.x,
              dz = b.z - old.z,
              t = clamp(
                ((p.x - old.x) * dx + (p.z - old.z) * dz) /
                  (dx * dx + dz * dz || 1),
                0,
                1,
              );
            return {
              p,
              t,
              d: Math.hypot(p.x - (old.x + dx * t), p.z - (old.z + dz * t)),
              height: old.y + (b.y - old.y) * t,
            };
          })
          .filter(
            (c) =>
              c.d < (c.p.role === 0 ? 1.05 : 0.65) &&
              c.height < (c.p.role === 0 ? 1.9 : 0.85) &&
              c.p.cooldown <= 0,
          )
          .sort((a, c) => a.t - c.t || a.d - c.d || a.p.id - c.p.id);
        const claim = claims[0];
        if (claim) {
          const p = claim.p;
          if (p.role === 0 && b.shotTeam !== null && b.shotTeam !== p.team) {
            const goalX = -direction(p.team, s.half) * 35;
            const t = (goalX - old.x) / (b.vx || 0.001);
            const goalZ = old.z + b.vz * t;
            if (t >= 0 && Math.abs(goalZ) < 2.28)
              s.stats.onTarget[b.shotTeam]++;
            p.action = "save";
            p.actionTime = 0.7;
            this.emit("save", "Saved!");
          }
          if (b.passTeam === p.team) {
            s.stats.completed[p.team]++;
            if (p.team === 0 && p.role !== 0) s.controlled = p.id;
          }
          b.owner = p.id;
          b.lastTouch = p.team;
          b.passTeam = null;
          b.shotTeam = null;
          p.hold = 0;
        }
      }
      if (b.owner === null) this.boundary(old);
    }
    s.elapsed += dt;
    if (s.elapsed >= (s.half === 1 ? T.half : T.half * 2) - 1e-7) {
      s.elapsed = s.half * T.half;
      if (s.half === 1) {
        this.phase("halfTime");
        this.emit("whistle", "Half time");
      } else {
        this.phase("finished");
        s.finishedAt = new Date().toISOString();
        this.emit("whistle", "Full time");
      }
      this.clearInput();
    }
    if (
      !Number.isFinite(b.x + b.y + b.z) ||
      Math.abs(b.x) > 45 ||
      Math.abs(b.z) > 32
    ) {
      this.restart("Recovery restart", b.lastTouch, 0, 0);
      this.emit("recovery", "Play restarted after a physics recovery");
    }
  }
  boundary(old: { x: number; y: number; z: number }) {
    const s = this.state,
      b = s.ball,
      r = T.ballRadius;
    const crossings: { t: number; axis: "x" | "z"; sign: number }[] = [];
    for (const [axis, limit] of [
      ["x", 35 + r],
      ["z", 22.5 + r],
    ] as const) {
      const delta = b[axis] - old[axis];
      for (const sign of [-1, 1])
        if (
          delta * sign > 0 &&
          b[axis] * sign >= limit &&
          old[axis] * sign < limit
        )
          crossings.push({ t: (sign * limit - old[axis]) / delta, axis, sign });
    }
    crossings.sort((a, c) => a.t - c.t);
    const c = crossings[0];
    if (!c) return;
    const x = old.x + (b.x - old.x) * c.t,
      z = old.z + (b.z - old.z) * c.t,
      y = old.y + (b.y - old.y) * c.t;
    if (c.axis === "z") {
      this.restart(
        "Throw in",
        (1 - b.lastTouch) as 0 | 1,
        clamp(x, -34, 34),
        c.sign * 22.2,
      );
      return;
    }
    const scorer = (direction(0, s.half) === c.sign ? 0 : 1) as 0 | 1;
    const defender = (1 - scorer) as 0 | 1;
    if (Math.abs(z) < 2.5 - r && y + r < 2 && y >= r - 0.04) {
      s.score[scorer]++;
      if (b.shotTeam === scorer) s.stats.onTarget[scorer]++;
      s.restart.team = defender;
      b.owner = null;
      this.phase("goalCelebration");
      this.emit("goal", scorer === 0 ? "GOAL!" : "Opponent goal");
      for (const p of s.players.filter((p) => p.team === scorer)) {
        p.action = "celebrate";
        p.actionTime = 3;
      }
    } else if (b.lastTouch === defender)
      this.restart("Corner", scorer, c.sign * 34.6, Math.sign(z || 1) * 22.2);
    else this.restart("Goal kick", defender, c.sign * 31, 0);
  }
}
