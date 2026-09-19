import { join } from "node:path";
import { Classification, ensure } from "../../../../packages/contracts";
import type {
  Source,
  SourceVersion,
  Evidence,
  ExtractedBlock,
  Run,
  Classification as ClassificationType,
} from "../../../../packages/contracts";
import { Store, id, now, hash, encode } from "../storage/store";
const extractorVersion = "tracework-extract-1";
export async function ingest(
  s: Store,
  w: string,
  name: string,
  bytes: Uint8Array,
  opts: {
    sourceId?: string;
    classification?: ClassificationType;
    authority?: Source["authority"];
    metadata?: Record<string, unknown>;
  } = {},
) {
  ensure(
    s.getWorkspace(w).status === "active",
    "ARCHIVED",
    "Unarchive the workspace before adding sources",
    409,
  );
  ensure(
    bytes.length <= 25 * 1024 * 1024,
    "UPLOAD_TOO_LARGE",
    "Documents must be 25 MiB or smaller",
    413,
  );
  ensure(
    name.length > 0 && name.length <= 240,
    "INVALID_NAME",
    "Use a document name up to 240 characters",
  );
  const h = await s.blob(bytes);
  return s.tx(() => {
    let source = opts.sourceId
      ? s.get<Source>("source", w, opts.sourceId)
      : null;
    if (source) {
      const existing = s
        .list<SourceVersion>("source-version", w)
        .find(
          (v) =>
            v.sourceId === source!.id &&
            v.hash === h &&
            v.metadata.commit === opts.metadata?.commit &&
            v.metadata.path === opts.metadata?.path &&
            v.extractorVersion === extractorVersion &&
            v.status === "ready",
        );
      if (existing) return { source, version: existing, reused: true };
    }
    if (!source) {
      source = {
        id: id(),
        workspaceId: w,
        name,
        kind: name.split(".").at(-1) ?? "text",
        authority: opts.authority ?? "supporting",
        classification: Classification.parse(opts.classification ?? "internal"),
        status: "active",
        latestVersionId: null,
        createdAt: now(),
      };
      s.insert("source", w, source);
    }
    const ordinal =
      1 +
      Math.max(
        0,
        ...s
          .list<SourceVersion>("source-version", w)
          .filter((v) => v.sourceId === source.id)
          .map((v) => v.ordinal),
      );
    const version: SourceVersion = {
      id: id(),
      workspaceId: w,
      sourceId: source.id,
      ordinal,
      hash: h,
      extractorVersion,
      extractionId: id(),
      status: "queued",
      warnings: [],
      createdAt: now(),
      metadata: { originalName: name, ...opts.metadata },
    };
    s.insert("source-version", w, version);
    const run: Run = {
      id: id(),
      workspaceId: w,
      kind: "extract",
      status: "queued",
      payload: { sourceVersionId: version.id },
      attempt: 0,
      leaseToken: 0,
      leaseOwner: null,
      leaseExpiry: null,
      cancelRequested: false,
      createdAt: now(),
      updatedAt: now(),
    };
    s.insert("run", w, run);
    s.audit(w, "source.uploaded", {
      sourceId: source.id,
      versionId: version.id,
      hash: h,
    });
    return { source, version, runId: run.id, reused: false };
  });
}
export async function extractVersion(
  s: Store,
  w: string,
  vid: string,
  signal: AbortSignal,
  fence: () => void,
) {
  const v = s.get<SourceVersion>("source-version", w, vid);
  if (v.status === "ready") {
    fence();
    return {
      sourceVersionId: v.id,
      reused: true,
      blocks: s
        .list<Evidence>("evidence", w)
        .filter((e) => e.sourceVersionId === v.id).length,
    };
  }
  const source = s.get<Source>("source", w, v.sourceId);
  fence();
  s.update("source-version", w, { ...v, status: "extracting" });
  const proc = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      join(import.meta.dir, "extractor.ts"),
      join(s.root, "blobs", v.hash),
      String(v.metadata.originalName ?? source.name),
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: s.root,
        TMPDIR: join(s.root, "tmp"),
      },
    },
  );
  const abort = () => proc.kill();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 30000);
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    ensure(
      code === 0,
      "EXTRACTION_FAILED",
      err.slice(0, 2000) || "Extraction timed out or was cancelled",
    );
    const parsed = JSON.parse(out) as {
      blocks: ExtractedBlock[];
      warnings: string[];
    };
    const extractedHash = await s.blob(encode(parsed.blocks));
    fence();
    s.tx(() => {
      fence();
      s.update("source-version", w, { ...v, status: "indexing" });
      for (const b of parsed.blocks) {
        const ev: Evidence = {
          id: id(),
          workspaceId: w,
          sourceId: source.id,
          sourceVersionId: v.id,
          extractionId: v.extractionId,
          locator: b.locator,
          excerpt: b.text,
          hash: hash(b.text),
        };
        if (v.metadata.commit && v.metadata.path)
          ev.locator = {
            ...ev.locator,
            kind: "git",
            commit: String(v.metadata.commit),
            path: String(v.metadata.path),
            repositoryId: String(v.metadata.repositoryId),
          };
        s.insert("evidence", w, ev);
        s.index(w, ev.id, "evidence", v.id, ev.excerpt);
      }
      s.update("source-version", w, {
        ...v,
        status: "ready",
        extractedHash,
        warnings: parsed.warnings,
      });
      const current = s.get<Source>("source", w, source.id);
      const currentV = current.latestVersionId
        ? s.get<SourceVersion>("source-version", w, current.latestVersionId)
        : null;
      if (!currentV || currentV.ordinal < v.ordinal)
        s.update("source", w, { ...current, latestVersionId: v.id });
    });
    return { sourceVersionId: v.id, blocks: parsed.blocks.length };
  } catch (e) {
    try {
      fence();
      s.update("source-version", w, {
        ...v,
        status: "failed",
        error: (e as Error).message,
      });
    } catch {}
    throw e;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
export function canSubmit(s: Store, w: string, c: ClassificationType) {
  return (
    c === "public" ||
    (c === "internal" && s.getWorkspace(w).settings.allowInternalAI)
  );
}
export function classificationOfEvidence(
  s: Store,
  w: string,
  ids: string[],
): ClassificationType {
  let level = 0;
  for (const eid of ids) {
    const e = s.get<Evidence>("evidence", w, eid),
      source = s.get<Source>("source", w, e.sourceId);
    level = Math.max(
      level,
      ["public", "internal", "restricted"].indexOf(source.classification),
    );
  }
  return (["public", "internal", "restricted"] as const)[level]!;
}
export function mostRestricted(
  ...values: ClassificationType[]
): ClassificationType {
  return values.includes("restricted")
    ? "restricted"
    : values.includes("internal")
      ? "internal"
      : "public";
}
