import { test, expect } from "bun:test";
import { library } from "../logic/library";
function harness() {
  const worker = new Worker(
    new URL("../simulator/worker.ts", import.meta.url).href,
  );
  const listeners = new Set<(m: any) => void>();
  worker.onmessage = (e) => {
    for (const l of listeners) l(e.data);
  };
  return {
    worker,
    wait(predicate: (m: any) => boolean, command?: unknown) {
      return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error("Worker response timed out"));
        }, 5000);
        const listener = (m: any) => {
          if (predicate(m)) {
            clearTimeout(timer);
            listeners.delete(listener);
            resolve(m);
          }
        };
        listeners.add(listener);
        if (command) worker.postMessage(command);
      });
    },
  };
}
test("worker executes, pauses at breakpoints and steps independently", async () => {
  const h = harness();
  try {
    await h.wait((m) => m.type === "state");
    await h.wait((m) => m.type === "assembly", {
      type: "assemble",
      source: "LDI R0, 5\nINC R0\nHALT",
    });
    await h.wait((m) => m.type === "state" && m.state.pc === 0x8000, {
      type: "breakpoints",
      addresses: [0x8002],
    });
    await h.wait((m) => m.type === "state" && m.fast, {
      type: "speed",
      hz: 1000,
      fast: true,
    });
    const paused = await h.wait(
      (m) => m.type === "state" && m.state.pc === 0x8002 && !m.running,
      { type: "run" },
    );
    expect(paused.stopReason).toBe("breakpoint");
    expect(paused.state.registers[0]).toBe(5);
    const after = await h.wait(
      (m) => m.type === "state" && m.state.instructions === 2,
      { type: "step", kind: "instruction" },
    );
    expect(after.state.registers[0]).toBe(6);
    const halted = await h.wait((m) => m.type === "state" && m.state.halted, {
      type: "run",
    });
    expect(halted.running).toBe(false);
    const saved = await h.wait((m) => m.type === "saved", { type: "save" });
    expect(saved.state.memory.length).toBe(65536);
  } finally {
    h.worker.terminate();
  }
}, 10000);
test("worker compiles laboratory circuit and generates real truth table", async () => {
  const h = harness();
  try {
    await h.wait((m) => m.type === "state");
    const initial = await h.wait((m) => m.type === "lab", {
      type: "labCompile",
      circuit: library["Full Adder"],
      inputs: { A: 1, B: 1, Cin: 0 },
    });
    expect(initial.values["Full Adder:Sum"]).toBe(0);
    expect(initial.values["Full Adder:Carry"]).toBe(1);
    const truth = await h.wait((m) => m.type === "truth", { type: "truth" });
    expect(truth.rows.length).toBe(8);
    expect(truth.rows[7].outputs).toEqual({ Sum: 1, Carry: 1 });
    const changed = await h.wait((m) => m.type === "lab", {
      type: "labInput",
      name: "Cin",
      value: 1,
    });
    expect(changed.values["Full Adder:Sum"]).toBe(1);
  } finally {
    h.worker.terminate();
  }
}, 10000);
