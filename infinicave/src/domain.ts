export const SCHEMA = 1;
export const SIM_VERSION = 1;
export const GENERATOR_VERSION = "1.0.0";
export const CONTENT_VERSION = "1.0.0";
export const TILE = 1;
export const RADIUS = 0.48;
export const DT = 1 / 60;
export const SPEED = 8;
export type Size = "small" | "standard" | "large";
export type Vec = { x: number; y: number };
export type RoomKind =
  | "entrance"
  | "cavern"
  | "relay"
  | "checkpoint"
  | "heart"
  | "optional";
export interface Room extends Vec {
  id: string;
  index: number;
  stage: number;
  kind: RoomKind;
  name: string;
  width: number;
  height: number;
}
export interface Edge {
  id: string;
  a: string;
  b: string;
  gateId?: string;
  width: number;
}
export interface Gate extends Vec {
  id: string;
  width: number;
  height: number;
  requires: number;
}
export interface Relay extends Vec {
  id: string;
  roomId: string;
  bit: number;
}
export interface Checkpoint extends Vec {
  id: string;
  roomId: string;
}
export type HazardKind = "beam" | "barrier" | "slider";
export interface Hazard extends Vec {
  id: string;
  kind: HazardKind;
  roomId: string;
  horizontal: boolean;
  length: number;
  period: number;
  active: number;
  phase: number;
  crossing: [Vec, Vec];
}
export interface EnemyDef extends Vec {
  id: string;
  kind: "pursuer" | "patrol" | "emitter";
  roomId: string;
  end: Vec;
  facing: number;
}
export interface World {
  generator: string;
  content: string;
  seed: string;
  size: Size;
  attempt: number;
  fallback?: string;
  width: number;
  height: number;
  cols: number;
  rows: number;
  cells: number[];
  rooms: Room[];
  edges: Edge[];
  gates: Gate[];
  relays: Relay[];
  checkpoints: Checkpoint[];
  hazards: Hazard[];
  enemies: EnemyDef[];
  heart: Vec;
  spawn: Vec;
  witness: string[];
  hash: string;
}
export interface Player extends Vec {
  vx: number;
  vy: number;
  facing: number;
  health: number;
  protection: number;
  cooldown: number;
}
export interface Enemy extends Vec {
  id: string;
  health: number;
  cooldown: number;
  direction: number;
  mode: number;
}
export interface Projectile extends Vec {
  id: number;
  vx: number;
  vy: number;
  life: number;
  hostile: boolean;
}
export interface Runtime {
  tick: number;
  time: number;
  rng: number;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  nextProjectile: number;
  relays: number;
  checkpointId: string;
  activatedCheckpoints: string[];
  explored: string[];
  discoveries: string[];
  status: "active" | "completed";
  objective: string;
}
export interface Stats {
  playTime: number;
  deaths: number;
  completedAt: string | null;
}
export interface Context {
  schema: number;
  simulation: number;
  id: string;
  sourceId?: string;
  name: string;
  created: string;
  updated: string;
  lastPlayed: string;
  world: World;
  runtime: Runtime;
  checkpoint: Runtime;
  stats: Stats;
  revision: number;
}
export interface Envelope {
  payload: Context;
  checksum: string;
  previousRevision: number | null;
}
export interface SaveRecord {
  unreadable?: boolean;
  id: string;
  current: Envelope;
  previous: Envelope | null;
}
export interface Controls {
  left: string;
  right: string;
  up: string;
  down: string;
  fire: string;
  interact: string;
  map: string;
  pause: string;
}
export interface Settings {
  effects: number;
  music: number;
  deadZone: number;
  reducedMotion: boolean;
  reducedFlashing: boolean;
  lowEffects: boolean;
  controls: Controls;
}
export const DEFAULT_SETTINGS: Settings = {
  effects: 0.45,
  music: 0.2,
  deadZone: 0.18,
  reducedMotion: false,
  reducedFlashing: false,
  lowEffects: false,
  controls: {
    left: "KeyA",
    right: "KeyD",
    up: "KeyW",
    down: "KeyS",
    fire: "Space",
    interact: "KeyE",
    map: "KeyM",
    pause: "Escape",
  },
};
export const BUDGETS = {
  small: {
    columns: 4,
    rows: 4,
    relays: 2,
    label: "Small",
    length: "10–15 min",
    maxWidth: 240,
    maxHeight: 180,
  },
  standard: {
    columns: 6,
    rows: 5,
    relays: 3,
    label: "Standard",
    length: "20–30 min",
    maxWidth: 400,
    maxHeight: 300,
  },
  large: {
    columns: 8,
    rows: 6,
    relays: 4,
    label: "Large",
    length: "35–50 min",
    maxWidth: 600,
    maxHeight: 450,
  },
};
export function copy<T>(value: T): T {
  return structuredClone(value);
}
export function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function allRelays(world: World) {
  return (1 << world.relays.length) - 1;
}
export function objective(world: World, state: Runtime) {
  const next = world.relays.find((r) => !(state.relays & r.bit));
  return state.status === "completed"
    ? "Expedition complete"
    : next
      ? `Find relay ${world.relays.indexOf(next) + 1} of ${world.relays.length}`
      : "Reach the heart · shut down the core";
}
