import { expect, test } from "bun:test";
import { flightSound } from "../src/audio";
import { SPEED, WALL_GRACE } from "../src/domain";
const player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  facing: 1,
  health: 100,
  wallContact: 0,
};
const idle = { x: 0, y: 0 };

test("climbing and descending have different pitches at the same speed", () => {
  const up = flightSound({ ...player, vy: SPEED }, { x: 0, y: 1 });
  const down = flightSound({ ...player, vy: -SPEED }, { x: 0, y: -1 });
  const hover = flightSound(player, idle);
  expect(up.rotor).toBeGreaterThan(down.rotor);
  expect(up.turbine).toBeGreaterThan(down.turbine);
  expect(up.rotor).toBeGreaterThan(hover.rotor);
  expect(hover.wind).toBe(0);
  expect(up.wind).toBeGreaterThan(0);
});

test("bank and braking affect pitch; mirrored forward flight sounds the same", () => {
  const right = flightSound({ ...player, vx: SPEED }, idle);
  const left = flightSound({ ...player, vx: -SPEED, facing: -1 }, idle);
  const backward = flightSound({ ...player, vx: SPEED, facing: -1 }, idle);
  const brake = flightSound({ ...player, vx: SPEED }, { x: -1, y: 0 });
  expect(left).toEqual(right);
  expect(right.turbine).toBeGreaterThan(backward.turbine);
  expect(brake.rotor).toBeGreaterThan(right.rotor);
  expect(brake.level).toBeGreaterThan(right.level);
});

test("wall scrape grows through the contact cushion and stops on release", () => {
  const brush = flightSound({ ...player, wallContact: WALL_GRACE / 2 }, idle);
  const pressure = flightSound({ ...player, wallContact: WALL_GRACE }, idle);
  expect(brush.scrape).toBeGreaterThan(0);
  expect(pressure.scrape).toBeGreaterThan(brush.scrape);
  expect(flightSound(player, idle).scrape).toBe(0);
});
