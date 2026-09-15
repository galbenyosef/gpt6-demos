import * as T from "three";
import type { Override } from "./domain";
export function disposeScene(root: T.Object3D) { const textures = new Set<T.Texture>(), materials = new Set<T.Material>(), geometries = new Set<T.BufferGeometry>(); root.traverse(o => { if (o instanceof T.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { materials.add(m); for (const v of Object.values(m)) if (v instanceof T.Texture) textures.add(v); } } }); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); }
export function applyOverrides(root: T.Object3D, overrides: Override[]) {
  const objects = new Map<string, T.Object3D>(); root.traverse(o => objects.set(o.userData.objectId, o));
  for (const change of overrides) if (change.createGroup && !objects.has(change.objectId)) { const group = new T.Group(); group.name = change.createGroup.name; group.userData.objectId = change.objectId; root.add(group); objects.set(change.objectId, group); }
  for (const change of overrides) {
    const o = objects.get(change.objectId); if (!o) continue;
    if (change.parentId && o !== root) { const parent = objects.get(change.parentId); let p = parent; while (p && p !== o) p = p.parent ?? undefined; if (p === o) throw Error("Grouping would create a cycle"); if (parent) parent.attach(o); }
    if (change.position) o.position.fromArray(change.position);
    if (change.rotation) o.rotation.set(...change.rotation);
    if (change.scale) o.scale.fromArray(change.scale);
    if (change.visible !== undefined) o.visible = change.visible;
    if (change.material) o.traverse(n => { if (n instanceof T.Mesh) { for (const material of Array.isArray(n.material) ? n.material : [n.material]) { if (material instanceof T.MeshStandardMaterial) { material.color.set(change.material!.baseColor); material.roughness = change.material!.roughness; material.metalness = change.material!.metalness; material.needsUpdate = true; } } } });
    if (change.deleted && o !== root) o.removeFromParent();
  }
  root.updateMatrixWorld(true);
}
export async function loadScene(json: Record<string, unknown>, textureUrls: Record<string, string> = {}) {
  const root = await new T.ObjectLoader().parseAsync(json as unknown as T.Object3DJSON);
  const pending: Promise<void>[] = [];
  root.traverse(o => { if (o instanceof T.Mesh && o.userData.textureAssetId) { const url = textureUrls[o.userData.textureAssetId]; if (!url) throw Error("Missing texture asset"); pending.push(new T.TextureLoader().loadAsync(url).then(texture => { texture.colorSpace = T.SRGBColorSpace; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m instanceof T.MeshStandardMaterial) { m.map = texture; m.needsUpdate = true; } } })); } });
  await Promise.all(pending); return root;
}
export const REVIEW_VIEWS = ["front", "left-45", "left", "right-45", "right", "back", "top"] as const;
export function frameCamera(camera: T.PerspectiveCamera, root: T.Object3D, view = "perspective") {
  root.updateMatrixWorld(true); const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3()), centre = box.getCenter(new T.Vector3());
  const radius = size.length() / 2, distance = Math.max(.1, radius / Math.sin(T.MathUtils.degToRad(camera.fov / 2)) * 1.15 / Math.min(1, camera.aspect));
  const directions: Record<string, [number, number, number]> = { front: [0, 0, 1], "left-45": [-1, 0, 1], left: [-1, 0, 0], "right-45": [1, 0, 1], right: [1, 0, 0], back: [0, 0, -1], top: [0, 1, .0001], perspective: [1, .65, 1.3] };
  camera.position.copy(centre).add(new T.Vector3(...(directions[view] ?? directions.perspective!)).normalize().multiplyScalar(distance)); camera.near = Math.max(.001, distance / 1000); camera.far = distance * 20; camera.up.set(0, 1, 0); camera.lookAt(centre); camera.updateProjectionMatrix(); return centre;
}
export function studioScene(background = "#202733") { const scene = new T.Scene(); scene.background = new T.Color(background); scene.add(new T.HemisphereLight(0xffffff, 0x5d657a, 2)); const key = new T.DirectionalLight(0xfff5eb, 3); key.position.set(4, 7, 6); scene.add(key); const fill = new T.DirectionalLight(0xd5e6ff, 1.5); fill.position.set(-5, 2, -3); scene.add(fill); return scene; }
