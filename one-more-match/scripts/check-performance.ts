import { createMatch, initPhysics, Simulation } from "../packages/simulation";
await initPhysics();
const sim = new Simulation(
  createMatch({ country: "ARG", opponent: "BRA", difficulty: "normal" }, 773),
);
sim.ready();
const times: number[] = [];
for (let i = 0; i < 20000; i++) {
  if (sim.state.phase === "halfTime") sim.resume();
  const start = performance.now();
  sim.step();
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
console.log(
  JSON.stringify({
    ticks: times.length,
    p50: times[Math.floor(times.length * 0.5)],
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
    max: times.at(-1),
    score: sim.state.score,
    phase: sim.state.phase,
  }),
);
sim.dispose();
