import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { country, kitsFor, type Kit } from "../../packages/catalogue";
import { createMatch } from "../../packages/simulation";
import type { Input, Match, Settings } from "../../packages/contracts";
// Client imports data and movement rules only; Rapier is not instantiated here.
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export class FootballScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(43, 1, 0.1, 350);
  root = new THREE.Group();
  clock = new THREE.Clock();
  ball: THREE.Mesh;
  marker: THREE.Mesh;
  shadow: THREE.Mesh;
  sun: THREE.DirectionalLight;
  players: {
    group: THREE.Group;
    mixer: THREE.AnimationMixer;
    actions: Map<string, THREE.AnimationAction>;
    current: string;
    materials: THREE.Material[];
    label: THREE.Sprite;
  }[] = [];
  state: Match | null = null;
  previous: Match | null = null;
  received = 0;
  preview = true;
  loaded = false;
  lastKit = "";
  settings: Settings | null = null;
  input: Input | null = null;
  frame = 0;
  disposed = false;
  crowd = new THREE.Group();
  target = v3();
  onError: (s: string) => void;
  constructor(
    public canvas: HTMLCanvasElement,
    onError: (s: string) => void,
  ) {
    this.onError = onError;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.scene.background = new THREE.Color("#b3c7c5");
    this.scene.fog = new THREE.Fog("#b3c7c5", 100, 230);
    this.scene.add(new THREE.HemisphereLight("#f9f6e7", "#506b56", 2.6));
    this.sun = new THREE.DirectionalLight("#fff0d1", 3.4);
    this.sun.position.set(-30, 65, 35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -50,
      right: 50,
      top: 40,
      bottom: -40,
      near: 1,
      far: 140,
    });
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);
    this.scene.add(this.root);
    this.stadium();
    this.ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 2),
      new THREE.MeshStandardMaterial({
        map: this.ballTexture(),
        roughness: 0.5,
      }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.68, 40),
      new THREE.MeshBasicMaterial({
        color: "#d8fc62",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.05;
    this.scene.add(this.marker);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.27, 24),
      new THREE.MeshBasicMaterial({
        color: "#10281d",
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.camera.position.set(54, 45, 56);
    this.camera.lookAt(0, 0, 0);
    this.resize();
    window.addEventListener("resize", this.resize);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    this.animate();
  }
  contextLost = (e: Event) => {
    e.preventDefault();
    this.onError(
      "The graphics connection was interrupted. Reload to restore the pitch.",
    );
  };
  resize = () => {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
  mesh(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, rough = 1) {
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ color, roughness: rough }),
    );
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }
  box(w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z);
  }
  line(points: number[][], color = "#edf2d4") {
    const g = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => v3(p[0], 0.035, p[1])),
    );
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    this.root.add(l);
  }
  stadium() {
    this.box(190, 0.3, 150, "#6b9180", 0, -0.35, 0);
    this.box(82, 0.12, 57, "#225f47", 0, -0.05, 0);
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 1024;
    textureCanvas.height = 512;
    const ctx = textureCanvas.getContext("2d")!;
    ctx.fillStyle = "#438953";
    ctx.fillRect(0, 0, 1024, 512);
    let seed = 7;
    for (let i = 0; i < 120000; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 1024;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 512;
      ctx.fillStyle = i % 2 ? "#508f5928" : "#1d5c3325";
      ctx.fillRect(x, y, 1, 3);
    }
    const tex = new THREE.CanvasTexture(textureCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 45),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.root.add(pitch);
    for (let i = 0; i < 10; i++)
      if (i % 2 === 0) {
        const strip = new THREE.Mesh(
          new THREE.PlaneGeometry(7, 45),
          new THREE.MeshStandardMaterial({
            color: "#a4c47b",
            transparent: true,
            opacity: 0.11,
            depthWrite: false,
          }),
        );
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(-31.5 + i * 7, 0.006, 0);
        this.root.add(strip);
      }
    this.line([
      [-35, -22.5],
      [35, -22.5],
      [35, 22.5],
      [-35, 22.5],
      [-35, -22.5],
    ]);
    this.line([
      [0, -22.5],
      [0, 22.5],
    ]);
    const circle = [];
    for (let i = 0; i <= 90; i++)
      circle.push([
        Math.cos((i / 90) * Math.PI * 2) * 6,
        Math.sin((i / 90) * Math.PI * 2) * 6,
      ]);
    this.line(circle);
    for (const side of [-1, 1]) {
      this.line([
        [35 * side, -12],
        [25 * side, -12],
        [25 * side, 12],
        [35 * side, 12],
      ]);
      this.line([
        [35 * side, -5],
        [31 * side, -5],
        [31 * side, 5],
        [35 * side, 5],
      ]);
      const goal = new THREE.Group();
      for (const z of [-2.55, 2.55]) {
        const p = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 2.1, 10),
          new THREE.MeshStandardMaterial({ color: "#ffffff" }),
        );
        p.position.set(35 * side, 1.05, z);
        p.castShadow = true;
        goal.add(p);
      }
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 5.2, 10),
        new THREE.MeshStandardMaterial({ color: "#ffffff" }),
      );
      bar.rotation.x = Math.PI / 2;
      bar.position.set(35 * side, 2.05, 0);
      goal.add(bar);
      const netMat = new THREE.LineBasicMaterial({
        color: "#ebeee4",
        transparent: true,
        opacity: 0.42,
      });
      const points: THREE.Vector3[] = [];
      for (let z = -2.5; z <= 2.51; z += 0.25) {
        points.push(
          v3(35 * side, 2, z),
          v3(37 * side, 1.8, z),
          v3(37 * side, 1.8, z),
          v3(37 * side, 0, z),
        );
      }
      for (let y = 0; y <= 1.81; y += 0.2)
        points.push(v3(37 * side, y, -2.5), v3(37 * side, y, 2.5));
      for (const z of [-2.5, 2.5])
        for (let y = 0; y <= 2; y += 0.2)
          points.push(v3(35 * side, y, z), v3(37 * side, y * 0.9, z));
      goal.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(points),
          netMat,
        ),
      );
      this.root.add(goal);
      for (const z of [-22.5, 22.5]) {
        this.mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6),
          "#f5efde",
          35 * side,
          0.75,
          z,
        );
        const flag = this.box(
          0.48,
          0.32,
          0.025,
          "#e7ff85",
          35 * side + 0.24,
          1.35,
          z,
        );
        flag.rotation.y = 0.3;
      }
    }
    // Layered terraces and instanced seats keep the stadium lively without thousands of draw calls.
    for (const side of [-1, 1]) {
      for (let row = 0; row < 7; row++) {
        this.box(
          87,
          0.55,
          1.45,
          row % 2 ? "#bcc3b5" : "#cdd0c2",
          0,
          row * 0.62 + 0.1,
          side * (29 + row * 1.4),
        );
        this.box(
          1.45,
          0.55,
          55,
          "#bfc8b9",
          side * (41 + row * 1.4),
          row * 0.62 + 0.1,
          0,
        );
      }
      this.box(92, 0.6, 11, "#e5e6d5", 0, 9.3, side * 35);
      for (let x = -40; x <= 40; x += 16)
        this.box(0.3, 9, 0.3, "#53665a", x, 4.5, side * 39);
    }
    const crowdCount = 2200;
    const seats = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.55, 0.65, 0.45),
      new THREE.MeshStandardMaterial({ roughness: 1 }),
      crowdCount,
    );
    const dummy = new THREE.Object3D();
    const palette = [
      "#193e3f",
      "#c6c5a7",
      "#d3935d",
      "#3d7771",
      "#769297",
      "#ccac71",
    ];
    for (let i = 0; i < crowdCount; i++) {
      const side = i % 2 ? 1 : -1;
      const n = Math.floor(i / 2),
        row = Math.floor(n / 140) % 7,
        x = (n % 140) * 0.6 - 42;
      dummy.position.set(x, row * 0.62 + 0.7, side * (29 + row * 1.4));
      dummy.rotation.y = side > 0 ? Math.PI : 0;
      dummy.updateMatrix();
      seats.setMatrixAt(i, dummy.matrix);
      seats.setColorAt(i, new THREE.Color(palette[(i * 31) % palette.length]));
    }
    this.crowd.add(seats);
    this.root.add(this.crowd);
    for (const z of [-26, 26]) {
      this.box(73, 0.8, 0.2, "#193f37", 0, 0.4, z);
      for (let x = -29; x <= 29; x += 14)
        this.board("ONE MORE MATCH", x, 0.85, z, z > 0 ? Math.PI : 0);
    }
    for (const x of [-43, 43])
      for (const z of [-29, 29]) {
        this.mesh(
          new THREE.CylinderGeometry(0.16, 0.25, 18, 8),
          "#758980",
          x,
          9,
          z,
        );
        const lights = this.box(4, 0.9, 0.6, "#f3f0cf", x, 18, z);
        (lights.material as THREE.MeshStandardMaterial).emissive.set("#d6d5ad");
        (lights.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4;
      }
  }
  board(text: string, x: number, y: number, z: number, angle: number) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#193f37";
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = "#dceeab";
    ctx.font = "bold 27px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 43);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.rotation.y = angle;
    this.root.add(m);
  }
  ballTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fffbea";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#21352f";
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        for (let n = 0; n < 5; n++) {
          const a = (n / 5) * Math.PI * 2;
          const x = i * 48 + (j % 2) * 24 + Math.cos(a) * 12,
            y = j * 48 + Math.sin(a) * 12;
          n ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.fill();
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  async load() {
    const asset = await new GLTFLoader().loadAsync("/assets/player.glb");
    for (let i = 0; i < 14; i++) {
      const group = clone(asset.scene) as THREE.Group;
      group.scale.setScalar(1.2);
      const materials: THREE.Material[] = [];
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.frustumCulled = false;
          const ms = (
            Array.isArray(o.material) ? o.material : [o.material]
          ).map((m: THREE.Material) => {
            const copy = m.clone();
            materials.push(copy);
            return copy;
          });
          o.material = Array.isArray(o.material) ? ms : ms[0]!;
        }
      });
      this.scene.add(group);
      const mixer = new THREE.AnimationMixer(group);
      const actions = new Map(
        asset.animations.map((c) => [c.name, mixer.clipAction(c)]),
      );
      actions.get("idle")?.play();
      const label = this.label(String((i % 7) + 1));
      this.scene.add(label);
      this.players.push({
        group,
        mixer,
        actions,
        current: "idle",
        materials,
        label,
      });
    }
    this.loaded = true;
    this.previewCountries("ARG", "BRA");
  }
  label(text: string) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#173d35";
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#fffbe9";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 32, 44);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        depthTest: false,
        transparent: true,
      }),
    );
    sprite.scale.set(0.8, 0.8, 1);
    return sprite;
  }
  jersey(kit: Kit, number = 7) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = kit.primary;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = kit.secondary;
    if (kit.pattern === "stripes")
      for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 32, 256);
    if (kit.pattern === "checks")
      for (let x = 0; x < 4; x++)
        for (let y = 0; y < 4; y++)
          if ((x + y) % 2) ctx.fillRect(x * 64, y * 64, 64, 64);
    ctx.fillRect(0, 0, 256, 12);
    ctx.fillStyle =
      kit.primary === "#f3f1e9" || kit.pattern !== "plain"
        ? "#17362f"
        : "#fff9e9";
    ctx.font = "bold 68px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(number), 64, 164);
    ctx.fillText(String(number), 192, 164);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  applyKits(state: Match) {
    const key = JSON.stringify(state.kits);
    if (key === this.lastKit) return;
    this.lastKit = key;
    this.players.forEach((p, i) => {
      const kit = state.kits[i < 7 ? 0 : 1];
      for (const material of p.materials) {
        const m = material as THREE.MeshStandardMaterial;
        if (m.name === "shirt") {
          m.map?.dispose();
          m.map = this.jersey(
            i % 7 === 0
              ? {
                  ...kit,
                  primary: i === 0 ? "#fbb652" : "#bc7eee",
                  secondary: "#292c41",
                  pattern: "plain",
                }
              : kit,
            (i % 7) + 1,
          );
          m.color.set("#ffffff");
          m.needsUpdate = true;
        } else if (m.name === "shorts")
          m.color.set(i % 7 === 0 ? "#253342" : kit.shorts);
        else if (m.name === "socks") m.color.set(kit.primary);
        else if (m.name === "skin")
          m.color.set(["#bb805c", "#8c563b", "#dcaa81", "#6c4435"][i % 4]!);
      }
    });
  }
  previewCountries(a: string, b: string) {
    if (!this.loaded) return;
    const s = createMatch(
      { country: a, opponent: b === a ? "BRA" : b, difficulty: "normal" },
      42,
    );
    s.players.forEach((p, i) => {
      p.x += i % 2 ? 4 : -2;
    });
    this.previous = null;
    this.state = s;
    this.preview = true;
    this.applyKits(s);
  }
  update(state: Match) {
    this.previous = this.state?.id === state.id ? this.state : null;
    this.state = state;
    this.received = performance.now();
    this.preview = false;
    this.applyKits(state);
  }
  quality(s: Settings) {
    this.settings = s;
    const q = s.quality === "auto" ? "medium" : s.quality;
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, q === "high" ? 2 : q === "low" ? 1 : 1.5) *
        s.renderScale,
    );
    this.renderer.shadowMap.enabled = q !== "low";
    this.crowd.visible = q !== "low";
    this.resize();
  }
  animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05),
      now = performance.now() / 1000,
      s = this.state;
    if (s && this.loaded) {
      const alpha = Math.min(1, (performance.now() - this.received) / 50);
      this.players.forEach((view, i) => {
        const p = s.players[i]!,
          old = this.previous?.players[i] ?? p;
        let x = THREE.MathUtils.lerp(old.x, p.x, alpha),
          z = THREE.MathUtils.lerp(old.z, p.z, alpha);
        if (
          !this.preview &&
          p.id === s.controlled &&
          s.phase === "playing" &&
          this.input
        ) {
          const prediction = Math.min(
            (performance.now() - this.received) / 1000,
            0.05,
          );
          x += this.input.x * (this.input.sprint ? 8.5 : 6.2) * prediction;
          z += this.input.z * (this.input.sprint ? 8.5 : 6.2) * prediction;
        }
        view.group.position.set(x, 0, z);
        view.group.rotation.y +=
          Math.atan2(
            Math.sin(p.angle - view.group.rotation.y),
            Math.cos(p.angle - view.group.rotation.y),
          ) * Math.min(1, dt * 15);
        view.label.position.set(x, 2.55, z);
        view.label.visible = !this.preview && p.id === s.controlled;
        const moving = Math.hypot(p.vx, p.vz);
        const action =
          p.actionTime > 0 && view.actions.has(p.action)
            ? p.action
            : moving > 7
              ? "sprint"
              : moving > 0.4
                ? "run"
                : "idle";
        if (action !== view.current) {
          view.actions.get(view.current)?.fadeOut(0.15);
          view.actions.get(action)?.reset().fadeIn(0.15).play();
          view.current = action;
        }
        view.mixer.update(dt);
      });
      const oldBall = this.previous?.ball ?? s.ball;
      this.ball.position.set(
        THREE.MathUtils.lerp(oldBall.x, s.ball.x, alpha),
        Math.max(0.22, THREE.MathUtils.lerp(oldBall.y, s.ball.y, alpha)),
        THREE.MathUtils.lerp(oldBall.z, s.ball.z, alpha),
      );
      this.ball.rotation.x += s.ball.vz * dt * 2;
      this.ball.rotation.z -= s.ball.vx * dt * 2;
      this.shadow.position.set(
        this.ball.position.x,
        0.025,
        this.ball.position.z,
      );
      const cp = this.players[s.controlled]!;
      this.marker.position.set(cp.group.position.x, 0.055, cp.group.position.z);
      this.marker.visible = !this.preview;
      if (this.preview) {
        this.target.set(1, 0, 0);
        this.camera.position.lerp(
          v3(48 + Math.sin(now * 0.07) * 3, 43, 53),
          dt * 0.7,
        );
      } else {
        const sign = s.half === 1 ? 1 : -1;
        const focusX = s.ball.x * 0.7 + s.players[s.controlled]!.x * 0.3;
        const focusZ = s.ball.z * 0.6;
        this.target.lerp(
          v3(focusX * 0.78, 0, focusZ * 0.5),
          this.settings?.reducedMotion ? 1 : dt * 3,
        );
        this.camera.position.lerp(
          v3(focusX * 0.72, 34, focusZ * 0.45 + 39 * sign),
          Math.min(1, dt * (this.settings?.reducedMotion ? 10 : 3)),
        );
      }
      this.camera.lookAt(this.target);
    }
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.scene.traverse((o) => {
      if (
        o instanceof THREE.Mesh ||
        o instanceof THREE.Line ||
        o instanceof THREE.Sprite
      ) {
        if ("geometry" in o) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if ("map" in m) (m.map as THREE.Texture | null)?.dispose();
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
  }
}
