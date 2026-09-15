import type { BuildResult } from "../../shared/domain";
import { config } from "../config";
let bundlePromise: Promise<string> | undefined;
export function runtimeBundle() {
  return bundlePromise ??= (async () => { const result = await Bun.build({ entrypoints: [new URL("./entry.ts", import.meta.url).pathname], target: "browser", format: "iife", minify: true }); if (!result.success) throw Error(result.logs.join("\n")); return result.outputs[0]!.text(); })();
}
export class SandboxRunner {
  async build(code: string, context = { parameters: {}, metadata: { assemblageId: "fixture", revision: 1 } }, textureIds: string[] = [], signal?: AbortSignal, settings: Partial<typeof config> = {}): Promise<BuildResult> {
    signal?.throwIfAborted(); const runtime = await runtimeBundle(); signal?.throwIfAborted();
    const cfg = { ...config, ...settings };
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.ts", import.meta.url).href);
      const finish = (error?: Error, output?: BuildResult) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); worker.terminate(); error ? reject(error) : resolve(output!); };
      const abort = () => finish(new Error("Build cancelled"));
      const timer = setTimeout(() => finish(new Error("Sandbox execution timeout")), cfg.timeout + 10000);
      signal?.addEventListener("abort", abort, { once: true });
      worker.onmessage = event => event.data.success ? finish(undefined, event.data.output) : finish(new Error(event.data.error));
      worker.onerror = event => finish(new Error(event.message || "Sandbox worker crashed"));
      worker.postMessage({ code, runtimeBundle: runtime, timeout: cfg.timeout, memory: cfg.memory, limits: cfg.limits, maxSource: cfg.maxSource, context, textureIds });
    });
  }
}
