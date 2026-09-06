import { CaveRenderer } from "../../src/rendering";
import { generateWorld } from "../../src/generation";
import { createContext } from "../../src/simulation";
import { DEFAULT_SETTINGS } from "../../src/domain";
(window as any).caveHarness = {
  async resourceAudit() {
    const cv = document.createElement("canvas");
    cv.style.cssText =
      "position:fixed;width:1920px;height:1080px;opacity:0;pointer-events:none";
    document.body.append(cv);
    const renderer = new CaveRenderer(cv),
      world = await generateWorld("RESOURCE-AUDIT", "standard"),
      context = createContext(world, "Audit"),
      samples = [];
    for (let i = 0; i < 8; i++) {
      renderer.setWorld(world);
      renderer.render(context, 1 / 60, i, DEFAULT_SETTINGS);
      samples.push({
        ...renderer.renderer.info.memory,
        calls: renderer.renderer.info.render.calls,
        triangles: renderer.renderer.info.render.triangles,
      });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    const gl = renderer.renderer.getContext(),
      debug = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : "Unavailable";
    renderer.dispose();
    cv.remove();
    return { gpu, samples };
  },
};
