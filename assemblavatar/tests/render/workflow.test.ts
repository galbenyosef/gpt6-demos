import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../../src/backend/api";
import { examples } from "../../src/shared/examples";
test("build → reference upload → manual edit → export → import → restore → duplicate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assemblavatar-workflow-")), app = createApplication(dir);
  const call = async (path: string, data?: unknown, method = data ? "POST" : "GET") => { const response = await app.fetch(new Request(`http://127.0.0.1:3000/api${path}`, { method, headers: data instanceof FormData ? {} : { "Content-Type": "application/json" }, body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined })); if (!response.ok) throw Error(JSON.stringify(await response.json())); return response; };
  const finish = async (jobId: string) => { for (let i = 0; i < 1000; i++) { const j = await app.store.jobs.require(jobId); if (!["queued", "running"].includes(j.status) && !app.workspaces.busy.has(j.assemblageId)) { expect(j.error).toBeUndefined(); expect(j.status).toBe("completed"); return; } await Bun.sleep(20); } throw Error("Job timed out"); };
  try {
    const a = await (await call("/assemblages", {name:"Workflow test",kind:"object"})).json();
    const first = await (await call(`/assemblages/${a.id}/build`, {code:examples.robot.code,prompt:"Build fixture"})).json(); await finish(first.jobId);
    const original = await app.workspaces.detail(a.id); expect(original.revision?.revisionNumber).toBe(1);
    const image = await app.store.assets.get(original.model!.thumbnailAssetId); const reference = new FormData(); reference.set("file", new File([image], "reference.png", {type:"image/png"})); reference.set("role","front");
    const refs = await (await call(`/assemblages/${a.id}/references`, reference)).json(); expect(refs[0].role).toBe("front");
    const invalid = new FormData(); invalid.set("file",new File(["<script>bad</script>"],"fake.png",{type:"image/png"})); const rejected = await app.fetch(new Request(`http://127.0.0.1:3000/api/assemblages/${a.id}/references`,{method:"POST",body:invalid})); expect(rejected.status).toBe(400);
    const second = await (await call(`/assemblages/${a.id}/build`, {code:examples.robot.code,prompt:"Move root",overrides:[{objectId:"root",position:[2,0,0]}]})).json(); await finish(second.jobId);
    const edited = await app.workspaces.detail(a.id); expect(edited.revision?.overrides[0]?.position).toEqual([2,0,0]); expect(edited.source?.code).toBe(original.source?.code);
    expect(edited.revision!.diagnostics.boundingBox.min[0] - original.revision!.diagnostics.boundingBox.min[0]).toBeCloseTo(2);
    const glb = new Uint8Array(await (await call(`/models/${edited.model!.id}/content?format=glb`)).arrayBuffer()); expect(new TextDecoder().decode(glb.slice(0,4))).toBe("glTF");
    const target = await (await call("/assemblages",{name:"Imported",kind:"object"})).json(); const upload = new FormData();upload.set("file",new File([glb],"robot.glb"));
    const imported = await (await call(`/assemblages/${target.id}/import`,upload)).json(); expect(imported.diagnostics.triangleCount).toBe(edited.revision!.diagnostics.triangleCount);
    await call(`/assemblages/${a.id}/revisions`,{revisionId:original.revision!.id}); expect((await app.workspaces.detail(a.id)).currentRevision).toBe(1);
    const duplicate = await (await call(`/assemblages/${a.id}/duplicate`,{})).json(); await finish(duplicate.jobId); expect((await app.workspaces.detail(duplicate.assemblageId)).source?.code).toBe(original.source?.code);
    const cross = await app.fetch(new Request(`http://127.0.0.1:3000/api/assemblages/${target.id}/revisions`,{method:"POST",body:JSON.stringify({revisionId:original.revision!.id})}));expect(cross.status).toBe(400);
  } finally { await app.generation.renderer.close(); await rm(dir,{recursive:true,force:true}); }
},120000);
