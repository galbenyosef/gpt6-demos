import { expect, test } from "bun:test";
import { library } from "../logic/library";
import { compile } from "../compiler/compiler";
import { Simulator } from "../simulator/Simulator";
import {
  groupComponents,
  parseProject,
  type Project,
} from "../persistence/project";
import { H16 } from "../machine/H16";
import { assemble } from "../assembler/Assembler";
test("grouping preserves combinational behavior and external nets", () => {
  const circuit = structuredClone(library["Full Adder"]);
  const group = groupComponents(
    circuit,
    new Set(["first", "second"]),
    "GroupedAdders",
  );
  const custom = { ...library, GroupedAdders: group };
  const sim = new Simulator(compile(circuit, custom));
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let cin = 0; cin < 2; cin++) {
        sim.setPort("A", a);
        sim.setPort("B", b);
        sim.setPort("Cin", cin);
        sim.settle();
        expect(sim.read("Sum")).toBe((a + b + cin) & 1);
        expect(sim.read("Carry")).toBe((a + b + cin) >> 1);
      }
});
test("JSON project round-trip includes custom circuits, source, probes and full machine", () => {
  const machine = new H16();
  machine.load(assemble("LDI R0,42\nHALT").words);
  machine.stepInstruction();
  const p: Project = {
    version: 1,
    source: "LDI R0,42\nHALT",
    breakpoints: [2],
    probes: ["R0"],
    custom: {},
    workspace: library.XOR,
    preferences: { hz: 10, fast: false },
    machine: machine.snapshot(),
  };
  const copy = parseProject(JSON.stringify(p));
  expect(copy).toEqual(p);
  const restored = new H16();
  restored.restore(copy.machine!);
  expect(restored.registers[0].value).toBe(42);
});
test("invalid imports are rejected before changing active project", () => {
  for (const input of ["{}", "null", '{"version":2}', "not json"])
    expect(() => parseProject(input)).toThrow();
  const p: Project = {
    version: 1,
    source: "HALT",
    breakpoints: [],
    probes: [],
    custom: {},
    workspace: library.XOR,
    preferences: { hz: 1, fast: false },
    machine: new H16().snapshot(),
  };
  p.machine!.memory[3] = -1;
  expect(() => parseProject(JSON.stringify(p))).toThrow(
    "Invalid saved machine",
  );
});
