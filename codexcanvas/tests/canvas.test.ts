import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isVisible } from '../src/shared/presentation';
import { Store } from '../src/server/persistence/Store';
import { screenToWorld, worldToScreen, zoomAt, fit, placeObject } from '../src/web/canvas/geometry';
test('camera transforms, anchored zoom and fit work across pan/zoom', () => {
  const c = { x: -30, y: 180, zoom: .7 }, world = screenToWorld(300, 200, c);
  expect(worldToScreen(world.x, world.y, c)).toEqual({ x: 300, y: 200 });
  const zoom = zoomAt(c, 300, 200, 2); expect(screenToWorld(300, 200, zoom).x).toBeCloseTo(world.x);
  expect(zoomAt(c, 0, 0, 100).zoom).toBe(2); expect(zoomAt(c, 0, 0, .01).zoom).toBe(.25); expect(fit([], 1000, 800).zoom).toBe(1);
});
test('SQLite restores positions, resized/collapsed/hidden state and 70% zoom without a transcript', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'canvas-store-')); const db = join(dir, 'canvas.db'); let store = new Store(db);
  try {
    const workspace = await store.addWorkspace('Workspace', dir);
    store.attach('thread-a', workspace.id); store.attach('thread-b', workspace.id);
    const diff = store.reconcile('thread-a', 'turn', { id: 'change', type: 'fileChange', changes: [{ path: 'file.ts', kind: 'update', diff: 'secret transcript' }] })!;
    const second = store.reconcile('thread-a', 'turn', { id: 'diff', type: 'turnDiff', diff: 'same turn' })!; expect(diff.id).toBe(second.id);
    store.update('thread-a', diff.id, { x: 1500, y: 50, width: 700, height: 500, collapsed: true, hidden: true, manuallyPositioned: true });
    store.viewport('thread-a', { x: -350, y: 10, zoom: .7 }); store.close(); store = new Store(db);
    const restored = store.canvas('thread-a'); expect(restored.camera.zoom).toBe(.7); expect(restored.objects.find(o => o.id === diff.id)).toMatchObject({ x: 1500, y: 50, width: 700, collapsed: true, manuallyPositioned: true, hidden: true });
    expect(store.reconcile('thread-a', 'turn', { id: 'diff', type: 'turnDiff' })!.x).toBe(1500);
    expect(() => store.update('thread-b', diff.id, { x: 5 })).toThrow('not found');
    expect(() => store.update('thread-a', 'thread-a:conversation', { hidden: true })).toThrow('cannot be hidden');
    expect(() => store.viewport('thread-a', { x: 0, y: 0, zoom: .1 })).toThrow('Invalid');
    const columns = store.db.query('PRAGMA table_info(canvas_objects)').all() as { name: string }[]; expect(columns.map(c => c.name)).not.toContain('text'); expect(columns.map(c => c.name)).not.toContain('content');
    const commands = Array.from({ length: 100 }, (_, n) => store.reconcile('thread-b', `t${Math.floor(n / 5)}`, { id: `c${n}`, type: 'commandExecution' })!);
    expect(new Set(commands.map(o => o.id)).size).toBe(20);
    expect(new Set(commands.map(o => `${o.x}:${o.y}`)).size).toBe(1);
    const kept = store.keep('thread-b', 't0', { id:'c0', type:'commandExecution' })!;
    expect(kept.pinned).toBe(true); expect(kept.type).toBe('command');
    store.selectTurn('thread-b', 't0'); expect(store.canvas('thread-b').selectedTurnId).toBe('t0');
    expect(store.keep('thread-b','t0',{ id:'c0',type:'commandExecution' })!.id).toBe(kept.id);
    store.update('thread-b',kept.id,{pinned:false});
    expect(store.canvas('thread-b').objects.find(o=>o.id===kept.id)?.pinned).toBe(false);
  } finally { store.close(); await rm(dir, { recursive: true }); }
});
test('workspace validation rejects relative paths and files', async () => {
  const store = new Store(':memory:');
  try { await expect(store.addWorkspace('Bad', '.')).rejects.toThrow('absolute'); await expect(store.addWorkspace('File', join(process.cwd(), 'package.json'))).rejects.toThrow('not a directory'); }
  finally { store.close(); }
});

test('legacy migration preserves arranged, resized, hidden and file cards without retaining automatic clutter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'canvas-migration-')), path = join(dir, 'canvas.db'); let store = new Store(path);
  try {
    const workspace = await store.addWorkspace('Legacy', dir); store.attach('thread', workspace.id);
    const moved = store.keep('thread', 'old', { id:'moved', type:'commandExecution' });
    store.update('thread',moved.id,{ x:2100,y:900,manuallyPositioned:true,hidden:true,collapsed:true });
    const resized = store.keep('thread','old',{ id:'resized',type:'webSearch' });
    store.update('thread',resized.id,{width:620,height:510});
    const plain = store.keep('thread','old',{id:'automatic',type:'commandExecution'});
    const file = store.keep('thread','old',{id:'file',type:'file'});
    const plan = store.reconcile('thread','old',{id:'plan-item',type:'plan'})!;
    store.update('thread',plan.id,{x:5000,y:7000});
    // Recreate the pre-grouping schema: no keep state or turn selection existed.
    store.db.exec('ALTER TABLE canvas_objects DROP COLUMN pinned; ALTER TABLE canvases DROP COLUMN selected_turn_id; PRAGMA user_version=2');
    store.close(); store = new Store(path);
    let canvas = store.canvas('thread');
    expect(canvas.objects).toHaveLength(6); expect(canvas.selectedTurnId).toBeNull();
    expect(canvas.objects.find(o=>o.id===moved.id)).toMatchObject({pinned:true,x:2100,y:900,hidden:true,collapsed:true});
    expect(canvas.objects.find(o=>o.id===resized.id)).toMatchObject({pinned:true,width:620,height:510});
    expect(canvas.objects.find(o=>o.id===plain.id)?.pinned).toBe(false);
    expect(canvas.objects.find(o=>o.id===file.id)?.pinned).toBe(true);
    expect(canvas.objects.find(o=>o.id===plan.id)).toMatchObject({pinned:false,x:920,y:100});
    store.update('thread',moved.id,{pinned:false}); store.selectTurn('thread','old'); store.close(); store=new Store(path);
    canvas=store.canvas('thread'); expect(canvas.selectedTurnId).toBe('old');
    expect(canvas.objects.find(o=>o.id===moved.id)?.pinned).toBe(false);
  } finally { store.close(); await rm(dir,{recursive:true}); }
});

test('placement and visibility exclude history and hidden cards and use collapsed header footprints', async () => {
  const store=new Store(':memory:');
  try {
    const workspace=await store.addWorkspace('Test',process.cwd()); store.attach('thread',workspace.id);
    const old=store.reconcile('thread','old',{id:'command',type:'commandExecution'})!;
    let objects=store.canvas('thread').objects;
    expect(isVisible(old,'new')).toBe(false);
    const base=placeObject(objects,'new','activity',480,700);
    expect(base).toEqual({x:old.x,y:old.y});
    store.update('thread',old.id,{pinned:true,collapsed:true}); objects=store.canvas('thread').objects;
    expect(isVisible(objects.find(o=>o.id===old.id)!,'new')).toBe(true);
    expect(placeObject(objects,'new','activity',480,700).y).toBe(old.y+46+28);
    store.update('thread',old.id,{hidden:true}); objects=store.canvas('thread').objects;
    expect(placeObject(objects,'new','activity',480,700)).toEqual(base);
  } finally {store.close();}
});
