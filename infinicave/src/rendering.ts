import * as THREE from 'three';
import { TILE, type World, type Context, type Settings, type Vec } from './domain';
import { stream } from './generation';
import { hazardActive } from './physics';
import type { GameEvent } from './simulation';
const UP = new THREE.Vector3(0, 0, 1);
export class CaveRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-30, 30, 20, -20, .1, 100);
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
  private particles: { mesh: THREE.Mesh; vx: number; vy: number; life: number }[] = [];
  private cameraTarget = new THREE.Vector2();
  private shake = 0;
  private world?: World;
  private scratch = new THREE.Object3D();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#071017'); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.scene.add(new THREE.AmbientLight('#9cbbc1', 1.6));
    const sun = new THREE.DirectionalLight('#ffcea0', 3.2); sun.position.set(-15, 25, 30); this.scene.add(sun);
    const blue = new THREE.DirectionalLight('#3b96ba', 1.4); blue.position.set(10, -12, 15); this.scene.add(blue);
    this.camera.position.z = 45; this.scene.add(this.root);
    this.bulletMesh = new THREE.InstancedMesh(this.geo('sphere'), this.mat('#ffa550', '#ff9d43', 4), 1000); this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.bulletMesh.frustumCulled = false; this.scene.add(this.bulletMesh);
    const dustGeometry = new THREE.BufferGeometry(), vertices = new Float32Array(300 * 3), rand = stream('floating-dust');
    for (let i = 0; i < vertices.length; i += 3) { vertices[i] = (rand() - .5) * 90; vertices[i + 1] = (rand() - .5) * 65; vertices[i + 2] = rand() * 10 - 7; }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3)); this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#a3c6ba', size: .065, transparent: true, opacity: .35 })); this.scene.add(this.dust);
    this.resize();
  }
  private mat(color: string, emissive = '#000000', intensity = 0) { const key = color + emissive + intensity; if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: .2, emissive, emissiveIntensity: intensity })); return this.materials.get(key)!; }
  private geo(type: string) { if (!this.geometries.has(type)) this.geometries.set(type, type === 'sphere' ? new THREE.SphereGeometry(1, 12, 8) : type === 'ring' ? new THREE.TorusGeometry(1, .08, 5, 32) : type === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 1, 8) : type === 'cone' ? new THREE.ConeGeometry(1, 1, 6) : new THREE.BoxGeometry(1, 1, 1)); return this.geometries.get(type)!; }
  private mesh(parent: THREE.Object3D, type: string, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, emissive?: string, intensity = 1) { const mesh = new THREE.Mesh(this.geo(type), this.mat(color, emissive, emissive ? intensity : 0)); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh; }
  resize(low = false) { const width = this.canvas.clientWidth || innerWidth, height = this.canvas.clientHeight || innerHeight; this.renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.75)); this.renderer.setSize(width, height, false); const spanY = 37; this.camera.top = spanY / 2; this.camera.bottom = -spanY / 2; this.camera.left = -spanY * width / height / 2; this.camera.right = -this.camera.left; this.camera.updateProjectionMatrix(); }
  setWorld(world: World) {
    this.clearWorld(); this.world = world; this.cameraTarget.set(world.spawn.x, world.spawn.y); this.camera.position.set(world.spawn.x, world.spawn.y, 45);
    const rand = stream(`${world.seed}|decoration-v1`), chunkSize = 16;
    for (let cy = 0; cy < world.rows; cy += chunkSize) for (let cx = 0; cx < world.cols; cx += chunkSize) {
      const chunk = new THREE.Group(); chunk.userData = { x: (cx + 8) * TILE, y: (cy + 8) * TILE }; this.chunks.push(chunk); this.root.add(chunk);
      const walls: { x: number; y: number; edge: boolean; shade: number }[] = [], trim: { x: number; y: number; sx: number; sy: number }[] = [];
      for (let y = cy; y < Math.min(cy + chunkSize, world.rows); y++) for (let x = cx; x < Math.min(cx + chunkSize, world.cols); x++) if (world.cells[y * world.cols + x]) {
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (world.cells[(y + dy!) * world.cols + x + dx!] === 0) { edge = true; trim.push({ x: (x + .5) * TILE + dx! * .96, y: (y + .5) * TILE + dy! * .96, sx: dx ? .07 : TILE - .03, sy: dy ? .07 : TILE - .03 }); }
        walls.push({ x: (x + .5) * TILE, y: (y + .5) * TILE, edge, shade: rand() });
      }
      if (walls.length) {
        const batch = new THREE.InstancedMesh(this.geo('box'), this.mat('#ffffff'), walls.length);
        walls.forEach((w, i) => { this.scratch.position.set(w.x, w.y, w.edge ? -.25 : -.1); this.scratch.scale.set(TILE, TILE, w.edge ? 2.5 : 2.8); this.scratch.rotation.set(0, 0, 0); this.scratch.updateMatrix(); batch.setMatrixAt(i, this.scratch.matrix); batch.setColorAt(i, new THREE.Color(w.edge ? '#695144' : '#272b2a').multiplyScalar(.72 + w.shade * .42)); }); chunk.add(batch);
        // Fine masonry seams are confined to the solid side of the collision outline.
        const seams = new THREE.InstancedMesh(this.geo('box'), this.mat('#22292a'), walls.length);
        walls.forEach((w, i) => { this.scratch.position.set(w.x, w.y, 1.32); this.scratch.scale.set(TILE - .015, .025, .015); this.scratch.updateMatrix(); seams.setMatrixAt(i, this.scratch.matrix); }); chunk.add(seams);
      }
      if (trim.length) { const batch = new THREE.InstancedMesh(this.geo('box'), this.mat('#a5835a'), trim.length); trim.forEach((p, i) => { this.scratch.position.set(p.x, p.y, 1.1); this.scratch.scale.set(p.sx, p.sy, .1); this.scratch.updateMatrix(); batch.setMatrixAt(i, this.scratch.matrix); }); chunk.add(batch); }
    }
    for (const room of world.rooms) {
      const group = new THREE.Group(); group.position.set(room.x, room.y, 0); group.userData = { x: room.x, y: room.y }; this.root.add(group); this.chunks.push(group);
      this.mesh(group, 'box', '#101e24', 0, 0, -7, 28, 24, .1);
      for (let i = 0; i < 7; i++) {
        const x = (rand() - .5) * 26, y = -7 + rand() * 2, scale = 1 + rand() * 4;
        this.mesh(group, 'cone', '#172b31', x, y, -5 - rand() * 2, scale, scale * 2, .6).rotation.z = .2 * (rand() - .5);
        this.mesh(group, 'cone', '#14242a', (rand() - .5) * 26, 9, -5, scale / 2, scale * 2, .7).rotation.z = Math.PI;
      }
      // Ruined pillars and conduits live behind the flight plane.
      for (const x of [-9, 9]) { this.mesh(group, 'box', '#283333', x, -1, -3.5, .7, 16, .7); this.mesh(group, 'box', '#38413c', x, 6.5, -3.5, 1.5, .6, 1); }
      this.mesh(group, 'box', '#324342', 0, 6.5, -4, 18, .18, .3);
      for (let i = 0; i < 4; i++) this.mesh(group, 'box', '#56aba5', -6 + i * 4, -6, -3, .12, .45 + rand(), .15, '#3a8884', .6);
      if (room.kind === 'optional') {
        const relic = this.mesh(group, 'ring', '#b49155', 0, 0, -1, 2, 2, .3, '#78582d', .3); relic.rotation.z = Math.PI / 4;
        this.mesh(group, 'sphere', '#d0a355', 0, 0, -1, .4, .7, .3, '#d39d4e', 1.5);
      }
    }
    for (const gate of world.gates) {
      const group = new THREE.Group(); group.position.set(gate.x, gate.y, 0); this.root.add(group); this.gates.set(gate.id, group);
      const horizontal = gate.width > gate.height;
      this.mesh(group, 'box', '#a58144', 0, 0, .05, gate.width, gate.height, .6);
      for (let i = -1; i <= 1; i++) this.mesh(group, 'box', '#ffc16a', horizontal ? i * gate.width / 4 : 0, horizontal ? 0 : i * gate.height / 4, .4, horizontal ? .12 : 1.5, horizontal ? 1.5 : .12, .05, '#ff9d31', 1.5);
    }
    for (const relay of world.relays) {
      const group = new THREE.Group(); group.position.set(relay.x, relay.y, -.6); this.root.add(group); this.relays.set(relay.id, group);
      this.mesh(group, 'box', '#455454', 0, -1.5, 0, 3.2, .7, 1.4); this.mesh(group, 'box', '#283f44', 0, -.4, 0, 1.1, 2.1, 1);
      this.mesh(group, 'ring', '#cf9b54', 0, .7, 0, 1.7, 1.7, 1, '#986122', .4);
      this.mesh(group, 'sphere', '#ffc97a', 0, .7, .4, .4, .65, .4, '#edac57', 2);
      for (const x of [-2.2, 2.2]) this.mesh(group, 'box', '#78817a', x, 0, -.5, .2, 4, .3);
    }
    for (const cp of world.checkpoints) {
      const group = new THREE.Group(); group.position.set(cp.x, cp.y, -1); this.root.add(group); this.checkpoints.set(cp.id, group);
      this.mesh(group, 'ring', '#568d88', 0, 0, 0, 2.25, 2.25, .5, '#347a70', .7);
      this.mesh(group, 'box', '#51706c', 0, -2.5, .3, 5, .4, 2);
      for (const x of [-2.7, 2.7]) { this.mesh(group, 'box', '#477978', x, -.5, 0, .22, 4, .4); this.mesh(group, 'sphere', '#9ef0c7', x, 1.6, .1, .15, .15, .15, '#80eec9', 2); }
    }
    for (const h of world.hazards) {
      const group = new THREE.Group(); group.position.set(h.x, h.y, .4); this.root.add(group); this.hazards.set(h.id, group);
      this.mesh(group, 'box', h.kind === 'beam' ? '#ffdba0' : '#d09350', 0, 0, 0, h.horizontal ? h.length : 1.4, h.horizontal ? 1.4 : h.length, h.kind === 'beam' ? .12 : 1, '#d88427', h.kind === 'beam' ? 3 : .2);
      const supports = new THREE.Group(); supports.position.copy(group.position); this.root.add(supports);
      for (const side of [-1, 1]) {
        this.mesh(supports, 'box', '#7b7156', h.horizontal ? side * (h.length / 2 + .25) : 0, h.horizontal ? 0 : side * (h.length / 2 + .25), 0, h.horizontal ? .5 : 2, h.horizontal ? 2 : .5, 1);
        this.mesh(supports, 'sphere', '#ffc96e', h.horizontal ? side * (h.length / 2 + .3) : 0, h.horizontal ? 0 : side * (h.length / 2 + .3), .6, .14, .14, .14, '#ffc96e', 2);
      }
    }
    for (const e of world.enemies) {
      const group = new THREE.Group(); group.position.set(e.x, e.y, .2); this.root.add(group); this.enemies.set(e.id, group);
      this.mesh(group, e.kind === 'emitter' ? 'box' : 'sphere', '#635a50', 0, 0, 0, .65, .45, .5);
      this.mesh(group, 'sphere', '#ff9165', 0, 0, .45, .22, .16, .12, '#ff6338', 2);
      if (e.kind === 'emitter') this.mesh(group, 'box', '#a79a7f', e.facing * .6, 0, 0, .7, .15, .2);
      else for (const x of [-.6, .6]) this.mesh(group, 'box', '#9b917e', x, .35, 0, .8, .06, .25);
    }
    this.heart.position.set(world.heart.x, world.heart.y, -1); this.root.add(this.heart);
    for (const scale of [3, 4.1, 5.2]) this.mesh(this.heart, 'ring', '#586c65', 0, 0, -.6, scale, scale, .6);
    this.mesh(this.heart, 'sphere', '#70e2c0', 0, 0, .1, 1.7, 2.1, .8, '#3bd9b2', 2);
    for (const x of [-6, 6]) this.mesh(this.heart, 'box', '#394a46', x, 0, -2, .8, 15, 2);
    this.createCraft(); this.root.add(this.craft);
  }
  private createCraft() {
    this.craft = new THREE.Group(); const g = this.craft;
    this.mesh(g, 'sphere', '#deb979', 0, 0, .2, .69, .3, .34);
    this.mesh(g, 'sphere', '#6fc3c5', .33, .08, .34, .31, .23, .22, '#297981', .35);
    this.mesh(g, 'box', '#b39b71', -.85, .08, .1, .9, .1, .12).rotation.z = -.1;
    this.mesh(g, 'box', '#c6ad76', -1.3, .21, .12, .18, .48, .08);
    this.mesh(g, 'box', '#383c35', .43, -.19, .28, .65, .075, .1);
    for (const z of [-.1, .5]) { this.mesh(g, 'box', '#a0a397', 0, -.4, z, 1.25, .055, .055); for (const x of [-.35, .35]) this.mesh(g, 'box', '#606f68', x, -.3, z, .035, .2, .035); }
    this.mesh(g, 'box', '#8a9583', -.08, .4, .2, .06, .3, .06);
    this.rotor = new THREE.Group(); this.rotor.position.set(-.08, .54, .2); g.add(this.rotor);
    this.mesh(this.rotor, 'box', '#c8c8aa', 0, 0, 0, 2.5, .027, .09);
    this.mesh(this.rotor, 'box', '#afb69c', 0, 0, 0, .09, .027, 2.5);
    this.mesh(g, 'sphere', '#adf4d5', -.42, .2, .49, .065, .065, .065, '#80f5cb', 3);
  }
  event(event: GameEvent, settings: Settings) {
    if (event.type === 'hit' && !settings.reducedMotion) this.shake = .3;
    if (!['enemy', 'relay', 'hit', 'complete'].includes(event.type) || settings.lowEffects) return;
    for (let i = 0; i < 14; i++) { const angle = i * 2.399, mesh = this.mesh(this.root, 'sphere', event.type === 'relay' ? '#86ffca' : '#f5b16d', event.position.x, event.position.y, 1, .08, .08, .08, '#ba874a', 2); this.particles.push({ mesh, vx: Math.cos(angle) * (2 + i / 5), vy: Math.sin(angle) * (2 + i / 5), life: .8 }); }
  }
  render(context: Context, delta: number, clock: number, settings: Settings, demo = false, alpha = 1, previous?: Vec) {
    const { runtime: s, world: w } = context, p = s.player;
    const px = previous ? THREE.MathUtils.lerp(previous.x, p.x, alpha) : p.x, py = previous ? THREE.MathUtils.lerp(previous.y, p.y, alpha) : p.y;
    this.craft.position.set(px, py + (demo ? Math.sin(clock * 1.3) * .12 : 0), .7); this.craft.scale.x = p.facing; this.craft.rotation.z = settings.reducedMotion ? 0 : -p.vx * .012;
    this.rotor.rotation.y = clock * 55;
    this.craft.visible = settings.reducedFlashing || p.protection <= 0 || Math.floor(clock * 8) % 2 === 0;
    const look = settings.reducedMotion ? 0 : p.vx * .35;
    let tx = px + look + (demo ? 7 : 0), ty = py;
    if (Math.abs(tx - this.cameraTarget.x) < 2) tx = this.cameraTarget.x;
    if (Math.abs(ty - this.cameraTarget.y) < 1.2) ty = this.cameraTarget.y;
    this.cameraTarget.lerp(new THREE.Vector2(tx, ty), 1 - Math.exp(-delta * 4));
    const halfX = this.camera.right, halfY = this.camera.top;
    this.camera.position.x = THREE.MathUtils.clamp(this.cameraTarget.x, halfX, Math.max(halfX, w.width - halfX));
    this.camera.position.y = THREE.MathUtils.clamp(this.cameraTarget.y, halfY, Math.max(halfY, w.height - halfY));
    if (this.shake > 0) { this.camera.position.x += Math.sin(clock * 81) * this.shake; this.camera.position.y += Math.cos(clock * 73) * this.shake; this.shake = Math.max(0, this.shake - delta); }
    this.dust.position.set(this.camera.position.x, this.camera.position.y + Math.sin(clock * .1), 0); this.dust.visible = !settings.lowEffects;
    for (const chunk of this.chunks) chunk.visible = Math.abs(chunk.userData.x - this.camera.position.x) < halfX + 35 && Math.abs(chunk.userData.y - this.camera.position.y) < halfY + 30;
    for (const gate of w.gates) { const group = this.gates.get(gate.id)!; group.visible = (s.relays & gate.requires) !== gate.requires; }
    for (const r of w.relays) { const group = this.relays.get(r.id)!; group.children[2]!.rotation.z = s.time * .2; const active = !!(s.relays & r.bit); (group.children[3] as THREE.Mesh).material = this.mat(active ? '#9affe0' : '#ffc97a', active ? '#42dab3' : '#edac57', 2); }
    for (const cp of w.checkpoints) this.checkpoints.get(cp.id)!.children[0]!.rotation.z = -clock * .08;
    for (const h of w.hazards) {
      const group = this.hazards.get(h.id)!, active = s.status !== 'completed' && hazardActive(h, s.time), phase = (s.time + h.phase) % h.period;
      group.visible = active;
      // Solid crossing windows remain exact; visual movement stays on the occupied side.
      group.scale.set(1, 1, 1); if (h.kind === 'beam' && !settings.reducedFlashing) group.scale.z = .7 + .3 * Math.sin(clock * 40);
      if (h.kind === 'slider' && active) group.position.z = .4 + Math.sin(phase / h.active * Math.PI) * .5;
    }
    s.enemies.forEach(e => { const group = this.enemies.get(e.id)!; group.visible = e.health > 0; group.position.x = e.x; group.position.y = e.y; });
    this.bulletMesh.count = Math.min(s.projectiles.length, 1000);
    s.projectiles.slice(0, 1000).forEach((b, i) => { this.scratch.position.set(b.x, b.y, .9); this.scratch.rotation.set(0, 0, Math.atan2(b.vy, b.vx)); this.scratch.scale.set(b.hostile ? .18 : .28, .055, .055); this.scratch.updateMatrix(); this.bulletMesh.setMatrixAt(i, this.scratch.matrix); }); this.bulletMesh.instanceMatrix.needsUpdate = true;
    this.heart.children.slice(0, 3).forEach((ring, i) => { ring.rotation.z = s.time * .03 * (i % 2 ? -1 : 1); });
    const core = this.heart.children[3]; if (core) { core.scale.setScalar(s.status === 'completed' ? .25 : 1 + Math.sin(s.time * 2) * .05); core.scale.multiply(new THREE.Vector3(1.7, 2.1, .8)); }
    for (const particle of this.particles) { particle.life -= delta; particle.mesh.position.x += particle.vx * delta; particle.mesh.position.y += particle.vy * delta; particle.mesh.scale.setScalar(Math.max(0, particle.life) * .13); if (particle.life <= 0) this.root.remove(particle.mesh); } this.particles = this.particles.filter(p => p.life > 0);
    this.renderer.render(this.scene, this.camera);
  }
  private clearWorld() {
    this.root.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); }); this.root.clear(); this.chunks = []; this.gates.clear(); this.relays.clear(); this.checkpoints.clear(); this.hazards.clear(); this.enemies.clear(); this.particles = []; this.heart = new THREE.Group();
    this.renderer.renderLists.dispose();
  }
  dispose() { this.clearWorld(); this.bulletMesh.dispose(); this.dust.geometry.dispose(); (this.dust.material as THREE.Material).dispose(); for (const geo of this.geometries.values()) geo.dispose(); for (const material of this.materials.values()) material.dispose(); this.renderer.dispose(); }
}
