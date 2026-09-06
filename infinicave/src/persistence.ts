import { copy, type Context, type Envelope, type SaveRecord } from './domain';
import { digest } from './generation';
import { validateEnvelope } from './validation';
const DB_NAME = 'infinicave-v1';
export const MAX_IMPORT = 25 * 1024 * 1024;
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore('contexts', { keyPath: 'id' }); request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); }; request.onerror = () => { database = undefined; reject(request.error); }; request.onblocked = () => { database = undefined; reject(new Error('Storage upgrade is blocked by another tab. Close other InfiniCave tabs and retry.')); }; });
}
function read<T>(request: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function committed(tx: IDBTransaction) { return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error('The storage transaction was interrupted.')); tx.onerror = () => reject(tx.error); }); }
export async function listContexts(): Promise<SaveRecord[]> { const d = await db(); return (await read(d.transaction('contexts').objectStore('contexts').getAll()) as SaveRecord[]).sort((a, b) => (b.current.payload.lastPlayed || '').localeCompare(a.current.payload.lastPlayed || '')); }
export async function getRecord(id: string): Promise<SaveRecord | undefined> { const d = await db(); return read(d.transaction('contexts').objectStore('contexts').get(id)); }
export async function loadContext(id: string): Promise<{ context: Context; recovered: boolean; reason?: string }> {
  const record = await getRecord(id); if (!record) throw new Error('This expedition no longer exists.');
  try { return { context: await validateEnvelope(record.current), recovered: false }; }
  catch (error) { if (!record.previous) throw error; return { context: await validateEnvelope(record.previous), recovered: true, reason: error instanceof Error ? error.message : 'The newest save is damaged.' }; }
}
export async function writeContext(snapshot: Context) {
  const old = await getRecord(snapshot.id), next = copy(snapshot);
  next.revision = Math.max(snapshot.revision, old?.current.payload.revision || 0) + 1; next.updated = new Date().toISOString();
  const current: Envelope = { payload: next, checksum: await digest(next), previousRevision: null };
  let previous: Envelope | null = null;
  if (old) { try { await validateEnvelope(old.current, false); previous = old.current; } catch { if (old.previous) { await validateEnvelope(old.previous, false); previous = old.previous; } } }
  current.previousRevision = previous?.payload.revision ?? null;
  const d = await db(), tx = d.transaction('contexts', 'readwrite'), done = committed(tx); tx.objectStore('contexts').put({ id: next.id, current, previous } satisfies SaveRecord); await done;
  return next.revision;
}
export class SaveQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private autosave: { snapshot: Context; resolve: (revision: number) => void; reject: (error: unknown) => void } | null = null;
  save(context: Context, auto = false): Promise<number> {
    const snapshot = copy(context);
    if (auto && this.autosave) { this.autosave.snapshot = snapshot; return this.chain.then(() => context.revision); }
    if (auto) {
      return new Promise((resolve, reject) => {
        const job = { snapshot, resolve, reject }; this.autosave = job;
        this.chain = this.chain.catch(() => {}).then(async () => { this.autosave = null; try { const revision = await writeContext(job.snapshot); context.revision = revision; resolve(revision); } catch (e) { reject(e); } });
      });
    }
    const job = this.chain.catch(() => {}).then(async () => { const revision = await writeContext(snapshot); context.revision = revision; return revision; }); this.chain = job; return job;
  }
  async flush() { await this.chain; }
}
export async function claimContext(id: string): Promise<() => void> {
  if (!navigator.locks) throw new Error('This browser does not support safe expedition ownership. Open the game in a current desktop browser over localhost or HTTPS.');
  return new Promise((resolve, reject) => { void navigator.locks.request(`infinicave:${id}`, { ifAvailable: true }, async lock => { if (!lock) { reject(new Error('This expedition is open in another tab. Close it there before continuing here.')); return; } await new Promise<void>(release => resolve(release)); }).catch(reject); });
}
export async function deleteContext(id: string) { const release = await claimContext(id); try { const d = await db(), tx = d.transaction('contexts', 'readwrite'), done = committed(tx); tx.objectStore('contexts').delete(id); await done; } finally { release(); } }
export async function renameContext(id: string, name: string) { const release = await claimContext(id); try { const { context } = await loadContext(id); context.name = name.trim().slice(0, 60) || context.name; await writeContext(context); } finally { release(); } }
export async function importContext(file: File): Promise<Context> {
  if (file.size > MAX_IMPORT) throw new Error('Save files must be 25 MiB or smaller.');
  let data: unknown; try { data = JSON.parse(await file.text()); } catch { throw new Error('This file is not valid JSON.'); }
  const context = await validateEnvelope(data); context.sourceId = context.sourceId || context.id; context.id = crypto.randomUUID(); context.revision = 0; context.name = `${context.name.slice(0, 49)} · imported`; context.created = new Date().toISOString(); context.lastPlayed = context.created;
  context.revision = await writeContext(context); return context;
}
export async function exportContext(context: Context) {
  const payload = copy(context), envelope: Envelope = { payload, checksum: await digest(payload), previousRevision: null }, blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `infinicave-${context.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 50)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
