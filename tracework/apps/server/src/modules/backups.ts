import { Database } from "bun:sqlite";
import { join, resolve } from "node:path";
import { mkdir, readdir, cp } from "node:fs/promises";
import { Store, id, now, hash } from "../storage/store";
import { ensure } from "../../../../packages/contracts";
export async function createBackup(s: Store) {
  const bid = id(),
    dir = join(s.root, "backups", bid);
  await mkdir(dir, { recursive: true });
  const p = Bun.spawn(
    [
      process.execPath,
      import.meta.filename,
      "snapshot",
      join(s.root, "tracework.sqlite"),
      join(dir, "tracework.sqlite"),
    ],
    { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "" } },
  );
  const error = await new Response(p.stderr).text();
  ensure(
    (await p.exited) === 0,
    "BACKUP_FAILED",
    error || "SQLite snapshot failed",
  );
  const db = new Database(join(dir, "tracework.sqlite"), { readonly: true });
  const records = db.query("SELECT kind,payload FROM records").all() as {
    kind: string;
    payload: string;
  }[];
  const hashes = new Set<string>();
  for (const r of records) {
    const v = JSON.parse(r.payload);
    if (["source-version", "artifact", "checkpoint"].includes(r.kind)) {
      if (v.hash) hashes.add(v.hash);
      if (v.extractedHash) hashes.add(v.extractedHash);
    }
  }
  db.close();
  await mkdir(join(dir, "blobs"));
  for (const h of hashes) {
    const bytes = new Uint8Array(await s.blobFile(h).arrayBuffer());
    ensure(
      hash(bytes) === h,
      "CORRUPT_BLOB",
      "A referenced blob failed hash validation",
    );
    await Bun.write(join(dir, "blobs", h), bytes);
  }
  const dbHash = hash(
    new Uint8Array(await Bun.file(join(dir, "tracework.sqlite")).arrayBuffer()),
  );
  const manifest = {
    id: bid,
    schema: 1,
    createdAt: now(),
    bun: Bun.version,
    databaseHash: dbHash,
    blobHashes: [...hashes],
    path: dir,
  };
  await Bun.write(
    join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
}
export async function listBackups(s: Store) {
  const names = await readdir(join(s.root, "backups"));
  const all = [];
  for (const name of names) {
    if (!/^[a-f0-9-]{36}$/.test(name)) continue;
    const f = Bun.file(join(s.root, "backups", name, "manifest.json"));
    if (await f.exists()) all.push(await f.json());
  }
  return all;
}
export async function restoreBackup(s: Store, bid: string) {
  ensure(
    /^[a-f0-9-]{36}$/.test(bid),
    "INVALID_BACKUP",
    "Invalid backup identifier",
  );
  const dir = join(s.root, "backups", bid),
    f = Bun.file(join(dir, "manifest.json"));
  ensure(await f.exists(), "NOT_FOUND", "Backup not found", 404);
  const m = await f.json();
  ensure(m.schema === 1, "BACKUP_SCHEMA", "Unsupported backup schema");
  const bytes = new Uint8Array(
    await Bun.file(join(dir, "tracework.sqlite")).arrayBuffer(),
  );
  ensure(
    hash(bytes) === m.databaseHash,
    "CORRUPT_BACKUP",
    "Backup database hash failed",
  );
  for (const h of m.blobHashes) {
    ensure(/^[a-f0-9]{64}$/.test(h), "INVALID_HASH", "Invalid backup blob");
    ensure(
      hash(
        new Uint8Array(await Bun.file(join(dir, "blobs", h)).arrayBuffer()),
      ) === h,
      "CORRUPT_BACKUP",
      "Backup content hash failed",
    );
  }
  const target = join(s.root, "backups", `restored-${id()}`);
  await mkdir(target);
  await Bun.write(join(target, "tracework.sqlite"), bytes);
  await cp(join(dir, "blobs"), join(target, "blobs"), { recursive: true });
  const restored = new Store(target);
  const integrity = restored.db.query("PRAGMA integrity_check").get() as {
    integrity_check: string;
  };
  ensure(
    integrity.integrity_check === "ok",
    "CORRUPT_BACKUP",
    "SQLite integrity check failed",
  );
  for (const run of restored.allRuns())
    if (["queued", "running", "awaiting-approval"].includes(run.status))
      restored.update("run", run.workspaceId, {
        ...run,
        status: "interrupted",
        recorded: true,
        sdkState: undefined,
        sdkStateHash: undefined,
        approval: undefined,
        leaseOwner: null,
        leaseExpiry: null,
        error: {
          code: "RESTORED_HISTORY",
          message: "Imported run is historical. Start a fresh authorized task.",
        },
      });
  const workspaces = restored.workspaces().length;
  restored.close();
  return {
    path: target,
    workspaces,
    message:
      "Validated into a separate directory. Stop the application and set TRACEWORK_DATA_DIR to this path to open it; active data was preserved.",
  };
}
export async function checkpoint(s: Store, w: string, name: string) {
  const exported = s.exportWorkspace(w);
  const h = await s.blob(JSON.stringify(exported));
  const item = {
    id: id(),
    workspaceId: w,
    name,
    hash: h,
    contextVersionId: s.getWorkspace(w).headId,
    createdAt: now(),
    label: "Example checkpoint",
  };
  s.insert("checkpoint", w, item);
  return item;
}
export async function cloneCheckpoint(s: Store, w: string, cid: string) {
  const c = s.get<{ id: string; hash: string; name: string }>(
    "checkpoint",
    w,
    cid,
  );
  const data = await s.blobFile(c.hash).json();
  const cloned = s.importWorkspace(data, `${data.workspace.name} — ${c.name}`);
  const artifacts = s
    .list<any>("artifact", cloned.workspace.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const updatedHashes = new Map<string, string>();
  for (const artifact of artifacts) {
    let content = await s.blobFile(artifact.hash).text();
    for (const [oldId, newId] of Object.entries(cloned.remap))
      content = content.replaceAll(oldId, newId);
    const newHash = await s.blob(content);
    updatedHashes.set(artifact.id, newHash);
    const inputArtifacts = Object.fromEntries(
      Object.entries(artifact.manifest.inputArtifacts).map(([aid, h]) => [
        aid,
        updatedHashes.get(aid) ?? h,
      ]),
    );
    s.update("artifact", cloned.workspace.id, {
      ...artifact,
      hash: newHash,
      manifest: {
        ...artifact.manifest,
        inputArtifacts,
        lineage: artifact.originId,
      },
    });
  }
  return cloned;
}
if (import.meta.main && process.argv[2] === "snapshot") {
  const db = new Database(process.argv[3]!);
  db.exec("PRAGMA busy_timeout=5000");
  const target = process.argv[4]!;
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  db.close();
  const copy = new Database(target);
  copy.exec("DELETE FROM local_sessions");
  copy.close();
}
