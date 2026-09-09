import { Builder, port, ref, type Circuit, type Library } from "./model";
export const library: Library = {};
function primitive(
  id: string,
  inputs: Record<string, number>,
  outputs: Record<string, number>,
  kind: Circuit["primitive"],
) {
  library[id] = {
    id,
    name: id,
    inputs: Object.entries(inputs).map(([n, w]) => port(n, w)),
    outputs: Object.entries(outputs).map(([n, w]) => port(n, w, "OUTPUT")),
    components: [],
    nets: [],
    primitive: kind,
  };
}
primitive("NAND", { A: 1, B: 1 }, { OUT: 1 }, "NAND");
primitive("D Flip-Flop", { D: 1 }, { Q: 1 }, "DFF");
primitive("0", {}, { OUT: 1 }, "ZERO");
primitive("1", {}, { OUT: 1 }, "ONE");
function make(
  id: string,
  ins: Record<string, number>,
  outs: Record<string, number>,
  build: (b: Builder) => void,
) {
  const b = new Builder(id, ins, outs);
  build(b);
  library[id] = b.circuit;
}
make("NOT", { A: 1 }, { OUT: 1 }, (b) => {
  b.add("invert", "NAND");
  b.wire(b.input("A"), ref("invert", "A"));
  b.wire(b.input("A"), ref("invert", "B"));
  b.wire(ref("invert", "OUT"), b.output("OUT"));
});
make("AND", { A: 1, B: 1 }, { OUT: 1 }, (b) => {
  b.add("nand", "NAND", -2, 0);
  b.add("invert", "NOT", 2, 0);
  for (const p of ["A", "B"]) b.wire(b.input(p), ref("nand", p));
  b.wire(ref("nand", "OUT"), ref("invert", "A"));
  b.wire(ref("invert", "OUT"), b.output("OUT"));
});
make("OR", { A: 1, B: 1 }, { OUT: 1 }, (b) => {
  b.add("notA", "NOT", -2, 1);
  b.add("notB", "NOT", -2, -1);
  b.add("join", "NAND", 2, 0);
  for (const p of ["A", "B"]) {
    b.wire(b.input(p), ref("not" + p, "A"));
    b.wire(ref("not" + p, "OUT"), ref("join", p));
  }
  b.wire(ref("join", "OUT"), b.output("OUT"));
});
make("XOR", { A: 1, B: 1 }, { OUT: 1 }, (b) => {
  b.add("shared", "NAND", -3, 0);
  b.add("left", "NAND", 0, 1.5);
  b.add("right", "NAND", 0, -1.5);
  b.add("result", "NAND", 3, 0);
  for (const p of ["A", "B"]) b.wire(b.input(p), ref("shared", p));
  b.wire(b.input("A"), ref("left", "A"));
  b.wire(b.input("B"), ref("right", "A"));
  for (const id of ["left", "right"])
    b.wire(ref("shared", "OUT"), ref(id, "B"));
  b.wire(ref("left", "OUT"), ref("result", "A"));
  b.wire(ref("right", "OUT"), ref("result", "B"));
  b.wire(ref("result", "OUT"), b.output("OUT"));
});
make("MUX", { A: 1, B: 1, S: 1 }, { OUT: 1 }, (b) => {
  b.add("select", "NOT", -3, -2);
  b.add("a", "NAND", 0, 1);
  b.add("b", "NAND", 0, -1);
  b.add("result", "NAND", 3, 0);
  b.wire(b.input("S"), ref("select", "A"));
  b.wire(b.input("A"), ref("a", "A"));
  b.wire(ref("select", "OUT"), ref("a", "B"));
  b.wire(b.input("B"), ref("b", "A"));
  b.wire(b.input("S"), ref("b", "B"));
  b.wire(ref("a", "OUT"), ref("result", "A"));
  b.wire(ref("b", "OUT"), ref("result", "B"));
  b.wire(ref("result", "OUT"), b.output("OUT"));
});
make("DEMUX", { A: 1, S: 1 }, { LEFT: 1, RIGHT: 1 }, (b) => {
  b.add("select", "NOT", -2, 0);
  b.add("left", "AND", 2, 1);
  b.add("right", "AND", 2, -1);
  b.wire(b.input("S"), ref("select", "A"));
  for (const id of ["left", "right"]) b.wire(b.input("A"), ref(id, "A"));
  b.wire(ref("select", "OUT"), ref("left", "B"));
  b.wire(b.input("S"), ref("right", "B"));
  b.wire(ref("left", "OUT"), b.output("LEFT"));
  b.wire(ref("right", "OUT"), b.output("RIGHT"));
});
make("Half Adder", { A: 1, B: 1 }, { Sum: 1, Carry: 1 }, (b) => {
  b.add("sum", "XOR", 0, 1.5);
  b.add("carry", "AND", 0, -1.5);
  for (const id of ["sum", "carry"])
    for (const p of ["A", "B"]) b.wire(b.input(p), ref(id, p));
  b.wire(ref("sum", "OUT"), b.output("Sum"));
  b.wire(ref("carry", "OUT"), b.output("Carry"));
});
make("Full Adder", { A: 1, B: 1, Cin: 1 }, { Sum: 1, Carry: 1 }, (b) => {
  b.add("first", "Half Adder", -3, 1);
  b.add("second", "Half Adder", 0, 1);
  b.add("carry", "OR", 3, -1);
  for (const p of ["A", "B"]) b.wire(b.input(p), ref("first", p));
  b.wire(ref("first", "Sum"), ref("second", "A"));
  b.wire(b.input("Cin"), ref("second", "B"));
  b.wire(ref("first", "Carry"), ref("carry", "A"));
  b.wire(ref("second", "Carry"), ref("carry", "B"));
  b.wire(ref("second", "Sum"), b.output("Sum"));
  b.wire(ref("carry", "OUT"), b.output("Carry"));
});
make("Adder16", { A: 16, B: 16, Cin: 1 }, { OUT: 16, C: 1, V: 1 }, (b) => {
  for (let i = 0; i < 16; i++) {
    const id = b.add(
      `FullAdder${i}`,
      "Full Adder",
      (i % 4) * 3 - 4.5,
      4.5 - Math.floor(i / 4) * 3,
    );
    for (const p of ["A", "B"]) b.wire(ref("$in", p, i), ref(id, p));
    b.wire(
      i ? ref(`FullAdder${i - 1}`, "Carry") : b.input("Cin"),
      ref(id, "Cin"),
    );
    b.wire(ref(id, "Sum"), ref("$out", "OUT", i));
  }
  b.add("overflow", "XOR", 7, -3);
  b.wire(ref("FullAdder14", "Carry"), ref("overflow", "A"));
  b.wire(ref("FullAdder15", "Carry"), ref("overflow", "B"));
  b.wire(ref("FullAdder15", "Carry"), b.output("C"));
  b.wire(ref("overflow", "OUT"), b.output("V"));
});
for (const width of [1, 4, 8, 16]) {
  make(`Register${width}`, { D: width, EN: 1, RESET: 1 }, { Q: width }, (b) => {
    b.add("zero", "0", -5, 0);
    for (let i = 0; i < width; i++) {
      const x = (i % 4) * 3 - 4.5,
        y = 5 - Math.floor(i / 4) * 3;
      const m = b.add(`enable${i}`, "MUX", x, y);
      const r = b.add(`reset${i}`, "MUX", x + 0.6, y - 0.8);
      const d = b.add(`bit${i}`, "D Flip-Flop", x + 1.2, y - 1.6);
      b.wire(ref(d, "Q"), ref(m, "A"));
      b.wire(ref("$in", "D", i), ref(m, "B"));
      b.wire(b.input("EN"), ref(m, "S"));
      b.wire(ref(m, "OUT"), ref(r, "A"));
      b.wire(ref("zero", "OUT"), ref(r, "B"));
      b.wire(b.input("RESET"), ref(r, "S"));
      b.wire(ref(r, "OUT"), ref(d, "D"));
      b.wire(ref(d, "Q"), ref("$out", "Q", i));
    }
  });
}
make("Counter", { EN: 1, RESET: 1 }, { Q: 16 }, (b) => {
  b.add("state", "Register16", 3, 0);
  b.add("increment", "Adder16", -2, 0);
  b.add("zero", "0", -5, -3);
  b.add("one", "1", -5, 3);
  b.wire(ref("state", "Q"), ref("increment", "A"), 16);
  for (let i = 0; i < 16; i++)
    b.wire(ref(i === 0 ? "one" : "zero", "OUT"), ref("increment", "B", i));
  b.wire(ref("zero", "OUT"), ref("increment", "Cin"));
  b.wire(ref("increment", "OUT"), ref("state", "D"), 16);
  for (const p of ["EN", "RESET"]) b.wire(b.input(p), ref("state", p));
  b.wire(ref("state", "Q"), b.output("Q"), 16);
});
for (const type of ["AND", "OR", "XOR", "NOT", "MUX"])
  make(
    `${type}16`,
    type === "NOT"
      ? { A: 16 }
      : type === "MUX"
        ? { A: 16, B: 16, S: 1 }
        : { A: 16, B: 16 },
    { OUT: 16 },
    (b) => {
      for (let i = 0; i < 16; i++) {
        const id = b.add(
          `bit${i}`,
          type,
          (i % 4) * 3 - 4.5,
          4.5 - Math.floor(i / 4) * 3,
        );
        b.wire(ref("$in", "A", i), ref(id, "A"));
        if (type !== "NOT") b.wire(ref("$in", "B", i), ref(id, "B"));
        if (type === "MUX") b.wire(b.input("S"), ref(id, "S"));
        b.wire(ref(id, "OUT"), ref("$out", "OUT", i));
      }
    },
  );
make("Subtract select", { B: 16, S: 1 }, { OUT: 16 }, (b) => {
  for (let i = 0; i < 16; i++) {
    const id = b.add(
      `bit${i}`,
      "XOR",
      (i % 4) * 3 - 4.5,
      4.5 - Math.floor(i / 4) * 3,
    );
    b.wire(ref("$in", "B", i), ref(id, "A"));
    b.wire(b.input("S"), ref(id, "B"));
    b.wire(ref(id, "OUT"), ref("$out", "OUT", i));
  }
});
make("Zero16", { A: 16 }, { Z: 1 }, (b) => {
  b.add("any1", "OR", -4, 3);
  b.wire(ref("$in", "A", 0), ref("any1", "A"));
  b.wire(ref("$in", "A", 1), ref("any1", "B"));
  for (let i = 2; i < 16; i++) {
    b.add(`any${i}`, "OR", (i % 4) * 3 - 4.5, 4.5 - Math.floor(i / 4) * 3);
    b.wire(ref(`any${i - 1}`, "OUT"), ref(`any${i}`, "A"));
    b.wire(ref("$in", "A", i), ref(`any${i}`, "B"));
  }
  b.add("isZero", "NOT", 6, -4);
  b.wire(ref("any15", "OUT"), ref("isZero", "A"));
  b.wire(ref("isZero", "OUT"), b.output("Z"));
});
// OP: ADD, SUB, AND, OR, XOR, NOT, PASS A, PASS B.
make(
  "ALU16",
  { A: 16, B: 16, OP: 3 },
  { OUT: 16, Z: 1, N: 1, C: 1, V: 1 },
  (b) => {
    b.add("subtract", "Subtract select", -7, 5);
    b.add("adder", "Adder16", -3, 5);
    b.wire(b.input("B"), ref("subtract", "B"), 16);
    b.wire(ref("$in", "OP", 0), ref("subtract", "S"));
    b.wire(b.input("A"), ref("adder", "A"), 16);
    b.wire(ref("subtract", "OUT"), ref("adder", "B"), 16);
    b.wire(ref("$in", "OP", 0), ref("adder", "Cin"));
    const signals = [ref("adder", "OUT"), ref("adder", "OUT")];
    for (const [i, type] of ["AND", "OR", "XOR", "NOT"].entries()) {
      const id = b.add(type, `${type}16`, -3, 2 - i * 2);
      b.wire(b.input("A"), ref(id, "A"), 16);
      if (type !== "NOT") b.wire(b.input("B"), ref(id, "B"), 16);
      signals.push(ref(id, "OUT"));
    }
    signals.push(b.input("A"), b.input("B"));
    let level = signals;
    for (let s = 0; s < 3; s++) {
      const next = [];
      for (let j = 0; j < level.length; j += 2) {
        const id = b.add(
          `select${s}_${j / 2}`,
          "MUX16",
          1 + s * 4,
          4 - j * 1.7,
        );
        b.wire(level[j], ref(id, "A"), 16);
        b.wire(level[j + 1], ref(id, "B"), 16);
        b.wire(ref("$in", "OP", s), ref(id, "S"));
        next.push(ref(id, "OUT"));
      }
      level = next;
    }
    b.wire(level[0], b.output("OUT"), 16);
    b.wire({ ...level[0], bit: 15 }, b.output("N"));
    b.add("zero", "Zero16", 9, -3);
    b.wire(level[0], ref("zero", "A"), 16);
    b.wire(ref("zero", "Z"), b.output("Z"));
    b.add("logicOp", "OR", -7, -7);
    b.wire(ref("$in", "OP", 1), ref("logicOp", "A"));
    b.wire(ref("$in", "OP", 2), ref("logicOp", "B"));
    b.add("arithmetic", "NOT", -3, -7);
    b.wire(ref("logicOp", "OUT"), ref("arithmetic", "A"));
    for (const [i, p] of ["C", "V"].entries()) {
      b.add(`flag${p}`, "AND", 1 + i * 4, -7);
      b.wire(ref("adder", p), ref(`flag${p}`, "A"));
      b.wire(ref("arithmetic", "OUT"), ref(`flag${p}`, "B"));
      b.wire(ref(`flag${p}`, "OUT"), b.output(p));
    }
  },
);
// Registers expose bit cells rather than showing all feedback gates at once.
make("Register16", { D: 16, EN: 1, RESET: 1 }, { Q: 16 }, (b) => {
  for (let i = 0; i < 16; i++) {
    const id = b.add(
      `bit${i}`,
      "Register1",
      (i % 4) * 4 - 6,
      6 - Math.floor(i / 4) * 4,
    );
    b.wire(ref("$in", "D", i), ref(id, "D"));
    b.wire(b.input("EN"), ref(id, "EN"));
    b.wire(b.input("RESET"), ref(id, "RESET"));
    b.wire(ref(id, "Q"), ref("$out", "Q", i));
  }
});
make(
  "Decoder3",
  { SEL: 3, WE: 1 },
  Object.fromEntries(Array.from({ length: 8 }, (_, i) => ["EN" + i, 1])),
  (b) => {
    for (let bit = 0; bit < 3; bit++) {
      b.add(`not${bit}`, "NOT", -5, 4 - bit * 3);
      b.wire(ref("$in", "SEL", bit), ref(`not${bit}`, "A"));
    }
    for (let i = 0; i < 8; i++) {
      const bits = Array.from({ length: 3 }, (_, bit) =>
        (i >> bit) & 1 ? ref("$in", "SEL", bit) : ref(`not${bit}`, "OUT"),
      );
      b.add(`decode${i}`, "AND", -1, 8 - i * 2.5);
      b.add(`select${i}`, "AND", 3, 8 - i * 2.5);
      b.add(`enable${i}`, "AND", 7, 8 - i * 2.5);
      b.wire(bits[0], ref(`decode${i}`, "A"));
      b.wire(bits[1], ref(`decode${i}`, "B"));
      b.wire(ref(`decode${i}`, "OUT"), ref(`select${i}`, "A"));
      b.wire(bits[2], ref(`select${i}`, "B"));
      b.wire(ref(`select${i}`, "OUT"), ref(`enable${i}`, "A"));
      b.wire(b.input("WE"), ref(`enable${i}`, "B"));
      b.wire(ref(`enable${i}`, "OUT"), b.output("EN" + i));
    }
  },
);
make(
  "MUX8x16",
  {
    ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => ["R" + i, 16])),
    SEL: 3,
  },
  { OUT: 16 },
  (b) => {
    let level = Array.from({ length: 8 }, (_, i) => b.input(`R${i}`));
    for (let bit = 0; bit < 3; bit++) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const id = b.add(
          `select${bit}_${i / 2}`,
          "MUX16",
          -4 + bit * 4,
          5 - i * 2,
        );
        b.wire(level[i], ref(id, "A"), 16);
        b.wire(level[i + 1], ref(id, "B"), 16);
        b.wire(ref("$in", "SEL", bit), ref(id, "S"));
        next.push(ref(id, "OUT"));
      }
      level = next;
    }
    b.wire(level[0], b.output("OUT"), 16);
  },
);
make(
  "RegisterFile",
  { DATA: 16, WSEL: 3, ASEL: 3, BSEL: 3, WE: 1, RESET: 1 },
  {
    A: 16,
    B: 16,
    ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => ["R" + i, 16])),
  },
  (b) => {
    b.add("writeSelect", "Decoder3", -7, 0);
    b.wire(b.input("WSEL"), ref("writeSelect", "SEL"), 3);
    b.wire(b.input("WE"), ref("writeSelect", "WE"));
    for (let i = 0; i < 8; i++) {
      b.add(`R${i}`, "Register16", -3 + (i % 2) * 4, 6 - Math.floor(i / 2) * 4);
      b.wire(b.input("DATA"), ref(`R${i}`, "D"), 16);
      b.wire(b.input("RESET"), ref(`R${i}`, "RESET"));
      b.wire(ref("writeSelect", "EN" + i), ref(`R${i}`, "EN"));
      b.wire(ref(`R${i}`, "Q"), b.output(`R${i}`), 16);
    }
    for (const path of ["A", "B"]) {
      b.add("read" + path, "MUX8x16", 6, path === "A" ? 4 : -4);
      for (let i = 0; i < 8; i++)
        b.wire(ref(`R${i}`, "Q"), ref("read" + path, `R${i}`), 16);
      b.wire(b.input(path + "SEL"), ref("read" + path, "SEL"), 3);
      b.wire(ref("read" + path, "OUT"), b.output(path), 16);
    }
  },
);
export const builtinNames = new Set(Object.keys(library));
