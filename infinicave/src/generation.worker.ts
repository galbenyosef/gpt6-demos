import { generateWorld } from "./generation";
import type { Size } from "./domain";
self.onmessage = async ({
  data,
}: MessageEvent<{ seed: string; size: Size }>) => {
  try {
    const world = await generateWorld(data.seed, data.size, (phase) =>
      self.postMessage({ phase }),
    );
    self.postMessage({ world });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Cave generation failed.",
    });
  }
};
