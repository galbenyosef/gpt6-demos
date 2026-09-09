export type Mode='CREATE'|'EDIT'|'ANIMATE';
export type Profile='FAST'|'PRECISE';
export interface Point{x:number;y:number}
export type Tool='select'|'lasso'|'brush'|'mask'|'eraser'|'sketch'|'arrow'|'comment'|'crop'|'hand'|'zoom';
export interface Annotation{id:string;kind:Tool;points:Point[];radius:number;color:string;text?:string}
export interface Asset{id:string;mimeType:string;width:number;height:number;createdAt:number;type:'GENERATED_IMAGE'|'UPLOADED_IMAGE'|'REFERENCE'}
export interface GenerationRecord{id:string;timestamp:number;operation:'GENERATE'|'EDIT';model:string;parentRevisionIds:string[];prompt:string;generatedAssetId:string}
export interface Revision{id:string;parentId?:string;imageAssetId:string;createdAt:number;prompt:string;annotations:Annotation[];generation?:GenerationRecord}
export interface Frame{id:string;revisionId:string;keyframe:boolean;durationMs?:number;generatedFromFrameId?:string;generatedFromRevisionId?:string;motionInstruction?:string;status:'READY'|'GENERATING'|'FAILED'|'STALE'}
export interface Project{schemaVersion:1;id:string;name:string;draftPrompt:string;createdAt:number;updatedAt:number;size:{width:number;height:number};mode:Mode;assets:Record<string,Asset>;revisions:Revision[];activeRevisionId?:string;frames:Frame[];activeFrameId?:string;canonicalRevisionId?:string;references:string[];annotations:Record<string,Annotation[]>;constraints:string[];sceneBible:string;description:string;fps:number;loop:'loop'|'once'|'pingpong';redo:Record<string,string>;generationHistory:GenerationRecord[]}
export const id=()=>crypto.randomUUID();
export function newProject():Project{return {schemaVersion:1,id:id(),name:'Untitled study',draftPrompt:'',createdAt:Date.now(),updatedAt:Date.now(),size:{width:1024,height:1024},mode:'CREATE',assets:{},revisions:[],frames:[],references:[],annotations:{},constraints:['character identity','camera','background','lighting'],sceneBible:'',description:'',fps:8,loop:'loop',redo:{},generationHistory:[]};}
export const revision=(p:Project,r=p.activeRevisionId)=>p.revisions.find(x=>x.id===r);
export const frame=(p:Project)=>p.frames.find(f=>f.id===p.activeFrameId);
export const annotations=(p:Project)=>p.annotations[p.activeRevisionId??'draft']??=[];
export function selectRevision(p:Project,rid:string){if(!revision(p,rid))return;p.activeRevisionId=rid;}
export function selectFrame(p:Project,fid:string){const f=p.frames.find(f=>f.id===fid);if(!f)return;p.activeFrameId=fid;p.activeRevisionId=f.revisionId;}
export function addRevision(p:Project,asset:Asset,prompt:string,parentId?:string,model?:string,activate=true){
  const r:Revision={id:id(),parentId,imageAssetId:asset.id,createdAt:Date.now(),prompt,annotations:structuredClone(p.annotations[parentId??'draft']??[])};
  p.assets[asset.id]=asset;p.revisions.push(r);p.annotations[r.id]=[];
  if(model){r.generation={id:id(),timestamp:Date.now(),operation:parentId?'EDIT':'GENERATE',model,parentRevisionIds:parentId?[parentId]:[],prompt,generatedAssetId:asset.id};p.generationHistory.push(r.generation);}
  if(parentId)p.redo[parentId]=r.id;if(activate)p.activeRevisionId=r.id;
  p.canonicalRevisionId??=r.id;
  return r;
}
export function undo(p:Project){const r=revision(p);if(r?.parentId){p.redo[r.parentId]=r.id;p.activeRevisionId=r.parentId;return true;}return false;}
export function redo(p:Project){const next=p.redo[p.activeRevisionId??''];if(next&&revision(p,next)){p.activeRevisionId=next;return true;}return false;}
export function addFrame(p:Project,rid=p.activeRevisionId,at=p.frames.length){if(!rid||!revision(p,rid))throw Error('Create or upload an image first.');const f:Frame={id:id(),revisionId:rid,keyframe:p.frames.length===0,status:'READY'};p.frames.splice(at,0,f);selectFrame(p,f.id);return f;}
export function invalidateDescendants(p:Project,fid:string){const affected=new Set([fid]);let changed=true;while(changed){changed=false;for(const f of p.frames)if(f.generatedFromFrameId&&affected.has(f.generatedFromFrameId)&&!affected.has(f.id)){affected.add(f.id);f.status='STALE';changed=true;}}return [...affected].filter(x=>x!==fid);}
export function changeFrameRevision(p:Project,fid:string,rid:string){const f=p.frames.find(f=>f.id===fid);if(!f||!revision(p,rid))return;if(f.revisionId!==rid){f.revisionId=rid;f.status='READY';invalidateDescendants(p,fid);}if(p.activeFrameId===fid)p.activeRevisionId=rid;}
export function deleteFrame(p:Project,fid:string){const index=p.frames.findIndex(f=>f.id===fid);if(index<0)return;invalidateDescendants(p,fid);p.frames.splice(index,1);if(p.activeFrameId===fid){p.activeFrameId=undefined;const next=p.frames[Math.min(index,p.frames.length-1)];if(next)selectFrame(p,next.id);}}
export function moveFrame(p:Project,fid:string,to:number){const index=p.frames.findIndex(f=>f.id===fid);if(index<0||to<0||to>=p.frames.length)return;const [f]=p.frames.splice(index,1);p.frames.splice(to,0,f!);}
export function assetReferences(p:Project){const counts:Record<string,number>={};for(const r of p.revisions)counts[r.imageAssetId]=(counts[r.imageAssetId]??0)+1;for(const a of p.references)counts[a]=(counts[a]??0)+1;return counts;}
export function migrateProject(raw:any):Project{
  if(!raw||typeof raw!=='object'||![undefined,0,1].includes(raw.schemaVersion))throw Error('Unsupported project version.');
  if(typeof raw.id!=='string'||typeof raw.name!=='string'||!raw.size||!Number.isInteger(raw.size.width)||!Number.isInteger(raw.size.height)||raw.size.width<256||raw.size.height<256||raw.size.width>3840||raw.size.height>3840||raw.size.width*raw.size.height>8294400||!Array.isArray(raw.revisions)||!Array.isArray(raw.frames)||!raw.assets)throw Error('Invalid project file.');
  const p={...newProject(),...raw,schemaVersion:1} as Project;
  const safeId=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
  if(!safeId(p.id)||p.name.length>200||typeof p.draftPrompt!=='string'||p.draftPrompt.length>6000||p.revisions.length>10000||p.frames.length>10000||!Array.isArray(p.generationHistory)||typeof p.sceneBible!=='string'||typeof p.description!=='string'||!['loop','once','pingpong'].includes(p.loop))throw Error('Invalid project metadata.');
  for(const [key,a] of Object.entries(p.assets)){if(!safeId(key)||!a||a.id!==key||!['image/png','image/jpeg','image/webp'].includes(a.mimeType)||!Number.isFinite(a.width)||!Number.isFinite(a.height)||a.width<1||a.height<1||a.width>8192||a.height>8192)throw Error('Invalid asset metadata.');}
  if(!p.constraints.every(c=>typeof c==='string'&&c.length<=4000))throw Error('Invalid preservation constraints.');

  if(!['CREATE','EDIT','ANIMATE'].includes(p.mode)||!Number.isFinite(p.fps)||p.fps<1||p.fps>60||!Array.isArray(p.references)||!Array.isArray(p.constraints)||!p.annotations||typeof p.annotations!=='object')throw Error('Invalid project settings.');
  const ids=new Set<string>();
  for(const r of p.revisions){if(!r||!safeId(r.id)||typeof r.prompt!=='string'||r.prompt.length>32000||ids.has(r.id)||!p.assets[r.imageAssetId])throw Error('Invalid revision or missing asset.');ids.add(r.id);}
  for(const r of p.revisions){let current:Revision|undefined=r;const seen=new Set<string>();while(current?.parentId){if(seen.has(current.id)||!ids.has(current.parentId))throw Error('Invalid revision ancestry.');seen.add(current.id);current=revision(p,current.parentId);}}
  const fids=new Set<string>();for(const f of p.frames){if(!f||!safeId(f.id)||!['READY','GENERATING','FAILED','STALE'].includes(f.status)||(f.durationMs!==undefined&&(!Number.isFinite(f.durationMs)||f.durationMs<1||f.durationMs>10000))||fids.has(f.id)||!ids.has(f.revisionId))throw Error('Invalid frame.');fids.add(f.id);if(f.status==='GENERATING')f.status='FAILED';}
  if(p.activeRevisionId&&!ids.has(p.activeRevisionId)||p.canonicalRevisionId&&!ids.has(p.canonicalRevisionId)||p.references.some(a=>!p.assets[a]))throw Error('Missing project reference.');
  for(const list of Object.values(p.annotations)){if(!Array.isArray(list)||list.length>10000)throw Error('Invalid annotations.');for(const a of list){if(!a||!safeId(a.id)||typeof a.color!=='string'||(a.text!==undefined&&typeof a.text!=='string')||!['select','lasso','brush','mask','eraser','sketch','arrow','comment','crop','hand','zoom'].includes(a.kind)||!Array.isArray(a.points)||a.points.length>100000||!Number.isFinite(a.radius)||a.points.some(pt=>!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y)||pt.x<0||pt.x>1||pt.y<0||pt.y>1))throw Error('Invalid annotation geometry.');}}
  return p;
}
export const serialize=(p:Project)=>JSON.stringify(p);
