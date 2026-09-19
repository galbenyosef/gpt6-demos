import { Database } from "bun:sqlite";
import { mkdirSync, renameSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { AppError, ensure } from "../../../../packages/contracts";
import type {
  Workspace,
  Version,
  ObjectRevision,
  Snapshot,
  Run,
} from "../../../../packages/contracts";
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
export const encode = (x: unknown) => JSON.stringify(x);
export class Store {
  readonly db: Database;
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
    for (const p of ["", "blobs", "exports", "execution", "backups", "tmp"])
      mkdirSync(join(this.root, p), { recursive: true });
    this.db = new Database(join(this.root, "tracework.sqlite"), {
      create: true,
      strict: true,
    });
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),sequence INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(workspace_id,sequence));
   CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,object_id TEXT NOT NULL,workspace_id TEXT NOT NULL REFERENCES workspaces(id),payload TEXT NOT NULL,UNIQUE(workspace_id,id));
   CREATE TABLE IF NOT EXISTS membership(version_id TEXT NOT NULL REFERENCES versions(id),object_id TEXT NOT NULL,revision_id TEXT NOT NULL REFERENCES revisions(id),PRIMARY KEY(version_id,object_id));
   CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,workspace_id TEXT NOT NULL REFERENCES workspaces(id),payload TEXT NOT NULL,PRIMARY KEY(kind,id));
   CREATE INDEX IF NOT EXISTS records_workspace ON records(workspace_id,kind);
   CREATE INDEX IF NOT EXISTS revisions_workspace ON revisions(workspace_id,object_id);
   CREATE TABLE IF NOT EXISTS commands(workspace_id TEXT NOT NULL REFERENCES workspaces(id),key TEXT NOT NULL,hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(workspace_id,key));
   CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS events_run ON events(run_id,seq);
   CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(workspace_id UNINDEXED,id UNINDEXED,kind UNINDEXED,version_id UNINDEXED,text);
   CREATE TABLE IF NOT EXISTS local_sessions(id TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TRIGGER IF NOT EXISTS immutable_revision BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'immutable revision'); END;
   CREATE TRIGGER IF NOT EXISTS immutable_version BEFORE UPDATE ON versions BEGIN SELECT RAISE(ABORT,'immutable version'); END;
   CREATE TRIGGER IF NOT EXISTS immutable_audit BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
   CREATE TRIGGER IF NOT EXISTS immutable_evidence BEFORE UPDATE ON records WHEN OLD.kind='evidence' BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
   INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
  }
  tx<T>(f: () => T): T {
    return this.db.transaction(f).immediate();
  }
  getWorkspace(w: string): Workspace {
    const row = this.db
      .query("SELECT payload FROM workspaces WHERE id=?")
      .get(w) as { payload: string } | null;
    ensure(row, "NOT_FOUND", "Workspace not found", 404);
    return JSON.parse(row.payload);
  }
  workspaces(): Workspace[] {
    return (
      this.db
        .query("SELECT payload FROM workspaces ORDER BY rowid DESC")
        .all() as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  putWorkspace(w: Workspace) {
    this.db
      .query(
        "INSERT INTO workspaces VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(w.id, encode(w));
  }
  get<T>(kind: string, w: string, key: string): T {
    const r = this.db
      .query(
        "SELECT payload FROM records WHERE kind=? AND workspace_id=? AND id=?",
      )
      .get(kind, w, key) as { payload: string } | null;
    ensure(r, "NOT_FOUND", `${kind} not found in this workspace`, 404);
    return JSON.parse(r.payload);
  }
  maybe<T>(kind: string, w: string, key: string): T | null {
    try {
      return this.get(kind, w, key);
    } catch (e) {
      if (e instanceof AppError && e.code === "NOT_FOUND") return null;
      throw e;
    }
  }
  list<T>(kind: string, w: string): T[] {
    return (
      this.db
        .query(
          "SELECT payload FROM records WHERE kind=? AND workspace_id=? ORDER BY rowid DESC",
        )
        .all(kind, w) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  insert<T extends { id: string }>(kind: string, w: string, value: T) {
    this.db
      .query("INSERT INTO records VALUES(?,?,?,?)")
      .run(kind, value.id, w, encode(value));
  }
  update<T extends { id: string }>(kind: string, w: string, value: T) {
    ensure(
      this.db
        .query(
          "UPDATE records SET payload=? WHERE kind=? AND workspace_id=? AND id=?",
        )
        .run(encode(value), kind, w, value.id).changes,
      "NOT_FOUND",
      `${kind} not found`,
      404,
    );
  }
  version(w: string, key: string): Version {
    const r = this.db
      .query("SELECT payload FROM versions WHERE id=? AND workspace_id=?")
      .get(key, w) as { payload: string } | null;
    ensure(r, "NOT_FOUND", "Version not found in this workspace", 404);
    return JSON.parse(r.payload);
  }
  versions(w: string): Version[] {
    return (
      this.db
        .query(
          "SELECT payload FROM versions WHERE workspace_id=? ORDER BY sequence DESC",
        )
        .all(w) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  snapshot(w: string, key?: string): Snapshot {
    const version = this.version(w, key ?? this.getWorkspace(w).headId);
    const rows = this.db
      .query(
        "SELECT r.payload FROM membership m JOIN revisions r ON r.id=m.revision_id WHERE m.version_id=? AND r.workspace_id=?",
      )
      .all(version.id, w) as { payload: string }[];
    return { version, objects: rows.map((r) => JSON.parse(r.payload)) };
  }
  saveVersion(v: Version, objects: ObjectRevision[]) {
    this.db
      .query("INSERT INTO versions VALUES(?,?,?,?)")
      .run(v.id, v.workspaceId, v.sequence, encode(v));
    const rev = this.db.query(
      "INSERT OR IGNORE INTO revisions VALUES(?,?,?,?)",
    );
    const member = this.db.query("INSERT INTO membership VALUES(?,?,?)");
    for (const o of objects) {
      rev.run(o.revisionId, o.id, v.workspaceId, encode(o));
      member.run(v.id, o.id, o.revisionId);
    }
  }
  audit(w: string, action: string, data: unknown, actor = "human") {
    const value = {
      id: id(),
      workspaceId: w,
      action,
      actor,
      data,
      createdAt: now(),
    };
    this.db
      .query("INSERT INTO audit VALUES(?,?,?)")
      .run(value.id, w, encode(value));
    return value;
  }
  audits(w: string) {
    return (
      this.db
        .query(
          "SELECT payload FROM audit WHERE workspace_id=? ORDER BY rowid DESC LIMIT 500",
        )
        .all(w) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  replay<T>(w: string, key: string, payload: unknown): T | null {
    const r = this.db
      .query("SELECT hash,result FROM commands WHERE workspace_id=? AND key=?")
      .get(w, key) as { hash: string; result: string } | null;
    if (!r) return null;
    ensure(
      r.hash === hash(encode(payload)),
      "IDEMPOTENCY_CONFLICT",
      "This command key was already used with different input",
      409,
    );
    return JSON.parse(r.result);
  }
  remember(w: string, key: string, payload: unknown, result: unknown) {
    this.db
      .query("INSERT INTO commands VALUES(?,?,?,?)")
      .run(w, key, hash(encode(payload)), encode(result));
  }
  index(
    w: string,
    key: string,
    kind: string,
    version: string,
    content: string,
  ) {
    this.db
      .query(
        "DELETE FROM search_index WHERE workspace_id=? AND id=? AND kind=?",
      )
      .run(w, key, kind);
    this.db
      .query("INSERT INTO search_index VALUES(?,?,?,?,?)")
      .run(w, key, kind, version, content);
  }
  search(w: string, query: string, limit = 50) {
    const safe = query
      .match(/[\p{L}\p{N}_-]+/gu)
      ?.slice(0, 12)
      .map((x) => '"' + x + '"')
      .join(" AND ");
    if (!safe) return [];
    return this.db
      .query(
        "SELECT id,kind,version_id as versionId,snippet(search_index,4,'','','…',36) as excerpt FROM search_index WHERE search_index MATCH ? AND workspace_id=? LIMIT ?",
      )
      .all(safe, w, limit);
  }
  async blob(bytes: Uint8Array | string) {
    const data =
      typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
    const h = hash(data);
    const target = join(this.root, "blobs", h);
    if (!existsSync(target)) {
      const temp = join(this.root, "tmp", id());
      await Bun.write(temp, data);
      renameSync(temp, target);
    }
    return h;
  }
  blobFile(h: string) {
    ensure(/^[a-f0-9]{64}$/.test(h), "INVALID_HASH", "Invalid content hash");
    return Bun.file(join(this.root, "blobs", h));
  }
  verifiedBlob(h: string) {
    ensure(/^[a-f0-9]{64}$/.test(h), "INVALID_HASH", "Invalid content hash");
    const bytes = readFileSync(join(this.root, "blobs", h));
    ensure(
      hash(bytes) === h,
      "CORRUPT_BLOB",
      "Stored content does not match its immutable hash",
    );
    return bytes;
  }
  event(runId: string, event: unknown) {
    this.db
      .query("INSERT INTO events(run_id,payload) VALUES(?,?)")
      .run(runId, encode({ createdAt: now(), ...(event as object) }));
  }
  events(runId: string, after = 0) {
    return (
      this.db
        .query(
          "SELECT seq,payload FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 500",
        )
        .all(runId, after) as { seq: number; payload: string }[]
    ).map((r) => ({ seq: r.seq, ...JSON.parse(r.payload) }));
  }
  allRuns(): Run[] {
    return (
      this.db.query("SELECT payload FROM records WHERE kind='run'").all() as {
        payload: string;
      }[]
    ).map((r) => JSON.parse(r.payload));
  }
  session() {
    const sid = id(),
      csrf = id();
    this.db
      .query("INSERT INTO local_sessions VALUES(?,?,?)")
      .run(sid, csrf, Date.now() + 86400000);
    return { sid, csrf };
  }
  checkSession(sid: string, csrf?: string) {
    const r = this.db
      .query("SELECT csrf,expires FROM local_sessions WHERE id=?")
      .get(sid) as { csrf: string; expires: number } | null;
    return !!r && r.expires > Date.now() && (!csrf || r.csrf === csrf);
  }
  exportWorkspace(w: string) {
    const workspace = this.getWorkspace(w);
    const snapshots = this.versions(w)
      .reverse()
      .map((v) => this.snapshot(w, v.id));
    const records = (
      this.db
        .query("SELECT kind,payload FROM records WHERE workspace_id=?")
        .all(w) as { kind: string; payload: string }[]
    )
      .filter(
        (r) =>
          ![
            "session",
            "context-plan",
            "scene",
            "checkpoint",
            "attempt",
            "attempt-result",
          ].includes(r.kind),
      )
      .map((r) => ({ kind: r.kind, value: JSON.parse(r.payload) }));
    return { schema: 1, workspace, snapshots, records, audit: this.audits(w) };
  }
  importWorkspace(data: ReturnType<Store["exportWorkspace"]>, name: string) {
    ensure(data.schema === 1, "BACKUP_SCHEMA", "Unsupported checkpoint schema");
    const remap = new Map<string, string>();
    remap.set(data.workspace.id, id());
    for (const snap of data.snapshots) {
      remap.set(snap.version.id, id());
      for (const o of snap.objects) {
        if (!remap.has(o.id)) remap.set(o.id, id());
        if (!remap.has(o.revisionId)) remap.set(o.revisionId, id());
      }
    }
    for (const { value } of data.records) {
      if (value.id && !remap.has(value.id)) remap.set(value.id, id());
      for (const key of ["extractionId", "artifactId"])
        if (value[key] && !remap.has(value[key])) remap.set(value[key], id());
    }
    const transform = (v: unknown): unknown =>
      typeof v === "string"
        ? (remap.get(v) ?? v)
        : Array.isArray(v)
          ? v.map(transform)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, x]) => [
                  remap.get(k) ?? k,
                  transform(x),
                ]),
              )
            : v;
    const ws = transform(data.workspace) as Workspace;
    ws.name = name;
    ws.status = "active";
    ws.createdAt = now();
    ws.updatedAt = now();
    ws.settings = { allowInternalAI: false, revision: 0 };
    this.tx(() => {
      this.putWorkspace(ws);
      for (const snapshot of data.snapshots) {
        const v = transform(snapshot.version) as Version;
        const objects = transform(snapshot.objects) as ObjectRevision[];
        v.hash = hash(encode(objects.map((o) => [o.id, o.revisionId]).sort()));
        this.saveVersion(v, objects);
      }
      for (const record of data.records) {
        const value = transform(record.value) as Record<string, unknown> & {
          id: string;
        };
        value.originId = record.value.id;
        if (record.kind === "run") {
          value.status = "completed";
          value.recorded = true;
          value.sdkState = undefined;
          value.sdkStateHash = undefined;
          value.approval = undefined;
          value.leaseOwner = null;
          value.leaseExpiry = null;
          value.kind = "recorded";
          value.result = {
            importedStatus: record.value.status,
            recordedResult: record.value.result,
          };
        }
        if (record.kind === "artifact") {
          value.execution = undefined;
          value.review =
            record.value.kind === "service-module"
              ? "draft"
              : record.value.review;
          value.originManifest = record.value.manifest;
        }
        if (
          [
            "agent-draft",
            "artifact-draft",
            "tool-invocation",
            "advisory-draft",
          ].includes(record.kind)
        )
          continue;
        this.insert(record.kind, ws.id, value);
        if (record.kind === "evidence")
          this.index(
            ws.id,
            value.id,
            "evidence",
            String(value.sourceVersionId),
            String(value.excerpt),
          );
      }
      this.audit(ws.id, "checkpoint.cloned", {
        originWorkspaceId: data.workspace.id,
      });
    });
    return { workspace: ws, remap: Object.fromEntries(remap) };
  }
  close() {
    this.db.close();
  }
}
