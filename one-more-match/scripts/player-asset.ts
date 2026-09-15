import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
// Original articulated player asset; generated locally, with no third-party artwork.
class Reader {
  result: unknown;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((v) => {
      this.result = `data:${blob.type};base64,${Buffer.from(v).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
(globalThis as any).FileReader = Reader;
const root = new THREE.Group();
root.name = "Footballer";
const bones: THREE.Bone[] = [];
function bone(
  name: string,
  parent: number | null,
  x: number,
  y: number,
  z: number,
) {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  if (parent === null) root.add(b);
  else bones[parent]!.add(b);
  bones.push(b);
  return bones.length - 1;
}
const hips = bone("hips", null, 0, 0.93, 0),
  spine = bone("spine", hips, 0, 0.23, 0),
  head = bone("head", spine, 0, 0.48, 0);
const la = bone("armL", spine, -0.29, 0.22, 0),
  le = bone("elbowL", la, 0, -0.28, 0),
  ra = bone("armR", spine, 0.29, 0.22, 0),
  re = bone("elbowR", ra, 0, -0.28, 0);
const ll = bone("legL", hips, -0.13, -0.02, 0),
  lk = bone("kneeL", ll, 0, -0.4, 0),
  rl = bone("legR", hips, 0.13, -0.02, 0),
  rk = bone("kneeR", rl, 0, -0.4, 0);
root.updateMatrixWorld(true);
const mats = [
  new THREE.MeshStandardMaterial({
    name: "shirt",
    color: "white",
    roughness: 0.9,
  }),
  new THREE.MeshStandardMaterial({ name: "shorts", color: "#19283a" }),
  new THREE.MeshStandardMaterial({
    name: "skin",
    color: "#b87852",
    roughness: 0.9,
  }),
  new THREE.MeshStandardMaterial({ name: "socks", color: "white" }),
  new THREE.MeshStandardMaterial({
    name: "boots",
    color: "#15232c",
    roughness: 0.6,
  }),
  new THREE.MeshStandardMaterial({
    name: "hair",
    color: "#251b18",
    roughness: 1,
  }),
];
const parts: THREE.BufferGeometry[] = [];
const groups: number[] = [];
function part(
  g: THREE.BufferGeometry,
  b: number,
  x: number,
  y: number,
  z: number,
  mat: number,
) {
  g.translate(x, y, z);
  const count = g.getAttribute("position").count;
  const indices = new Uint16Array(count * 4),
    weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    indices[i * 4] = b;
    weights[i * 4] = 1;
  }
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  parts.push(g);
  groups.push(mat);
}
part(new THREE.CapsuleGeometry(0.245, 0.24, 5, 12), spine, 0, 1.27, 0, 0);
part(new THREE.BoxGeometry(0.43, 0.25, 0.28, 2, 2, 2), hips, 0, 0.96, 0, 1);
part(new THREE.SphereGeometry(0.155, 14, 10), head, 0, 1.72, 0, 2);
part(
  new THREE.SphereGeometry(0.157, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
  head,
  0,
  1.76,
  -0.01,
  5,
);
part(new THREE.CylinderGeometry(0.07, 0.08, 0.13, 10), head, 0, 1.54, 0, 2);
for (const [side, arm, elbow, leg, knee] of [
  [-1, la, le, ll, lk],
  [1, ra, re, rl, rk],
]) {
  part(
    new THREE.CapsuleGeometry(0.085, 0.16, 4, 8),
    arm!,
    side! * 0.29,
    1.3,
    0,
    0,
  );
  part(
    new THREE.CapsuleGeometry(0.057, 0.2, 4, 8),
    elbow!,
    side! * 0.29,
    1.04,
    0,
    2,
  );
  part(
    new THREE.SphereGeometry(0.065, 8, 6),
    elbow!,
    side! * 0.29,
    0.89,
    0.015,
    2,
  );
  part(
    new THREE.CapsuleGeometry(0.093, 0.19, 4, 8),
    leg!,
    side! * 0.13,
    0.78,
    0,
    1,
  );
  part(
    new THREE.CapsuleGeometry(0.069, 0.1, 4, 8),
    leg!,
    side! * 0.13,
    0.59,
    0,
    2,
  );
  part(
    new THREE.CapsuleGeometry(0.064, 0.25, 4, 8),
    knee!,
    side! * 0.13,
    0.3,
    0,
    3,
  );
  part(
    new THREE.BoxGeometry(0.15, 0.1, 0.29),
    knee!,
    side! * 0.13,
    0.075,
    0.065,
    4,
  );
}
const grouped = mats.map((_, m) =>
  mergeGeometries(
    parts.filter((_, i) => groups[i] === m),
    false,
  )!,
);
const geo = mergeGeometries(grouped, true)!;
const mesh = new THREE.SkinnedMesh(geo, mats);
mesh.name = "Player";
root.add(mesh);
mesh.bind(new THREE.Skeleton(bones));
const clips: THREE.AnimationClip[] = [];
function clip(
  name: string,
  duration: number,
  swings: Record<string, number>,
  special = false,
) {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [name, amount] of Object.entries(swings)) {
    const values: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = special
        ? Math.sin((i / 4) * Math.PI) * amount
        : Math.sin((i / 4) * Math.PI * 2) * amount;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${name}.quaternion`,
        [0, duration * 0.25, duration * 0.5, duration * 0.75, duration],
        values,
      ),
    );
  }
  clips.push(new THREE.AnimationClip(name, duration, tracks));
}
clip("idle", 2, { spine: 0.035, armL: 0.025, armR: -0.025 });
clip("run", 0.65, {
  legL: 0.65,
  legR: -0.65,
  kneeL: 0.25,
  kneeR: -0.25,
  armL: -0.65,
  armR: 0.65,
});
clip("sprint", 0.48, {
  legL: 0.9,
  legR: -0.9,
  kneeL: 0.5,
  kneeR: -0.5,
  armL: -0.9,
  armR: 0.9,
});
clip("turn", 0.5, { spine: 0.12, legL: 0.3, legR: -0.3 });
clip("pass", 0.4, { legR: -1.05, armL: 0.4 }, true);
clip("shot", 0.45, { legR: -1.45, spine: 0.25, armL: 0.7 }, true);
clip("tackle", 0.4, { legL: -1.1, spine: 0.3 }, true);
clip("save", 0.65, { armL: -1.8, armR: -1.8, legL: 0.5, legR: -0.5 }, true);
clip("celebrate", 1.4, { armL: -2.5, armR: -2.5, spine: 0.12 }, true);
const output = await new GLTFExporter().parseAsync(root, {
  binary: true,
  animations: clips,
});
await Bun.write("public/assets/player.glb", output as ArrayBuffer);
console.log("Created original skinned footballer GLB");
