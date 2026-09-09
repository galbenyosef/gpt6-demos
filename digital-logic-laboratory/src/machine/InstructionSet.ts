export const OPS = [
  "NOP",
  "HALT",
  "MOV",
  "LDI",
  "LD",
  "ST",
  "ADD",
  "SUB",
  "INC",
  "DEC",
  "AND",
  "OR",
  "XOR",
  "NOT",
  "JMP",
  "JZ",
  "JNZ",
  "JC",
  "CALL",
  "RET",
  "PUSH",
  "POP",
] as const;
export type Opcode = (typeof OPS)[number];
export const FORMS: Record<Opcode, "none" | "r" | "rr" | "ri" | "addr"> = {
  NOP: "none",
  HALT: "none",
  MOV: "rr",
  LDI: "ri",
  LD: "rr",
  ST: "rr",
  ADD: "rr",
  SUB: "rr",
  INC: "r",
  DEC: "r",
  AND: "rr",
  OR: "rr",
  XOR: "rr",
  NOT: "r",
  JMP: "addr",
  JZ: "addr",
  JNZ: "addr",
  JC: "addr",
  CALL: "addr",
  RET: "none",
  PUSH: "r",
  POP: "r",
};
export const MAP = {
  RAM_START: 0,
  RAM_END: 0x7fff,
  ROM_START: 0x8000,
  ROM_END: 0xbfff,
  VIDEO: 0xc000,
  VIDEO_WORDS: 1024,
  KEY: 0xe000,
  KEY_STATE: 0xe001,
  TIMER: 0xe002,
  WIDTH: 128,
  HEIGHT: 128,
};
export const PHASES = [
  "FETCH",
  "DECODE",
  "EXECUTE",
  "MEMORY",
  "WRITEBACK",
] as const;
export function decodeInstruction(word: number) {
  const op = OPS[word >>> 11];
  if (!op) throw new Error(`Illegal opcode ${word >>> 11}`);
  if (word & 31) throw new Error("Reserved instruction bits must be zero");
  return { op, a: (word >>> 8) & 7, b: (word >>> 5) & 7 };
}
export const instructionWords = (op: Opcode) =>
  FORMS[op] === "ri" || FORMS[op] === "addr" ? 2 : 1;
