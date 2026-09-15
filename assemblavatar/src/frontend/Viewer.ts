import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { applyOverrides, disposeScene, frameCamera, loadScene, studioScene } from "../shared/scene";
import type { Override } from "../shared/domain";
export interface TreeNode { id: string; name: string; type: string; visible: boolean; depth: number }
export class Viewer {
  readonly renderer: T.WebGLRenderer; readonly scene = studioScene("#202733"); readonly camera = new T.PerspectiveCamera(35, 1, .01, 1000);
  readonly controls: OrbitControls; readonly gizmo: TransformControls;
  root?: T.Object3D; selected?: T.Object3D; private bounds?: T.BoxHelper; private selection?: T.BoxHelper; private grid: T.GridHelper;
  private observer: ResizeObserver; private frame = 0; private disposed = false; private token = 0; private editable = true; private wireframe = false; private showBounds = false; private down: [number, number] = [0, 0]; private dragging = false;
  onSelection: (o?: T.Object3D) => void = () => {}; onChange: (change: Override) => void = () => {};
  constructor(readonly element: HTMLElement) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D model. Drag to orbit, scroll to zoom, right-drag to pan."); this.renderer.domElement.tabIndex = 0; element.append(this.renderer.domElement);
    this.camera.position.set(5, 4, 7); this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true; this.controls.target.set(0, 1, 0);
    this.grid = new T.GridHelper(20, 40, 0x536175, 0x343f50); this.grid.position.y = -.005; this.scene.add(this.grid);
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement); this.gizmo.setSize(.8); this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener("dragging-changed", e => { this.dragging = Boolean(e.value); this.controls.enabled = !e.value; });
    this.gizmo.addEventListener("mouseUp", () => { if (this.selected) { this.onChange(this.snapshot(this.selected)); this.onSelection(this.selected); } });
    this.renderer.domElement.addEventListener("pointerdown", e => { this.down = [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener("pointerup", e => { if (!this.editable || this.dragging || this.gizmo.axis || e.button !== 0 || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4 || !this.root) return; const rect = this.renderer.domElement.getBoundingClientRect(); const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera); const hit = ray.intersectObject(this.root, true).find(h => { let o: T.Object3D | null = h.object; while (o) { if (!o.visible) return false; o = o.parent; } return true; }); this.select(hit?.object.userData.objectId); });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(element); this.resize();
    const animate = () => { if (this.disposed) return; this.frame = requestAnimationFrame(animate); this.controls.update(); this.selection?.update(); this.bounds?.update(); this.renderer.render(this.scene, this.camera); }; animate();
  }
  private resize() { const width = this.element.clientWidth, height = this.element.clientHeight; if (!width || !height) return; this.renderer.setSize(width, height); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); }
  async load(data: { scene: Record<string, unknown>; overrides: Override[]; textureUrls: Record<string, string> }) { const token = ++this.token; const root = await loadScene(data.scene, data.textureUrls); if (token !== this.token || this.disposed) { disposeScene(root); return; } this.unload(false); this.root = root; applyOverrides(root, data.overrides); this.scene.add(root); this.fit(); this.setWireframe(this.wireframe); this.setBounds(this.showBounds); }
  unload(invalidate = true) { if (invalidate) ++this.token; this.select(); if (this.bounds) { this.bounds.removeFromParent(); this.bounds.geometry.dispose(); (this.bounds.material as T.Material).dispose(); this.bounds = undefined; } if (this.root) { this.root.removeFromParent(); disposeScene(this.root); this.root = undefined; } }
  fit(view = "perspective") { if (this.root) { this.controls.target.copy(frameCamera(this.camera, this.root, view)); this.controls.update(); this.controls.saveState(); } }
  setEditable(value: boolean) { this.editable = value; if (!value) this.gizmo.detach(); else if (this.selected) this.gizmo.attach(this.selected); }
  setTransform(mode: "translate" | "rotate" | "scale") { this.gizmo.setMode(mode); }
  setBackground(light: boolean) { this.scene.background = new T.Color(light ? "#b3bbc3" : "#202733"); }
  setWireframe(enabled: boolean) { this.wireframe = enabled; this.root?.traverse(o => { if (o instanceof T.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof T.MeshStandardMaterial) m.wireframe = enabled; }); }
  setBounds(enabled: boolean) { this.showBounds = enabled; if (this.bounds) this.bounds.visible = enabled; else if (enabled && this.root) { this.bounds = new T.BoxHelper(this.root, 0x90a8c0); this.scene.add(this.bounds); } }
  select(id?: string) { this.gizmo.detach(); if (this.selection) { this.selection.removeFromParent(); this.selection.geometry.dispose(); (this.selection.material as T.Material).dispose(); this.selection = undefined; } this.selected = undefined; this.root?.traverse(o => { if (o.userData.objectId === id) this.selected = o; }); if (this.selected) { this.selection = new T.BoxHelper(this.selected, 0xd8e96a); this.scene.add(this.selection); if (this.editable) this.gizmo.attach(this.selected); } this.onSelection(this.selected); }
  tree(): TreeNode[] { const result: TreeNode[] = []; const visit = (o: T.Object3D, depth: number) => { result.push({ id: o.userData.objectId, name: o.name || "Part", type: o.type, visible: o.visible, depth }); o.children.forEach(c => visit(c, depth + 1)); }; if (this.root) visit(this.root, 0); return result; }
  snapshot(o: T.Object3D): Override { const m = o instanceof T.Mesh ? (Array.isArray(o.material) ? o.material[0] : o.material) : undefined; return { objectId: o.userData.objectId, position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z], scale: o.scale.toArray(), visible: o.visible, material: m instanceof T.MeshStandardMaterial ? { baseColor: `#${m.color.getHexString()}`, roughness: m.roughness, metalness: m.metalness } : undefined }; }
  change(change: Override) { if (!this.root) return; applyOverrides(this.root, [change]); this.onChange(change); this.onSelection(this.selected); }
  dispose() { this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); this.unload(); this.controls.dispose(); this.gizmo.dispose(); this.grid.geometry.dispose(); (this.grid.material as T.Material).dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); }
}
