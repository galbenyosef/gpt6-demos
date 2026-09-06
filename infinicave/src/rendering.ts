import * as THREE from "three";
import {
  TILE,
  type World,
  type Context,
  type Settings,
  type Vec,
} from "./domain";
import { stream } from "./generation";
import { hazardRect } from "./physics";
import type { GameEvent } from "./simulation";
const UP = new THREE.Vector3(0, 0, 1);
export class CaveRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-30, 30, 20, -20, 0.1, 100);
  private root = new THREE.Group();
  private craft = new THREE.Group();
  private rotor = new THREE.Group();
  private gates = new Map<string, THREE.Group>();
  private relays = new Map<string, THREE.Group>();
  private checkpoints = new Map<string, THREE.Group>();
  private hazards = new Map<string, THREE.Group>();
  private enemies = new Map<string, THREE.Group>();
  private chunks: THREE.Group[] = [];
  private bulletMesh: THREE.InstancedMesh;
  private dust: THREE.Points;
  private heart = new THREE.Group();
  private particles: {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    life: number;
  }[] = [];
  private cameraTarget = new THREE.Vector2();
  private shake = 0;
  private muzzle = new THREE.Mesh();
  private muzzleLife = 0;
  private craftLight = new THREE.PointLight("#c6dcbb", 22, 22, 2);
  private protectionRing = new THREE.Mesh();
  private glowMaterial?: THREE.MeshBasicMaterial;
  private world?: World;
  private scratch = new THREE.Object3D();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private textures: THREE.Texture[] = [];
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.setupStone();
    this.renderer.setClearColor("#071017");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.add(new THREE.AmbientLight("#9cbbc1", 1));
    this.scene.add(this.craftLight);
    const sun = new THREE.DirectionalLight("#ffcea0", 2.5);
    sun.position.set(-15, 25, 30);
    this.scene.add(sun);
    const blue = new THREE.DirectionalLight("#3b96ba", 1.2);
    blue.position.set(10, -12, 15);
    this.scene.add(blue);
    this.camera.position.z = 45;
    this.scene.add(this.root);
    this.bulletMesh = new THREE.InstancedMesh(
      this.geo("sphere"),
      this.mat("#fff4d6", "#ffb862", 0.8),
      1000,
    );
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.frustumCulled = false;
    this.scene.add(this.bulletMesh);
    const dustGeometry = new THREE.BufferGeometry(),
      vertices = new Float32Array(300 * 3),
      rand = stream("floating-dust");
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i] = (rand() - 0.5) * 90;
      vertices[i + 1] = (rand() - 0.5) * 65;
      vertices[i + 2] = rand() * 10 - 7;
    }
    dustGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(vertices, 3),
    );
    this.dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: "#a3c6ba",
        size: 0.065,
        transparent: true,
        opacity: 0.35,
      }),
    );
    this.scene.add(this.dust);
    this.resize();
  }
  private setupStone() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d")!,
      random = stream("basalt-grain-v1");
    const pixels = ctx.createImageData(128, 128);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const shade = 180 + random() * 65;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    ctx.strokeStyle = "#393b3930";
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      let x = random() * 128,
        y = random() * 128;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (random() - 0.4) * 20;
        y += (random() - 0.5) * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(cv);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    this.textures.push(texture);
    const stone = this.mat("#ffffff");
    stone.map = texture;
    stone.bumpMap = texture;
    stone.bumpScale = 0.07;
    const shape = new THREE.Shape();
    const n = 0.47;
    shape.moveTo(-n, -n);
    shape.lineTo(n, -n);
    shape.lineTo(n, n);
    shape.lineTo(-n, n);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.9,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.03,
      bevelSegments: 1,
      steps: 1,
    });
    geometry.translate(0, 0, -0.45);
    this.geometries.set("rock", geometry);
  }
  private glow(parent: THREE.Object3D, x: number, y: number, size: number) {
    if (!this.glowMaterial) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const ctx = cv.getContext("2d")!,
        gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "#78dcc666");
      gradient.addColorStop(0.2, "#3cbca544");
      gradient.addColorStop(0.6, "#22998018");
      gradient.addColorStop(1, "#1e807000");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(cv);
      this.textures.push(texture);
      this.glowMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.geometries.set("glow", new THREE.PlaneGeometry(1, 1));
    }
    const mesh = new THREE.Mesh(this.geo("glow"), this.glowMaterial);
    mesh.position.set(x, y, -2);
    mesh.scale.set(size, size, 1);
    parent.add(mesh);
  }
  private mat(color: string, emissive = "#000000", intensity = 0) {
    const key = color + emissive + intensity;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.8,
          metalness: 0.2,
          emissive,
          emissiveIntensity: intensity,
        }),
      );
    return this.materials.get(key)!;
  }
  private geo(type: string) {
    if (!this.geometries.has(type))
      this.geometries.set(
        type,
        type === "sphere"
          ? new THREE.SphereGeometry(1, 12, 8)
          : type === "ring"
            ? new THREE.TorusGeometry(1, 0.08, 5, 32)
            : type === "cylinder"
              ? new THREE.CylinderGeometry(1, 1, 1, 8)
              : type === "cone"
                ? new THREE.ConeGeometry(1, 1, 6)
                : new THREE.BoxGeometry(1, 1, 1),
      );
    return this.geometries.get(type)!;
  }
  private mesh(
    parent: THREE.Object3D,
    type: string,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    emissive?: string,
    intensity = 1,
  ) {
    const mesh = new THREE.Mesh(
      this.geo(type),
      this.mat(color, emissive, emissive ? intensity : 0),
    );
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }
  resize(low = false) {
    const width = this.canvas.clientWidth || innerWidth,
      height = this.canvas.clientHeight || innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.75));
    this.renderer.setSize(width, height, false);
    const spanY = 37;
    this.camera.top = spanY / 2;
    this.camera.bottom = -spanY / 2;
    this.camera.left = (-spanY * width) / height / 2;
    this.camera.right = -this.camera.left;
    this.camera.updateProjectionMatrix();
  }
  setWorld(world: World) {
    this.clearWorld();
    this.world = world;
    this.cameraTarget.set(world.spawn.x, world.spawn.y);
    this.camera.position.set(world.spawn.x, world.spawn.y, 45);
    const rand = stream(`${world.seed}|decoration-v1`),
      chunkSize = 16;
    for (let cy = 0; cy < world.rows; cy += chunkSize)
      for (let cx = 0; cx < world.cols; cx += chunkSize) {
        const chunk = new THREE.Group();
        chunk.userData = { x: (cx + 8) * TILE, y: (cy + 8) * TILE };
        this.chunks.push(chunk);
        this.root.add(chunk);
        const walls: { x: number; y: number; edge: boolean; shade: number }[] =
            [],
          trim: { x: number; y: number; sx: number; sy: number }[] = [];
        for (let y = cy; y < Math.min(cy + chunkSize, world.rows); y++)
          for (let x = cx; x < Math.min(cx + chunkSize, world.cols); x++)
            if (world.cells[y * world.cols + x]) {
              let edge = false;
              for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ])
                if (world.cells[(y + dy!) * world.cols + x + dx!] === 0) {
                  edge = true;
                  trim.push({
                    x: (x + 0.5) * TILE + dx! * (TILE / 2 - 0.035),
                    y: (y + 0.5) * TILE + dy! * (TILE / 2 - 0.035),
                    sx: dx ? 0.07 : TILE - 0.03,
                    sy: dy ? 0.07 : TILE - 0.03,
                  });
                }
              walls.push({
                x: (x + 0.5) * TILE,
                y: (y + 0.5) * TILE,
                edge,
                shade: rand(),
              });
            }
        for (const edge of [false, true]) {
          const selected = walls.filter((w) => w.edge === edge);
          if (!selected.length) continue;
          const batch = new THREE.InstancedMesh(
            this.geo(edge ? "rock" : "box"),
            this.mat(edge ? "#ffffff" : "#172421"),
            selected.length,
          );
          selected.forEach((w, i) => {
            this.scratch.position.set(w.x, w.y, edge ? -0.25 : -0.1);
            this.scratch.scale.set(TILE, TILE, edge ? 2.5 : 2.8);
            this.scratch.rotation.set(0, 0, 0);
            this.scratch.updateMatrix();
            batch.setMatrixAt(i, this.scratch.matrix);
            if (edge)
              batch.setColorAt(
                i,
                new THREE.Color(
                  w.shade < 0.35 ? "#605e50" : "#705a47",
                ).multiplyScalar(0.85 + w.shade * 0.28),
              );
          });
          chunk.add(batch);
          if (edge) {
            const seams = new THREE.InstancedMesh(
              this.geo("box"),
              this.mat("#22292a"),
              selected.length,
            );
            selected.forEach((w, i) => {
              this.scratch.position.set(w.x, w.y, 1.05);
              this.scratch.scale.set(TILE - 0.015, 0.015, 0.015);
              this.scratch.updateMatrix();
              seams.setMatrixAt(i, this.scratch.matrix);
            });
            chunk.add(seams);
          }
        }
        if (trim.length) {
          const batch = new THREE.InstancedMesh(
            this.geo("box"),
            this.mat("#8b805e"),
            trim.length,
          );
          trim.forEach((p, i) => {
            this.scratch.position.set(p.x, p.y, 1.1);
            this.scratch.scale.set(p.sx, p.sy, 0.1);
            this.scratch.updateMatrix();
            batch.setMatrixAt(i, this.scratch.matrix);
          });
          chunk.add(batch);
        }
      }
    for (const room of world.rooms) {
      const group = new THREE.Group();
      group.position.set(room.x, room.y, 0);
      group.userData = { x: room.x, y: room.y };
      this.root.add(group);
      this.chunks.push(group);
      this.mesh(group, "box", "#101e24", 0, 0, -7, 28, 24, 0.1);
      for (let i = 0; i < 7; i++) {
        const x = (rand() - 0.5) * 26,
          y = -7 + rand() * 2,
          scale = 1 + rand() * 4;
        this.mesh(
          group,
          "cone",
          "#172b31",
          x,
          y,
          -5 - rand() * 2,
          scale,
          scale * 2,
          0.6,
        ).rotation.z = 0.2 * (rand() - 0.5);
        this.mesh(
          group,
          "cone",
          "#14242a",
          (rand() - 0.5) * 26,
          9,
          -5,
          scale / 2,
          scale * 2,
          0.7,
        ).rotation.z = Math.PI;
      }
      // Ruined pillars and conduits live behind the flight plane.
      for (const x of [-9, 9]) {
        this.mesh(group, "box", "#283333", x, -1, -3.5, 0.7, 16, 0.7);
        this.mesh(group, "box", "#38413c", x, 6.5, -3.5, 1.5, 0.6, 1);
      }
      this.mesh(group, "box", "#324342", 0, 6.5, -4, 18, 0.18, 0.3);
      for (let i = 0; i < 4; i++)
        this.mesh(
          group,
          "box",
          "#56aba5",
          -6 + i * 4,
          -6,
          -3,
          0.12,
          0.45 + rand(),
          0.15,
          "#3a8884",
          0.6,
        );
      if (room.kind === "optional") {
        const relic = this.mesh(
          group,
          "ring",
          "#b49155",
          0,
          0,
          -1,
          2,
          2,
          0.3,
          "#78582d",
          0.3,
        );
        relic.rotation.z = Math.PI / 4;
        this.mesh(
          group,
          "sphere",
          "#d0a355",
          0,
          0,
          -1,
          0.4,
          0.7,
          0.3,
          "#d39d4e",
          1.5,
        );
      }
    }
    for (const gate of world.gates) {
      const group = new THREE.Group();
      group.position.set(gate.x, gate.y, 0);
      this.root.add(group);
      this.gates.set(gate.id, group);
      const horizontal = gate.width > gate.height;
      this.mesh(
        group,
        "box",
        "#a58144",
        0,
        0,
        0.05,
        gate.width,
        gate.height,
        0.6,
      );
      for (let i = -1; i <= 1; i++)
        this.mesh(
          group,
          "box",
          "#ffc16a",
          horizontal ? (i * gate.width) / 4 : 0,
          horizontal ? 0 : (i * gate.height) / 4,
          0.4,
          horizontal ? 0.12 : 1.5,
          horizontal ? 1.5 : 0.12,
          0.05,
          "#ff9d31",
          1.5,
        );
    }
    for (const relay of world.relays) {
      const group = new THREE.Group();
      group.position.set(relay.x, relay.y, -0.6);
      this.root.add(group);
      this.relays.set(relay.id, group);
      this.glow(this.root, relay.x, relay.y + 0.7, 14);
      this.mesh(group, "box", "#455454", 0, -1.5, 0, 3.2, 0.7, 1.4);
      this.mesh(group, "box", "#283f44", 0, -0.4, 0, 1.1, 2.1, 1);
      this.mesh(
        group,
        "ring",
        "#cf9b54",
        0,
        0.7,
        0,
        1.7,
        1.7,
        1,
        "#986122",
        0.4,
      );
      this.mesh(
        group,
        "sphere",
        "#ffc97a",
        0,
        0.7,
        0.4,
        0.4,
        0.65,
        0.4,
        "#edac57",
        2,
      );
      for (const x of [-2.2, 2.2])
        this.mesh(group, "box", "#78817a", x, 0, -0.5, 0.2, 4, 0.3);
    }
    for (const cp of world.checkpoints) {
      const group = new THREE.Group();
      group.position.set(cp.x, cp.y, -1);
      this.root.add(group);
      this.checkpoints.set(cp.id, group);
      this.glow(this.root, cp.x, cp.y, 16);
      this.mesh(
        group,
        "ring",
        "#568d88",
        0,
        0,
        0,
        2.25,
        2.25,
        0.5,
        "#347a70",
        0.7,
      );
      this.mesh(group, "box", "#51706c", 0, -2.5, 0.3, 5, 0.4, 2);
      for (const x of [-2.7, 2.7]) {
        this.mesh(group, "box", "#477978", x, -0.5, 0, 0.22, 4, 0.4);
        this.mesh(
          group,
          "sphere",
          "#9ef0c7",
          x,
          1.6,
          0.1,
          0.15,
          0.15,
          0.15,
          "#80eec9",
          2,
        );
      }
    }
    for (const h of world.hazards) {
      const group = new THREE.Group();
      group.position.set(h.x, h.y, 0.4);
      this.root.add(group);
      this.hazards.set(h.id, group);
      this.mesh(
        group,
        "box",
        h.kind === "beam" ? "#ffdba0" : "#d09350",
        0,
        0,
        0,
        h.horizontal ? h.length : 1.4,
        h.horizontal ? 1.4 : h.length,
        h.kind === "beam" ? 0.12 : 1,
        "#d88427",
        h.kind === "beam" ? 3 : 0.2,
      );
      const supports = new THREE.Group();
      supports.position.copy(group.position);
      this.root.add(supports);
      for (const side of [-1, 1]) {
        this.mesh(
          supports,
          "box",
          "#7b7156",
          h.horizontal ? side * (h.length / 2 + 0.25) : 0,
          h.horizontal ? 0 : side * (h.length / 2 + 0.25),
          0,
          h.horizontal ? 0.5 : 2,
          h.horizontal ? 2 : 0.5,
          1,
        );
        this.mesh(
          supports,
          "sphere",
          "#ffc96e",
          h.horizontal ? side * (h.length / 2 + 0.3) : 0,
          h.horizontal ? 0 : side * (h.length / 2 + 0.3),
          0.6,
          0.14,
          0.14,
          0.14,
          "#ffc96e",
          2,
        );
      }
    }
    for (const e of world.enemies) {
      const group = new THREE.Group();
      group.position.set(e.x, e.y, 0.2);
      this.root.add(group);
      this.enemies.set(e.id, group);
      this.mesh(
        group,
        e.kind === "emitter" ? "box" : "sphere",
        "#635a50",
        0,
        0,
        0,
        0.65,
        0.45,
        0.5,
      );
      this.mesh(
        group,
        "sphere",
        "#ff9165",
        0,
        0,
        0.45,
        0.22,
        0.16,
        0.12,
        "#ff6338",
        2,
      );
      if (e.kind === "emitter")
        this.mesh(
          group,
          "box",
          "#a79a7f",
          e.facing * 0.6,
          0,
          0,
          0.7,
          0.15,
          0.2,
        );
      else
        for (const x of [-0.6, 0.6])
          this.mesh(group, "box", "#9b917e", x, 0.35, 0, 0.8, 0.06, 0.25);
    }
    this.glow(this.root, world.heart.x, world.heart.y, 26);
    this.heart.position.set(world.heart.x, world.heart.y, -1);
    this.root.add(this.heart);
    for (const scale of [3, 4.1, 5.2])
      this.mesh(this.heart, "ring", "#586c65", 0, 0, -0.6, scale, scale, 0.6);
    this.mesh(
      this.heart,
      "sphere",
      "#70e2c0",
      0,
      0,
      0.1,
      1.7,
      2.1,
      0.8,
      "#3bd9b2",
      2,
    );
    for (const x of [-6, 6])
      this.mesh(this.heart, "box", "#394a46", x, 0, -2, 0.8, 15, 2);
    this.createCraft();
    this.root.add(this.craft);
    this.protectionRing = this.mesh(
      this.root,
      "ring",
      "#82c3ad",
      0,
      0,
      0.4,
      0.9,
      0.68,
      0.2,
      "#64b797",
      0.5,
    );
  }
  private createCraft() {
    this.craft = new THREE.Group();
    const g = this.craft;
    this.mesh(g, "sphere", "#deb979", 0, 0, 0.2, 0.69, 0.3, 0.34);
    this.mesh(
      g,
      "sphere",
      "#6fc3c5",
      0.33,
      0.08,
      0.34,
      0.31,
      0.23,
      0.22,
      "#297981",
      0.35,
    );
    this.mesh(
      g,
      "box",
      "#b39b71",
      -0.85,
      0.08,
      0.1,
      0.9,
      0.1,
      0.12,
    ).rotation.z = -0.1;
    this.mesh(g, "box", "#c6ad76", -1.3, 0.21, 0.12, 0.18, 0.48, 0.08);
    this.mesh(g, "box", "#383c35", 0.43, -0.19, 0.28, 0.65, 0.075, 0.1);
    for (const z of [-0.1, 0.5]) {
      this.mesh(g, "box", "#a0a397", 0, -0.4, z, 1.25, 0.055, 0.055);
      for (const x of [-0.35, 0.35])
        this.mesh(g, "box", "#606f68", x, -0.3, z, 0.035, 0.2, 0.035);
    }
    this.mesh(g, "box", "#8a9583", -0.08, 0.4, 0.2, 0.06, 0.3, 0.06);
    this.rotor = new THREE.Group();
    this.rotor.position.set(-0.08, 0.54, 0.2);
    g.add(this.rotor);
    this.mesh(this.rotor, "box", "#c8c8aa", 0, 0, 0, 2.5, 0.027, 0.09);
    this.mesh(this.rotor, "box", "#afb69c", 0, 0, 0, 0.09, 0.027, 2.5);
    this.muzzle = this.mesh(
      g,
      "sphere",
      "#fff0ac",
      0.95,
      -0.19,
      0.28,
      0.3,
      0.1,
      0.1,
      "#ffd46d",
      3,
    );
    this.mesh(
      g,
      "sphere",
      "#adf4d5",
      -0.42,
      0.2,
      0.49,
      0.065,
      0.065,
      0.065,
      "#80f5cb",
      3,
    );
  }
  event(event: GameEvent, settings: Settings) {
    if (event.type === "shot") this.muzzleLife = 0.07;
    if (event.type === "hit" && !settings.reducedMotion) this.shake = 0.3;
    if (
      !["enemy", "relay", "hit", "complete"].includes(event.type) ||
      settings.lowEffects
    )
      return;
    for (let i = 0; i < 14; i++) {
      const angle = i * 2.399,
        mesh = this.mesh(
          this.root,
          "sphere",
          event.type === "relay" ? "#86ffca" : "#f5b16d",
          event.position.x,
          event.position.y,
          1,
          0.08,
          0.08,
          0.08,
          "#ba874a",
          2,
        );
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * (2 + i / 5),
        vy: Math.sin(angle) * (2 + i / 5),
        life: 0.8,
      });
    }
  }
  render(
    context: Context,
    delta: number,
    clock: number,
    settings: Settings,
    demo = false,
    alpha = 1,
    previous?: Vec,
  ) {
    const { runtime: s, world: w } = context,
      p = s.player;
    const px = previous ? THREE.MathUtils.lerp(previous.x, p.x, alpha) : p.x,
      py = previous ? THREE.MathUtils.lerp(previous.y, p.y, alpha) : p.y;
    this.craft.position.set(
      px,
      py + (demo ? Math.sin(clock * 1.3) * 0.12 : 0),
      0.7,
    );
    this.craft.scale.x = p.facing;
    this.craft.rotation.z = settings.reducedMotion ? 0 : -p.vx * 0.012;
    this.rotor.rotation.y = clock * 55;
    this.muzzleLife = Math.max(0, this.muzzleLife - delta);
    this.muzzle.visible = this.muzzleLife > 0 && !settings.reducedFlashing;
    this.craft.visible = true;
    this.protectionRing.visible = p.protection > 0;
    this.protectionRing.position.set(px, py, 0.4);
    this.craftLight.position.set(px + 1, py + 1, 4);
    const look = settings.reducedMotion ? 0 : p.vx * 0.35;
    let tx = px + look + (demo ? 7 : 0),
      ty = py;
    if (Math.abs(tx - this.cameraTarget.x) < 2) tx = this.cameraTarget.x;
    if (Math.abs(ty - this.cameraTarget.y) < 1.2) ty = this.cameraTarget.y;
    this.cameraTarget.lerp(new THREE.Vector2(tx, ty), 1 - Math.exp(-delta * 4));
    const halfX = this.camera.right,
      halfY = this.camera.top;
    this.camera.position.x = THREE.MathUtils.clamp(
      this.cameraTarget.x,
      halfX,
      Math.max(halfX, w.width - halfX),
    );
    this.camera.position.y = THREE.MathUtils.clamp(
      this.cameraTarget.y,
      halfY,
      Math.max(halfY, w.height - halfY),
    );
    if (this.shake > 0) {
      this.camera.position.x += Math.sin(clock * 81) * this.shake;
      this.camera.position.y += Math.cos(clock * 73) * this.shake;
      this.shake = Math.max(0, this.shake - delta);
    }
    this.dust.position.set(
      this.camera.position.x,
      this.camera.position.y + Math.sin(clock * 0.1),
      0,
    );
    this.dust.visible = !settings.lowEffects;
    for (const chunk of this.chunks)
      chunk.visible =
        Math.abs(chunk.userData.x - this.camera.position.x) < halfX + 35 &&
        Math.abs(chunk.userData.y - this.camera.position.y) < halfY + 30;
    for (const gate of w.gates) {
      const group = this.gates.get(gate.id)!;
      group.visible = (s.relays & gate.requires) !== gate.requires;
    }
    for (const r of w.relays) {
      const group = this.relays.get(r.id)!;
      group.children[2]!.rotation.z = s.time * 0.2;
      const active = !!(s.relays & r.bit);
      (group.children[3] as THREE.Mesh).material = this.mat(
        active ? "#9affe0" : "#ffc97a",
        active ? "#42dab3" : "#edac57",
        2,
      );
    }
    for (const cp of w.checkpoints)
      this.checkpoints.get(cp.id)!.children[0]!.rotation.z = -clock * 0.08;
    for (const h of w.hazards) {
      const group = this.hazards.get(h.id)!,
        rect = hazardRect(h, s.time);
      group.visible = s.status !== "completed" && !!rect;
      if (rect) {
        group.position.set(rect.x, rect.y, 0.4);
        group.scale.set(
          rect.width / (h.horizontal ? h.length : 1.4),
          rect.height / (h.horizontal ? 1.4 : h.length),
          1,
        );
        if (h.kind === "beam" && !settings.reducedFlashing)
          group.scale.z = 0.7 + 0.3 * Math.sin(clock * 40);
      }
    }
    s.enemies.forEach((e) => {
      const group = this.enemies.get(e.id)!;
      group.visible = e.health > 0;
      group.position.x = e.x;
      group.position.y = e.y;
    });
    this.bulletMesh.count = Math.min(s.projectiles.length, 1000);
    s.projectiles.slice(0, 1000).forEach((b, i) => {
      this.scratch.position.set(b.x, b.y, 0.9);
      this.scratch.rotation.set(0, 0, Math.atan2(b.vy, b.vx));
      this.scratch.scale.set(b.hostile ? 0.18 : 0.28, 0.055, 0.055);
      this.scratch.updateMatrix();
      this.bulletMesh.setMatrixAt(i, this.scratch.matrix);
      this.bulletMesh.setColorAt(
        i,
        new THREE.Color(b.hostile ? "#ff7148" : "#efffd4"),
      );
    });
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    if (this.bulletMesh.instanceColor)
      this.bulletMesh.instanceColor.needsUpdate = true;
    this.heart.children.slice(0, 3).forEach((ring, i) => {
      ring.rotation.z = s.time * 0.03 * (i % 2 ? -1 : 1);
    });
    const core = this.heart.children[3];
    if (core) {
      core.scale.setScalar(
        s.status === "completed" ? 0.25 : 1 + Math.sin(s.time * 2) * 0.05,
      );
      core.scale.multiply(new THREE.Vector3(1.7, 2.1, 0.8));
    }
    for (const particle of this.particles) {
      particle.life -= delta;
      particle.mesh.position.x += particle.vx * delta;
      particle.mesh.position.y += particle.vy * delta;
      particle.mesh.scale.setScalar(Math.max(0, particle.life) * 0.13);
      if (particle.life <= 0) this.root.remove(particle.mesh);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.renderer.render(this.scene, this.camera);
  }
  private clearWorld() {
    this.root.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    this.root.clear();
    this.chunks = [];
    this.gates.clear();
    this.relays.clear();
    this.checkpoints.clear();
    this.hazards.clear();
    this.enemies.clear();
    this.particles = [];
    this.heart = new THREE.Group();
    this.renderer.renderLists.dispose();
  }
  dispose() {
    this.clearWorld();
    this.bulletMesh.dispose();
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
    for (const geo of this.geometries.values()) geo.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.glowMaterial?.dispose();
    this.renderer.dispose();
  }
}
