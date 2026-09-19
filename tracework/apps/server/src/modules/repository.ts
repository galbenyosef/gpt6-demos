import { realpath } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { ensure } from "../../../../packages/contracts";
import { Store, id, now, hash } from "../storage/store";
import { ingest } from "./sources";
export type Repository = {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  createdAt: string;
};
export type RepositorySnapshot = {
  id: string;
  workspaceId: string;
  repositoryId: string;
  commit: string;
  dirty: boolean;
  files: {
    path: string;
    oid: string;
    hash: string;
    sourceId?: string;
    sourceVersionId?: string;
  }[];
  exclusions: { path: string; reason: string }[];
  createdAt: string;
};
async function git(path: string, args: string[]) {
  const p = Bun.spawn(
    [
      "git",
      "--no-optional-locks",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "protocol.file.allow=never",
      "-C",
      path,
      ...args,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: process.env.PATH ?? "",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        HOME: "/nonexistent",
      },
      timeout: 20000,
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).arrayBuffer(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  ensure(code === 0, "GIT_ERROR", err.slice(0, 600) || "Git read failed");
  return new Uint8Array(out);
}
export async function registerRepository(
  s: Store,
  w: string,
  path: string,
  name: string,
) {
  ensure(
    isAbsolute(path),
    "INVALID_PATH",
    "Register an absolute local repository path",
  );
  const real = await realpath(path);
  const top = new TextDecoder()
    .decode(await git(real, ["rev-parse", "--show-toplevel"]))
    .trim();
  ensure(
    (await realpath(top)) === real,
    "INVALID_REPOSITORY",
    "Register the repository root, not a nested directory",
  );
  const repo: Repository = {
    id: id(),
    workspaceId: w,
    name: name.trim() || real.split("/").at(-1)!,
    path: real,
    createdAt: now(),
  };
  s.insert("repository", w, repo);
  s.audit(w, "repository.registered", { repositoryId: repo.id });
  return repo;
}
export async function importRepository(
  s: Store,
  w: string,
  rid: string,
  ref: string,
  signal: AbortSignal,
  fence: () => void,
) {
  const repo = s.get<Repository>("repository", w, rid);
  ensure(
    ref.length > 0 &&
      ref.length < 200 &&
      !ref.startsWith("-") &&
      !/[\s\0]/.test(ref),
    "INVALID_COMMIT",
    "Use a commit SHA, branch, or tag",
  );
  ensure(
    (await realpath(repo.path)) === repo.path,
    "PATH_CHANGED",
    "The registered repository path has changed",
  );
  const commit = new TextDecoder()
    .decode(await git(repo.path, ["rev-parse", "--verify", `${ref}^{commit}`]))
    .trim();
  ensure(
    /^[a-f0-9]{40,64}$/.test(commit),
    "INVALID_COMMIT",
    "Git did not resolve a commit",
  );
  const status = await git(repo.path, [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  const inventory = new TextDecoder().decode(
    await git(repo.path, ["ls-tree", "-rz", "--full-tree", commit]),
  );
  const snapshot: RepositorySnapshot = {
    id: id(),
    workspaceId: w,
    repositoryId: rid,
    commit,
    dirty: status.length > 0,
    files: [],
    exclusions: [],
    createdAt: now(),
  };
  let total = 0;
  for (const entry of inventory.split("\0").filter(Boolean)) {
    fence();
    signal.throwIfAborted();
    const match = entry.match(/^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/s);
    if (!match) continue;
    const [, mode, type, oid, path] = match as [
      string,
      string,
      string,
      string,
      string,
    ];
    let reason = "";
    if (type !== "blob" || mode === "120000")
      reason = "Symlink, submodule, or non-file object";
    else if (
      isAbsolute(path) ||
      normalize(path).startsWith("..") ||
      path.includes("\\")
    )
      reason = "Path outside allowed inventory";
    else if (
      /(^|\/)(node_modules|vendor|dist|build|\.git|\.env(?:\..*)?|credentials|secrets)(\/|$)|\.(pem|key|p12|pfx|crt)$|id_(rsa|ed25519)|(?:^|\/)\.npmrc$/i.test(
        path,
      )
    )
      reason = "Excluded dependency, build output, or credential path";
    if (reason) {
      snapshot.exclusions.push({ path, reason });
      continue;
    }
    const size = Number(
      new TextDecoder().decode(await git(repo.path, ["cat-file", "-s", oid])),
    );
    if (
      size > 2 * 1024 * 1024 ||
      total + size > 50 * 1024 * 1024 ||
      snapshot.files.length >= 500
    ) {
      snapshot.exclusions.push({
        path,
        reason: "Text-file, count, or snapshot size limit",
      });
      continue;
    }
    const bytes = await git(repo.path, ["cat-file", "blob", oid]);
    if (bytes.includes(0)) {
      snapshot.exclusions.push({ path, reason: "Binary content" });
      continue;
    }
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      snapshot.exclusions.push({ path, reason: "Non-UTF-8 content" });
      continue;
    }
    total += size;
    const prior = s
      .list<RepositorySnapshot>("repository-snapshot", w)
      .filter((x) => x.repositoryId === rid)
      .flatMap((x) => x.files)
      .find((x) => x.path === path);
    const imported = await ingest(s, w, path, bytes, {
      sourceId: prior?.sourceId,
      classification: "internal",
      metadata: { repositoryId: rid, commit, path, snapshotId: snapshot.id },
    });
    snapshot.files.push({
      path,
      oid,
      hash: hash(bytes),
      sourceId: imported.source.id,
      sourceVersionId: imported.version.id,
    });
  }
  fence();
  s.insert("repository-snapshot", w, snapshot);
  s.audit(w, "repository.imported", {
    repositoryId: rid,
    commit,
    snapshotId: snapshot.id,
    dirty: snapshot.dirty,
  });
  return snapshot;
}
export function compareRepositories(s: Store, w: string, a: string, b: string) {
  const before = s.get<RepositorySnapshot>("repository-snapshot", w, a),
    after = s.get<RepositorySnapshot>("repository-snapshot", w, b);
  ensure(
    before.repositoryId === after.repositoryId,
    "REPOSITORY_MISMATCH",
    "Select snapshots from the same repository",
  );
  const paths = new Set([...before.files, ...after.files].map((f) => f.path));
  return {
    before: before.commit,
    after: after.commit,
    changes: [...paths].flatMap((path) => {
      const x = before.files.find((f) => f.path === path),
        y = after.files.find((f) => f.path === path);
      return x?.hash === y?.hash
        ? []
        : [
            {
              path,
              status: !x ? "added" : !y ? "removed" : "modified",
              before: x,
              after: y,
            },
          ];
    }),
    boundary:
      "Observable text-file changes only; no general correctness claim.",
  };
}
