import { H16 } from "../machine/H16";
import { assemble } from "../assembler/Assembler";
import { compile } from "../compiler/compiler";
import { library } from "../logic/library";
import { Simulator, TraceRecorder } from "./Simulator";
import { MAP } from "../machine/InstructionSet";
import type { Circuit } from "../logic/model";
const machine = new H16();
let running = false,
  hz = 100,
  fast = false;
let breakpoints = new Set<number>();
let skipBreakpoint = -1;
let stopReason: "ready" | "paused" | "breakpoint" = "ready";
let memoryAddress = MAP.ROM_START;
let lab: Simulator | null = null;
let activePath = "ALU16";
let inspectDevice = "ALU";
let probes = ["CLK", "ALU_RESULT", "PC"];
const trace = new TraceRecorder();
let clock = 0;
let last = performance.now(),
  debt = 0;
let published = 0;
let requestId: string | undefined;
const send = (message: Record<string, unknown>) =>
  postMessage({ ...message, requestId });
function record() {
  const all: Record<string, number | "X"> = {
    CLK: clock++ % 2,
    ALU_RESULT: machine.alu.result,
    PC: machine.pc.value,
    ...Object.fromEntries(machine.registers.map((r, i) => [`R${i}`, r.value])),
  };
  for (const p of probes) {
    const sep = p.lastIndexOf(":");
    if (sep > 0)
      try {
        all[p] = inspection().read(p.slice(sep + 1), p.slice(0, sep));
      } catch {
        all[p] = "X";
      }
  }
  trace.record(
    machine.cycles,
    Object.fromEntries(probes.map((p) => [p, all[p] ?? "X"])),
  );
}
function inspection() {
  return inspectDevice === "RegisterFile"
    ? machine.bank.sim
    : inspectDevice === "PC"
      ? machine.pc.sim
      : inspectDevice === "SP"
        ? machine.sp.sim
        : inspectDevice === "IR"
          ? machine.irRegister.sim
          : machine.alu.sim;
}
function snapshot() {
  send({
    type: "state",
    state: machine.snapshot(false),
    running,
    stopReason,
    hz,
    fast,
    values: inspection().values(activePath),
    video: machine.memory.slice(MAP.VIDEO, MAP.VIDEO + MAP.VIDEO_WORDS),
    memoryAddress,
    memory: Array.from({ length: 64 }, (_, i) =>
      machine.read(memoryAddress + i),
    ),
    trace: trace.samples,
    gateCount: machine.alu.sim.net.gateTypes.length,
  });
}
function recordLab() {
  if (!lab) return;
  const all = lab.values();
  trace.record(
    lab.time++,
    Object.fromEntries(
      probes.map((p) => [p, p === "CLK" ? lab!.time % 2 : (all[p] ?? "X")]),
    ),
  );
}
function labSnapshot() {
  if (lab)
    send({
      type: "lab",
      values: lab.values(),
      time: lab.time,
      gateCount: lab.net.gateTypes.length,
      trace: trace.samples,
    });
}
function advance() {
  if (machine.phase === 0 && breakpoints.has(machine.pc.value)) {
    if (skipBreakpoint !== machine.pc.value) {
      running = false;
      stopReason = "breakpoint";
      skipBreakpoint = machine.pc.value;
      return;
    }
    skipBreakpoint = -1;
  }
  machine.stepPhase();
  if (!fast) record();
  if (machine.halted) running = false;
}
setInterval(() => {
  const now = performance.now(),
    elapsed = Math.min(250, now - last);
  last = now;
  if (!running) return;
  const deadline = now + 12;
  if (fast) {
    while (running && performance.now() < deadline) advance();
    record();
  } else {
    debt += (elapsed * hz) / 1000;
    while (debt >= 1 && running && performance.now() < deadline) {
      advance();
      debt--;
    }
  }
  if (!running || now - published >= 80) {
    snapshot();
    published = now;
  }
}, 16);
onmessage = (event: MessageEvent) => {
  const m = event.data;
  requestId = m.requestId;
  try {
    switch (m.type) {
      case "assemble": {
        const result = assemble(m.source);
        send({ type: "assembly", ...result });
        if (!result.diagnostics.length) {
          running = false;
          machine.load(result.words);
          stopReason = "ready";
          trace.clear();
          skipBreakpoint = -1;
          record();
        }
        break;
      }
      case "run":
        if (!machine.halted) {
          running = true;
          stopReason = "paused";
          last = performance.now();
          debt = 0;
        }
        break;
      case "pause":
        if (running) stopReason = "paused";
        running = false;
        break;
      case "step":
        stopReason = "paused";
        running = false;
        skipBreakpoint = -1;
        if (m.kind === "instruction") {
          machine.stepInstruction();
          record();
        } else {
          machine.stepPhase();
          record();
        }
        break;
      case "reset":
        running = false;
        machine.reset();
        stopReason = "ready";
        skipBreakpoint = -1;
        trace.clear();
        record();
        break;
      case "speed":
        hz = m.hz;
        fast = m.fast;
        debt = 0;
        break;
      case "breakpoints":
        breakpoints = new Set(m.addresses);
        break;
      case "memory":
        memoryAddress = Math.max(0, Math.min(0xffc0, m.address | 0));
        break;
      case "key":
        machine.keyCode = m.code;
        machine.keyState = m.down ? 1 : 0;
        break;
      case "inspect":
        activePath = m.path;
        inspectDevice = m.device ?? inspectDevice;
        break;
      case "probes":
        probes = m.probes;
        trace.clear();
        record();
        break;
      case "save":
        send({ type: "saved", state: machine.snapshot() });
        return;
      case "restore":
        running = false;
        machine.restore(m.state);
        stopReason = "paused";
        trace.clear();
        record();
        break;
      case "labInvalidate":
        lab = null;
        trace.clear();
        send({ type: "labInvalidated" });
        return;
      case "labCompile": {
        const custom = m.library ?? {};
        Object.assign(library, custom);
        const circuit = m.circuit as Circuit;
        lab = new Simulator(compile(circuit, library));
        for (const p of circuit.inputs)
          lab.setPort(p.id, m.inputs?.[p.id] ?? 0);
        lab.settle();
        trace.clear();
        labSnapshot();
        return;
      }
      case "labInput":
        if (lab) {
          lab.setPort(m.name, m.value);
          if (!m.stage) lab.settle();
          recordLab();
          labSnapshot();
        }
        return;
      case "labStep":
        if (lab) {
          if (m.kind === "gate") lab.stepPropagation();
          else lab.tick();
          recordLab();
          labSnapshot();
        }
        return;
      case "truth":
        if (lab) {
          const c = lab.net.root,
            total = c.inputs.reduce((s, p) => s + p.width, 0);
          if (total > 8 || lab.net.sequential.length)
            throw new Error(
              "Truth tables require a combinational circuit with at most 8 input bits.",
            );
          const temp = new Simulator(compile(c, library));
          const rows = [];
          for (let v = 0; v < 2 ** total; v++) {
            let shift = 0;
            const inputs: Record<string, number> = {};
            for (const p of c.inputs) {
              inputs[p.id] = (v >>> shift) & ((1 << p.width) - 1);
              temp.setPort(p.id, inputs[p.id]);
              shift += p.width;
            }
            temp.settle();
            rows.push({
              inputs,
              outputs: Object.fromEntries(
                c.outputs.map((p) => [p.id, temp.read(p.id)]),
              ),
            });
          }
          send({ type: "truth", rows });
        }
        return;
    }
    snapshot();
  } catch (error) {
    running = false;
    send({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    requestId = undefined;
  }
};
snapshot();
