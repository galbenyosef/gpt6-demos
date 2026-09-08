import { test, expect } from "bun:test";
import { preset } from "../mission/model";
function receive(worker: Worker, type: string, id?: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      reject(Error(`Timeout waiting for ${type}`));
    }, 10000);
    function onMessage(event: MessageEvent) {
      if (event.data.type === "error") {
        clearTimeout(timeout);
        reject(Error(event.data.message));
      }
      if (
        event.data.type === type &&
        (id === undefined || event.data.prediction?.id === id)
      ) {
        clearTimeout(timeout);
        worker.removeEventListener("message", onMessage);
        resolve(event.data);
      }
    }
    worker.addEventListener("message", onMessage);
  });
}
test("worker predicts off-thread and cancels obsolete requests", async () => {
  const worker = new Worker(
    new URL("../simulation/worker.ts", import.meta.url).href,
  );
  try {
    let result = receive(worker, "state");
    worker.postMessage({ type: "load", mission: preset(), time: 0 });
    expect((await result).snapshot.time).toBe(0);
    const received: number[] = [];
    worker.addEventListener("message", (e) => {
      if (e.data.type === "prediction") received.push(e.data.prediction.id);
    });
    result = receive(worker, "prediction", 101);
    worker.postMessage({
      type: "predict",
      id: 100,
      craftId: "explorer-1",
      targetId: "moon",
      horizon: 31557600,
    });
    worker.postMessage({
      type: "predict",
      id: 101,
      craftId: "explorer-1",
      targetId: "moon",
      horizon: 0,
    });
    const prediction = (await result).prediction;
    expect(prediction.points.length).toBeGreaterThan(100);
    expect(prediction.points[0].altitude).toBeCloseTo(300000, 2);
    expect(received).toEqual([101]);
  } finally {
    worker.terminate();
  }
}, 15000);

test("display sampling does not change the planned lunar capture", async () => {
  const mission = preset("moon");
  mission.manoeuvres = [
    {
      id: "tli",
      craftId: "explorer-1",
      time: 0,
      type: "impulse",
      frame: "LOCAL_ORBITAL",
      deltaV: { x: 3108.8374, y: 0, z: 0 },
      durationS: 30,
      throttle: 1,
    },
    {
      id: "capture",
      craftId: "explorer-1",
      time: 391870,
      type: "impulse",
      frame: "LOCAL_ORBITAL",
      deltaV: { x: -816.63254, y: 0, z: 0 },
      durationS: 30,
      throttle: 1,
    },
  ];
  const { Simulation } = await import("../simulation/Simulation");
  const { norm, sub } = await import("../physics/math");
  const expected = new Simulation(mission).advance(401870);
  const worker = new Worker(
    new URL("../simulation/worker.ts", import.meta.url).href,
  );
  try {
    let result = receive(worker, "state");
    worker.postMessage({ type: "load", mission, time: 0 });
    await result;
    result = receive(worker, "prediction", 12);
    worker.postMessage({
      type: "predict",
      id: 12,
      craftId: "explorer-1",
      targetId: "moon",
      horizon: 401870,
    });
    const actual = (await result).prediction.final;
    expect(
      norm(
        sub(
          actual.crafts[0].state.position,
          expected.crafts[0]!.state.position,
        ),
      ),
    ).toBeLessThan(0.1);
  } finally {
    worker.terminate();
  }
}, 15000);
