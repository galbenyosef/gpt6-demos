import { hex } from "../logic/model";
import { PHASES } from "../machine/InstructionSet";
import type { MachineState } from "../machine/H16";
export type StopReason = "ready" | "paused" | "breakpoint";
export function executionView(
  s: MachineState,
  running: boolean,
  reason: StopReason,
) {
  const { op, a, b } = s.decoded;
  const phase = s.cycles ? (s.phase + 4) % 5 : -1;
  const writes = [
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
  ].includes(op);
  const arithmetic = [
    "ADD",
    "SUB",
    "INC",
    "DEC",
    "AND",
    "OR",
    "XOR",
    "NOT",
    "MOV",
    "LDI",
  ].includes(op);
  const instruction =
    op +
    (["HALT", "NOP", "RET"].includes(op)
      ? ""
      : ["JMP", "JZ", "JNZ", "JC", "CALL"].includes(op)
        ? ` 0x${hex(s.immediate)}`
        : ` R${a}` +
          (["INC", "DEC", "NOT", "PUSH", "POP"].includes(op)
            ? ""
            : op === "LDI"
              ? `, ${s.immediate}`
              : `, R${b}`));
  const label = s.fault
    ? "Fault"
    : s.halted
      ? "Finished"
      : running
        ? "Running"
        : reason === "breakpoint"
          ? "Breakpoint"
          : s.cycles === 0
            ? "Ready"
            : "Paused";
  let title = "",
    detail = "",
    nodes: string[] = [];
  if (s.fault) {
    title = s.fault;
    detail = "Execution stopped. Reset or load a corrected program.";
  } else if (s.halted) {
    title = `HALT · ${s.instructions} instructions completed`;
    detail =
      s.registers
        .map((v, i) => ({ v, i }))
        .filter((r) => r.v !== 0)
        .map(({ v, i }) => `R${i} = ${v} (0x${hex(v)})`)
        .join(" · ") || "All general-purpose registers are 0.";
  } else if (reason === "breakpoint" && !running) {
    title = `Stopped before instruction at 0x${hex(s.pc)}`;
    detail = "Resume to execute this instruction, or step through its phases.";
  } else if (phase < 0) {
    title = running
      ? "Clock started · waiting for the first fetch"
      : "Program loaded · ready to run";
    detail = running
      ? "The first clock reads the instruction at 0x" + hex(s.pc) + "."
      : "Run executes the program. Watch slowly follows one CPU phase per second.";
  } else {
    title = `${PHASES[phase]} · ${phase === 0 ? "Read instruction" : instruction}`;
    if (phase === 0) {
      detail = `Memory[0x${hex(s.instructionPC)}] → instruction register (0x${hex(s.ir)}). Next: decode.`;
      nodes = ["PC", "RAM", "IR"];
    }
    if (phase === 1) {
      detail = `Control unit decoded ${instruction}. Next: select register inputs and ALU operation.`;
      nodes = ["IR", "Decoder"];
    }
    if (phase === 2) {
      detail = arithmetic
        ? `${op === "LDI" ? `Immediate ${s.immediate}` : `Inputs ${s.alu.a} and ${s.alu.b}`} → ALU ${op} → ${s.alu.result} (0x${hex(s.alu.result)}). ${writes ? "R" + a + " has not been written yet." : ""}`
        : "No arithmetic is needed for this instruction.";
      nodes = arithmetic ? ["Registers", "ALU"] : ["Decoder"];
    }
    if (phase === 3) {
      detail =
        op === "ST"
          ? `R${a} (${s.registers[a]}) → memory[0x${hex(s.registers[b])}].`
          : op === "LD"
            ? `Memory[0x${hex(s.registers[b])}] → ${s.pending}, ready for R${a}.`
            : ["PUSH", "POP", "CALL", "RET"].includes(op)
              ? `Stack transfer completed. SP = 0x${hex(s.sp)}.`
              : "No memory transfer is needed. Next: writeback.";
      nodes = ["LD", "ST"].includes(op)
        ? ["RAM", "Registers"]
        : ["PUSH", "POP", "CALL", "RET"].includes(op)
          ? ["RAM", "SP"]
          : ["Decoder"];
    }
    if (phase === 4) {
      detail = writes
        ? `R${a} ← ${s.registers[a]} (0x${hex(s.registers[a])}). Next instruction: 0x${hex(s.pc)}.`
        : `Instruction completed. Next instruction: 0x${hex(s.pc)}.`;
      nodes = writes ? ["Registers"] : ["PC"];
    }
  }
  return { label, title, detail, phase, nodes, instruction };
}
