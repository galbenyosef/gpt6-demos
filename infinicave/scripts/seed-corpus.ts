import { generateWorld, validateWorld } from "../src/generation";
import type { Size } from "../src/domain";
const count = Number(process.env.SEED_COUNT || 1000),
  started = performance.now();
const report: Record<string, unknown> = {
  date: new Date().toISOString(),
  seedsPerSize: count,
  generator: "1.0.0",
  results: {},
};
for (const size of ["small", "standard", "large"] as Size[]) {
  let fallbacks = 0,
    maxMs = 0;
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    const now = performance.now(),
      w = await generateWorld(
        `corpus-v1-${i.toString().padStart(4, "0")}`,
        size,
      );
    maxMs = Math.max(maxMs, performance.now() - now);
    if (w.fallback) fallbacks++;
    if (i % 100 === 0) console.log(`${size}: ${i}/${count}`);
  }
  const fallback = await generateWorld("fallback-regression", size, undefined, {
    forceFallback: true,
  });
  if (validateWorld(fallback).length)
    throw new Error(`${size} fallback failed`);
  const result = {
    accepted: count,
    fallbackCandidates: fallbacks,
    fallbackValidated: true,
    totalMs: Math.round(performance.now() - start),
    maxGenerationMs: Math.round(maxMs),
  };
  (report.results as Record<string, unknown>)[size] = result;
  console.log(size, result);
}
report.totalMs = Math.round(performance.now() - started);
await Bun.write(
  "tests/seed-corpus-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log("All cave sizes passed. Report: tests/seed-corpus-report.json");
