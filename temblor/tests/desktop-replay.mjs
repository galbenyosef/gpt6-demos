// SPDX-License-Identifier: GPL-2.0-or-later
// Drive the shipping browser input queue on the same clock as the native test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { launchChrome } from "./chromium.mjs";

const fixture = JSON.parse(await readFile(new URL("./desktop-replay.json", import.meta.url)));
const browser = await launchChrome({ headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.replayTime = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      if (callback.name !== "frame") return raf(callback);
      window.replayFrame = callback;
      return 0;
    };
    Object.defineProperty(performance, "now", { value: () => window.replayTime });
  });
  await page.goto((process.env.TEMBLOR_URL || "http://127.0.0.1:8080") + "?seed=" + fixture.seed);
  await page.click("#play");
  await page.waitForFunction(() => temblorReport.active);
  const result = await page.evaluate(async ({ inputs, frameMs }) => {
    const { Engine } = await import("./pkg/temblor.js");
    // Frame presentation is independent of the simulation and command queue.
    Engine.prototype.frame = () => {};
    let next = 0;
    const canvas = document.querySelector("canvas");
    for (let frame = 0; temblorReport.active && replayTime < 600000; frame++) {
      const end = replayTime + frameMs[frame % frameMs.length];
      while (next < inputs.length && inputs[next][0] <= end) {
        const [time, code, value, y] = inputs[next++];
        window.replayTime = time;
        if (code === "look") {
          document.dispatchEvent(new MouseEvent("mousemove", { movementX: value, movementY: y }));
        } else if (code === "Fire") {
          (value ? canvas : window).dispatchEvent(new MouseEvent(value ? "mousedown" : "mouseup"));
        } else {
          window.dispatchEvent(new KeyboardEvent(value ? "keydown" : "keyup", { code }));
        }
      }
      window.replayTime = end;
      replayFrame(end);
    }
    const counts = {};
    for (const { kind, actor, detail } of temblorReport.events) {
      if (!["pickup", "shot", "frag"].includes(kind)) continue;
      const key = [actor, kind, detail].join("/");
      counts[key] = (counts[key] || 0) + 1;
    }
    return { scores: temblorReport.state.scores, counts };
  }, fixture);
  console.log(JSON.stringify(result));
  assert.deepEqual(result, fixture.expected);
} finally {
  await browser.close();
}
