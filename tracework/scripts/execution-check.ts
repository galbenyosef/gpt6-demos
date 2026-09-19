import { join } from "node:path";
import { Store, id, now } from "../apps/server/src/storage/store";
import {
  dockerAvailable,
  docker,
  executeArtifact,
} from "../apps/server/src/modules/execution";
import {
  createWorkspace,
  humanCommand,
} from "../apps/server/src/modules/model";
import {
  generateArtifact,
  reviewArtifact,
} from "../apps/server/src/modules/artifacts";
import type { Run } from "../packages/contracts";
if (!(await dockerAvailable())) {
  console.log(
    "Not run: Docker is unavailable. Verified-code acceptance remains disabled.",
  );
  process.exit(0);
}
const s = new Store(process.env.TRACEWORK_DATA_DIR || ".tracework-data"),
  file = Bun.file(join(s.root, "runner-profile.json"));
if (!(await file.exists()))
  throw new Error("Run bun run execution:prepare first");
const profile = await file.json();
const w = createWorkspace(
  s,
  { name: "Execution qualification — synthetic fixture" },
  true,
);
humanCommand(s, w.id, {
  expectedContextVersionId: w.headId,
  idempotencyKey: id(),
  reason: "Synthetic runner qualification",
  operations: [
    {
      id: id(),
      action: "create",
      localId: "items",
      value: {
        kind: "element",
        type: "domain-concept",
        name: "Items",
        description: "A bounded collection of named items",
        attributes: { definition: "A test item" },
        classification: "public",
        assertion: "human-assumed",
        evidenceIds: [],
      },
    },
  ],
});
const contract = await generateArtifact(s, w.id, {
  kind: "openapi",
  contextVersionId: s.getWorkspace(w.id).headId,
});
reviewArtifact(s, w.id, contract.id, "accepted", "Synthetic fixed contract");
const generated = [
  {
    path: "src/generated/handler.ts",
    content: `import {Database} from 'bun:sqlite';import {applyMigrations} from './migrate';const db=new Database(process.env.SERVICE_DATABASE||'service.sqlite');applyMigrations(db);export default async function(req:Request){if(new URL(req.url).pathname!=='/items')return new Response('Not found',{status:404});if(req.method==='GET')return Response.json(db.query('select id,name from items').all());if(req.method==='POST'){const body=await req.json().catch(()=>null);if(!body||typeof body.name!=='string'||!body.name.trim())return Response.json({error:'name required'},{status:400});const id=crypto.randomUUID();db.query('insert into items values(?,?)').run(id,body.name);return Response.json({id,name:body.name},{status:201})}return new Response('Method not allowed',{status:405})}`,
  },
  {
    path: "src/generated/migrate.ts",
    content: `import type {Database} from 'bun:sqlite';export function applyMigrations(db:Database){db.exec('CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,name TEXT NOT NULL)')}`,
  },
  {
    path: "migrations/001_items.sql",
    content:
      "CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,name TEXT NOT NULL);",
  },
  {
    path: "tests/generated/items.test.ts",
    content: `import {test,expect} from 'bun:test';import {writeFileSync} from 'node:fs';test('isolation',async()=>{expect(process.env.OPENAI_API_KEY).toBeUndefined();expect(await Bun.file('/tracework.sqlite').exists()).toBe(false);expect(()=>writeFileSync('/work/package.json','tampered')).toThrow();expect(()=>writeFileSync('/trusted/harness/acceptance.ts','tampered')).toThrow();expect(()=>writeFileSync('/input/contract.json','tampered')).toThrow();await expect(fetch('https://example.com',{signal:AbortSignal.timeout(1000)})).rejects.toThrow()});`,
  },
];
const report: any = { profile, checks: [] };
async function execute(files: typeof generated) {
  const artifact = await generateArtifact(s, w.id, {
    kind: "service-module",
    contextVersionId: s.getWorkspace(w.id).headId,
    inputArtifactIds: [contract.id],
    content: JSON.stringify({ generated: files }),
  });
  const run: Run = {
    id: id(),
    workspaceId: w.id,
    kind: "execute",
    payload: { artifactId: artifact.id },
    status: "running",
    attempt: 1,
    leaseToken: 1,
    leaseOwner: "qualification",
    leaseExpiry: Date.now() + 180000,
    cancelRequested: false,
    createdAt: now(),
    updatedAt: now(),
  };
  s.insert("run", w.id, run);
  return executeArtifact(s, run, new AbortController().signal, () => {}, true);
}
try {
  const valid = await execute(generated);
  report.checks.push({
    name: "Valid service and isolation checks",
    passed: valid.passed,
    runId: valid.id,
  });
  if (!valid.passed) throw new Error("Valid example did not pass");
  const broken = await execute(
    generated.map((f) =>
      f.path.endsWith("migrate.ts")
        ? {
            ...f,
            content:
              "import type {Database} from 'bun:sqlite';export function applyMigrations(db:Database){db.exec('BROKEN SQL')}",
          }
        : f,
    ),
  );
  report.checks.push({
    name: "Broken migration rejected",
    passed: !broken.passed,
    runId: broken.id,
  });
  if (broken.passed) throw new Error("Broken migration was not rejected");
  await Bun.write(
    file,
    JSON.stringify(
      { ...profile, qualified: true, qualification: report },
      null,
      2,
    ),
  );
  report.outcome = "passed";
} catch (e) {
  report.outcome = "failed";
  report.error = (e as Error).message;
  await Bun.write(
    file,
    JSON.stringify({ ...profile, qualified: false }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await Bun.write(
    join(s.root, "execution-qualification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  s.close();
}
