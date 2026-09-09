import {migrateProject,type Project,type Asset} from './project';
let dbPromise:Promise<IDBDatabase>;
function database(){return dbPromise??=new Promise((resolve,reject)=>{const r=indexedDB.open('flip-slop-studio',1);r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'});r.result.createObjectStore('assets');r.result.createObjectStore('settings');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transact<T>(store:string,mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),r=fn(tx.objectStore(store));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export const putBlob=(id:string,blob:Blob)=>transact('assets','readwrite',s=>s.put(blob,id));
export async function getBlob(id:string):Promise<Blob>{const b=await transact<Blob>('assets','readonly',s=>s.get(id));if(!b)throw Error('An image asset is missing.');return b;}
export async function saveProject(p:Project){p.updatedAt=Date.now();await transact('projects','readwrite',s=>s.put(structuredClone(p)));await transact('settings','readwrite',s=>s.put(p.id,'lastProject'));}
export async function loadLast(){const id=await transact<string>('settings','readonly',s=>s.get('lastProject'));if(!id)return;return loadProject(id);}
export async function loadProject(id:string){const p=await transact('projects','readonly',s=>s.get(id));return p?migrateProject(p):undefined;}
export async function listProjects(){return (await transact<Project[]>('projects','readonly',s=>s.getAll())).sort((a,b)=>b.updatedAt-a.updatedAt);}
export async function storeAsset(blob:Blob,type:Asset['type']):Promise<Asset>{
  if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>15_000_000)throw Error('Choose a PNG, JPEG or WebP image under 15 MB.');
  const bitmap=await createImageBitmap(blob);const asset:Asset={id:crypto.randomUUID(),type,mimeType:blob.type,width:bitmap.width,height:bitmap.height,createdAt:Date.now()};bitmap.close();if(asset.width>8192||asset.height>8192)throw Error('Images must be at most 8192 pixels on each edge.');await putBlob(asset.id,blob);return asset;
}
export async function dataURL(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
export class BitmapCache{
  private cache=new Map<string,ImageBitmap>();private pending=new Map<string,Promise<ImageBitmap>>();
  async get(id:string){const found=this.cache.get(id);if(found){this.cache.delete(id);this.cache.set(id,found);return found;}if(this.pending.has(id))return this.pending.get(id)!;const promise=getBlob(id).then(createImageBitmap).then(b=>{this.cache.set(id,b);this.pending.delete(id);while(this.cache.size>12){const old=this.cache.keys().next().value!;this.cache.get(old)!.close();this.cache.delete(old);}return b;},e=>{this.pending.delete(id);throw e;});this.pending.set(id,promise);return promise;}
  clear(){for(const b of this.cache.values())b.close();this.cache.clear();}
}
