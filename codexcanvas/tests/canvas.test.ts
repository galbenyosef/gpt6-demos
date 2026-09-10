import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/server/persistence/Store';
import { screenToWorld, worldToScreen, zoomAt, fit } from '../src/web/canvas/geometry';
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
    for (let i = 0; i < commands.length; i++) for (let j = i + 1; j < commands.length; j++) { const a = commands[i]!, b = commands[j]!; expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true); }
  } finally { store.close(); await rm(dir, { recursive: true }); }
});
test('workspace validation rejects relative paths and files', async () => {
  const store = new Store(':memory:');
  try { await expect(store.addWorkspace('Bad', '.')).rejects.toThrow('absolute'); await expect(store.addWorkspace('File', join(process.cwd(), 'package.json'))).rejects.toThrow('not a directory'); }
  finally { store.close(); }
});
