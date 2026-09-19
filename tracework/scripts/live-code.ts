import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../apps/server/src/app';
import { createWorkspace, humanCommand } from '../apps/server/src/modules/model';
import { generateArtifact, reviewArtifact, exportArtifact } from '../apps/server/src/modules/artifacts';
import { id } from '../apps/server/src/storage/store';
import type { Run, Artifact } from '../packages/contracts';
if (!process.env.OPENAI_API_KEY || process.env.TRACEWORK_LIVE !== '1') {
  console.log('Not run: set TRACEWORK_LIVE=1 and configure OPENAI_API_KEY.');process.exit(0);
}
const root=mkdtempSync(join(tmpdir(),'tracework-live-code-')),app=createApp(root);
const w=createWorkspace(app.s,{name:'Synthetic catalog code qualification'},true);
app.s.putWorkspace({...w,settings:{allowInternalAI:true,revision:1}});
humanCommand(app.s,w.id,{expectedContextVersionId:w.headId,idempotencyKey:id(),reason:'Explicit synthetic qualification scope',operations:[
 {id:id(),action:'create',localId:'catalog',value:{kind:'element',type:'bounded-context',name:'Catalog',description:'Owns a collection of named editions',attributes:{},assertion:'human-assumed',classification:'public',evidenceIds:[]}},
 {id:id(),action:'create',localId:'edition',value:{kind:'element',type:'domain-concept',name:'Edition',description:'A named catalog record with id and name',attributes:{definition:'A named catalog record with id and name'},assertion:'human-assumed',classification:'public',evidenceIds:[]}},
]});
const current=app.s.snapshot(w.id),objects=current.objects;
const contract=await generateArtifact(app.s,w.id,{kind:'openapi',contextVersionId:current.version.id,selectedIds:objects.filter(o=>o.kind==='element'&&o.type==='domain-concept').map(o=>o.id)});
reviewArtifact(app.s,w.id,contract.id,'accepted','Reviewed synthetic collection profile');
const run=app.runtime.start(w.id,{kind:'code',expectedContextVersionId:current.version.id,elementIds:objects.map(o=>o.id),inputArtifactIds:[contract.id],question:'Implement this exact small collection API. SQLite persists id/name records. Reject missing/empty name with 400, POST returns 201 and GET returns array. Use only the supplied template contract. Include executable numbered SQL migration, migration helper and generated tests. No external services or dependencies.'});
app.jobs.start();
const report:any={runtime:Bun.version,model:process.env.OPENAI_MODEL||'gpt-6-astra',sdk:'0.18.0',root,runId:run.id,execution:'not-run'};
try {
 for(let n=0;n<650;n++) {
  const r=app.s.get<Run>('run',w.id,run.id);
  if(['failed','cancelled','interrupted','awaiting-approval'].includes(r.status))throw new Error(JSON.stringify(r.error??{status:r.status}));
  if(r.status==='completed') {
   const artifact=app.s.get<Artifact>('artifact',w.id,(r.result as any).artifactId);
   if(artifact.checks.some(c=>c.result==='block'))throw new Error('Generated files failed validation');
   if(app.s.getWorkspace(w.id).headId!==current.version.id)throw new Error('Generated code modified accepted context');
   const bundle=await exportArtifact(app.s,w.id,artifact.id);
   report.outcome='passed';report.artifactId=artifact.id;report.hash=artifact.hash;report.checks=artifact.checks;report.usage=r.usage;
   report.exported=true;break;
  }
  await Bun.sleep(1000);
 }
 if(!report.outcome)throw new Error('Code task deadline exceeded');
} catch(e){report.outcome='failed';report.error=(e as Error).message;process.exitCode=1;}
finally {await Bun.write(join(root,'live-code-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({outcome:report.outcome,error:report.error,report:join(root,'live-code-report.json'),execution:'not-run'},null,2));await app.close();}
