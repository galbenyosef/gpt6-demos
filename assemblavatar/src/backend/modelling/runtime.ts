import * as T from "three";
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from "three-bvh-csg/src/index.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { PrimitiveOptions, MaterialSpec, Deformation, Vec3 } from "../../shared/modelling-contract";

export interface Limits { maxObjects: number; maxTriangles: number; maxBounds: number }
const defaults: Limits = { maxObjects: 1000, maxTriangles: 300000, maxBounds: 1000 };
const finite = (v: number, max = 1000) => { if (!Number.isFinite(v) || Math.abs(v) > max) throw Error("Non-finite or out-of-range geometry value"); return v; };
const positive = (v: number) => { finite(v); if (v <= 0) throw Error("Dimensions must be positive"); return v; };
const segments = (n = 32) => { if (!Number.isInteger(n) || n < 3 || n > 128) throw Error("Segments must be an integer between 3 and 128"); return n; };
const vector = (v: Vec3) => v.map(x => finite(x)) as Vec3;
export function seededRandom(seed: number) { let s = seed | 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function standard(m: MaterialSpec = {}) { return new T.MeshStandardMaterial({ color: m.baseColor ?? "#9baec4", roughness: Math.max(0, Math.min(1, m.roughness ?? .65)), metalness: Math.max(0, Math.min(1, m.metalness ?? 0)), opacity: m.opacity ?? 1, transparent: (m.opacity ?? 1) < 1, emissive: m.emissive ?? "#000000", side: T.DoubleSide }); }
export function createRuntime(limits = defaults, textureIds: string[] = []) {
  let allocations = 0, allocatedTriangles = 0;
  const count = (o: T.Object3D) => { if (++allocations > limits.maxObjects * 4) throw Error("Object allocation budget exceeded"); return o; };
  const mesh = (g: T.BufferGeometry, o: PrimitiveOptions = {}) => {
    allocatedTriangles += (g.index?.count ?? g.getAttribute("position").count) / 3;
    if (allocatedTriangles > limits.maxTriangles * 4) throw Error("Geometry allocation budget exceeded");
    const result = count(new T.Mesh(g, standard(o.material))) as T.Mesh; result.name = o.name ?? "Part"; return result;
  };
  const edit = (o: T.Object3D, fn: (g: T.BufferGeometry) => void) => { o.traverse(n => { if (n instanceof T.Mesh) { n.geometry = n.geometry.clone(); fn(n.geometry); n.geometry.computeVertexNormals(); n.geometry.computeBoundingBox(); } }); };
  const clone = (o: T.Object3D) => { const c = o.clone(true); c.traverse(n => { count(n); if (n instanceof T.Mesh) { n.geometry = n.geometry.clone(); n.material = Array.isArray(n.material) ? n.material.map(m => m.clone()) : n.material.clone(); } }); return c; };
  const csg = (a: T.Object3D, b: T.Object3D, operation: number) => {
    if (!(a instanceof T.Mesh) || !(b instanceof T.Mesh)) throw Error("Boolean operations require two meshes");
    a.updateMatrixWorld(true); b.updateMatrixWorld(true);
    const ga = a.geometry.clone().applyMatrix4(a.matrixWorld), gb = b.geometry.clone().applyMatrix4(b.matrixWorld);
    for (const g of [ga, gb]) { if (!g.getAttribute("uv")) g.setAttribute("uv", new T.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2)); }
    const aa = new Brush(ga, a.material), bb = new Brush(gb, b.material); aa.updateMatrixWorld(); bb.updateMatrixWorld();
    const result = new Evaluator().evaluate(aa, bb, operation); count(result); result.name = a.name; return result;
  };
  const bounds = (o: T.Object3D) => { o.updateMatrixWorld(true); const b = new T.Box3().setFromObject(o); return { min: b.min.toArray() as Vec3, max: b.max.toArray() as Vec3 }; };
  const runtime = {
    create: {
      box: (o: PrimitiveOptions = {}) => mesh(new T.BoxGeometry(positive(o.width ?? 1), positive(o.height ?? 1), positive(o.depth ?? 1)), o),
      sphere: (o: PrimitiveOptions = {}) => mesh(new T.SphereGeometry(positive(o.radius ?? .5), segments(o.segments), segments(o.segments)), o),
      ellipsoid: (o: PrimitiveOptions = {}) => { const g = new T.SphereGeometry(1, segments(o.segments), segments(o.segments)); g.scale(positive(o.width ?? 1) / 2, positive(o.height ?? 1.25) / 2, positive(o.depth ?? 1) / 2); return mesh(g, o); },
      cylinder: (o: PrimitiveOptions = {}) => mesh(new T.CylinderGeometry(Math.max(0, finite(o.radiusTop ?? o.radius ?? .5)), positive(o.radiusBottom ?? o.radius ?? .5), positive(o.height ?? 1), segments(o.segments)), o),
      cone: (o: PrimitiveOptions = {}) => mesh(new T.ConeGeometry(positive(o.radius ?? .5), positive(o.height ?? 1), segments(o.segments)), o),
      capsule: (o: PrimitiveOptions = {}) => mesh(new T.CapsuleGeometry(positive(o.radius ?? .25), positive(o.length ?? 1), 8, segments(o.segments)), o),
      torus: (o: PrimitiveOptions = {}) => mesh(new T.TorusGeometry(positive(o.radius ?? .5), positive(o.tube ?? .15), 16, segments(o.segments)), o),
      plane: (o: PrimitiveOptions = {}) => mesh(new T.PlaneGeometry(positive(o.width ?? 1), positive(o.height ?? 1)), o),
      group: (name = "Group") => { const g = count(new T.Group()); g.name = name; return g; },
    },
    transform: {
      position: (o: T.Object3D, v: Vec3) => { o.position.fromArray(vector(v)); },
      rotation: (o: T.Object3D, v: Vec3) => { o.rotation.set(...vector(v)); },
      scale: (o: T.Object3D, v: Vec3) => { o.scale.fromArray(vector(v)); },
      translate: (o: T.Object3D, v: Vec3) => { o.position.add(new T.Vector3(...vector(v))); },
    },
    material: {
      standard: (m: MaterialSpec) => m,
      skin: (m: MaterialSpec = {}) => ({ baseColor: "#c99375", roughness: .72, ...m }),
      apply: (o: T.Object3D, m: MaterialSpec) => { o.traverse(n => { if (n instanceof T.Mesh) n.material = standard(m); }); },
    },
    geometry: {
      union: (a: T.Object3D, b: T.Object3D) => csg(a, b, ADDITION),
      subtract: (a: T.Object3D, b: T.Object3D) => csg(a, b, SUBTRACTION),
      intersect: (a: T.Object3D, b: T.Object3D) => csg(a, b, INTERSECTION),
      duplicate: clone,
      mirror: (o: T.Object3D, axis: "x" | "y" | "z") => { const c = clone(o); c.scale[axis] *= -1; c.position[axis] *= -1; return c; },
      extrude: (profile: [number, number][], options: { depth: number; bevel?: number; steps?: number }) => {
        if (profile.length < 3 || profile.length > 256) throw Error("Extrusion requires 3–256 profile points");
        const shape = new T.Shape(profile.map(p => new T.Vector2(finite(p[0]), finite(p[1]))));
        return mesh(new T.ExtrudeGeometry(shape, { depth: positive(options.depth), steps: Math.min(32, Math.max(1, options.steps ?? 1)), bevelEnabled: Boolean(options.bevel), bevelSize: Math.abs(finite(options.bevel ?? 0)), bevelThickness: Math.abs(options.bevel ?? 0), bevelSegments: 3 }));
      },
      lathe: (profile: [number, number][], o: { segments?: number } = {}) => { if (profile.length < 2 || profile.length > 256) throw Error("Lathe requires 2–256 profile points"); return mesh(new T.LatheGeometry(profile.map(p => new T.Vector2(finite(p[0]), finite(p[1]))), segments(o.segments))); },
      loft: (profiles: Vec3[][], o: { closed?: boolean } = {}) => {
        const n = profiles[0]?.length ?? 0;
        if (profiles.length < 2 || profiles.length > 128 || n < 3 || n > 128 || profiles.some(p => p.length !== n)) throw Error("Loft requires equal-length profiles with 3–128 points");
        const positions = profiles.flat().flatMap(vector), indices: number[] = [];
        for (let j = 0; j < profiles.length - 1; j++) for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n; indices.push(a, b, b + n, a, b + n, a + n); }
        if (o.closed) { for (let i = 1; i < n - 1; i++) { indices.push(0, i + 1, i); const k = (profiles.length - 1) * n; indices.push(k, k + i, k + i + 1); } }
        return runtime.geometry.fromVertices({ positions, indices });
      },
      fromVertices: (o: { positions: number[]; indices?: number[]; uvs?: number[] }) => {
        if (o.positions.length % 3 || o.positions.length < 9 || o.positions.length > limits.maxTriangles * 9) throw Error("Invalid position buffer size");
        o.positions.forEach(x => finite(x));
        if (o.indices && (o.indices.length % 3 || o.indices.length > limits.maxTriangles * 3 || o.indices.some(x => !Number.isInteger(x) || x < 0 || x >= o.positions.length / 3))) throw Error("Invalid triangle indices");
        const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(o.positions, 3));
        if (o.indices) g.setIndex(o.indices);
        if (o.uvs) { if (o.uvs.length !== o.positions.length / 3 * 2) throw Error("UV length mismatch"); o.uvs.forEach(x => finite(x)); g.setAttribute("uv", new T.Float32BufferAttribute(o.uvs, 2)); }
        g.computeVertexNormals(); return mesh(g);
      },
      smooth: (o: T.Object3D, options: { iterations?: number; factor?: number } = {}) => {
        const c = clone(o), iterations = Math.min(5, Math.max(1, options.iterations ?? 1)), factor = Math.min(1, Math.max(0, options.factor ?? .25));
        edit(c, g => {
          g.deleteAttribute("normal"); g.deleteAttribute("uv"); const welded = mergeVertices(g); g.copy(welded);
          const p = g.getAttribute("position"), idx = g.index!; const neighbours = Array.from({ length: p.count }, () => new Set<number>());
          for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i), b = idx.getX(i + 1), d = idx.getX(i + 2); neighbours[a]!.add(b).add(d); neighbours[b]!.add(a).add(d); neighbours[d]!.add(a).add(b); }
          for (let k = 0; k < iterations; k++) { const next = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const v = new T.Vector3(); for (const j of neighbours[i]!) v.add(new T.Vector3().fromBufferAttribute(p, j)); v.divideScalar(neighbours[i]!.size || 1).lerp(new T.Vector3().fromBufferAttribute(p, i), 1 - factor); v.toArray(next, i * 3); } g.setAttribute("position", new T.BufferAttribute(next, 3)); for (let i = 0; i < p.count; i++) p.setXYZ(i, next[i * 3]!, next[i * 3 + 1]!, next[i * 3 + 2]!); }
        }); return c;
      },
      subdivide: (o: T.Object3D, levels: number) => {
        if (!Number.isInteger(levels) || levels < 0 || levels > 3) throw Error("Subdivision levels must be 0–3"); const c = clone(o);
        edit(c, g => { for (let l = 0; l < levels; l++) { const src = g.index ? g.toNonIndexed() : g; const p = src.getAttribute("position"); if (p.count / 3 * 4 > limits.maxTriangles) throw Error("Subdivision triangle budget exceeded"); const result: number[] = []; for (let i = 0; i < p.count; i += 3) { const a = new T.Vector3().fromBufferAttribute(p, i), b = new T.Vector3().fromBufferAttribute(p, i + 1), c = new T.Vector3().fromBufferAttribute(p, i + 2), ab = a.clone().lerp(b, .5), bc = b.clone().lerp(c, .5), ca = c.clone().lerp(a, .5); for (const v of [a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca]) result.push(...v.toArray()); } g.setIndex(null); g.deleteAttribute("uv"); g.deleteAttribute("normal"); g.setAttribute("position", new T.Float32BufferAttribute(result, 3)); } }); return c;
      },
      deform: (o: T.Object3D, d: Deformation) => {
        const amount = finite(d.amount ?? .1), axis = d.axis ?? "y", centre = new T.Vector3(...vector(d.centre ?? [0, 0, 0])), radius = positive(d.radius ?? 1), rng = seededRandom(d.seed ?? 1);
        edit(o, g => { const p = g.getAttribute("position"), normal = g.getAttribute("normal"); const box = new T.Box3().setFromBufferAttribute(p as T.BufferAttribute); const span = Math.max(.001, box.max[axis] - box.min[axis]);
          const curve = d.curve && d.curve.length >= 2 ? new T.CatmullRomCurve3(d.curve.map(v => new T.Vector3(...vector(v)))) : undefined;
          for (let i = 0; i < p.count; i++) { const v = new T.Vector3().fromBufferAttribute(p, i), t = (v[axis] - box.min[axis]) / span;
            if (d.type === "scale-region") { let w = Math.max(0, 1 - v.distanceTo(centre) / radius); if (d.falloff !== "linear") w = w * w * (3 - 2 * w); const s = d.scale ?? [1, 1, 1]; v.sub(centre).multiply(new T.Vector3(1 + (s[0] - 1) * w, 1 + (s[1] - 1) * w, 1 + (s[2] - 1) * w)).add(centre); }
            else if (d.type === "twist") v.applyAxisAngle(new T.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0), amount * t);
            else if (d.type === "bend") { const q = v[axis]; v.x += Math.sin(t * amount) * q; v[axis] = Math.cos(t * amount) * q; }
            else if (d.type === "taper") { for (const a of ["x", "y", "z"] as const) if (a !== axis) v[a] *= 1 + amount * t; }
            else if (d.type === "curve-warp") { if (!curve) throw Error("Curve warp requires at least two curve points"); v[axis] = 0; v.add(curve.getPoint(t)); }
            else v.addScaledVector(new T.Vector3().fromBufferAttribute(normal, i), amount * (d.type === "displace" ? rng() * 2 - 1 : 1));
            vector(v.toArray() as Vec3); p.setXYZ(i, v.x, v.y, v.z);
          }
        });
      },
    },
    scene: { rename: (o: T.Object3D, name: string) => { o.name = name.slice(0, 100); }, metadata: (o: T.Object3D, data: Record<string, unknown>) => { o.userData = JSON.parse(JSON.stringify(data)); } },
    texture: { apply: (o: T.Object3D, assetId: string) => { if (!textureIds.includes(assetId)) throw Error("Texture asset is not in this assemblage"); o.traverse(n => { if (n instanceof T.Mesh) n.userData.textureAssetId = assetId; }); } },
    utility: { bounds, random: seededRandom, centre: (o: T.Object3D) => { const b = new T.Box3().setFromObject(o); o.position.sub(b.getCenter(new T.Vector3())); } },
  };
  return runtime;
}

export function validateScene(root: T.Object3D, limits = defaults) {
  if (!(root instanceof T.Object3D)) throw Error("buildModel must return { root: ModelObject }");
  const stats = { objectCount: 0, meshCount: 0, vertexCount: 0, triangleCount: 0, materialCount: 0, textureCount: 0, boundingBox: { min: [0, 0, 0] as Vec3, max: [0, 0, 0] as Vec3 }, warnings: [] as string[], durationMs: 0 };
  const materials = new Set(), textures = new Set(), seen = new Set<T.Object3D>();
  function visit(o: T.Object3D, path: string, depth: number) {
    if (depth > 64 || seen.has(o)) throw Error("Scene hierarchy is cyclic or too deep"); seen.add(o);
    if (++stats.objectCount > limits.maxObjects) throw Error("Object count limit exceeded");
    o.userData.objectId = path; o.name = String(o.name || "Part").slice(0, 100);
    [...o.position.toArray(), ...o.scale.toArray(), ...o.quaternion.toArray()].forEach(x => finite(x, limits.maxBounds));
    if (o instanceof T.Mesh) {
      stats.meshCount++; const p = o.geometry.getAttribute("position"); if (!p || p.count < 3) throw Error("Mesh has no geometry");
      stats.vertexCount += p.count; stats.triangleCount += (o.geometry.index?.count ?? p.count) / 3;
      if (stats.triangleCount > limits.maxTriangles || stats.vertexCount > limits.maxTriangles * 3) throw Error("Triangle or vertex budget exceeded");
      for (let i = 0; i < p.count; i++) { finite(p.getX(i), limits.maxBounds); finite(p.getY(i), limits.maxBounds); finite(p.getZ(i), limits.maxBounds); }
      const idx = o.geometry.index; if (idx) for (let i = 0; i < idx.count; i++) if (idx.getX(i) >= p.count) throw Error("Invalid index");
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      if (o.userData.textureAssetId) textures.add(o.userData.textureAssetId);
    }
    const names = new Map<string, number>(); for (const child of o.children) names.set(child.name || "Part", (names.get(child.name || "Part") ?? 0) + 1);
    o.children.forEach((child, i) => { const name = child.name || "Part"; visit(child, `${path}/${encodeURIComponent(name)}${names.get(name)! > 1 ? `:${i}` : ""}`, depth + 1); });
  }
  visit(root, "root", 0);
  if (!stats.meshCount) throw Error("Model contains no meshes");
  root.updateMatrixWorld(true); const box = new T.Box3().setFromObject(root);
  if (box.isEmpty() || box.getSize(new T.Vector3()).length() < .00001) throw Error("Model has empty or degenerate bounds");
  [...box.min.toArray(), ...box.max.toArray()].forEach(x => finite(x, limits.maxBounds));
  stats.boundingBox = { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 }; stats.materialCount = materials.size; stats.textureCount = textures.size;
  if (textures.size > 16) throw Error("Texture count limit exceeded");
  return stats;
}
