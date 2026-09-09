import { builtinNames } from "../logic/library";
import { type Circuit, type Library, type Net, ref } from "../logic/model";
import type { MachineState } from "../machine/H16";
export interface Project {
  version: 1;
  source: string;
  breakpoints: number[];
  addressBreakpoints?: number[];
  probes: string[];
  custom: Library;
  workspace: Circuit;
  preferences: { hz: number; fast: boolean };
  machine?: MachineState;
}
export function parseProject(text: string): Project {
  if (text.length > 8_000_000) throw new Error("Project is too large");
  const p = JSON.parse(text);
  if (
    p.version !== 1 ||
    typeof p.source !== "string" ||
    !Array.isArray(p.breakpoints) ||
    !p.workspace ||
    !p.custom ||
    !Array.isArray(p.probes)
  )
    throw new Error("Not an H16 project (version 1)");
  const validCircuit = (c: any) =>
    c &&
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    Array.isArray(c.components) &&
    c.components.every(
      (n: any) =>
        typeof n.id === "string" &&
        typeof n.type === "string" &&
        Number.isFinite(n.position?.x) &&
        Number.isFinite(n.position?.y),
    ) &&
    Array.isArray(c.nets) &&
    c.nets.every(
      (n: any) =>
        Array.isArray(n.sources) &&
        Array.isArray(n.targets) &&
        Number.isInteger(n.width),
    ) &&
    Array.isArray(c.inputs) &&
    Array.isArray(c.outputs);
  if (
    Object.keys(p.custom).some(
      (k) =>
        builtinNames.has(k) ||
        ["__proto__", "constructor", "prototype"].includes(k),
    )
  )
    throw new Error("Custom circuits cannot replace standard components");
  if (
    !validCircuit(p.workspace) ||
    !Object.values(p.custom).every(validCircuit)
  )
    throw new Error("Invalid circuit data");
  if (
    p.addressBreakpoints &&
    !p.addressBreakpoints.every(
      (n: unknown) =>
        typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 65535,
    )
  )
    throw new Error("Invalid address breakpoints");
  if (
    !p.probes.every((v: unknown) => typeof v === "string") ||
    !p.breakpoints.every((v: unknown) => Number.isInteger(v))
  )
    throw new Error("Invalid project settings");
  if (p.machine) {
    const s = p.machine;
    const word = (n: unknown) =>
      typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 65535;
    if (
      !Array.isArray(s.memory) ||
      s.memory.length !== 65536 ||
      !s.memory.every(word) ||
      !Array.isArray(s.registers) ||
      s.registers.length !== 8 ||
      !s.registers.every(word) ||
      !word(s.pc) ||
      !word(s.sp) ||
      !Number.isInteger(s.phase) ||
      s.phase < 0 ||
      s.phase > 4 ||
      !s.alu ||
      !s.flags ||
      !s.decoded
    )
      throw new Error("Invalid saved machine state");
  }
  return p;
}
export function groupComponents(
  parent: Circuit,
  selected: Set<string>,
  name: string,
): Circuit {
  const children = parent.components.filter((c) => selected.has(c.id));
  if (!children.length)
    throw new Error(
      "Select components to group (Shift-click to select several).",
    );
  if (!/^[A-Za-z][A-Za-z0-9 _-]{0,40}$/.test(name))
    throw new Error("Use a short name beginning with a letter.");
  const group: Circuit = {
    id: name,
    name,
    inputs: [],
    outputs: [],
    components: structuredClone(children),
    nets: [],
  };
  const parentNets: Net[] = [];
  let input = 0,
    output = 0;
  const id = `group_${Date.now().toString(36)}`;
  for (const net of parent.nets) {
    const sourceInside = selected.has(net.sources[0]?.component);
    const inside = net.targets.filter((r) => selected.has(r.component)),
      outside = net.targets.filter((r) => !selected.has(r.component));
    if (sourceInside) {
      if (inside.length)
        group.nets.push({ ...structuredClone(net), targets: inside });
      if (outside.length) {
        const p = `OUT${output++}`;
        group.outputs.push({
          id: p,
          name: p,
          direction: "OUTPUT",
          width: net.width,
        });
        group.nets.push({
          id: `out_${p}`,
          width: net.width,
          sources: structuredClone(net.sources),
          targets: [ref("$out", p)],
        });
        parentNets.push({
          ...structuredClone(net),
          sources: [ref(id, p)],
          targets: outside,
        });
      }
    } else {
      if (outside.length)
        parentNets.push({ ...structuredClone(net), targets: outside });
      if (inside.length) {
        const p = `IN${input++}`;
        group.inputs.push({
          id: p,
          name: p,
          direction: "INPUT",
          width: net.width,
        });
        group.nets.push({
          id: `in_${p}`,
          width: net.width,
          sources: [ref("$in", p)],
          targets: inside,
        });
        parentNets.push({
          ...structuredClone(net),
          id: `${net.id}_${p}`,
          targets: [ref(id, p)],
        });
      }
    }
  }
  const x = children.reduce((s, c) => s + c.position.x, 0) / children.length,
    y = children.reduce((s, c) => s + c.position.y, 0) / children.length;
  group.components.forEach((c) => {
    c.position.x -= x;
    c.position.y -= y;
  });
  parent.components = parent.components.filter((c) => !selected.has(c.id));
  parent.components.push({ id, type: name, position: { x, y, z: 0 } });
  parent.nets = parentNets;
  return group;
}
