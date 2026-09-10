import { Database } from 'bun:sqlite';
import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import type { Workspace, Canvas, CanvasObject, Camera, Item, ObjectPatch } from '../../shared/types';
import { artifactType, objectId } from '../../shared/types';
import { automaticId, automaticType } from '../../shared/presentation';
import { placeObject } from '../../web/canvas/geometry';
export class Store {
  readonly db: Database;
  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS canvases (thread_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), pan_x REAL NOT NULL DEFAULT 0, pan_y REAL NOT NULL DEFAULT 0, zoom REAL NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS canvas_objects (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES canvases(thread_id) ON DELETE CASCADE, turn_id TEXT, item_id TEXT, type TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, width REAL NOT NULL, height REAL NOT NULL, collapsed INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, z_index INTEGER NOT NULL DEFAULT 0, manually_positioned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS objects_thread ON canvas_objects(thread_id); `);
    const columns = this.db.query('PRAGMA table_info(canvases)').all() as { name: string }[];
    if (!columns.some(column => column.name === 'viewport_initialized')) this.db.exec('ALTER TABLE canvases ADD COLUMN viewport_initialized INTEGER NOT NULL DEFAULT 0');
    const objectColumns = this.db.query('PRAGMA table_info(canvas_objects)').all() as { name: string }[];
    this.db.transaction(() => {
      if (!objectColumns.some(column => column.name === 'pinned')) {
        this.db.exec('ALTER TABLE canvas_objects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
        // Retain explicit file views and user-arranged/resized legacy cards, including hidden ones.
        this.db.exec(`UPDATE canvas_objects SET pinned=1 WHERE type != 'conversation' AND
          (manually_positioned=1 OR type='file' OR width != 480 OR height != CASE WHEN type='plan' THEN 300 ELSE 340 END)`);
        this.db.exec(`UPDATE canvas_objects SET x=(SELECT c.x+c.width+80 FROM canvas_objects c WHERE c.thread_id=canvas_objects.thread_id AND c.type='conversation'),
          y=(SELECT c.y FROM canvas_objects c WHERE c.thread_id=canvas_objects.thread_id AND c.type='conversation')+CASE WHEN type='diff' THEN 328 ELSE 0 END
          WHERE type IN ('plan','diff') AND pinned=0`);
      }
      if (!columns.some(column => column.name === 'selected_turn_id')) this.db.exec('ALTER TABLE canvases ADD COLUMN selected_turn_id TEXT');
      this.db.exec('PRAGMA user_version = 3');
    })();
  }
  workspaces(): Workspace[] { return this.db.query('SELECT id, name, path FROM workspaces ORDER BY created_at').all() as Workspace[]; }
  workspace(id: string): Workspace {
    const workspace = this.db.query('SELECT id, name, path FROM workspaces WHERE id = ?').get(id) as Workspace | null;
    if (!workspace) throw new Error('Workspace not found'); return workspace;
  }
  async addWorkspace(name: string, path: string) {
    if (!isAbsolute(path)) throw new Error('Workspace path must be absolute');
    const canonical = await realpath(path);
    if (!(await stat(canonical)).isDirectory()) throw new Error('Workspace path is not a directory');
    await access(canonical, constants.R_OK | constants.X_OK);
    const workspace = { id: crypto.randomUUID(), name: name.trim() || basename(canonical), path: canonical };
    this.db.query('INSERT INTO workspaces VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET name = excluded.name').run(workspace.id, workspace.name, workspace.path, Date.now());
    return this.workspaces().find(w => w.path === canonical)!;
  }
  attach(threadId: string, workspaceId: string) {
    const existing = this.db.query('SELECT workspace_id FROM canvases WHERE thread_id = ?').get(threadId) as { workspace_id: string } | null;
    if (existing && existing.workspace_id !== workspaceId) throw new Error('Canvas belongs to another workspace');
    this.db.query('INSERT OR IGNORE INTO canvases (thread_id, workspace_id, updated_at) VALUES (?, ?, ?)').run(threadId, workspaceId, Date.now());
    this.insert({ id: `${threadId}:conversation`, threadId, type: 'conversation', x: 100, y: 100, width: 740, height: 700, collapsed: false, hidden: false, manuallyPositioned: false, pinned: false, zIndex: 1 });
    return this.canvas(threadId);
  }
  canvas(threadId: string): Canvas {
    const row = this.db.query('SELECT pan_x, pan_y, zoom, viewport_initialized, selected_turn_id FROM canvases WHERE thread_id = ?').get(threadId) as { pan_x: number; pan_y: number; zoom: number; viewport_initialized: number; selected_turn_id: string | null } | null;
    if (!row) throw new Error('Canvas not found');
    const objects = (this.db.query(`SELECT id, thread_id AS threadId, turn_id AS turnId, item_id AS itemId, type, x, y, width, height, collapsed, hidden, z_index AS zIndex, manually_positioned AS manuallyPositioned, pinned FROM canvas_objects WHERE thread_id = ? ORDER BY created_at, rowid`).all(threadId) as CanvasObject[]).map(o => ({ ...o, collapsed: !!o.collapsed, hidden: !!o.hidden, manuallyPositioned: !!o.manuallyPositioned, pinned: !!o.pinned }));
    return { threadId, selectedTurnId: row.selected_turn_id, viewportInitialized: !!row.viewport_initialized, camera: { x: row.pan_x, y: row.pan_y, zoom: row.zoom }, objects };
  }
  private insert(o: CanvasObject) {
    this.db.query(`INSERT OR IGNORE INTO canvas_objects (id, thread_id, turn_id, item_id, type, x, y, width, height, collapsed, hidden, z_index, manually_positioned, created_at, updated_at, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(o.id, o.threadId, o.turnId ?? null, o.itemId ?? null, o.type, o.x, o.y, o.width, o.height, +o.collapsed, +o.hidden, o.zIndex, +o.manuallyPositioned, Date.now(), Date.now(), +o.pinned);
  }
  reconcile(threadId: string, turnId: string, item: Item): CanvasObject | undefined {
    const type = automaticType(item); if (!type) return;
    const canvas = this.canvas(threadId), id = automaticId(threadId, turnId, item);
    const existing = canvas.objects.find(o => o.id === id); if (existing) return existing;
    const o: CanvasObject = { id, threadId, turnId, itemId: item.id, type, ...placeObject(canvas.objects, turnId, type, 480, type === 'activity' ? 700 : 340), width: 480, height: type === 'plan' ? 300 : type === 'activity' ? 700 : 340, collapsed: false, hidden: false, manuallyPositioned: false, pinned: type === 'file', zIndex: 2 };
    this.insert(o); return o;
  }
  keep(threadId: string, turnId: string, item: Item) {
    const type = artifactType(item); if (!type) throw new Error('This item cannot be kept on the canvas');
    const id = objectId(threadId, turnId, item), canvas = this.canvas(threadId);
    if (!canvas.objects.some(o => o.id === id)) this.insert({ id, threadId, turnId, itemId: item.id, type,
      ...placeObject(canvas.objects, turnId, type), width: 480, height: 340,
      collapsed: false, hidden: false, manuallyPositioned: false, pinned: true, zIndex: 2 });
    return this.update(threadId, id, { pinned: true, hidden: false });
  }
  selectTurn(threadId: string, turnId: string | null) {
    this.db.query('UPDATE canvases SET selected_turn_id=? WHERE thread_id=?').run(turnId, threadId);
  }
  update(threadId: string, id: string, patch: ObjectPatch) {
    const current = this.canvas(threadId).objects.find(o => o.id === id);
    if (!current) throw new Error('Canvas object not found in this thread');
    for (const key of ['x', 'y', 'width', 'height', 'zIndex'] as const) if (patch[key] !== undefined && (!Number.isFinite(patch[key]) || Math.abs(patch[key]!) > 1e7)) throw new Error('Invalid canvas geometry');
    for (const key of ['collapsed', 'hidden', 'manuallyPositioned', 'pinned'] as const) if (patch[key] !== undefined && typeof patch[key] !== 'boolean') throw new Error('Invalid canvas state');
    const o = { ...current, ...patch };
    if (o.width < 260 || o.width > 4000 || o.height < 140 || o.height > 4000) throw new Error('Card size is outside supported bounds');
    if (o.type === 'conversation' && o.hidden) throw new Error('The conversation cannot be hidden');
    this.db.query('UPDATE canvas_objects SET x=?, y=?, width=?, height=?, collapsed=?, hidden=?, z_index=?, manually_positioned=?, pinned=?, updated_at=? WHERE id=? AND thread_id=?').run(o.x, o.y, o.width, o.height, +o.collapsed, +o.hidden, o.zIndex, +o.manuallyPositioned, +o.pinned, Date.now(), id, threadId);
    return o;
  }
  viewport(threadId: string, camera: Camera) {
    if (![camera.x, camera.y, camera.zoom].every(Number.isFinite) || camera.zoom < .25 || camera.zoom > 2 || Math.abs(camera.x) > 1e7 || Math.abs(camera.y) > 1e7) throw new Error('Invalid viewport');
    this.db.query('UPDATE canvases SET pan_x=?, pan_y=?, zoom=?, updated_at=?, viewport_initialized=1 WHERE thread_id=?').run(camera.x, camera.y, camera.zoom, Date.now(), threadId);
  }
  canvasIds(workspaceId: string) { return (this.db.query('SELECT thread_id FROM canvases WHERE workspace_id = ?').all(workspaceId) as { thread_id: string }[]).map(r => r.thread_id); }
  remove(threadId: string, workspaceId: string) { this.db.query('DELETE FROM canvases WHERE thread_id=? AND workspace_id=?').run(threadId, workspaceId); }
  close() { this.db.close(); }
}
