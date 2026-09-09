import { type Circuit, type Library, type Ref, X } from "../logic/model";
export interface CompiledNetlist {
  gateTypes: Uint8Array;
  inputA: Int32Array;
  inputB: Int32Array;
  output: Int32Array;
  signalValues: Uint8Array;
  dependents: number[][];
  order: Int32Array;
  rank: Int32Array;
  sequential: Int32Array;
  ports: Record<string, Int32Array>;
  paths: string[];
  root: Circuit;
}
export class CircuitError extends Error {
  constructor(public issues: string[]) {
    super(issues.join("\n"));
  }
}
export const portKey = (path: string, port: string) => `${path}:${port}`;
export function compile(root: Circuit, library: Library): CompiledNetlist {
  const issues: string[] = [];
  const parent: number[] = [];
  const ports: Record<string, number[]> = {};
  const gates: {
    type: number;
    a: number;
    b: number;
    o: number;
    path: string;
  }[] = [];
  const constants: [number, number][] = [];
  const alloc = (width: number) =>
    Array.from({ length: width }, () => {
      const n = parent.length;
      parent.push(n);
      return n;
    });
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a: number, b: number) => {
    parent[find(b)] = find(a);
  };
  function visit(c: Circuit, path: string, ancestors: string[]) {
    if (ancestors.includes(c.id)) {
      issues.push(`${path}: recursive hierarchy (${c.id})`);
      return;
    }
    if (
      c.inputs.some((p) => p.direction !== "INPUT") ||
      c.outputs.some((p) => p.direction !== "OUTPUT")
    )
      issues.push(`${path}: port direction does not match boundary`);
    for (const p of [...c.inputs, ...c.outputs]) {
      if (!Number.isInteger(p.width) || p.width < 1 || p.width > 64) {
        issues.push(`${path}.${p.name}: width must be 1–64`);
        continue;
      }
      if (ports[portKey(path, p.id)])
        issues.push(`${path}: duplicate port ${p.id}`);
      ports[portKey(path, p.id)] = alloc(p.width);
    }
    if (c.primitive) {
      const expected =
        c.primitive === "NAND"
          ? { ins: ["A", "B"], out: "OUT" }
          : c.primitive === "DFF"
            ? { ins: ["D"], out: "Q" }
            : ["ZERO", "ONE"].includes(c.primitive)
              ? { ins: [], out: "OUT" }
              : null;
      if (
        !expected ||
        c.components.length ||
        c.nets.length ||
        c.inputs.length !== expected.ins.length ||
        c.outputs.length !== 1 ||
        c.outputs[0]?.id !== expected.out ||
        c.outputs[0]?.width !== 1 ||
        c.inputs.some((p) => p.width !== 1 || !expected.ins.includes(p.id))
      ) {
        issues.push(`${path}: invalid primitive definition`);
        return;
      }
      const get = (p: string) => ports[portKey(path, p)]?.[0] ?? 0;
      if (c.primitive === "ZERO" || c.primitive === "ONE")
        constants.push([get("OUT"), c.primitive === "ONE" ? 1 : 0]);
      else
        gates.push({
          type: c.primitive === "NAND" ? 0 : 1,
          a: get(c.primitive === "NAND" ? "A" : "D"),
          b: get("B"),
          o: get(c.primitive === "NAND" ? "OUT" : "Q"),
          path,
        });
      return;
    }
    const children = new Map<string, Circuit>();
    for (const child of c.components) {
      if (children.has(child.id)) {
        issues.push(`${path}: duplicate component ID ${child.id}`);
        continue;
      }
      const definition = library[child.type];
      if (!definition) {
        issues.push(`${path}/${child.id}: unknown component ${child.type}`);
        continue;
      }
      children.set(child.id, definition);
      visit(definition, `${path}/${child.id}`, [...ancestors, c.id]);
    }
    const driven = new Set<number>();
    function resolve(r: Ref, source: boolean, width: number): number[] | null {
      const external = r.component === "$in" || r.component === "$out";
      const def = external ? c : children.get(r.component);
      const p =
        def && [...def.inputs, ...def.outputs].find((p) => p.id === r.port);
      if (!p) {
        issues.push(`${path}: missing port ${r.component}.${r.port}`);
        return null;
      }
      const valid = source
        ? r.component === "$in" || (!external && p.direction === "OUTPUT")
        : r.component === "$out" || (!external && p.direction === "INPUT");
      if (
        !valid ||
        (r.component === "$in" && p.direction !== "INPUT") ||
        (r.component === "$out" && p.direction !== "OUTPUT")
      ) {
        issues.push(
          `${path}: invalid ${source ? "source" : "target"} ${r.component}.${r.port}`,
        );
        return null;
      }
      if (
        r.bit !== undefined &&
        (!Number.isInteger(r.bit) || r.bit < 0 || r.bit >= p.width)
      ) {
        issues.push(`${path}: bit outside ${r.port}`);
        return null;
      }
      const values =
        ports[portKey(external ? path : `${path}/${r.component}`, p.id)];
      if (!values) return null;
      const result = r.bit === undefined ? values : [values[r.bit]];
      if (result.length !== width) {
        issues.push(
          `${path}: width mismatch on ${r.component}.${r.port} (${result.length} vs ${width})`,
        );
        return null;
      }
      return result;
    }
    for (const n of c.nets) {
      if (n.sources.length !== 1) {
        issues.push(`${path}/${n.id}: exactly one driver required`);
        continue;
      }
      const s = resolve(n.sources[0], true, n.width);
      for (const t of n.targets) {
        const target = resolve(t, false, n.width);
        if (!s || !target) continue;
        target.forEach((v, i) => {
          if (driven.has(v))
            issues.push(
              `${path}/${n.id}: multiple drivers on ${t.component}.${t.port}`,
            );
          driven.add(v);
          union(s[i], v);
        });
      }
    }
    for (const child of c.components) {
      const def = children.get(child.id);
      if (!def) continue;
      for (const p of def.inputs)
        for (const v of ports[portKey(`${path}/${child.id}`, p.id)] ?? [])
          if (!driven.has(v))
            issues.push(
              `${path}/${child.id}.${p.id}: unconnected mandatory input`,
            );
    }
    for (const p of c.outputs)
      for (const v of ports[portKey(path, p.id)] ?? [])
        if (!driven.has(v)) issues.push(`${path}.${p.id}: unconnected output`);
  }
  visit(root, root.id, []);
  if (issues.length) throw new CircuitError([...new Set(issues)]);
  const indices = new Map<number, number>();
  const compact = parent.map((_, i) => {
    const key = find(i);
    if (!indices.has(key)) indices.set(key, indices.size);
    return indices.get(key)!;
  });
  const count = gates.length;
  const gateTypes = new Uint8Array(count),
    inputA = new Int32Array(count),
    inputB = new Int32Array(count),
    output = new Int32Array(count),
    signalValues = new Uint8Array(indices.size).fill(X);
  const dependents: number[][] = Array.from({ length: indices.size }, () => []);
  const driver = new Int32Array(indices.size).fill(-1);
  const sequential: number[] = [];
  gates.forEach((g, i) => {
    gateTypes[i] = g.type;
    inputA[i] = compact[g.a];
    inputB[i] = compact[g.b] ?? 0;
    output[i] = compact[g.o];
    driver[output[i]] = i;
    if (g.type === 1) {
      sequential.push(i);
      signalValues[output[i]] = 0;
    } else {
      dependents[inputA[i]].push(i);
      if (inputB[i] !== inputA[i]) dependents[inputB[i]].push(i);
    }
  });
  for (const [signal, value] of constants)
    signalValues[compact[signal]] = value;
  const indegree = new Int32Array(count);
  const next: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++)
    if (gateTypes[i] === 0)
      for (const s of new Set([inputA[i], inputB[i]])) {
        const d = driver[s];
        if (d >= 0 && gateTypes[d] === 0) {
          indegree[i]++;
          next[d].push(i);
        }
      }
  const order: number[] = [];
  for (let i = 0; i < count; i++)
    if (!gateTypes[i] && indegree[i] === 0) order.push(i);
  for (let i = 0; i < order.length; i++)
    for (const d of next[order[i]]) if (--indegree[d] === 0) order.push(d);
  if (order.length !== count - sequential.length)
    throw new CircuitError([
      "Combinational loop detected; insert a D flip-flop to break feedback.",
    ]);
  const rank = new Int32Array(count);
  order.forEach((g, i) => (rank[g] = i));
  return {
    gateTypes,
    inputA,
    inputB,
    output,
    signalValues,
    dependents,
    order: Int32Array.from(order),
    rank,
    sequential: Int32Array.from(sequential),
    ports: Object.fromEntries(
      Object.entries(ports).map(([p, ids]) => [
        p,
        Int32Array.from(ids.map((i) => compact[i])),
      ]),
    ),
    paths: gates.map((g) => g.path),
    root,
  };
}
export function dependencies(
  c: Circuit,
  id: string,
  direction: "upstream" | "downstream",
): Set<string> {
  const seen = new Set<string>([id]),
    queue = [id];
  for (let i = 0; i < queue.length; i++)
    for (const net of c.nets) {
      const from = direction === "upstream" ? net.targets : net.sources;
      const to = direction === "upstream" ? net.sources : net.targets;
      if (from.some((r) => r.component === queue[i]))
        for (const r of to)
          if (!seen.has(r.component)) {
            seen.add(r.component);
            queue.push(r.component);
          }
    }
  return seen;
}
