export type LogicValue = 0 | 1 | "X";
export const X = 2;
export const encode = (v: LogicValue): number => (v === "X" ? X : v);
export const decode = (v: number): LogicValue => (v === X ? "X" : (v as 0 | 1));
export const nand = (a: number, b: number) =>
  a === 0 || b === 0 ? 1 : a === X || b === X ? X : 0;
export interface Port {
  id: string;
  name: string;
  direction: "INPUT" | "OUTPUT";
  width: number;
}
export interface Ref {
  component: string;
  port: string;
  bit?: number;
}
export interface Component {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
}
export interface Net {
  id: string;
  width: number;
  sources: Ref[];
  targets: Ref[];
}
export interface Circuit {
  id: string;
  name: string;
  inputs: Port[];
  outputs: Port[];
  components: Component[];
  nets: Net[];
  primitive?: "NAND" | "DFF" | "ZERO" | "ONE";
}
export type Library = Record<string, Circuit>;
export const port = (
  name: string,
  width = 1,
  direction: Port["direction"] = "INPUT",
): Port => ({ id: name, name, width, direction });
export const ref = (component: string, port: string, bit?: number): Ref => ({
  component,
  port,
  ...(bit === undefined ? {} : { bit }),
});
export class Builder {
  circuit: Circuit;
  constructor(
    id: string,
    inputs: Record<string, number>,
    outputs: Record<string, number>,
  ) {
    this.circuit = {
      id,
      name: id,
      inputs: Object.entries(inputs).map(([n, w]) => port(n, w)),
      outputs: Object.entries(outputs).map(([n, w]) => port(n, w, "OUTPUT")),
      components: [],
      nets: [],
    };
  }
  add(id: string, type: string, x = 0, y = 0) {
    this.circuit.components.push({ id, type, position: { x, y, z: 0 } });
    return id;
  }
  wire(source: Ref, target: Ref, width = 1) {
    const net = this.circuit.nets.find(
      (n) =>
        n.width === width &&
        JSON.stringify(n.sources[0]) === JSON.stringify(source),
    );
    if (net) net.targets.push(target);
    else
      this.circuit.nets.push({
        id: `n${this.circuit.nets.length}`,
        width,
        sources: [source],
        targets: [target],
      });
  }
  input(name: string) {
    return ref("$in", name);
  }
  output(name: string) {
    return ref("$out", name);
  }
}
export const hex = (v: number, width = 4) =>
  (v >>> 0).toString(16).toUpperCase().padStart(width, "0");
