import {
  mkdir,
  rename,
  unlink,
  readdir,
  open,
  copyFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  defaultProfile,
  profileSchema,
  setupSchema,
  type Profile,
  type Match,
  type Result,
} from "../contracts";
export interface ProfileRepository {
  get(): Promise<Profile>;
  update(value: Profile, expectedRevision: number): Promise<Profile>;
}
export interface MatchRepository {
  save(value: Match): Promise<void>;
  load(id: string): Promise<Match | null>;
  latest(): Promise<Match | null>;
  remove(id: string): Promise<void>;
}
export interface ResultRepository {
  record(value: Result): Promise<void>;
  get(id: string): Promise<Result | null>;
  list(limit?: number, offset?: number): Promise<Result[]>;
}
export interface StorageProvider {
  profiles: ProfileRepository;
  matches: MatchRepository;
  results: ResultRepository;
  close(): Promise<void>;
  warning: string;
}
export class StorageError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const number = z.number().finite();
const pair = z.tuple([number, number]);
const stats = z.object({
  shots: pair,
  onTarget: pair,
  passes: pair,
  completed: pair,
  possession: pair,
});
const kit = z.object({
  primary: z.string(),
  secondary: z.string(),
  shorts: z.string(),
  pattern: z.enum(["plain", "stripes", "checks"]),
  alternate: z.boolean(),
});
const phases = z.enum([
  "loading",
  "kickoff",
  "playing",
  "stoppage",
  "goalCelebration",
  "halfTime",
  "paused",
  "finished",
  "abandoned",
]);
const matchSchema = z
  .object({
    schemaVersion: z.literal(1),
    simulationVersion: z.literal(1),
    id: z.string().uuid(),
    revision: number,
    setup: setupSchema,
    opponent: z.string(),
    kits: z.tuple([kit, kit]),
    seed: number,
    randomState: number,
    tick: number,
    seq: number,
    ack: number,
    phase: phases,
    previousPhase: phases,
    pauseReason: z.string(),
    half: z.union([z.literal(1), z.literal(2)]),
    elapsed: number,
    phaseTime: number,
    score: pair,
    players: z
      .array(
        z.object({
          id: number,
          team: z.union([z.literal(0), z.literal(1)]),
          role: number,
          x: number,
          z: number,
          vx: number,
          vz: number,
          angle: number,
          stamina: number,
          action: z.string(),
          actionTime: number,
          cooldown: number,
          hold: number,
          tx: number,
          tz: number,
        }),
      )
      .length(14),
    ball: z.object({
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      owner: number.nullable(),
      lastTouch: z.union([z.literal(0), z.literal(1)]),
      lock: number,
      passTeam: z.union([z.literal(0), z.literal(1)]).nullable(),
      shotTeam: z.union([z.literal(0), z.literal(1)]).nullable(),
    }),
    controlled: number,
    restart: z.object({
      kind: z.string(),
      team: z.union([z.literal(0), z.literal(1)]),
      x: number,
      z: number,
    }),
    stats,
    event: z.object({ id: number, kind: z.string(), text: z.string() }),
    startedAt: z.string(),
    finishedAt: z.string().optional(),
    charge: number,
  })
  .refine(
    (s) =>
      s.players.every(
        (p, i) => p.id === i && p.role === i % 7 && p.team === (i < 7 ? 0 : 1),
      ) &&
      s.controlled > 0 &&
      s.controlled < 7 &&
      (s.ball.owner === null ||
        (Number.isInteger(s.ball.owner) &&
          s.ball.owner >= 0 &&
          s.ball.owner < 14)),
    "Invalid player references",
  );
const resultSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  country: z.string(),
  opponent: z.string(),
  difficulty: z.enum(["easy", "normal", "hard"]),
  kits: z.tuple([kit, kit]),
  score: pair,
  outcome: z.string(),
  stats,
  startedAt: z.string(),
  finishedAt: z.string(),
});
export async function createFileStorage(
  root: string,
): Promise<StorageProvider> {
  await mkdir(root, { recursive: true });
  for (const d of ["matches", "results", "backups"])
    await mkdir(join(root, d), { recursive: true });
  const lock = join(root, ".lock");
  let handle;
  try {
    handle = await open(lock, "wx");
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
    let owner: { pid: number } | null = null;
    try {
      owner = JSON.parse(await Bun.file(lock).text());
    } catch {}
    if (!owner)
      throw new StorageError(
        "LOCKED",
        "Data directory lock is unreadable; inspect it before restarting.",
      );
    try {
      process.kill(owner.pid, 0);
      throw new StorageError(
        "LOCKED",
        "Another One More Match process owns this data directory.",
      );
    } catch (err: any) {
      if (err.code !== "ESRCH") throw err;
    }
    await unlink(lock);
    handle = await open(lock, "wx");
  }
  await handle.writeFile(
    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
  );
  await handle.close();
  let queue = Promise.resolve();
  let closed = false;
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const job = queue.then(fn);
    queue = job.then(
      () => {},
      () => {},
    );
    return job;
  };
  const path = (kind: string, id: string) => {
    if (!/^[a-zA-Z0-9-]+$/.test(id))
      throw new StorageError("INVALID_ID", "Invalid record ID");
    return join(root, kind, `${id}.json`);
  };
  const read = async <T>(
    file: string,
    schema: z.ZodType<T>,
  ): Promise<T | null> => {
    if (!(await Bun.file(file).exists())) return null;
    try {
      const raw = await Bun.file(file).json();
      if (raw.schemaVersion > 1)
        throw new StorageError(
          "FUTURE_SCHEMA",
          "This save belongs to a newer version of One More Match.",
        );
      return schema.parse(raw);
    } catch (e) {
      if (e instanceof StorageError) throw e;
      store.warning =
        "A damaged save was recovered from backup where possible.";
      const backup = join(
        root,
        "backups",
        file.replaceAll(/[^a-zA-Z0-9]/g, "_"),
      );
      await rename(file, `${file}.corrupt-${Date.now()}`);
      if (await Bun.file(backup).exists()) {
        const restored = schema.parse(await Bun.file(backup).json());
        await Bun.write(file, JSON.stringify(restored));
        return restored;
      }
      return null;
    }
  };
  const write = async <T>(file: string, value: T, schema: z.ZodType<T>) => {
    const validated = schema.parse(value);
    const temp = `${file}.tmp`;
    const backup = join(root, "backups", file.replaceAll(/[^a-zA-Z0-9]/g, "_"));
    if (await Bun.file(file).exists()) await copyFile(file, backup);
    const f = await open(temp, "w");
    try {
      await f.writeFile(JSON.stringify(validated));
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(temp, file);
  };
  const files = async (kind: string) =>
    (await readdir(join(root, kind))).filter((n) => n.endsWith(".json"));
  const store: StorageProvider = {
    warning: "",
    profiles: {
      get: () =>
        serial(
          async () =>
            (await read(join(root, "profile.json"), profileSchema)) ??
            defaultProfile(),
        ),
      update: (value, expected) =>
        serial(async () => {
          const current =
            (await read(join(root, "profile.json"), profileSchema)) ??
            defaultProfile();
          if (current.revision !== expected)
            throw new StorageError(
              "REVISION_CONFLICT",
              "Settings changed in another window. Reload and try again.",
            );
          const next = profileSchema.parse({
            ...value,
            revision: expected + 1,
            updatedAt: new Date().toISOString(),
          });
          await write(join(root, "profile.json"), next, profileSchema);
          return next;
        }),
    },
    matches: {
      save: (value) => {
        const copy = structuredClone(value);
        return serial(async () => {
          const file = path("matches", copy.id);
          const prev = await read(file, matchSchema);
          if (prev && prev.revision > copy.revision) return;
          await write(file, copy, matchSchema);
        });
      },
      load: (id) => serial(() => read(path("matches", id), matchSchema)),
      latest: () =>
        serial(async () => {
          const all: Match[] = [];
          for (const f of await files("matches")) {
            const m = await read(join(root, "matches", f), matchSchema);
            if (
              m &&
              !["abandoned", "finished"].includes(m.phase) &&
              !(await Bun.file(path("results", m.id)).exists())
            )
              all.push(m);
          }
          return (
            all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ??
            null
          );
        }),
      remove: (id) =>
        serial(async () => {
          const file = path("matches", id);
          await unlink(file).catch((e) => {
            if (e.code !== "ENOENT") throw e;
          });
          await unlink(
            join(root, "backups", file.replaceAll(/[^a-zA-Z0-9]/g, "_")),
          ).catch(() => {});
        }),
    },
    results: {
      record: (value) =>
        serial(async () => {
          const file = path("results", value.id);
          if (!(await Bun.file(file).exists()))
            await write(file, value, resultSchema);
          const list = await files("results");
          if (list.length > 100) {
            const values: Result[] = [];
            for (const name of list) {
              const v = await read(join(root, "results", name), resultSchema);
              if (v) values.push(v);
            }
            values.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
            for (const v of values.slice(100))
              await unlink(path("results", v.id));
          }
        }),
      get: (id) => serial(() => read(path("results", id), resultSchema)),
      list: (limit = 20, offset = 0) =>
        serial(async () => {
          const all: Result[] = [];
          for (const f of await files("results")) {
            const r = await read(join(root, "results", f), resultSchema);
            if (r) all.push(r);
          }
          return all
            .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
            .slice(offset, offset + Math.min(100, limit));
        }),
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await queue;
      await unlink(lock).catch(() => {});
    },
  };
  // Leftover incomplete replacements are never treated as committed records.
  for (const folder of ["", "matches", "results"])
    for (const f of await readdir(join(root, folder)))
      if (f.endsWith(".tmp")) await unlink(join(root, folder, f));
  return store;
}
