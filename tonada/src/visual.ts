import * as THREE from 'three';
import type { Track } from './document';
export class Visual {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private meshes: THREE.Mesh[] = [];
  private frame = 0;
  private last = 0;
  private geometry?: THREE.PlaneGeometry;
  private resize: ResizeObserver;
  private controller = new AbortController();
  private running = false;
  private analyser?: AnalyserNode;
  private bins = new Uint8Array(128);
  private selected = -1;
  private ray = new THREE.Raycaster();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(
    private host: HTMLElement,
    private mode: 'mixer' | 'spectrum',
    private tracks: Track[],
    private onMove: (id: string, pan: number, reverb: number) => void,
    private reducedFlash: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x101415, 1);
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, mode === 'mixer' ? 2.8 : 4, mode === 'mixer' ? 7.5 : 8);
    this.camera.lookAt(0, 0, 0);
    const grid = new THREE.GridHelper(12, 24, 0x435151, 0x263333);
    grid.position.y = -1.4;
    this.scene.add(grid);
    this.scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffd8a6, 3);
    light.position.set(2, 6, 5);
    this.scene.add(light);
    if (mode === 'mixer') {
      tracks.forEach((t, i) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 24, 16),
          new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.3, metalness: 0.25 }),
        );
        mesh.position.set(t.pan * 4, t.reverb * 3 - 1, (i - 4) * 0.7);
        this.scene.add(mesh);
        this.meshes.push(mesh);
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = t.color;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1} · ${t.name}`, 128, 35);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }),
        );
        sprite.scale.set(1.6, 0.4, 1);
        sprite.position.y = 0.32;
        mesh.add(sprite);
      });
      const canvas = this.renderer.domElement;
      canvas.style.touchAction = 'none';
      canvas.addEventListener(
        'pointerdown',
        (e) => {
          this.pointer(e);
          const hit = this.ray.intersectObjects(this.meshes)[0];
          if (hit) {
            this.selected = this.meshes.indexOf(hit.object as THREE.Mesh);
            canvas.setPointerCapture(e.pointerId);
          }
        },
        { signal: this.controller.signal },
      );
      canvas.addEventListener(
        'pointermove',
        (e) => {
          if (this.selected < 0) return;
          this.pointer(e);
          const point = new THREE.Vector3();
          this.ray.ray.intersectPlane(
            new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.meshes[this.selected]!.position.z),
            point,
          );
          const mesh = this.meshes[this.selected]!;
          mesh.position.x = THREE.MathUtils.clamp(point.x, -4, 4);
          mesh.position.y = THREE.MathUtils.clamp(point.y, -1, 2);
          this.draw();
        },
        { signal: this.controller.signal },
      );
      canvas.addEventListener(
        'pointerup',
        () => {
          if (this.selected >= 0) {
            const mesh = this.meshes[this.selected]!;
            this.onMove(tracks[this.selected]!.id, mesh.position.x / 4, (mesh.position.y + 1) / 3);
            this.selected = -1;
          }
        },
        { signal: this.controller.signal },
      );
    } else {
      this.geometry = new THREE.PlaneGeometry(10, 5, 47, 15);
      this.geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(
        this.geometry,
        new THREE.MeshBasicMaterial({
          color: 0xe4ab69,
          wireframe: true,
          transparent: true,
          opacity: 0.7,
        }),
      );
      mesh.position.y = -1.3;
      this.scene.add(mesh);
    }
    this.resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.draw();
    });
    this.resize.observe(host);
    this.draw();
  }
  private pointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
  }
  private draw() {
    this.renderer.render(this.scene, this.camera);
  }
  setAnalyser(analyser?: AnalyserNode) {
    this.analyser = analyser;
    this.running = !!analyser && this.mode === 'spectrum' && !this.reduced;
    cancelAnimationFrame(this.frame);
    if (this.running) this.animate(0);
  }
  private animate = (now: number) => {
    if (!this.running) return;
    if (now - this.last > (this.reducedFlash ? 200 : 66) && this.analyser && this.geometry) {
      this.last = now;
      this.analyser.getByteFrequencyData(this.bins);
      const pos = this.geometry.attributes.position!;
      for (let row = 15; row > 0; row--)
        for (let col = 0; col < 48; col++) pos.setY(row * 48 + col, pos.getY((row - 1) * 48 + col));
      for (let col = 0; col < 48; col++) {
        const target = (this.bins[Math.floor((col / 47) * 100)]! / 255) * 2;
        const prev = pos.getY(col);
        pos.setY(
          col,
          this.reducedFlash ? prev + THREE.MathUtils.clamp(target - prev, -0.12, 0.12) : target,
        );
      }
      pos.needsUpdate = true;
      this.draw();
    }
    this.frame = requestAnimationFrame(this.animate);
  };
  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.controller.abort();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if ('map' in m) (m.map as THREE.Texture | null)?.dispose();
          m.dispose();
        });
      } else if (o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
