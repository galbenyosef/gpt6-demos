import { CaveRenderer } from "../../src/rendering";
import { generateWorld } from "../../src/generation";
import { createContext } from "../../src/simulation";
import { DEFAULT_SETTINGS } from "../../src/domain";
import { GameAudio } from "../../src/audio";
(window as any).caveHarness = {
  async audioAudit() {
    // Inspect real Web Audio output, including buses set to zero and suspended contexts.
    const audio = new GameAudio();
    const internal = audio as any;
    let settings = { ...DEFAULT_SETTINGS, helicopter: 0, effects: 0, music: 0 };
    const player = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      health: 100,
      wallContact: 0,
    };
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    try {
      await audio.start(settings);
      const ctx: AudioContext = internal.context;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      internal.master.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      async function output() {
        await wait(450);
        let squares = 0,
          peak = 0;
        for (let i = 0; i < 5; i++) {
          analyser.getFloatTimeDomainData(samples);
          for (const value of samples) {
            squares += value * value;
            peak = Math.max(peak, Math.abs(value));
          }
          await wait(30);
        }
        return { rms: Math.sqrt(squares / (samples.length * 5)), peak };
      }
      const silent = await output();
      settings = { ...settings, helicopter: 1 };
      audio.update(settings);
      audio.motion({ ...player, vy: 8 }, { x: 0, y: 1 });
      const helicopter = await output();
      const climbPitch = internal.rotor.frequency.value;
      audio.motion({ ...player, vy: -8 }, { x: 0, y: -1 });
      await wait(500);
      const descentPitch = internal.rotor.frequency.value;
      settings = { ...settings, helicopter: 0, effects: 1 };
      audio.update(settings);
      audio.motion(player, { x: 0, y: 0 });
      const effectsIdle = await output();
      audio.event({ type: "death", position: player }, player);
      const effects = await output();
      audio.active(false);
      await wait(50);
      const paused = { state: ctx.state, voices: internal.voices.size };
      settings = { ...settings, effects: 0, music: 1 };
      await audio.start(settings);
      audio.motion(player, { x: 0, y: 0 });
      const music = await output();
      audio.update({ ...settings, muteAudio: true });
      const muted = await output();
      audio.active(false);
      await audio.start({ ...settings, music: 0, effects: 1 });
      const loops = internal.loops.length;
      for (const type of [
        "shot",
        "enemyShot",
        "hit",
        "enemy",
        "checkpoint",
        "relay",
        "death",
        "complete",
        "discovery",
      ] as const)
        audio.event({ type, position: player }, player);
      const scheduled = internal.voices.size;
      await wait(2200);
      const drained = internal.voices.size;
      audio.event({ type: "complete", position: player }, player);
      audio.active(false, 0.2);
      const tailState = ctx.state;
      await wait(300);
      const tailEnded = { state: ctx.state, voices: internal.voices.size };
      analyser.disconnect();
      return {
        silent,
        helicopter,
        climbPitch,
        descentPitch,
        effectsIdle,
        effects,
        paused,
        music,
        muted,
        loops,
        scheduled,
        drained,
        tailState,
        tailEnded,
      };
    } finally {
      audio.dispose();
    }
  },
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
