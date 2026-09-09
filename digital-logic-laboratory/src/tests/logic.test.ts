import { describe, expect, test } from "bun:test";
import { Builder, ref, nand, X } from "../logic/model";
import { library } from "../logic/library";
import { compile, dependencies } from "../compiler/compiler";
import { Simulator } from "../simulator/Simulator";
import { ALU, Register16 } from "../machine/H16";
function run(type: string, inputs: Record<string, number | "X">) {
  const sim = new Simulator(compile(library[type], library));
  for (const [k, v] of Object.entries(inputs)) sim.setPort(k, v);
  sim.settle();
  return sim;
}
describe("NAND-derived logic", () => {
  test("three-valued primitive", () => {
    expect(nand(0, X)).toBe(1);
    expect(nand(1, X)).toBe(X);
    expect(nand(X, X)).toBe(X);
  });
  for (const [name, oracle] of Object.entries({
    NAND: (a: number, b: number) => 1 - (a & b),
    AND: (a: number, b: number) => a & b,
    OR: (a: number, b: number) => a | b,
    XOR: (a: number, b: number) => a ^ b,
  }))
    test(`${name} exhaustive truth table`, () => {
      for (let a = 0; a < 2; a++)
        for (let b = 0; b < 2; b++)
          expect(run(name, { A: a, B: b }).read("OUT")).toBe(oracle(a, b));
    });
  test("NOT truth table including unknown", () => {
    expect(run("NOT", { A: 0 }).read("OUT")).toBe(1);
    expect(run("NOT", { A: 1 }).read("OUT")).toBe(0);
    expect(run("NOT", { A: "X" }).read("OUT")).toBe("X");
  });
  test("MUX and DEMUX exhaustive", () => {
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++)
        for (let s = 0; s < 2; s++) {
          expect(run("MUX", { A: a, B: b, S: s }).read("OUT")).toBe(s ? b : a);
          const d = run("DEMUX", { A: a, S: s });
          expect(d.read("LEFT")).toBe(s ? 0 : a);
          expect(d.read("RIGHT")).toBe(s ? a : 0);
        }
  });
  test("half and full adders exhaustive", () => {
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) {
        const half = run("Half Adder", { A: a, B: b });
        expect(half.read("Sum")).toBe((a + b) & 1);
        expect(half.read("Carry")).toBe((a + b) >> 1);
        for (let c = 0; c < 2; c++) {
          const full = run("Full Adder", { A: a, B: b, Cin: c });
          expect(full.read("Sum")).toBe((a + b + c) & 1);
          expect(full.read("Carry")).toBe((a + b + c) >> 1);
        }
      }
  });
  test("Adder16 circuit against reference including carry vs signed overflow", () => {
    let seed = 123;
    const sim = run("Adder16", { A: 0, B: 0, Cin: 0 });
    const pairs = [
      [0, 0],
      [1, 1],
      [0x7fff, 1],
      [0xffff, 1],
      [0x8000, 0x8000],
    ];
    for (let i = 0; i < 1000; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      pairs.push([seed & 65535, seed >>> 16]);
    }
    for (const [a, b] of pairs) {
      sim.setPort("A", a);
      sim.setPort("B", b);
      sim.settle();
      const value = (a + b) & 65535;
      expect(sim.read("OUT")).toBe(value);
      expect(sim.read("C")).toBe(a + b > 65535 ? 1 : 0);
      expect(sim.read("V")).toBe(~(a ^ b) & (a ^ value) & 0x8000 ? 1 : 0);
    }
  });
  test("all ALU operations against independent arithmetic oracle", () => {
    const alu = new ALU();
    let seed = 9876;
    for (let k = 0; k < 200; k++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const a = k < 5 ? [0, 1, 0x7fff, 0x8000, 0xffff][k] : seed & 65535,
        b = k < 5 ? [0, 1, 1, 0x8000, 1][k] : seed >>> 16;
      const expected = [a + b, a - b, a & b, a | b, a ^ b, ~a, a, b].map(
        (v) => v & 65535,
      );
      for (let op = 0; op < 8; op++) {
        const result = alu.evaluate(a, b, op);
        expect(result).toBe(expected[op]);
        expect(alu.flags.Z).toBe(result === 0 ? 1 : 0);
        expect(alu.flags.N).toBe(result >>> 15);
        expect(alu.flags.C).toBe(
          op === 0 ? +(a + b > 65535) : op === 1 ? +(a >= b) : 0,
        );
        const overflow =
          op === 0
            ? ~(a ^ b) & (a ^ result) & 32768
            : op === 1
              ? (a ^ b) & (a ^ result) & 32768
              : 0;
        expect(alu.flags.V).toBe(overflow ? 1 : 0);
      }
    }
  });
  test("register load, hold, reset, clock edge and unknown", () => {
    const r = new Register16();
    r.edge(42);
    expect(r.value).toBe(42);
    r.sim.setPort("D", 99);
    r.sim.settle();
    expect(r.value).toBe(42);
    r.edge(99, false);
    expect(r.value).toBe(42);
    r.edge(99, true);
    expect(r.value).toBe(99);
    r.edge(99, false, true);
    expect(r.value).toBe(0);
    const sim = run("D Flip-Flop", { D: "X" });
    expect(sim.read("Q")).toBe(0);
    sim.tick();
    expect(sim.read("Q")).toBe("X");
  });
  test("simultaneous edge sampling across chained DFFs", () => {
    const b = new Builder("chain", { D: 1 }, { Q: 1 });
    b.add("a", "D Flip-Flop");
    b.add("b", "D Flip-Flop");
    b.wire(b.input("D"), ref("a", "D"));
    b.wire(ref("a", "Q"), ref("b", "D"));
    b.wire(ref("b", "Q"), b.output("Q"));
    const sim = new Simulator(compile(b.circuit, library));
    sim.setPort("D", 1);
    sim.tick();
    expect(sim.read("Q")).toBe(0);
    sim.tick();
    expect(sim.read("Q")).toBe(1);
  });
  test("counter increments, holds, wraps and resets", () => {
    const sim = run("Counter", { EN: 1, RESET: 0 });
    for (let i = 0; i < 20; i++) sim.tick();
    expect(sim.read("Q")).toBe(20);
    sim.setPort("EN", 0);
    sim.tick();
    expect(sim.read("Q")).toBe(20);
    sim.setPort("RESET", 1);
    sim.tick();
    expect(sim.read("Q")).toBe(0);
  });
  test("gate propagation steps reveal pending intermediate signals", () => {
    const sim = run("AND", { A: 0, B: 1 });
    sim.setPort("A", 1);
    expect(sim.read("OUT")).toBe(0);
    sim.stepPropagation();
    expect(sim.read("OUT")).toBe(0);
    sim.stepPropagation();
    expect(sim.read("OUT")).toBe(1);
  });
  test("changing unrelated input does not rescan entire graph", () => {
    const sim = run("Adder16", { A: 0, B: 0, Cin: 0 });
    const before = sim.evaluations;
    sim.setPort("A", 0x8000);
    sim.settle();
    expect(sim.read("OUT")).toBe(0x8000);
    expect(sim.evaluations - before).toBeLessThan(40);
  });
  test("hierarchical paths contain the gates used for the output", () => {
    const alu = new ALU();
    alu.evaluate(23, 35, 0);
    expect(alu.sim.read("OUT", "ALU16/adder")).toBe(58);
    expect(alu.sim.read("Sum", "ALU16/adder/FullAdder0")).toBe(0);
    expect(alu.sim.net.paths).toContain(
      "ALU16/adder/FullAdder0/first/sum/shared",
    );
  });
});
describe("compiler validation and graph traversal", () => {
  test("all standard components compile", () => {
    for (const c of Object.values(library))
      expect(() => compile(c, library)).not.toThrow();
  });
  test("missing inputs and duplicate IDs", () => {
    const c = structuredClone(library.AND);
    c.nets.pop();
    expect(() => compile(c, library)).toThrow("unconnected");
    c.components.push(c.components[0]);
    expect(() => compile(c, library)).toThrow("duplicate component ID");
  });
  test("invalid directions and widths", () => {
    const c = structuredClone(library.AND);
    c.nets[0].sources = [ref("nand", "A")];
    expect(() => compile(c, library)).toThrow("invalid source");
    const d = structuredClone(library.AND);
    d.nets[0].width = 16;
    expect(() => compile(d, library)).toThrow("width mismatch");
  });
  test("multi-driver, invalid hierarchy, bad bit", () => {
    const c = structuredClone(library.AND);
    c.nets[0].sources.push(ref("$in", "B"));
    expect(() => compile(c, library)).toThrow("driver");
    const d = structuredClone(library.AND);
    d.components[0].type = "missing";
    expect(() => compile(d, library)).toThrow("unknown component");
    const e = structuredClone(library.AND);
    e.nets[0].sources[0].bit = 5;
    expect(() => compile(e, library)).toThrow("bit outside");
  });
  test("recursive definitions and combinational cycles", () => {
    const b = new Builder("loop", {}, { OUT: 1 });
    b.add("self", "NOT");
    b.wire(ref("self", "OUT"), ref("self", "A"));
    b.wire(ref("self", "OUT"), b.output("OUT"));
    expect(() => compile(b.circuit, library)).toThrow("Combinational loop");
    b.circuit.components[0].type = "loop";
    expect(() => compile(b.circuit, { ...library, loop: b.circuit })).toThrow(
      "recursive hierarchy",
    );
  });
  test("upstream and downstream traversal", () => {
    expect(dependencies(library.XOR, "result", "upstream")).toEqual(
      new Set(["result", "left", "right", "$in", "shared"]),
    );
    expect(dependencies(library.XOR, "shared", "downstream")).toEqual(
      new Set(["shared", "left", "right", "result", "$out"]),
    );
  });
  test("thousands of primitives stay indexed and executable", () => {
    const b = new Builder("large", { A: 16, B: 16, Cin: 1 }, { OUT: 16 });
    for (let i = 0; i < 32; i++) {
      b.add("add" + i, "Adder16");
      b.wire(
        i ? ref("add" + (i - 1), "OUT") : b.input("A"),
        ref("add" + i, "A"),
        16,
      );
      b.wire(b.input("B"), ref("add" + i, "B"), 16);
      b.wire(b.input("Cin"), ref("add" + i, "Cin"));
    }
    b.wire(ref("add31", "OUT"), b.output("OUT"), 16);
    const sim = new Simulator(compile(b.circuit, library));
    expect(sim.net.gateTypes.length).toBeGreaterThan(7000);
    sim.setPort("A", 12);
    sim.setPort("B", 3);
    sim.setPort("Cin", 0);
    sim.settle();
    expect(sim.read("OUT")).toBe(108);
  });
});
