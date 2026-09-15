import { chromium } from "playwright";
import html from "./render-client.html";
import { MAX_RENDER_BODY, type RenderService } from "../../src/backend/render/RenderService";
// Playwright drives a real user tab only in development tests.
export async function connectRenderBrowser(renderer: RenderService) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, maxRequestBodySize: MAX_RENDER_BODY, routes: { "/": html, "/api/render/*": req => renderer.fetch(req) } });
  try {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      await page.goto(String(server.url));
      return Object.assign(async () => { await browser.close(); server.stop(true); }, {
        comparePng: (expected: string, actual: string) => page.evaluate(async ({ expected, actual }) => {
          const pixels = async (data: string) => {
            const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
            const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
            const context = canvas.getContext("2d")!; context.drawImage(bitmap, 0, 0); bitmap.close();
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
          };
          const a = await pixels(expected), b = await pixels(actual);
          if (a.length !== b.length) throw Error("Image dimensions changed");
          let max = 0, total = 0;
          for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i]! - b[i]!); max = Math.max(max, delta); total += delta; }
          return { max, mean: total / a.length };
        }, { expected, actual }),
      });
    } catch (error) { await browser.close(); throw error; }
  } catch (error) { server.stop(true); throw error; }
}
