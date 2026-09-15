import { z } from "zod";
import { countries, type Kit } from "../catalogue";
export const countryId = z
  .string()
  .refine((id) => countries.some((c) => c.id === id), "Unknown country");
export const setupSchema = z
  .object({
    country: countryId,
    opponent: z.union([countryId, z.literal("random")]).default("random"),
    difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
  })
  .refine((s) => s.country !== s.opponent, "Choose two different countries");
export type Setup = z.infer<typeof setupSchema>;
export const settingsSchema = z.object({
  quality: z.enum(["auto", "low", "medium", "high"]).default("auto"),
  renderScale: z.number().min(0.5).max(2).default(1),
  master: z.number().min(0).max(1).default(0.7),
  effects: z.number().min(0).max(1).default(0.8),
  crowd: z.number().min(0).max(1).default(0.25),
  muted: z.boolean().default(false),
  reducedMotion: z.boolean().default(false),
  textScale: z.number().min(0.8).max(1.4).default(1),
  deadZone: z.number().min(0.05).max(0.4).default(0.15),
  bindings: z.record(z.string(), z.string().max(30)).default({
    up: "KeyW",
    down: "KeyS",
    left: "KeyA",
    right: "KeyD",
    sprint: "ShiftLeft",
    pass: "KeyJ",
    shoot: "KeyK",
    switch: "KeyL",
  }),
});
export type Settings = z.infer<typeof settingsSchema>;
export const profileSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  id: z.literal("local"),
  setup: setupSchema,
  settings: settingsSchema,
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile = (): Profile => ({
  schemaVersion: 1,
  revision: 0,
  id: "local",
  setup: { country: "ARG", opponent: "random", difficulty: "normal" },
  settings: settingsSchema.parse({}),
  updatedAt: new Date().toISOString(),
});
export type Phase =
  | "loading"
  | "kickoff"
  | "playing"
  | "stoppage"
  | "goalCelebration"
  | "halfTime"
  | "paused"
  | "finished"
  | "abandoned";
export type Player = {
  id: number;
  team: 0 | 1;
  role: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number;
  stamina: number;
  action: string;
  actionTime: number;
  cooldown: number;
  hold: number;
  tx: number;
  tz: number;
};
export type Ball = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number | null;
  lastTouch: 0 | 1;
  lock: number;
  passTeam: 0 | 1 | null;
  shotTeam: 0 | 1 | null;
};
export type Stats = {
  shots: [number, number];
  onTarget: [number, number];
  passes: [number, number];
  completed: [number, number];
  possession: [number, number];
};
export type Match = {
  schemaVersion: 1;
  simulationVersion: 1;
  id: string;
  revision: number;
  setup: Setup;
  opponent: string;
  kits: [Kit, Kit];
  seed: number;
  randomState: number;
  tick: number;
  seq: number;
  ack: number;
  phase: Phase;
  previousPhase: Phase;
  pauseReason: string;
  half: 1 | 2;
  elapsed: number;
  phaseTime: number;
  score: [number, number];
  players: Player[];
  ball: Ball;
  controlled: number;
  restart: { kind: string; team: 0 | 1; x: number; z: number };
  stats: Stats;
  event: { id: number; kind: string; text: string };
  startedAt: string;
  finishedAt?: string;
  charge: number;
};
export const inputSchema = z.object({
  type: z.literal("input"),
  matchId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  x: z.number().min(-1).max(1),
  z: z.number().min(-1).max(1),
  sprint: z.boolean(),
  shoot: z.boolean(),
  pass: z.number().int().nonnegative(),
  switch: z.number().int().nonnegative(),
});
export type Input = z.infer<typeof inputSchema>;
export const idleInput = (id: string): Input => ({
  type: "input",
  matchId: id,
  seq: 0,
  x: 0,
  z: 0,
  sprint: false,
  shoot: false,
  pass: 0,
  switch: 0,
});
export type Result = {
  schemaVersion: 1;
  id: string;
  country: string;
  opponent: string;
  difficulty: Setup["difficulty"];
  kits: [Kit, Kit];
  score: [number, number];
  outcome: string;
  stats: Stats;
  startedAt: string;
  finishedAt: string;
};
export const resultOf = (s: Match): Result => ({
  schemaVersion: 1,
  id: s.id,
  country: s.setup.country,
  opponent: s.opponent,
  difficulty: s.setup.difficulty,
  kits: s.kits,
  score: s.score,
  outcome:
    s.score[0] > s.score[1] ? "Win" : s.score[0] < s.score[1] ? "Loss" : "Draw",
  stats: s.stats,
  startedAt: s.startedAt,
  finishedAt: s.finishedAt ?? new Date().toISOString(),
});
