import { mkdir, rename, readdir, unlink, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Assemblage, SourceProgram, Revision, ModelArtifact, GenerationJob, AssetMetadata, BuildAttempt, Message } from "../../shared/domain";
export const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export const now = () => new Date().toISOString();
export function validId(value: string) { if (!/^[a-z]+_[a-f0-9-]{36}$/.test(value)) throw Error("Invalid identifier"); return value; }
export class Repository<T extends { id: string }> {
  constructor(readonly dir: string) {}
  private path(id: string) { return join(this.dir, `${validId(id)}.json`); }
  async put(value: T): Promise<void> { await mkdir(this.dir, { recursive: true, mode: 0o700 }); const path = this.path(value.id), temp = `${path}.${crypto.randomUUID()}.tmp`; await Bun.write(temp, JSON.stringify(value, null, 2)); await rename(temp, path); }
  async get(id: string): Promise<T | null> { try { return JSON.parse(await readFile(this.path(id), "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
  async require(id: string): Promise<T> { const value = await this.get(id); if (!value) throw new NotFound(); return value; }
  async list(): Promise<T[]> { await mkdir(this.dir, { recursive: true, mode: 0o700 }); const files = await readdir(this.dir); const values = await Promise.all(files.filter(f => f.endsWith(".json")).map(async f => { try { return JSON.parse(await readFile(join(this.dir, f), "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } })); return values.filter(v => v !== null) as T[]; }
  async delete(id: string) { try { await unlink(this.path(id)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } }
}
export class NotFound extends Error { constructor() { super("Resource not found"); } }
export interface AssetStore { put(bytes: Uint8Array, metadata: Omit<AssetMetadata, "id" | "sha256" | "size" | "createdAt">): Promise<AssetMetadata>; get(id: string): Promise<Uint8Array>; delete(id: string): Promise<void>; exists(id: string): Promise<boolean>; getMetadata(id: string): Promise<AssetMetadata> }
export class FileSystemAssetStore implements AssetStore {
  readonly metadata: Repository<AssetMetadata>;
  constructor(readonly dir: string) { this.metadata = new Repository(join(dir, "metadata")); }
  async put(bytes: Uint8Array, metadata: Omit<AssetMetadata, "id" | "sha256" | "size" | "createdAt">) { await mkdir(this.dir, { recursive: true, mode: 0o700 }); const value: AssetMetadata = { ...metadata, id: id("asset"), size: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), createdAt: now() }; await Bun.write(join(this.dir, value.id), bytes); await this.metadata.put(value); return value; }
  async get(id: string) { await this.metadata.require(id); return new Uint8Array(await Bun.file(join(this.dir, validId(id))).arrayBuffer()); }
  getMetadata(id: string) { return this.metadata.require(id); }
  async exists(id: string) { return Boolean(await this.metadata.get(id)) && await Bun.file(join(this.dir, validId(id))).exists(); }
  async delete(id: string) { await this.metadata.delete(id); try { await unlink(join(this.dir, validId(id))); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } }
}
export class Store {
  metrics: Repository<{ id: string; [key: string]: unknown }>;
  assemblages: Repository<Assemblage>; programs: Repository<SourceProgram>; revisions: Repository<Revision>; models: Repository<ModelArtifact>; jobs: Repository<GenerationJob>; attempts: Repository<BuildAttempt>; messages: Repository<Message>; assets: FileSystemAssetStore;
  constructor(root: string) { root = resolve(root); this.metrics = new Repository(join(root, "metrics")); this.assemblages = new Repository(join(root, "assemblages")); this.programs = new Repository(join(root, "source-programs")); this.revisions = new Repository(join(root, "revisions")); this.models = new Repository(join(root, "models")); this.jobs = new Repository(join(root, "jobs")); this.attempts = new Repository(join(root, "attempts")); this.messages = new Repository(join(root, "messages")); this.assets = new FileSystemAssetStore(join(root, "assets")); }
  async recover() { for (const j of await this.jobs.list()) if (["queued", "running"].includes(j.status)) { j.status = "failed"; j.phase = "failed"; j.error = "Server restarted before this job finished"; j.updatedAt = now(); await this.jobs.put(j); const a = await this.assemblages.get(j.assemblageId); if (a) { a.status = a.currentModelId ? "ready" : "failed"; await this.assemblages.put(a); } } }
}
