import { expect, test } from "bun:test";
import { H16 } from "../machine/H16";
import { assemble } from "../assembler/Assembler";
import { executionView } from "../ui/execution";
test("ready, clock start and finished summaries remain explicit for short programs", () => {
  const m = new H16();
  m.load(assemble("LDI R1,23\nLDI R2,35\nADD R1,R2\nHALT").words);
  expect(executionView(m.snapshot(false), false, "ready").label).toBe("Ready");
  expect(executionView(m.snapshot(false), true, "ready").title).toContain(
    "waiting for the first fetch",
  );
  for (let i = 0; i < 4; i++) m.stepInstruction();
  const view = executionView(m.snapshot(false), false, "paused");
  expect(view.label).toBe("Finished");
  expect(view.title).toBe("HALT · 4 instructions completed");
  expect(view.detail).toContain("R1 = 58 (0x003A)");
});
test("execution summary distinguishes ALU propagation from register writeback", () => {
  const m = new H16();
  m.load(assemble("ADD R1,R2").words);
  m.registers[1].edge(23);
  m.registers[2].edge(35);
  for (let i = 0; i < 3; i++) m.stepPhase();
  const view = executionView(m.snapshot(false), false, "paused");
  expect(view.phase).toBe(2);
  expect(view.nodes).toEqual(["Registers", "ALU"]);
  expect(view.detail).toContain("R1 has not been written yet");
  expect(m.registers[1].value).toBe(23);
  m.stepPhase();
  m.stepPhase();
  expect(executionView(m.snapshot(false), false, "paused").detail).toContain(
    "R1 ← 58",
  );
});
test("breakpoint explains the next PC rather than the previous instruction", () => {
  const m = new H16();
  m.load(assemble("LDI R0,1\nHALT").words);
  m.stepInstruction();
  const view = executionView(m.snapshot(false), false, "breakpoint");
  expect(view.label).toBe("Breakpoint");
  expect(view.title).toContain("0x8002");
  expect(view.detail).toContain("Resume");
});
test("no-op instructions do not highlight an inactive ALU", () => {
  const m = new H16();
  m.load(assemble("NOP").words);
  for (let i = 0; i < 3; i++) m.stepPhase();
  expect(executionView(m.snapshot(false), true, "paused").nodes).toEqual([
    "Decoder",
  ]);
});
