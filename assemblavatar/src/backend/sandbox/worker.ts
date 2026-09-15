import { getQuickJS } from "quickjs-emscripten";
import { validateProgram } from "./ProgramValidator";
declare const self: Worker;
self.onmessage = async (event: MessageEvent) => {
  const { code, runtimeBundle, timeout, memory, limits, maxSource, context, textureIds } = event.data;
  const started = Date.now();
  try {
    const { javascript } = validateProgram(code, maxSource);
    const quickjs = await getQuickJS(); const runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(memory); runtime.setMaxStackSize(1024 * 1024);
    const deadline = Date.now() + timeout; runtime.setInterruptHandler(() => Date.now() > deadline);
    const vm = runtime.newContext();
    try {
      // Nothing from the host is installed into the VM: no IO, imports, timers or callbacks.
      const script = `const exports = {}; const console = Object.freeze({log(){}, warn(){}, error(){}, time(){}, timeEnd(){}}); let __seed = 1; Math.random = () => { __seed = (__seed * 1664525 + 1013904223) >>> 0; return __seed / 4294967296; }; ${runtimeBundle}\nconst __ctxData = ${JSON.stringify(context)}; const __textures = ${JSON.stringify(textureIds)}; const __limits = ${JSON.stringify(limits)}; const __ctx = {...__ctxData, runtime: __runtime(__limits, __textures), assets: {texture(id) {if (!__textures.includes(id)) throw Error('Unknown texture asset'); return id;}}};\n${javascript}\nPromise.resolve(exports.buildModel(__ctx)).then(__out => { const __stats = __validateScene(__out.root, __limits); return JSON.stringify({scene: __out.root.toJSON(), metadata: __out.metadata || {}, diagnostics: __stats}); });`;
      const result = vm.evalCode(script, "model.js");
      if (result.error) { const error = vm.dump(result.error); result.error.dispose(); throw Error(error.message || "Sandbox execution failed"); }
      while (runtime.hasPendingJob()) { const jobs = runtime.executePendingJobs(); if (jobs.error) { const error = vm.dump(jobs.error); jobs.error.dispose(); result.value.dispose(); throw Error(error.message || "Async build failed"); } }
      const state = vm.getPromiseState(result.value); result.value.dispose();
      if (state.type === "pending") throw Error("Async build did not settle");
      if (state.type === "rejected") { const error = vm.dump(state.error); state.error.dispose(); throw Error(error.message || "Build failed"); }
      const json = vm.getString(state.value); state.value.dispose();
      if (json.length > 50 * 1024 * 1024) throw Error("Scene serialization exceeds budget");
      const output = JSON.parse(json); output.diagnostics.durationMs = Date.now() - started;
      self.postMessage({ success: true, output });
    } finally { vm.dispose(); runtime.dispose(); }
  } catch (error) { self.postMessage({ success: false, error: error instanceof Error ? error.message : "Build failed" }); }
};
