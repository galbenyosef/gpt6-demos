// Trusted observer runs separately from generated application code.
import { Database } from "bun:sqlite";
const contract = await Bun.file("/input/contract.json").json();
const paths = Object.entries(contract.paths) as [string, Record<string, any>][];
if (!paths.length) throw new Error("No collection contract paths");
const service = Bun.spawn(["bun", "/work/src/index.ts"], {
  cwd: "/work", stdout: "ignore", stderr: "ignore",
  env: { PATH: "/usr/local/bin:/usr/bin:/bin", PORT: "3099", SERVICE_DATABASE: "/tmp/acceptance.sqlite" },
});
const call = (path: string, init?: RequestInit) => fetch("http://127.0.0.1:3099" + path, { ...init, signal: AbortSignal.timeout(2000) });
try {
  let ready = false;
  for (let n = 0; n < 50; n++) {
    if (service.exitCode !== null) throw new Error("Generated server exited before completing checks");
    try { await call(paths[0]![0]); ready = true; break; } catch { await Bun.sleep(100); }
  }
  if (!ready) throw new Error("Generated server did not become ready");
  for (const [path, operations] of paths) {
    if (path.includes("{") || !operations.get || !operations.post) throw new Error("Unsupported contract: collection GET and POST required");
    const initial = await call(path);
    if (initial.status !== 200 || !Array.isArray(await initial.json())) throw new Error(`GET ${path} must return an array`);
    const invalid = await call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (invalid.status !== 400) throw new Error(`POST ${path} must reject missing name`);
    const name = "Acceptance " + crypto.randomUUID();
    const created = await call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const record = await created.json();
    if (created.status !== 201 || typeof record.id !== "string" || record.name !== name) throw new Error(`POST ${path} violates its response contract`);
    const listed = await (await call(path)).json();
    if (!Array.isArray(listed) || !listed.some((r: any) => r.id === record.id && r.name === name)) throw new Error("Created record is absent from collection");
  }
  const db = new Database("/tmp/acceptance.sqlite", { readonly: true });
  if ((db.query("PRAGMA integrity_check").get() as any).integrity_check !== "ok") throw new Error("SQLite integrity failed");
  db.close();
  console.log(`${paths.length} independent collection GET/POST sequences passed`);
} finally { service.kill(); await service.exited; }
