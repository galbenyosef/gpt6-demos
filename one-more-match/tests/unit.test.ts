import { beforeAll, expect, test } from "bun:test";
import {
  createMatch,
  initPhysics,
  Simulation,
  direction,
} from "../packages/simulation";
import { countries, kitsFor } from "../packages/catalogue";
import { idleInput, setupSchema } from "../packages/contracts";
beforeAll(initPhysics);
const make = () =>
  new Simulation(
    createMatch({ country: "ARG", opponent: "BRA", difficulty: "normal" }, 123),
  );
test("20 distinct countries, all pairings have distinguishable shirts", () => {
  expect(new Set(countries.map((c) => c.id)).size).toBe(20);
  for (const a of countries)
    for (const b of countries)
      if (a !== b) {
        const [h, v] = kitsFor(a.id, b.id);
        expect(h.primary).not.toBe(v.primary);
      }
  expect(
    setupSchema.safeParse({
      country: "ARG",
      opponent: "ARG",
      difficulty: "normal",
    }).success,
  ).toBe(false);
});
test("kickoff waits, passes release the ball, pause preserves the clock", () => {
  const sim = make();
  try {
    sim.ready();
    for (let i = 0; i < 100; i++) sim.step();
    expect(sim.state.elapsed).toBe(0);
    const input = idleInput(sim.state.id);
    input.seq = 1;
    input.pass = 1;
    sim.accept(input);
    sim.step();
    expect(sim.state.phase).toBe("playing");
    expect(sim.state.stats.passes[0]).toBe(1);
    sim.pause();
    const time = sim.state.elapsed;
    for (let i = 0; i < 60; i++) sim.step();
    expect(sim.state.elapsed).toBe(time);
    sim.resume();
    sim.step();
    expect(sim.state.elapsed).toBeGreaterThan(time);
  } finally {
    sim.dispose();
  }
});
test("goals require whole ball and resolve once; corner and throw ownership", () => {
  const sim = make();
  try {
    const s = sim.state;
    sim.ready();
    sim.phase("playing");
    Object.assign(s.ball, { owner: null, x: 35.1, y: 0.3, z: 0, lastTouch: 0 });
    sim.boundary({ x: 34, y: 0.3, z: 0 });
    expect(s.score).toEqual([0, 0]);
    s.ball.x = 35.3;
    sim.boundary({ x: 35.1, y: 0.3, z: 0 });
    expect(s.score).toEqual([1, 0]);
    expect(s.phase).toBe("goalCelebration");
    for (let i = 0; i < 100; i++) sim.step();
    expect(s.score).toEqual([1, 0]);
    sim.phase("playing");
    Object.assign(s.ball, { owner: null, x: 36, y: 0.3, z: 8, lastTouch: 1 });
    sim.boundary({ x: 34, y: 0.3, z: 8 });
    expect(s.restart.kind).toBe("Corner");
    expect(s.restart.team).toBe(0);
    sim.phase("playing");
    Object.assign(s.ball, { owner: null, x: 2, y: 0.3, z: 24, lastTouch: 0 });
    sim.boundary({ x: 2, y: 0.3, z: 22 });
    expect(s.restart.kind).toBe("Throw in");
    expect(s.restart.team).toBe(1);
  } finally {
    sim.dispose();
  }
});
test("overbar is not a goal; second-half direction and final tick work", () => {
  const sim = make();
  try {
    const s = sim.state;
    sim.ready();
    sim.phase("playing");
    Object.assign(s.ball, { owner: null, x: 36, y: 3, z: 0, lastTouch: 0 });
    sim.boundary({ x: 34, y: 3, z: 0 });
    expect(s.score[0]).toBe(0);
    expect(s.restart.kind).toBe("Goal kick");
    sim.phase("playing");
    s.elapsed = 149.999;
    sim.step();
    expect(s.phase).toBe("halfTime");
    sim.resume();
    expect(s.half).toBe(2);
    expect(direction(0, s.half)).toBe(-1);
    sim.phase("playing");
    s.elapsed = 299.999;
    sim.step();
    expect(s.phase).toBe("finished");
    expect(s.elapsed).toBe(300);
  } finally {
    sim.dispose();
  }
});
test("movement normalises diagonal, invalid sequences ignored and possession unique", () => {
  const sim = make();
  try {
    sim.ready();
    sim.phase("playing");
    const input = { ...idleInput(sim.state.id), seq: 1, x: 1, z: 1 };
    sim.accept(input);
    for (let i = 0; i < 60; i++) sim.step();
    const p = sim.state.players[sim.state.controlled]!;
    expect(Math.hypot(p.vx, p.vz)).toBeLessThanOrEqual(6.21);
    sim.accept({ ...input, seq: 0, x: -1 });
    expect(sim.input.x).toBe(1);
    expect(
      sim.state.ball.owner === null ||
        sim.state.players.some((p) => p.id === sim.state.ball.owner),
    ).toBe(true);
  } finally {
    sim.dispose();
  }
});
test("same seed and same inputs reproduce same simulation", () => {
  const a = make(),
    b = make();
  try {
    a.ready();
    b.ready();
    for (let i = 0; i < 1000; i++) {
      a.step();
      b.step();
    }
    expect(a.state.ball).toEqual(b.state.ball);
    expect(a.state.players).toEqual(b.state.players);
  } finally {
    a.dispose();
    b.dispose();
  }
});
test("100 full seeded matches complete without invalid state or stuck restart", () => {
  let goals = 0;
  for (let n = 0; n < 100; n++) {
    const sim = new Simulation(
      createMatch(
        { country: "ARG", opponent: "BRA", difficulty: "normal" },
        n + 1,
      ),
    );
    sim.ready();
    let steps = 0;
    try {
      while (sim.state.phase !== "finished" && steps < 35000) {
        if (sim.state.phase === "halfTime") sim.resume();
        sim.step();
        steps++;
        if (steps % 300 === 0) {
          expect(
            Number.isFinite(
              sim.state.ball.x + sim.state.ball.y + sim.state.ball.z,
            ),
          ).toBe(true);
          expect(
            sim.state.players.every((p) => Number.isFinite(p.x + p.z)),
          ).toBe(true);
        }
      }
      expect(sim.state.phase).toBe("finished");
      goals += sim.state.score[0] + sim.state.score[1];
    } finally {
      sim.dispose();
    }
  }
  expect(goals).toBeGreaterThan(0);
}, 120000);
