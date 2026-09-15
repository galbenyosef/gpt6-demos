import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { applyOverrides, disposeScene, frameCamera, loadScene, REVIEW_VIEWS, studioScene } from "../../shared/scene";
import { validateScene } from "../modelling/runtime";
import type { Override } from "../../shared/domain";
function base64(buffer: ArrayBuffer) { const bytes = new Uint8Array(buffer); let s = ""; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(s); }
async function render(input: { scene: Record<string, unknown>; overrides: Override[]; textureUrls: Record<string, string>; limits: Parameters<typeof validateScene>[1] }) {
  const root = await loadScene(input.scene, input.textureUrls); applyOverrides(root, input.overrides);
  const diagnostics = validateScene(root, input.limits), scene = studioScene("#737983"); scene.add(root);
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(768, 768); renderer.setPixelRatio(1); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  const camera = new T.PerspectiveCamera(35, 1, .01, 1000);
  try {
    const previews: { view: string; data: string }[] = [];
    for (const view of REVIEW_VIEWS) { frameCamera(camera, root, view); renderer.render(scene, camera); const gl = renderer.getContext(); const pixels = new Uint8Array(768 * 768 * 4); gl.readPixels(0, 0, 768, 768, gl.RGBA, gl.UNSIGNED_BYTE, pixels); let changed = 0; for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i]! - pixels[0]!) + Math.abs(pixels[i + 1]! - pixels[1]!) + Math.abs(pixels[i + 2]! - pixels[2]!) > 8) changed++; if (view === "front" && changed < 25) throw Error("Render has no visible model geometry"); previews.push({ view, data: renderer.domElement.toDataURL("image/png").split(",")[1]! }); }
    const exporter = new GLTFExporter(); const glb = await exporter.parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 4096 }) as ArrayBuffer;
    const gltf = await exporter.parseAsync(root, { binary: false, onlyVisible: true, maxTextureSize: 4096 });
    // Round-trip every export through the same loader used by the viewer.
    const reloaded = await new GLTFLoader().parseAsync(glb, ""); validateScene(reloaded.scene, input.limits); disposeScene(reloaded.scene);
    return { previews, glb: base64(glb), gltf: JSON.stringify(gltf), diagnostics };
  } finally { disposeScene(root); renderer.dispose(); renderer.forceContextLoss(); }
}
async function importGlb(data: string) { const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0)); const result = await new GLTFLoader().parseAsync(bytes.buffer, ""); const diagnostics = validateScene(result.scene); const scene = result.scene.toJSON(); disposeScene(result.scene); return { scene, diagnostics, metadata: { imported: true } }; }
async function inspectImage(data: string) { const response = await fetch(data); const bitmap = await createImageBitmap(await response.blob()); const size = { width: bitmap.width, height: bitmap.height }; bitmap.close(); if (size.width > 4096 || size.height > 4096 || size.width * size.height > 16777216) throw Error("Images must be no larger than 4096 × 4096"); return size; }
Object.assign(globalThis, { assemblavatarRender: render, assemblavatarImport: importGlb, assemblavatarInspectImage: inspectImage });

const operations = { render, importGlb, inspectImage };
window.addEventListener("message", async event => {
  if (event.source !== parent || !Object.hasOwn(operations, event.data?.operation)) return;
  try {
    const result = await (operations[event.data.operation as keyof typeof operations] as (input: any) => Promise<unknown>)(event.data.input);
    parent.postMessage({ result }, "*");
  } catch (error) { parent.postMessage({ error: error instanceof Error ? error.message : "Rendering failed" }, "*"); }
});
parent.postMessage({ ready: true }, "*");
