import { mkdtempSync } from "node:fs";
import { cpus, totalmem, platform, arch } from "node:os";
import { join } from "node:path";
import { Store, id } from "../apps/server/src/storage/store";
import {
  createWorkspace,
  humanCommand,
} from "../apps/server/src/modules/model";
import { ingest, extractVersion } from "../apps/server/src/modules/sources";
import type { Operation, Evidence } from "../packages/contracts";
const s = new Store(mkdtempSync("/tmp/tracework-benchmark-")),
  w = createWorkspace(s, { name: "Synthetic reference workload" });
const started = performance.now();
for (let i = 0; i < 100; i++) {
  const r = await ingest(
    s,
    w.id,
    `source-${i}.md`,
    new TextEncoder().encode(
      `# Reference source ${i}\nA technician needs valid certification for appointment assignment. This is synthetic verification data.`,
    ),
    { classification: "public" },
  );
  await extractVersion(
    s,
    w.id,
    r.version.id,
    new AbortController().signal,
    () => {},
  );
}
const evidence = s.list<Evidence>("evidence", w.id);
const ops: Operation[] = [];
for (let i = 0; i < 500; i++)
  ops.push({
    id: id(),
    action: "create",
    localId: `e${i}`,
    value: {
      kind: "element",
      type: "domain-concept",
      name: `Concept ${i}`,
      description:
        "A synthetic domain concept for reference workload verification.",
      attributes: { definition: "Synthetic workload concept" },
      assertion: "source-stated",
      classification: "public",
      evidenceIds: [evidence[i % 100]!.id],
    },
  });
const first = humanCommand(s, w.id, {
  expectedContextVersionId: w.headId,
  idempotencyKey: id(),
  reason: "Synthetic benchmark data",
  operations: ops,
});
for (let batch = 0; batch < 3; batch++) {
  const edges: Operation[] = [];
  for (let j = 0; j < 500; j++) {
    const i = batch * 500 + j;
    edges.push({
      id: id(),
      action: "create",
      localId: `r${i}`,
      value: {
        kind: "relationship",
        type: "depends-on",
        from: first.locals[`e${i % 500}`]!,
        to: first.locals[`e${(i + 1 + batch) % 500}`]!,
        name: `Dependency ${i}`,
        description: "Synthetic declared dependency",
        attributes: {},
        assertion: "source-stated",
        classification: "public",
        evidenceIds: [evidence[i % 100]!.id],
      },
    });
  }
  humanCommand(s, w.id, {
    expectedContextVersionId: s.getWorkspace(w.id).headId,
    idempotencyKey: id(),
    reason: "Synthetic benchmark graph",
    operations: edges,
  });
}
while (s.versions(w.id).length < 100) {
  const obj = s.snapshot(w.id).objects.find((o) => o.kind === "element")!;
  const { id: oid, revisionId, workspaceId, createdAt, ...value } = obj;
  humanCommand(s, w.id, {
    expectedContextVersionId: s.getWorkspace(w.id).headId,
    idempotencyKey: id(),
    reason: "Synthetic version history",
    operations: [
      {
        id: id(),
        action: "update",
        targetId: oid,
        value: {
          ...value,
          description: "Synthetic revision " + s.versions(w.id).length,
        },
      },
    ],
  });
}
const read: number[] = [],
  search: number[] = [];
for (let i = 0; i < 100; i++) {
  let start = performance.now();
  s.snapshot(w.id);
  read.push(performance.now() - start);
  start = performance.now();
  s.search(w.id, "certification");
  search.push(performance.now() - start);
}
const p95 = (v: number[]) => v.sort((a, b) => a - b)[94];
const result = {
  host: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryGiB: Math.round(totalmem() / 1024 ** 3),
  },
  runtime: Bun.version,
  sqlite: s.db.query("select sqlite_version() as version").get(),
  dataset: {
    sources: 100,
    elements: 500,
    relationships: 1500,
    contextVersions: 100,
  },
  p95Milliseconds: { snapshot: p95(read), fts: p95(search) },
  target: "Indexed reads below 500 ms at p95",
  preparationMilliseconds: performance.now() - started,
  browserInteraction: "Not measured by this script",
  dataDirectory: s.root,
};
await Bun.write("benchmark-results.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
s.close();
