import { describe, expect, test } from "bun:test";
import { assemble, lex, parse } from "../assembler/Assembler";
import { H16 } from "../machine/H16";
import { OPS, MAP, decodeInstruction } from "../machine/InstructionSet";
import { programs } from "../examples/programs";
function machine(source: string) {
  const program = assemble(source);
  expect(program.diagnostics).toEqual([]);
  const m = new H16();
  m.load(program.words);
  return m;
}
function finish(m: H16, limit = 10000) {
  for (let i = 0; i < limit && !m.halted; i++) m.stepInstruction();
  expect(m.fault).toBe("");
  return m;
}
describe("assembler", () => {
  test("lexer positions, comments, numeric forms and parser AST", () => {
    const tokens = lex("; comment\nstart: LDI R0, 0x2A\n.word 0b10, -1");
    expect(tokens.find((t) => t.text === "LDI")).toMatchObject({
      line: 2,
      column: 8,
    });
    const ast = parse(tokens);
    expect(ast.map((s) => s.kind)).toEqual(["label", "instruction", "data"]);
  });
  test("machine words, labels, forward references, source mapping", () => {
    const a = assemble("JMP next\n.word 0x1234\nnext: LDI R2, -1\nHALT");
    expect(a.diagnostics).toEqual([]);
    expect([...a.words]).toEqual([
      14 << 11,
      0x8003,
      0x1234,
      (3 << 11) | (2 << 8),
      0xffff,
      1 << 11,
    ]);
    expect(a.symbols.next).toBe(0x8003);
    expect(a.sourceMap[0x8004]).toBe(3);
    expect(a.lineAddresses[4]).toBe(0x8005);
  });
  for (const [source, message] of [
    ["LDI R9, 10", "Unknown register"],
    ["JMP missing", "Undefined label"],
    ["LDI R0, 65536", "16-bit range"],
    ["LDI R0, -32769", "16-bit range"],
    ["BOGUS", "Unknown instruction"],
    ["LDI R0 10", "comma"],
    ["ADD R0,", "operand"],
    ["a: NOP\na: HALT", "Duplicate label"],
    ["LD R0, [R1", "closing bracket"],
    [".word 0xZZ", "Invalid number"],
    ["LDI R0, @", "Unexpected character"],
  ])
    test(`diagnostic: ${source}`, () => {
      const a = assemble(source);
      expect(a.diagnostics[0].message).toContain(message);
      expect(a.diagnostics[0].line).toBeGreaterThan(0);
      expect(a.diagnostics[0].column).toBeGreaterThan(0);
      expect(a.words.length).toBe(0);
    });
  test("all examples assemble", () => {
    for (const [name, source] of Object.entries(programs)) {
      const p = assemble(source);
      expect(p.diagnostics).toEqual([]);
      expect(p.words.length).toBeGreaterThan(0);
    }
  });
  test("ROM bounds", () =>
    expect(
      assemble(".word " + Array(16385).fill("0").join(",")).diagnostics[0]
        .message,
    ).toContain("ROM"));
});
describe("H16 every opcode", () => {
  const cases: Record<string, { code: string; check: (m: H16) => void }> = {
    NOP: { code: "NOP", check: (m) => expect(m.pc.value).toBe(0x8001) },
    HALT: { code: "HALT", check: (m) => expect(m.halted).toBe(true) },
    MOV: {
      code: "MOV R0,R1",
      check: (m) => expect(m.registers[0].value).toBe(3),
    },
    LDI: {
      code: "LDI R0,0xCAFE",
      check: (m) => {
        expect(m.registers[0].value).toBe(0xcafe);
        expect(m.pc.value).toBe(0x8002);
      },
    },
    LD: {
      code: "LD R0,[R1]",
      check: (m) => expect(m.registers[0].value).toBe(42),
    },
    ST: { code: "ST R0,[R1]", check: (m) => expect(m.memory[3]).toBe(8) },
    ADD: {
      code: "ADD R0,R1",
      check: (m) => expect(m.registers[0].value).toBe(11),
    },
    SUB: {
      code: "SUB R0,R1",
      check: (m) => {
        expect(m.registers[0].value).toBe(5);
        expect(m.flags.C).toBe(1);
      },
    },
    INC: { code: "INC R0", check: (m) => expect(m.registers[0].value).toBe(9) },
    DEC: { code: "DEC R0", check: (m) => expect(m.registers[0].value).toBe(7) },
    AND: {
      code: "AND R0,R1",
      check: (m) => {
        expect(m.registers[0].value).toBe(0);
        expect(m.flags.Z).toBe(1);
      },
    },
    OR: {
      code: "OR R0,R1",
      check: (m) => expect(m.registers[0].value).toBe(11),
    },
    XOR: {
      code: "XOR R0,R1",
      check: (m) => expect(m.registers[0].value).toBe(11),
    },
    NOT: {
      code: "NOT R0",
      check: (m) => {
        expect(m.registers[0].value).toBe(65527);
        expect(m.flags.N).toBe(1);
      },
    },
    JMP: { code: "JMP 0x8123", check: (m) => expect(m.pc.value).toBe(0x8123) },
    JZ: { code: "JZ 0x8123", check: (m) => expect(m.pc.value).toBe(0x8123) },
    JNZ: { code: "JNZ 0x8123", check: (m) => expect(m.pc.value).toBe(0x8002) },
    JC: { code: "JC 0x8123", check: (m) => expect(m.pc.value).toBe(0x8123) },
    CALL: {
      code: "CALL 0x8123",
      check: (m) => {
        expect(m.pc.value).toBe(0x8123);
        expect(m.sp.value).toBe(0x7ffe);
        expect(m.memory[0x7fff]).toBe(0x8002);
      },
    },
    RET: {
      code: "RET",
      check: (m) => {
        expect(m.pc.value).toBe(0x8222);
        expect(m.sp.value).toBe(0x7fff);
      },
    },
    PUSH: {
      code: "PUSH R0",
      check: (m) => {
        expect(m.sp.value).toBe(0x7ffe);
        expect(m.memory[0x7fff]).toBe(8);
      },
    },
    POP: {
      code: "POP R0",
      check: (m) => {
        expect(m.registers[0].value).toBe(0x8222);
        expect(m.sp.value).toBe(0x7fff);
      },
    },
  };
  for (const op of OPS)
    test(op, () => {
      const c = cases[op];
      const m = machine(c.code);
      m.registers[0].edge(8);
      m.registers[1].edge(3);
      m.memory[3] = 42;
      m.flags.Z = 1;
      m.flags.C = 1;
      if (op === "RET" || op === "POP") {
        m.sp.edge(0x7ffe);
        m.memory[0x7fff] = 0x8222;
      }
      m.stepInstruction();
      expect(m.fault).toBe("");
      expect(m.cycles).toBe(5);
      expect(m.instructions).toBe(1);
      c.check(m);
    });
  test("both conditional outcomes and carry/overflow flags", () => {
    for (const [op, flag] of [
      ["JZ", "Z"],
      ["JNZ", "Z"],
      ["JC", "C"],
    ] as const)
      for (const v of [0, 1]) {
        const m = machine(`${op} 0x9000`);
        m.flags[flag] = v;
        m.stepInstruction();
        expect(m.pc.value).toBe((op === "JNZ" ? !v : v) ? 0x9000 : 0x8002);
      }
    const m = finish(machine("LDI R0, 0x7FFF\nINC R0\nHALT"));
    expect(m.flags).toEqual({ Z: 0, N: 1, C: 0, V: 1 });
    const n = finish(machine("LDI R0, 0xFFFF\nINC R0\nHALT"));
    expect(n.flags).toEqual({ Z: 1, N: 0, C: 1, V: 0 });
  });
  test("phase stepping: actual ALU result precedes register commit", () => {
    const m = machine("ADD R0,R1");
    m.registers[0].edge(23);
    m.registers[1].edge(35);
    m.stepPhase();
    expect(m.phase).toBe(1);
    m.stepPhase();
    expect(m.decoded.op).toBe("ADD");
    m.stepPhase();
    expect(m.alu.sim.read("OUT")).toBe(58);
    expect(m.registers[0].value).toBe(23);
    m.stepPhase();
    m.stepPhase();
    expect(m.registers[0].value).toBe(58);
  });
  test("halted machine does not advance", () => {
    const m = finish(machine("HALT"));
    const before = m.snapshot();
    for (let i = 0; i < 20; i++) m.stepPhase();
    expect(m.snapshot()).toEqual(before);
  });
  test("illegal instruction, ROM protection and stack faults", () => {
    expect(() => decodeInstruction(0xffff)).toThrow("Illegal");
    expect(() => decodeInstruction(1)).toThrow("Reserved");
    expect(() => new H16().write(0x8000, 1)).toThrow("ROM");
    const m = machine("RET");
    m.stepInstruction();
    expect(m.fault).toContain("underflow");
  });
});
describe("whole programs and devices", () => {
  test("sum and Fibonacci", () => {
    const s = finish(machine(programs["Sum 1…10"]));
    expect(s.registers[1].value).toBe(55);
    const f = finish(machine(programs.Fibonacci));
    expect([...f.memory.slice(0, 12)]).toEqual([
      0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89,
    ]);
  });
  test("memory copy with stack and CALL/RET", () => {
    const m = machine(
      "LDI R0, 17\nPUSH R0\nLDI R0, 0\nCALL sub\nPOP R2\nHALT\nsub: LDI R1, 12\nST R1,[R0]\nLD R3,[R0]\nRET",
    );
    finish(m);
    expect(m.registers[2].value).toBe(17);
    expect(m.registers[3].value).toBe(12);
    expect(m.sp.value).toBe(MAP.RAM_END);
  });
  test("memory fill produces actual framebuffer contents", () => {
    const m = finish(machine(programs["Memory fill"]));
    expect(m.halted).toBe(true);
    expect(
      m.memory.slice(MAP.VIDEO, MAP.VIDEO + 1024).every((v) => v === 0xaaaa),
    ).toBe(true);
  });
  test("keyboard and timer reads go through memory map", () => {
    const m = machine(
      "LDI R1,0xE000\nLD R0,[R1]\nINC R1\nLD R2,[R1]\nINC R1\nLD R3,[R1]\nHALT",
    );
    m.keyCode = 38;
    m.keyState = 1;
    finish(m);
    expect(m.registers[0].value).toBe(38);
    expect(m.registers[2].value).toBe(1);
    expect(m.registers[3].value).toBeGreaterThan(0);
  });
  test("save and restore mid-instruction resumes deterministically", () => {
    const m = machine(programs.Fibonacci);
    for (let i = 0; i < 23; i++) m.stepPhase();
    const n = new H16();
    n.restore(m.snapshot());
    finish(m);
    finish(n);
    expect(n.snapshot()).toEqual(m.snapshot());
  });
  test("Pong draws, moves and responds to keyboard using CPU instructions", () => {
    const m = machine(programs.Pong);
    const frame = assemble(programs.Pong).symbols.frame;
    function nextFrame() {
      let count = 0;
      do {
        m.stepInstruction();
        if (m.halted) throw new Error(m.fault);
        if (++count > 10000) throw new Error("Pong frame did not finish");
      } while (m.pc.value !== frame);
    }
    nextFrame();
    expect(m.memory[0]).toBe(64);
    expect(m.memory[4]).toBe(55);
    expect(
      m.memory.slice(MAP.VIDEO, MAP.VIDEO + 1024).some((v) => v !== 0),
    ).toBe(true);
    const old = m.memory.slice(MAP.VIDEO, MAP.VIDEO + 1024);
    m.keyCode = 38;
    m.keyState = 1;
    nextFrame();
    expect(m.memory[0]).toBe(65);
    expect(m.memory[1]).toBe(65);
    expect(m.memory[4]).toBe(53);
    expect(m.memory.slice(MAP.VIDEO, MAP.VIDEO + 1024)).not.toEqual(old);
    m.memory[4] = 111;
    m.keyCode = 40;
    nextFrame();
    expect(m.memory[4]).toBe(111);
    m.memory[4] = 11;
    m.keyCode = 38;
    nextFrame();
    expect(m.memory[4]).toBe(11);
    m.keyState = 0;
    for (let i = 0; i < 65; i++) nextFrame();
    expect(m.memory[0]).toBeLessThan(127);
    expect(m.memory[1]).toBeGreaterThanOrEqual(10);
    expect(m.memory[1]).toBeLessThanOrEqual(124);
    m.memory[0] = 2;
    m.memory[1] = 90;
    m.memory[2] = 65535;
    m.memory[4] = 20;
    nextFrame();
    expect(m.memory[7]).toBe(1);
    expect(m.memory[0]).toBe(64);
  }, 30000);
});
