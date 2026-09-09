import {id,addRevision,revision,changeFrameRevision,annotations,type Project,type Profile,type Revision,type Annotation} from './project';
import {storeAsset,getBlob,dataURL} from './storage';
import {motion} from './geometry';
export class GenerationQueue {
  private tail:Promise<unknown>=Promise.resolve();epoch=0;controller?:AbortController;
  cancel(){this.epoch++;this.controller?.abort();}
  enqueue<T>(work:(signal:AbortSignal)=>Promise<T>):Promise<T>{const epoch=this.epoch;const task=this.tail.catch(()=>{}).then(async()=>{if(epoch!==this.epoch)throw new DOMException('Cancelled','AbortError');const c=new AbortController();this.controller=c;try{const result=await work(c.signal);if(epoch!==this.epoch)throw new DOMException('Cancelled','AbortError');return result;}finally{if(this.controller===c)this.controller=undefined;}});this.tail=task;return task;}
}
export async function api(path:string,body:unknown,signal?:AbortSignal){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});const result=await response.json();if(!response.ok)throw Error(result.error?.message??'Request failed.');return result;}
export interface RequestOptions{prompt:string;profile:Profile;quality:string;sourceId?:string;targetId?:string;previousId?:string;repair?:boolean;guidance?:Blob;mask?:Blob;signal?:AbortSignal;activate?:boolean;frameId?:string;annotationSnapshot?:Annotation[]}
export function compose(p:Project,o:RequestOptions){
  const marks=o.annotationSnapshot??annotations(p);
  const notes=marks.filter(a=>a.kind==='comment').map(a=>`At (${a.points[0]!.x.toFixed(2)}, ${a.points[0]!.y.toFixed(2)}): ${a.text}`);
  const arrows=marks.filter(a=>a.kind==='arrow').map(a=>JSON.stringify(motion(a)));
  return [o.prompt,o.sourceId?'Edit the first image. Preserve everything except the explicitly requested changes.':'Create an image based on the prompt and any supplied visual references.',o.sourceId?'Additional images anchor visual identity; a target image, when supplied, defines the final pose.':'',o.repair?'Repair the first image while preserving its current pose and motion state.':'',o.guidance?'The final image is annotated visual guidance. Interpret marks, do not reproduce the annotation marks.':'',`Preserve: ${p.constraints.join(', ')}.`,p.sceneBible?`Scene definition: ${p.sceneBible}`:'',notes.join('\n'),arrows.length?`Motion arrows in normalized image coordinates: ${arrows.join('; ')}`:''].filter(Boolean).join('\n\n');
}
export async function generateRevision(p:Project,o:RequestOptions):Promise<Revision>{
  const before=p.activeRevisionId;const inputs:string[]=[];
  const ids=[o.sourceId,p.canonicalRevisionId,o.previousId,o.targetId].filter((r):r is string=>!!r).map(r=>revision(p,r)?.imageAssetId).filter((a):a is string=>!!a);
  if(!o.sourceId)ids.length=0;
  for(const a of [...new Set([...ids,...p.references])].slice(0,7)){
    let blob=await getBlob(a);
    // A mask must match the first image's dimensions, even for an imported source.
    if(o.mask&&a===ids[0]&&(p.assets[a]!.width!==p.size.width||p.assets[a]!.height!==p.size.height)){
      const c=document.createElement('canvas');c.width=p.size.width;c.height=p.size.height;
      const bitmap=await createImageBitmap(blob);c.getContext('2d')!.drawImage(bitmap,0,0,c.width,c.height);bitmap.close();
      blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not prepare masked edit.')),'image/png'));
    }
    inputs.push(await dataURL(blob));
  }
  if(o.guidance)inputs.push(await dataURL(o.guidance));
  const result=await api(o.sourceId?'/api/images/edit':'/api/images/generate',{prompt:compose(p,o),...p.size,modelProfile:o.profile,quality:o.quality,images:inputs,mask:o.mask?await dataURL(o.mask):undefined},o.signal);
  if(o.signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const bytes=Uint8Array.from(atob(result.data),(c)=>c.charCodeAt(0));
  const asset=await storeAsset(new Blob([bytes],{type:result.mimeType}),'GENERATED_IMAGE');
  if(o.signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const active=o.activate!==false&&before===p.activeRevisionId;
  const r=addRevision(p,asset,o.prompt,o.sourceId,result.model,active);
  if(o.frameId&&active)changeFrameRevision(p,o.frameId,r.id);
  return r;
}
