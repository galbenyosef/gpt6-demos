import { chromium, type Browser, type Page } from "playwright";
import type { BuildDiagnostics, BuildResult, Override } from "../../shared/domain";
import { config } from "../config";
export interface RenderOutput { previews: { view: string; data: string }[]; glb: string; gltf: string; diagnostics: BuildDiagnostics }
export class RenderService {
  private browser?: Promise<Browser>; private script?: Promise<string>; private queue: Promise<unknown> = Promise.resolve();
  private getBrowser() { return this.browser ??= chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], chromiumSandbox: true }).catch(error => { this.browser = undefined; throw Error(`Headless renderer unavailable. Run bunx playwright install chromium or set CHROMIUM_PATH. ${error.message.split("\n")[0]}`); }); }
  private getScript() { return this.script ??= (async () => { const b = await Bun.build({ entrypoints: [new URL("./render-page.ts", import.meta.url).pathname], target: "browser", minify: true }); if (!b.success) throw Error(b.logs.join("\n")); return b.outputs[0]!.text(); })(); }
  private async page<T>(work: (page: Page) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const previous = this.queue; let release!: () => void; this.queue = new Promise<void>(r => { release = r; }); await previous;
    try {
      signal?.throwIfAborted(); const browser = await this.getBrowser(); const context = await browser.newContext({ viewport: { width: 768, height: 768 }, serviceWorkers: "block" });
      await context.route("**/*", route => route.abort()); const page = await context.newPage();
      const abort = () => { void context.close(); }; signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 60000);
      try { await page.setContent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; img-src data: blob:; connect-src data:; style-src \'unsafe-inline\'"><title>Assemblavatar render worker</title>'); await page.addScriptTag({ content: await this.getScript() }); return await work(page); }
      finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); await context.close(); }
    } finally { release(); }
  }
  render(build: BuildResult, overrides: Override[] = [], textureUrls: Record<string, string> = {}, signal?: AbortSignal): Promise<RenderOutput> { return this.page(page => page.evaluate(async input => await (globalThis as any).assemblavatarRender(input), { scene: build.scene, overrides, textureUrls, limits: config.limits }), signal); }
  inspectImage(bytes: Uint8Array, mime: string) { return this.page(page => page.evaluate(data => (globalThis as any).assemblavatarInspectImage(data), `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`)); }
  importGlb(bytes: Uint8Array): Promise<BuildResult> {
    // Reject external resource URIs before the loader can touch them.
    if (bytes.length < 20) throw Error("Invalid GLB"); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) throw Error("Only valid GLB 2.0 files are supported");
    const length = view.getUint32(12, true); if (length > bytes.length - 20) throw Error("Invalid GLB JSON chunk");
    const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + length)));
    for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) if (resource.uri) throw Error("Imported GLB must embed all resources in its binary buffer");
    if ((json.extensionsRequired ?? []).length) throw Error("GLB extensions are not supported for import");
    return this.page(page => page.evaluate(data => (globalThis as any).assemblavatarImport(data), Buffer.from(bytes).toString("base64")));
  }
  async close() { if (this.browser) { await (await this.browser).close(); this.browser = undefined; } }
}
