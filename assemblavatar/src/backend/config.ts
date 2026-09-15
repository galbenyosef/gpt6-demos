const integer = (key: string, fallback: number, min: number, max: number) => { const n = Number(process.env[key] || fallback); if (!Number.isInteger(n) || n < min || n > max) throw Error(`Invalid ${key}`); return n; };
export const config = {
  apiKey: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-6-astra",
  dataDir: process.env.ASSEMBLAVATAR_DATA_DIR || "./data",
  host: process.env.ASSEMBLAVATAR_HOST || "127.0.0.1",
  port: integer("ASSEMBLAVATAR_PORT", 3000, 0, 65535),
  maxUpload: integer("MAX_UPLOAD_SIZE_MB", 30, 1, 100) * 1024 * 1024,
  maxIterations: integer("MAX_GENERATION_ITERATIONS", 4, 1, 8),
  maxRepairs: integer("MAX_PROGRAM_REPAIR_ATTEMPTS", 3, 0, 5),
  maxSource: integer("MAX_SOURCE_SIZE_KB", 500, 1, 500) * 1024,
  timeout: integer("SANDBOX_TIMEOUT_MS", 10000, 100, 30000),
  memory: integer("SANDBOX_MEMORY_MB", 128, 16, 256) * 1024 * 1024,
  limits: { maxObjects: integer("MAX_OBJECT_COUNT", 1000, 1, 2000), maxTriangles: integer("MAX_TRIANGLE_COUNT", 300000, 100, 500000), maxBounds: 1000 },
};
if (config.model !== "gpt-6-astra") throw Error("Assemblavatar requires OPENAI_MODEL=gpt-6-astra; no fallback models are permitted.");
