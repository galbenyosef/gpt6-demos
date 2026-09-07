import { type Project } from './document';
import { validateProject, LIMITS } from './validation';
export type Revision = { document: Project; checksum: string };
type RecordEntry = { id: string; current: Revision; previous?: Revision };
export async function checksum(p: Project) {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export class RecoveryError extends Error {
  constructor(readonly previous: Project) {
    super('The latest revision is damaged. Restore the previous valid revision?');
  }
}
export class Store {
  private db!: IDBDatabase;
  private queues = new Map<string, Promise<void>>();
  private releases = new Map<string, () => void>();
  async init() {
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('tonada', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('projects', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  private async record(id: string): Promise<RecordEntry | undefined> {
    return new Promise((resolve, reject) => {
      const r = this.db.transaction('projects').objectStore('projects').get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async list(): Promise<Project[]> {
    const records: RecordEntry[] = await new Promise((resolve, reject) => {
      const r = this.db.transaction('projects').objectStore('projects').getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return records
      .map((r) => r.current.document)
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }
  async acquire(id: string) {
    if (this.releases.has(id)) return true;
    if (!navigator.locks) throw new Error('This browser needs Web Locks to safely save projects.');
    return new Promise<boolean>((resolve, reject) => {
      navigator.locks
        .request(`tonada:${id}`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          await new Promise<void>((release) => {
            this.releases.set(id, release);
            resolve(true);
          });
        })
        .catch(reject);
    });
  }
  release(id: string) {
    this.releases.get(id)?.();
    this.releases.delete(id);
  }
  async load(id: string) {
    const record = await this.record(id);
    if (!record) throw new Error('Project not found.');
    try {
      validateProject(record.current.document);
      if ((await checksum(record.current.document)) !== record.current.checksum)
        throw new Error('Checksum mismatch.');
      return structuredClone(record.current.document);
    } catch (error) {
      if (
        record.previous &&
        (await checksum(record.previous.document)) === record.previous.checksum
      ) {
        validateProject(record.previous.document);
        throw new RecoveryError(structuredClone(record.previous.document));
      }
      throw error;
    }
  }
  save(project: Project): Promise<void> {
    if (!this.releases.has(project.id))
      return Promise.reject(new Error('Project is open in another tab.'));
    const snapshot = structuredClone(project);
    const previous = this.queues.get(project.id) ?? Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        validateProject(snapshot);
        const old = await this.record(snapshot.id);
        snapshot.revision = Math.max(snapshot.revision, old?.current.document.revision ?? 0) + 1;
        snapshot.updated = new Date().toISOString();
        const current = { document: snapshot, checksum: await checksum(snapshot) };
        await new Promise<void>((resolve, reject) => {
          const tx = this.db.transaction('projects', 'readwrite');
          tx.objectStore('projects').put({ id: snapshot.id, current, previous: old?.current });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('Save interrupted.'));
        });
      });
    this.queues.set(project.id, task);
    return task;
  }
  async remove(id: string) {
    if (!(await this.acquire(id))) throw new Error('Project is open in another tab.');
    await this.queues.get(id)?.catch(() => {});
    await new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction('projects', 'readwrite');
      tx.objectStore('projects').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.release(id);
  }
  async flush(id: string) {
    await this.queues.get(id);
  }
}
export async function exportProject(p: Project) {
  return JSON.stringify({ format: 'tonada', document: p, checksum: await checksum(p) }, null, 0);
}
export async function importProject(file: File) {
  if (file.size > LIMITS.importBytes) throw new Error('Project file exceeds 100 MiB.');
  const parsed = JSON.parse(await file.text());
  if (parsed.format !== 'tonada') throw new Error('Not a Tonada project.');
  const p = validateProject(parsed.document);
  if ((await checksum(p)) !== parsed.checksum) throw new Error('Project checksum mismatch.');
  const copy = structuredClone(p);
  copy.sourceId = p.id;
  copy.id = crypto.randomUUID();
  copy.revision = 0;
  copy.created = copy.updated = copy.lastOpened = new Date().toISOString();
  return copy;
}
export function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[/\\]/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
