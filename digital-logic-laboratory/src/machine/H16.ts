import { compile } from "../compiler/compiler";
import { library } from "../logic/library";
import { Simulator } from "../simulator/Simulator";
import {
  MAP,
  PHASES,
  decodeInstruction,
  instructionWords,
  type Opcode,
} from "./InstructionSet";
export const ALU_OPS = [
  "ADD",
  "SUB",
  "AND",
  "OR",
  "XOR",
  "NOT",
  "PASS A",
  "PASS B",
] as const;
export class ALU {
  sim = new Simulator(compile(library.ALU16, library));
  a = 0;
  b = 0;
  op = 0;
  result = 0;
  flags = { Z: 0, N: 0, C: 0, V: 0 };
  evaluate(a: number, b: number, op: number) {
    this.a = a & 65535;
    this.b = b & 65535;
    this.op = op;
    this.sim.setPort("A", a);
    this.sim.setPort("B", b);
    this.sim.setPort("OP", op);
    this.sim.settle();
    this.result = this.sim.read("OUT") as number;
    for (const flag of ["Z", "N", "C", "V"] as const)
      this.flags[flag] = this.sim.read(flag) as number;
    return this.result;
  }
}
const registerNet = () => compile(library.Register16, library);
export class Register16 {
  sim = new Simulator(registerNet());
  constructor() {
    this.sim.setPort("D", 0);
    this.sim.setPort("EN", 0);
    this.sim.setPort("RESET", 0);
    this.sim.settle();
  }
  get value() {
    return this.sim.read("Q") as number;
  }
  edge(value: number, enable = true, reset = false) {
    this.sim.setPort("D", value);
    this.sim.setPort("EN", +enable);
    this.sim.setPort("RESET", +reset);
    this.sim.tick();
  }
}
export class RegisterFile {
  sim = new Simulator(compile(library.RegisterFile, library));
  registers: {
    readonly value: number;
    edge: (value: number, enable?: boolean, reset?: boolean) => void;
  }[] = [];
  constructor() {
    for (const p of library.RegisterFile.inputs) this.sim.setPort(p.id, 0);
    this.sim.settle();
    const bank = this;
    this.registers = Array.from({ length: 8 }, (_, i) => ({
      get value() {
        return bank.sim.read("R" + i) as number;
      },
      edge(value: number, enable = true, reset = false) {
        bank.write(i, value, enable, reset);
      },
    }));
  }
  write(index: number, value: number, enable = true, reset = false) {
    this.sim.setPort("DATA", value);
    this.sim.setPort("WSEL", index);
    this.sim.setPort("WE", +enable);
    this.sim.setPort("RESET", +reset);
    this.sim.tick();
    this.sim.setPort("WE", 0);
    this.sim.setPort("RESET", 0);
    this.sim.settle();
  }
  select(a: number, b: number) {
    this.sim.setPort("ASEL", a);
    this.sim.setPort("BSEL", b);
    this.sim.settle();
    return [this.sim.read("A") as number, this.sim.read("B") as number];
  }
}
export interface MachineState {
  registers: number[];
  pc: number;
  sp: number;
  flags: { Z: number; N: number; C: number; V: number };
  phase: number;
  ir: number;
  instructionPC: number;
  immediate: number;
  decoded: { op: Opcode; a: number; b: number };
  halted: boolean;
  cycles: number;
  instructions: number;
  pending: number;
  alu: {
    a: number;
    b: number;
    op: number;
    result: number;
    flags: { Z: number; N: number; C: number; V: number };
  };
  memory: number[];
  keyCode: number;
  keyState: number;
  fault: string;
}
export class H16 {
  bank = new RegisterFile();
  registers = this.bank.registers;
  pc = new Register16();
  sp = new Register16();
  irRegister = new Register16();
  alu = new ALU();
  memory = new Uint16Array(65536);
  flags = { Z: 0, N: 0, C: 0, V: 0 };
  phase = 0;
  ir = 0;
  instructionPC = MAP.ROM_START;
  immediate = 0;
  decoded = { op: "NOP" as Opcode, a: 0, b: 0 };
  halted = false;
  cycles = 0;
  instructions = 0;
  pending = 0;
  keyCode = 0;
  keyState = 0;
  fault = "";
  constructor() {
    this.reset();
  }
  reset() {
    for (const r of this.registers) r.edge(0, true, true);
    this.pc.edge(MAP.ROM_START);
    this.sp.edge(MAP.RAM_END);
    this.irRegister.edge(0);
    this.flags = { Z: 0, N: 0, C: 0, V: 0 };
    this.phase = 0;
    this.ir = 0;
    this.instructionPC = MAP.ROM_START;
    this.immediate = 0;
    this.decoded = { op: "NOP", a: 0, b: 0 };
    this.halted = false;
    this.cycles = 0;
    this.instructions = 0;
    this.pending = 0;
    this.fault = "";
    this.keyCode = 0;
    this.keyState = 0;
    this.alu.evaluate(0, 0, 0);
    this.memory.fill(0, MAP.VIDEO, MAP.VIDEO + MAP.VIDEO_WORDS);
  }
  load(words: Uint16Array) {
    if (words.length > MAP.ROM_END - MAP.ROM_START + 1)
      throw new Error("Program exceeds ROM");
    this.memory.fill(0);
    this.memory.set(words, MAP.ROM_START);
    this.reset();
  }
  read(address: number) {
    address &= 65535;
    if (address === MAP.KEY) return this.keyCode;
    if (address === MAP.KEY_STATE) return this.keyState;
    if (address === MAP.TIMER) return this.cycles & 65535;
    return this.memory[address];
  }
  write(address: number, value: number) {
    address &= 65535;
    if (address >= MAP.ROM_START && address <= MAP.ROM_END)
      throw new Error("Cannot write program ROM");
    if (address >= MAP.KEY && address <= MAP.TIMER) return;
    this.memory[address] = value & 65535;
  }
  // Address increments use the same compiled adder. A dedicated address ALU keeps data-ALU inspection stable.
  private addressALU: ALU | undefined;
  private advance(value: number, delta: number) {
    this.addressALU ??= new ALU();
    return this.addressALU.evaluate(value, Math.abs(delta), delta < 0 ? 1 : 0);
  }
  private push(value: number) {
    if (this.sp.value === 0) throw new Error("Stack overflow");
    this.write(this.sp.value, value);
    this.sp.edge(this.advance(this.sp.value, -1));
  }
  private pop() {
    if (this.sp.value === MAP.RAM_END) throw new Error("Stack underflow");
    this.sp.edge(this.advance(this.sp.value, 1));
    return this.read(this.sp.value);
  }
  stepPhase() {
    if (this.halted) return;
    try {
      const { op, a, b } = this.decoded;
      switch (this.phase) {
        case 0:
          this.instructionPC = this.pc.value;
          this.ir = this.read(this.pc.value);
          this.irRegister.edge(this.ir);
          this.pc.edge(this.advance(this.pc.value, 1));
          break;
        case 1:
          this.decoded = decodeInstruction(this.ir);
          if (instructionWords(this.decoded.op) === 2) {
            this.immediate = this.read(this.pc.value);
            this.pc.edge(this.advance(this.pc.value, 1));
          } else this.immediate = 0;
          break;
        case 2: {
          const [va, vb] = this.bank.select(a, b);
          const operation: Partial<Record<Opcode, number>> = {
            ADD: 0,
            SUB: 1,
            INC: 0,
            DEC: 1,
            AND: 2,
            OR: 3,
            XOR: 4,
            NOT: 5,
            MOV: 7,
            LDI: 7,
          };
          if (op in operation) {
            this.pending = this.alu.evaluate(
              va,
              op === "INC" || op === "DEC"
                ? 1
                : op === "LDI"
                  ? this.immediate
                  : vb,
              operation[op]!,
            );
          }
          break;
        }
        case 3:
          if (op === "LD") this.pending = this.read(this.registers[b].value);
          if (op === "ST")
            this.write(this.registers[b].value, this.registers[a].value);
          if (op === "PUSH") this.push(this.registers[a].value);
          if (op === "POP") this.pending = this.pop();
          if (op === "CALL") this.push(this.pc.value);
          if (op === "RET") this.pending = this.pop();
          break;
        case 4:
          if (
            [
              "MOV",
              "LDI",
              "LD",
              "ADD",
              "SUB",
              "INC",
              "DEC",
              "AND",
              "OR",
              "XOR",
              "NOT",
              "POP",
            ].includes(op)
          )
            this.registers[a].edge(this.pending);
          if (
            ["ADD", "SUB", "INC", "DEC", "AND", "OR", "XOR", "NOT"].includes(op)
          )
            this.flags = { ...this.alu.flags };
          if (
            op === "JMP" ||
            op === "CALL" ||
            (op === "JZ" && this.flags.Z) ||
            (op === "JNZ" && !this.flags.Z) ||
            (op === "JC" && this.flags.C)
          )
            this.pc.edge(this.immediate);
          if (op === "RET") this.pc.edge(this.pending);
          if (op === "HALT") this.halted = true;
          this.instructions++;
          break;
      }
      this.cycles++;
      this.phase = (this.phase + 1) % PHASES.length;
    } catch (error) {
      this.halted = true;
      this.fault = error instanceof Error ? error.message : String(error);
    }
  }
  stepInstruction() {
    const start = this.instructions;
    while (!this.halted && this.instructions === start) this.stepPhase();
  }
  snapshot(includeMemory = true): MachineState {
    return {
      registers: this.registers.map((r) => r.value),
      pc: this.pc.value,
      sp: this.sp.value,
      flags: { ...this.flags },
      phase: this.phase,
      ir: this.ir,
      instructionPC: this.instructionPC,
      immediate: this.immediate,
      decoded: { ...this.decoded },
      halted: this.halted,
      cycles: this.cycles,
      instructions: this.instructions,
      pending: this.pending,
      alu: {
        a: this.alu.a,
        b: this.alu.b,
        op: this.alu.op,
        result: this.alu.result,
        flags: { ...this.alu.flags },
      },
      memory: includeMemory ? Array.from(this.memory) : [],
      keyCode: this.keyCode,
      keyState: this.keyState,
      fault: this.fault,
    };
  }
  restore(s: MachineState) {
    if (s.memory.length !== 65536 || s.registers.length !== 8)
      throw new Error("Invalid machine state");
    this.memory.set(s.memory);
    s.registers.forEach((v, i) => this.registers[i].edge(v));
    this.pc.edge(s.pc);
    this.sp.edge(s.sp);
    this.irRegister.edge(s.ir);
    this.flags = { ...s.flags };
    this.phase = s.phase;
    this.ir = s.ir;
    this.instructionPC = s.instructionPC;
    this.immediate = s.immediate;
    this.decoded = { ...s.decoded };
    this.halted = s.halted;
    this.cycles = s.cycles;
    this.instructions = s.instructions;
    this.pending = s.pending;
    this.keyCode = s.keyCode;
    this.keyState = s.keyState;
    this.fault = s.fault;
    this.bank.select(s.decoded.a, s.decoded.b);
    this.alu.evaluate(s.alu.a, s.alu.b, s.alu.op);
  }
}
