import { createRuntime, validateScene } from "../modelling/runtime";
// Bundled into the isolated VM. No host objects or callbacks enter the VM.
Object.assign(globalThis, { __runtime: createRuntime, __validateScene: validateScene });
