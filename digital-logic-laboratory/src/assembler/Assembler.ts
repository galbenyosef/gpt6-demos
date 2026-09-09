import {
  OPS,
  FORMS,
  MAP,
  instructionWords,
  type Opcode,
} from "../machine/InstructionSet";
export interface Token {
  kind:
    | "id"
    | "number"
    | "colon"
    | "comma"
    | "newline"
    | "lbracket"
    | "rbracket"
    | "eof";
  text: string;
  line: number;
  column: number;
}
export interface Diagnostic {
  line: number;
  column: number;
  message: string;
}
class AssemblyError extends Error {
  constructor(public diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}
const fail = (t: Pick<Token, "line" | "column">, message: string): never => {
  throw new AssemblyError({ line: t.line, column: t.column, message });
};
export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0,
    line = 1,
    column = 1;
  while (i < source.length) {
    let c = source[i];
    if (c === "\r" || c === " " || c === "\t") {
      i++;
      column++;
      continue;
    }
    if (c === ";" || c === "#") {
      while (i < source.length && source[i] !== "\n") {
        i++;
        column++;
      }
      continue;
    }
    const start = column;
    if (c === "\n") {
      tokens.push({ kind: "newline", text: c, line, column });
      i++;
      line++;
      column = 1;
      continue;
    }
    const punct: Record<string, Token["kind"]> = {
      ":": "colon",
      ",": "comma",
      "[": "lbracket",
      "]": "rbracket",
    };
    if (punct[c]) {
      tokens.push({ kind: punct[c], text: c, line, column });
      i++;
      column++;
      continue;
    }
    if (/[A-Za-z_.]/.test(c)) {
      let text = "";
      while (i < source.length && /[A-Za-z0-9_.]/.test(source[i])) {
        text += source[i++];
        column++;
      }
      tokens.push({ kind: "id", text, line, column: start });
      continue;
    }
    if (/[0-9-]/.test(c)) {
      let text = "";
      if (c === "-") {
        text += "-";
        i++;
        column++;
      }
      while (i < source.length && /[A-Za-z0-9]/.test(source[i])) {
        text += source[i++];
        column++;
      }
      tokens.push({ kind: "number", text, line, column: start });
      continue;
    }
    fail({ line, column }, `Unexpected character ${JSON.stringify(c)}`);
  }
  tokens.push({ kind: "eof", text: "", line, column });
  return tokens;
}
export type Statement =
  | { kind: "label"; name: string; token: Token }
  | { kind: "instruction"; op: Opcode; args: Token[]; token: Token }
  | { kind: "data"; args: Token[]; token: Token };
export function parse(tokens: Token[]): Statement[] {
  let i = 0;
  const ast: Statement[] = [];
  while (tokens[i].kind !== "eof") {
    if (tokens[i].kind === "newline") {
      i++;
      continue;
    }
    const first = tokens[i++];
    if (first.kind !== "id") fail(first, "Expected instruction or label");
    if (tokens[i].kind === "colon") {
      i++;
      ast.push({ kind: "label", name: first.text, token: first });
      continue;
    }
    const name = first.text.toUpperCase();
    if (name !== ".WORD" && !OPS.includes(name as Opcode))
      fail(first, `Unknown instruction ${first.text}`);
    const args: Token[] = [];
    let expectArg = true;
    while (!["newline", "eof"].includes(tokens[i].kind)) {
      const t = tokens[i++];
      if (!expectArg) {
        if (t.kind !== "comma") fail(t, "Expected comma between operands");
        expectArg = true;
        continue;
      }
      let value = t;
      if (t.kind === "lbracket") {
        value = tokens[i++];
        if (value.kind !== "id") fail(value, "Expected address register");
        if (tokens[i++].kind !== "rbracket")
          fail(value, "Expected closing bracket");
      }
      if (value.kind !== "id" && value.kind !== "number")
        fail(value, "Expected register, number, or label");
      args.push(value);
      expectArg = false;
    }
    if (expectArg && args.length)
      fail(tokens[i], "Expected operand after comma");
    if (name === ".WORD") {
      if (!args.length) fail(first, ".word requires at least one value");
      ast.push({ kind: "data", args, token: first });
    } else {
      const form = FORMS[name as Opcode];
      const n = form === "none" ? 0 : form === "rr" || form === "ri" ? 2 : 1;
      if (args.length !== n)
        fail(first, `${name} expects ${n} operand${n === 1 ? "" : "s"}`);
      ast.push({ kind: "instruction", op: name as Opcode, args, token: first });
    }
  }
  return ast;
}
export interface Assembly {
  words: Uint16Array;
  symbols: Record<string, number>;
  sourceMap: Record<number, number>;
  lineAddresses: Record<number, number>;
  diagnostics: Diagnostic[];
  origin: number;
}
export function assemble(source: string, origin = MAP.ROM_START): Assembly {
  const result: Assembly = {
    words: new Uint16Array(),
    symbols: Object.create(null),
    sourceMap: {},
    lineAddresses: {},
    diagnostics: [],
    origin,
  };
  try {
    const ast = parse(lex(source));
    let pc = origin;
    for (const s of ast) {
      if (s.kind === "label") {
        if (Object.hasOwn(result.symbols, s.name))
          fail(s.token, `Duplicate label ${s.name}`);
        result.symbols[s.name] = pc;
      } else pc += s.kind === "data" ? s.args.length : instructionWords(s.op);
    }
    if (pc > MAP.ROM_END + 1 || origin < MAP.ROM_START)
      fail({ line: 1, column: 1 }, "Program exceeds ROM region 0x8000–0xBFFF");
    const value = (t: Token) => {
      if (t.kind === "id") {
        if (!Object.hasOwn(result.symbols, t.text))
          return fail(t, `Undefined label "${t.text}"`);
        return result.symbols[t.text];
      }
      let sign = 1,
        text = t.text;
      if (text.startsWith("-")) {
        sign = -1;
        text = text.slice(1);
      }
      let n: number;
      if (/^0x[0-9a-f]+$/i.test(text)) n = parseInt(text.slice(2), 16);
      else if (/^0b[01]+$/i.test(text)) n = parseInt(text.slice(2), 2);
      else if (/^\d+$/.test(text)) n = Number(text);
      else return fail(t, `Invalid number ${t.text}`);
      n *= sign;
      if (!Number.isSafeInteger(n) || n < -32768 || n > 65535)
        return fail(t, "Immediate value exceeds 16-bit range");
      return n & 65535;
    };
    const register = (t: Token) => {
      if (!/^R[0-7]$/i.test(t.text))
        return fail(t, `Unknown register ${t.text}; expected R0–R7`);
      return Number(t.text[1]);
    };
    const words: number[] = [];
    pc = origin;
    for (const s of ast) {
      if (s.kind === "label") continue;
      result.lineAddresses[s.token.line] = pc;
      if (s.kind === "data") {
        for (const a of s.args) {
          result.sourceMap[pc++] = s.token.line;
          words.push(value(a));
        }
        continue;
      }
      const form = FORMS[s.op];
      let a = 0,
        b = 0;
      if (["r", "rr", "ri"].includes(form)) a = register(s.args[0]);
      if (form === "rr") b = register(s.args[1]);
      result.sourceMap[pc++] = s.token.line;
      words.push((OPS.indexOf(s.op) << 11) | (a << 8) | (b << 5));
      if (form === "ri" || form === "addr") {
        result.sourceMap[pc++] = s.token.line;
        words.push(value(s.args[form === "ri" ? 1 : 0]));
      }
    }
    result.words = Uint16Array.from(words);
  } catch (error) {
    if (error instanceof AssemblyError)
      result.diagnostics.push(error.diagnostic);
    else throw error;
  }
  return result;
}
