import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bodyState, lagrange, soi, type Mission } from "../mission/model";
import {
  sub,
  rotateZ,
  relative,
  localBasis,
  unit,
  type Vec3,
} from "../physics/math";
import type { Snapshot } from "../simulation/Simulation";
import type { Prediction } from "../simulation/worker";
const SCALE = 1e6;
export class SceneRenderer {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.001, 1e8);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  controls: OrbitControls;
  bodies = new THREE.Group();
  paths = new THREE.Group();
  markers = new THREE.Group();
  context = new THREE.Group();
  labels: { el: HTMLElement; object: THREE.Object3D }[] = [];
  mission!: Mission;
  snapshot!: Snapshot;
  prediction?: Prediction;
  frame = "earth";
  focus = "earth";
  mode = "orbit";
  showSOI = false;
  showLagrange = false;
  debug = false;
  showBaseline = true;
  showPrediction = true;
  showVectors = true;
  showGrid = true;
  selected = "explorer-1";
  hoverPoint?: Vec3;
  history: { position: Vec3; t: number }[] = [];
  onSelect: (id: string) => void = () => {};
  private sizeObserver: ResizeObserver;
  private globeTexture: THREE.Texture;
  constructor(public host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x0b0f13, 1);
    host.prepend(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(14, -21, 16);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 1e7;
    this.scene.add(new THREE.AmbientLight(0xc6def5, 1.05));
    const sun = new THREE.DirectionalLight(0xfff4dc, 2.5);
    sun.position.set(-20, -30, 20);
    this.scene.add(sun);
    this.scene.add(this.bodies, this.paths, this.context, this.markers);
    this.globeTexture = new THREE.TextureLoader().load("./earth.jpg");
    this.globeTexture.colorSpace = THREE.SRGBColorSpace;
    const stars: number[] = [];
    let seed = 7823;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 850; i++) {
      const a = rand() * Math.PI * 2,
        z = rand() * 2 - 1,
        r = Math.sqrt(1 - z * z);
      stars.push(r * Math.cos(a) * 3e6, r * Math.sin(a) * 3e6, z * 3e6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
    this.scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0x8c9bab,
          size: 1,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      ),
    );
    this.sizeObserver = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    this.sizeObserver.observe(host);
    let down = { x: 0, y: 0 };
    this.renderer.domElement.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.params.Line = { threshold: 0.12 };
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        this.camera,
      );
      const hit = ray
        .intersectObjects(
          [...this.bodies.children, ...this.markers.children],
          true,
        )
        .find((h) => h.object.userData.id);
      if (hit) this.onSelect(hit.object.userData.id);
    });
    const loop = () => {
      requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      for (const { el, object } of this.labels) {
        const pos = object
          .getWorldPosition(new THREE.Vector3())
          .project(this.camera);
        el.style.display =
          pos.z < 1 && Math.abs(pos.x) < 1.1 && Math.abs(pos.y) < 1.1
            ? ""
            : "none";
        el.style.transform = `translate(${((pos.x + 1) * host.clientWidth) / 2}px,${((-pos.y + 1) * host.clientHeight) / 2}px)`;
      }
    };
    loop();
  }
  origin(t: number): Vec3 {
    if (this.mode === "follow" || this.frame === "local") {
      const c = this.snapshot.crafts.find((c) => c.id === this.selected);
      if (c) return c.state.position;
    }
    const id =
      this.frame === "rotating"
        ? "earth"
        : this.frame === "local"
          ? this.focus
          : this.frame;
    const b = this.mission.bodies.find((b) => b.id === id);
    return b
      ? bodyState(b, t, this.mission.bodies).position
      : { x: 0, y: 0, z: 0 };
  }
  transform(p: Vec3, t = this.snapshot.time): THREE.Vector3 {
    let q = sub(p, this.origin(t));
    if (this.frame === "rotating")
      q = rotateZ(
        q,
        (-t * 2 * Math.PI) /
          this.mission.bodies.find((b) => b.id === "earth")!.rotationPeriodS,
      );
    if (this.frame === "local") {
      const c = this.snapshot.crafts.find((c) => c.id === this.selected),
        b = this.mission.bodies.find((b) => b.id === this.focus);
      if (c && b) {
        const basis = localBasis(
          relative(
            c.state,
            bodyState(b, this.snapshot.time, this.mission.bodies),
          ),
        );
        const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
        q = {
          x: dot(q, basis.prograde),
          y: dot(q, basis.radial),
          z: dot(q, basis.normal),
        };
      }
    }
    return new THREE.Vector3(q.x / SCALE, q.y / SCALE, q.z / SCALE);
  }
  clear(group: THREE.Group) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    group.clear();
  }
  label(object: THREE.Object3D, text: string, kind = "") {
    const el = document.createElement("span");
    el.className = `object-label ${kind}`;
    el.textContent = text;
    this.host.append(el);
    this.labels.push({ el, object });
  }
  line(
    points: THREE.Vector3[],
    color: number,
    group = this.paths,
    dashed = false,
    opacity = 1,
  ) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = dashed
      ? new THREE.LineDashedMaterial({
          color,
          transparent: true,
          opacity,
          dashSize: 0.22,
          gapSize: 0.14,
        })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    group.add(line);
    return line;
  }
  update(mission: Mission, snapshot: Snapshot, prediction = this.prediction) {
    this.mission = mission;
    this.snapshot = snapshot;
    this.prediction = prediction;
    this.draw();
  }
  draw() {
    if (!this.snapshot) return;
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    [this.bodies, this.paths, this.context, this.markers].forEach((g) =>
      this.clear(g),
    );
    const time = this.snapshot.time;
    for (const b of this.mission.bodies) {
      const radius = b.radiusM / SCALE;
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 64, 40),
        new THREE.MeshStandardMaterial({
          color: b.id === "earth" ? 0xb4c2c5 : b.color,
          map: b.id === "earth" ? this.globeTexture : null,
          roughness: 1,
          metalness: 0,
        }),
      );
      globe.position.copy(
        this.transform(bodyState(b, time, this.mission.bodies).position),
      );
      globe.rotation.x = Math.PI / 2;
      globe.rotation.y =
        (time / b.rotationPeriodS) * 2 * Math.PI + (b.id === "earth" ? 2.7 : 0);
      globe.userData.id = b.id;
      this.bodies.add(globe);
      if (b.id !== "earth" || this.frame !== "earth")
        this.label(globe, b.name.toUpperCase(), "body-label");
      if (b.id === "earth") {
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.012, 48, 32),
          new THREE.MeshBasicMaterial({
            color: 0x749fc3,
            transparent: true,
            opacity: 0.065,
            side: THREE.BackSide,
          }),
        );
        atmosphere.position.copy(globe.position);
        this.bodies.add(atmosphere);
      }
      if (this.showSOI && b.parentId) {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(soi(b, this.mission.bodies) / SCALE, 40, 24),
          new THREE.MeshBasicMaterial({
            color: b.color,
            wireframe: true,
            transparent: true,
            opacity: 0.045,
            depthWrite: false,
          }),
        );
        sphere.position.copy(globe.position);
        this.context.add(sphere);
      }
      if (b.parentId) {
        const parent = this.mission.bodies.find((p) => p.id === b.parentId)!,
          period =
            2 * Math.PI * Math.sqrt(b.orbitRadiusM! ** 3 / (parent.mu + b.mu));
        const pts = Array.from({ length: 241 }, (_, i) => {
          const t = time + (i * period) / 240;
          const rel = sub(
            bodyState(b, t, this.mission.bodies).position,
            bodyState(parent, t, this.mission.bodies).position,
          );
          const now = bodyState(parent, time, this.mission.bodies).position;
          return this.transform({
            x: now.x + rel.x,
            y: now.y + rel.y,
            z: now.z + rel.z,
          });
        });
        this.line(pts, 0x536170, this.context, false, 0.3);
      }
    }
    const focusBody = this.mission.bodies.find(
        (b) => b.id === (this.frame === "rotating" ? "earth" : this.frame),
      ),
      gridSize = focusBody ? (focusBody.radiusM / SCALE) * 6 : AU_RENDER;
    if (this.showGrid) {
      const grid = new THREE.GridHelper(gridSize, 24, 0x33424d, 0x202a33);
      grid.rotation.x = Math.PI / 2;
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.32;
      this.context.add(grid);
    }
    for (const c of this.snapshot.crafts) {
      const dot = new THREE.Mesh(
        new THREE.OctahedronGeometry(
          Math.max(0.08, ((focusBody?.radiusM ?? 6371000) / SCALE) * 0.014),
        ),
        new THREE.MeshBasicMaterial({
          color: c.collided ? 0xe07a6b : 0xdbf2e2,
        }),
      );
      dot.position.copy(this.transform(c.state.position));
      dot.userData.id = c.id;
      this.markers.add(dot);
      this.label(dot, c.name, "craft-label");
      if (this.showVectors || this.debug) {
        const d = unit(c.state.velocity),
          b =
            this.mission.bodies.find(
              (b) => b.id === this.snapshot.diagnostics[c.id]?.bodyId,
            ) ?? this.mission.bodies.find((b) => b.id === "earth")!;
        const vel = relative(
          c.state,
          bodyState(b, time, this.mission.bodies),
        ).velocity;
        const tip = this.transform({
          x: c.state.position.x + unit(vel).x * 1.2e6,
          y: c.state.position.y + unit(vel).y * 1.2e6,
          z: c.state.position.z + unit(vel).z * 1.2e6,
        });
        this.markers.add(
          new THREE.ArrowHelper(
            tip.clone().sub(dot.position).normalize(),
            dot.position,
            1.2,
            0xa5c3b0,
            0.25,
            0.12,
          ),
        );
        if (this.debug) {
          const acc = this.snapshot.diagnostics[c.id]?.acceleration;
          if (acc) {
            const tip = this.transform({
              x: c.state.position.x + unit(acc).x * 1e6,
              y: c.state.position.y + unit(acc).y * 1e6,
              z: c.state.position.z + unit(acc).z * 1e6,
            });
            this.markers.add(
              new THREE.ArrowHelper(
                tip.sub(dot.position).normalize(),
                dot.position,
                1,
                0xe29b6d,
                0.2,
                0.1,
              ),
            );
          }
        }
      }
    }
    if (this.history.length > 1)
      this.line(
        this.history.map((p) => this.transform(p.position, p.t)),
        0xe6dcc7,
        this.paths,
        false,
        0.8,
      );
    if (this.prediction) {
      if (this.showBaseline)
        this.line(
          this.prediction.baseline.map((p) => this.transform(p.position, p.t)),
          0x7b8d9c,
          this.paths,
          true,
          0.48,
        );
      if (this.showPrediction)
        this.line(
          this.prediction.points.map((p) => this.transform(p.position, p.t)),
          0xb2cba6,
          this.paths,
          false,
          0.95,
        );
      for (const n of this.mission.manoeuvres.filter(
        (n) => n.craftId === this.selected && n.time >= time,
      )) {
        const p = this.prediction.points.reduce((a, b) =>
          Math.abs(a.t - n.time) < Math.abs(b.t - n.time) ? a : b,
        );
        if (!p) continue;
        const node = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.17),
          new THREE.MeshBasicMaterial({ color: 0xe4bb78 }),
        );
        node.position.copy(this.transform(p.position, p.t));
        node.userData.id = n.id;
        this.markers.add(node);
        this.label(node, "Δv · " + n.id.slice(-2), "node-label");
      }
      const encounter = this.prediction.encounter;
      if (encounter?.soiEntry !== null && encounter) {
        const body = this.mission.bodies.find(
          (b) => b.id === encounter.bodyId,
        )!;
        const ghost = new THREE.Mesh(
          new THREE.SphereGeometry(body.radiusM / SCALE, 24, 16),
          new THREE.MeshBasicMaterial({
            color: 0xb2cba6,
            wireframe: true,
            transparent: true,
            opacity: 0.22,
          }),
        );
        ghost.position.copy(
          this.transform(
            bodyState(body, encounter.time, this.mission.bodies).position,
            encounter.time,
          ),
        );
        ghost.userData.id = `event:${encounter.time}`;
        this.markers.add(ghost);
        this.label(ghost, `${body.name} · encounter`, "node-label");
      }
      const seenEvents = new Set<string>();
      for (const event of this.prediction.events
        .filter((e) => {
          const key = `${e.type}:${e.bodyId}`;
          if (seenEvents.has(key)) return false;
          seenEvents.add(key);
          return true;
        })
        .filter(
          (e) =>
            e.spacecraftId === this.selected &&
            ["PERIAPSIS", "APOAPSIS", "SOI_ENTER"].includes(e.type),
        )
        .slice(0, 8)) {
        const p = this.prediction.points.reduce((a, b) =>
          Math.abs(a.t - event.time) < Math.abs(b.t - event.time) ? a : b,
        );
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.07),
          new THREE.MeshBasicMaterial({ color: 0x9baab9 }),
        );
        marker.position.copy(this.transform(p.position, p.t));
        marker.userData.id = `event:${event.time}`;
        this.markers.add(marker);
        this.label(
          marker,
          event.type === "PERIAPSIS"
            ? "Pe"
            : event.type === "APOAPSIS"
              ? "Ap"
              : "SOI",
          "event-label",
        );
      }
    }
    if (this.showLagrange) {
      const earth = this.mission.bodies.find((b) => b.id === "earth"),
        moon = this.mission.bodies.find((b) => b.id === "moon");
      if (earth && moon)
        for (const l of lagrange(earth, moon, time, this.mission.bodies)) {
          const dot = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.7),
            new THREE.MeshBasicMaterial({ color: 0xbaa5cc }),
          );
          dot.position.copy(this.transform(l.position));
          this.markers.add(dot);
          this.label(dot, l.name, "node-label");
        }
    }
    if (this.debug) this.context.add(new THREE.AxesHelper(gridSize / 3));
  }
  view(id: string) {
    this.controls.enableRotate = true;
    if (id === "top") {
      this.camera.position.set(
        0,
        0,
        Math.max(this.camera.position.length(), 22),
      );
    } else if (id === "side") {
      this.camera.position.set(
        0,
        -Math.max(this.camera.position.length(), 22),
        0.1,
      );
    } else {
      if (id === "spacecraft") {
        this.mode = "follow";
        this.camera.position.set(4, -7, 4);
      } else {
        this.mode = "orbit";
        this.frame = id === "solar" ? "global" : id;
        this.focus = id === "solar" ? "sun" : id;
        const b = this.mission.bodies.find((b) => b.id === id);
        const r =
          id === "solar"
            ? AU_RENDER * 3
            : Math.max(8, ((b?.radiusM ?? 6371000) / SCALE) * 4);
        this.camera.position.set(r * 0.65, -r, r * 0.7);
      }
      this.controls.target.set(0, 0, 0);
      this.draw();
    }
    this.controls.update();
  }
  fit() {
    if (!this.prediction?.points.length) return;
    const box = new THREE.Box3().setFromPoints(
      this.prediction.points.map((p) => this.transform(p.position, p.t)),
    );
    box.expandByPoint(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3()),
      distance = Math.max(size.length() * 1.6, 20);
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .add(
        new THREE.Vector3(0.45, -0.85, 0.7)
          .normalize()
          .multiplyScalar(distance),
      );
    this.controls.update();
  }
  setHover(p?: Vec3, t = this.snapshot.time) {
    if (this.hoverPoint) {
      const old = this.markers.getObjectByName("hover");
      if (old) {
        this.markers.remove(old);
        if (old instanceof THREE.Mesh) {
          old.geometry.dispose();
          old.material.dispose();
        }
      }
    }
    this.hoverPoint = p;
    if (p) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      marker.name = "hover";
      marker.position.copy(this.transform(p, t));
      this.markers.add(marker);
    }
  }
}
const AU_RENDER = 149597.8707;
