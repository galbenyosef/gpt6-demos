import { X, nand, type LogicValue, decode } from "../logic/model";
import { type CompiledNetlist, portKey } from "../compiler/compiler";
// Dirty gates are evaluated in compiled dependency order. The heap prevents duplicate work.
export class Simulator {
  readonly net: CompiledNetlist;
  private heap: number[] = [];
  private queued: Uint8Array;
  time = 0;
  evaluations = 0;
  constructor(net: CompiledNetlist) {
    this.net = net;
    this.queued = new Uint8Array(net.gateTypes.length);
    for (const g of net.order) this.enqueue(g);
    this.settle();
  }
  private enqueue(g: number) {
    if (this.queued[g]) return;
    this.queued[g] = 1;
    const h = this.heap,
      rank = this.net.rank;
    let i = h.length;
    h.push(g);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (rank[h[p]] <= rank[g]) break;
      h[i] = h[p];
      i = p;
    }
    h[i] = g;
  }
  private pop() {
    const h = this.heap,
      rank = this.net.rank;
    const g = h[0],
      last = h.pop()!;
    if (h.length) {
      let i = 0;
      while (i * 2 + 1 < h.length) {
        let j = i * 2 + 1;
        if (j + 1 < h.length && rank[h[j + 1]] < rank[h[j]]) j++;
        if (rank[last] <= rank[h[j]]) break;
        h[i] = h[j];
        i = j;
      }
      h[i] = last;
    }
    this.queued[g] = 0;
    return g;
  }
  set(signal: number, value: number) {
    if (this.net.signalValues[signal] === value) return;
    this.net.signalValues[signal] = value;
    for (const g of this.net.dependents[signal]) this.enqueue(g);
  }
  setPort(name: string, value: number | "X", path = this.net.root.id) {
    const ids = this.net.ports[portKey(path, name)];
    if (!ids) throw new Error(`Unknown port ${path}.${name}`);
    ids.forEach((s, i) => this.set(s, value === "X" ? X : (value >>> i) & 1));
  }
  read(name: string, path = this.net.root.id): number | "X" {
    const ids = this.net.ports[portKey(path, name)];
    if (!ids) throw new Error(`Unknown port ${path}.${name}`);
    let result = 0;
    for (let i = 0; i < ids.length; i++) {
      const v = this.net.signalValues[ids[i]];
      if (v === X) return "X";
      result |= v << i;
    }
    return result >>> 0;
  }
  stepPropagation() {
    // One topological wave: newly dirtied gates wait for the next step.
    const wave: number[] = [];
    while (this.heap.length) wave.push(this.pop());
    for (const g of wave) this.evaluate(g);
    this.time++;
    return this.heap.length;
  }
  private evaluate(g: number) {
    const n = this.net;
    this.evaluations++;
    this.set(
      n.output[g],
      nand(n.signalValues[n.inputA[g]], n.signalValues[n.inputB[g]]),
    );
  }
  settle() {
    while (this.heap.length) this.evaluate(this.pop());
  }
  tick() {
    this.settle();
    const sampled = Array.from(
      this.net.sequential,
      (g) => this.net.signalValues[this.net.inputA[g]],
    );
    this.net.sequential.forEach((g, i) =>
      this.set(this.net.output[g], sampled[i]),
    );
    this.time++;
    this.settle();
  }
  reset() {
    for (const g of this.net.sequential) this.set(this.net.output[g], 0);
    this.time = 0;
    this.settle();
  }
  values(path = this.net.root.id): Record<string, number | "X"> {
    const out: Record<string, number | "X"> = {};
    for (const p of Object.keys(this.net.ports))
      if (p.startsWith(path + ":") || p.startsWith(path + "/")) {
        const colon = p.lastIndexOf(":");
        out[p] = this.read(p.slice(colon + 1), p.slice(0, colon));
      }
    return out;
  }
  bits(name: string): LogicValue[] {
    return Array.from(this.net.ports[portKey(this.net.root.id, name)], (s) =>
      decode(this.net.signalValues[s]),
    );
  }
}
export interface TraceSample {
  time: number;
  values: Record<string, number | "X">;
}
export class TraceRecorder {
  samples: TraceSample[] = [];
  constructor(public capacity = 256) {}
  record(time: number, values: TraceSample["values"]) {
    this.samples.push({ time, values });
    if (this.samples.length > this.capacity)
      this.samples.splice(0, this.samples.length - this.capacity);
  }
  clear() {
    this.samples = [];
  }
}
