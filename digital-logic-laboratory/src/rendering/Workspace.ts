import * as THREE from "three";
import { library } from "../logic/library";
import { hex, type Circuit, type Ref, type Component } from "../logic/model";
export interface ViewNode {
  width?: number;
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  inputs: { id: string; width: number }[];
  outputs: { id: string; width: number }[];
}
export interface ViewWire {
  id: string;
  source: Ref;
  target: Ref;
  width: number;
  value?: number | "X";
  active?: boolean;
}
export class Workspace {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-14, 14, 9, -9, 0.1, 100);
  renderer: THREE.WebGLRenderer;
  group = new THREE.Group();
  labels: HTMLDivElement;
  nodes: ViewNode[] = [];
  wires: ViewWire[] = [];
  zoom = 1;
  selected = "";
  private resizeObserver: ResizeObserver;
  private drag: {
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null = null;
  private connecting: Ref | null = null;
  private lastClick = { id: "", time: 0 };
  highlighted = new Set<string>();
  activeNodes = new Set<string>();
  private animation = 0;
  private pan: { x: number; y: number; cx: number; cy: number } | null = null;
  onSelect: (id: string) => void = () => {};
  onOpen: (id: string) => void = () => {};
  onMove: (id: string, x: number, y: number) => void = () => {};
  onConnect: (a: Ref, b: Ref) => void = () => {};
  onProbe: (id: string) => void = () => {};
  constructor(public host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x101918, 1);
    host.append(this.renderer.domElement);
    this.labels = document.createElement("div");
    this.labels.className = "scene-labels";
    host.append(this.labels);
    this.camera.position.set(0, 0, 30);
    this.scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-5, 7, 15);
    this.scene.add(light);
    this.scene.add(this.group);
    const grid = new THREE.GridHelper(150, 150, 0x2b3a35, 0x1c2a25);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.5;
    this.scene.add(grid);
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.fit();
    });
    this.resizeObserver.observe(host);
    host.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          0.35,
          Math.min(3, this.zoom * Math.exp(-e.deltaY * 0.001)),
        );
        this.resize();
      },
      { passive: false },
    );
    host.addEventListener("pointerdown", (e) => {
      if (e.target === this.renderer.domElement) {
        this.pan = {
          x: e.clientX,
          y: e.clientY,
          cx: this.camera.position.x,
          cy: this.camera.position.y,
        };
        host.setPointerCapture(e.pointerId);
      }
    });
    host.addEventListener("pointermove", (e) => {
      if (this.pan) {
        this.camera.position.x =
          this.pan.cx -
          (((e.clientX - this.pan.x) / host.clientWidth) *
            (this.camera.right - this.camera.left)) /
            this.zoom;
        this.camera.position.y =
          this.pan.cy +
          (((e.clientY - this.pan.y) / host.clientHeight) *
            (this.camera.top - this.camera.bottom)) /
            this.zoom;
        this.camera.updateMatrixWorld();
        this.draw();
        return;
      }

      if (
        !this.drag ||
        Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY) <
          4
      )
        return;
      const dx =
        (((e.clientX - this.drag.startX) / host.clientWidth) *
          (this.camera.right - this.camera.left)) /
        this.zoom;
      const dy =
        ((-(e.clientY - this.drag.startY) / host.clientHeight) *
          (this.camera.top - this.camera.bottom)) /
        this.zoom;
      const n = this.nodes.find((n) => n.id === this.drag!.id)!;
      n.x = this.drag.x + dx;
      n.y = this.drag.y + dy;
      this.draw();
    });
    host.addEventListener("pointerup", (e) => {
      this.pan = null;
      if (this.drag) {
        const drag = this.drag;
        const n = this.nodes.find((n) => n.id === drag.id)!;
        const moved =
          Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4;
        this.drag = null;
        if (moved) this.onMove(n.id, n.x, n.y);
        else {
          const now = performance.now();
          if (this.lastClick.id === n.id && now - this.lastClick.time < 450) {
            this.lastClick = { id: "", time: 0 };
            this.onOpen(n.id);
          } else {
            this.lastClick = { id: n.id, time: now };
            this.selected = n.id;
            this.onSelect(n.id);
            this.draw();
          }
        }
      }
    });
    host.addEventListener("click", (e) => {
      if (e.target === this.renderer.domElement) {
        this.selected = "";
        this.onSelect("");
        this.draw();
      }
    });
    this.resize();
  }
  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    const aspect = width / height;
    this.camera.left = -10 * aspect;
    this.camera.right = 10 * aspect;
    this.camera.top = 10;
    this.camera.bottom = -10;
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
    this.draw();
  }
  fit() {
    this.camera.position.x = 0;
    this.camera.position.y = 0;
    this.camera.updateMatrixWorld();
    this.zoom = 1;
    const maxX = Math.max(8, ...this.nodes.map((n) => Math.abs(n.x) + 2)),
      maxY = Math.max(6, ...this.nodes.map((n) => Math.abs(n.y) + 2));
    const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    this.zoom = Math.min(10 / maxY, (10 * aspect) / maxX) * 0.88;
    this.resize();
  }
  set(nodes: ViewNode[], wires: ViewWire[]) {
    this.nodes = nodes;
    this.wires = wires;
    this.draw();
  }
  circuit(c: Circuit, values: Record<string, number | "X"> = {}, path = c.id) {
    const nodes: ViewNode[] = c.components.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.id,
      x: n.position.x,
      y: n.position.y,
      inputs: library[n.type]?.inputs ?? [],
      outputs: library[n.type]?.outputs ?? [],
    }));
    const spread = (i: number, n: number) => (n - 1) * 1.1 - i * 2.2;
    const extent = Math.max(6, ...nodes.map((n) => Math.abs(n.x) + 4));
    c.inputs.forEach((p, i) =>
      nodes.push({
        id: `$in:${p.id}`,
        type: "INPUT",
        label: p.id,
        x: -extent,
        y: spread(i, c.inputs.length),
        inputs: [],
        outputs: [p],
      }),
    );
    c.outputs.forEach((p, i) =>
      nodes.push({
        id: `$out:${p.id}`,
        type: "OUTPUT",
        label: p.id,
        x: extent,
        y: spread(i, c.outputs.length),
        inputs: [p],
        outputs: [],
      }),
    );
    if (c.primitive)
      nodes.push({
        id: "primitive",
        type: c.name,
        label: c.name,
        x: 0,
        y: 0,
        inputs: c.inputs,
        outputs: c.outputs,
      });
    const convert = (r: Ref) => ({
      ...r,
      component:
        r.component === "$in" || r.component === "$out"
          ? `${r.component}:${r.port}`
          : r.component,
    });
    const wires = c.nets.flatMap((net) =>
      net.targets.map((target, i) => {
        const source = net.sources[0];
        let value =
          values[
            `${source.component === "$in" ? path : path + "/" + source.component}:${source.port}`
          ] ?? "X";
        if (source.bit !== undefined && value !== "X")
          value = (value >>> source.bit) & 1;
        return {
          id: net.id + ":" + i,
          source: convert(source),
          target: convert(target),
          width: net.width,
          value,
        };
      }),
    );
    if (c.primitive) {
      c.inputs.forEach((p) =>
        wires.push({
          id: p.id,
          source: { component: `$in:${p.id}`, port: p.id },
          target: { component: "primitive", port: p.id },
          width: p.width,
          value: values[`${path}:${p.id}`] ?? "X",
        }),
      );
      c.outputs.forEach((p) =>
        wires.push({
          id: p.id,
          source: { component: "primitive", port: p.id },
          target: { component: `$out:${p.id}`, port: p.id },
          width: p.width,
          value: values[`${path}:${p.id}`] ?? "X",
        }),
      );
    }
    if (nodes.length <= 5) nodes.forEach((n) => (n.width = 3.8));
    this.set(nodes, wires);
  }
  private point(r: Ref, source: boolean) {
    const n = this.nodes.find((n) => n.id === r.component);
    if (!n) return new THREE.Vector3();
    const ports = source ? n.outputs : n.inputs;
    const i = Math.max(
      0,
      ports.findIndex((p) => p.id === r.port),
    );
    return new THREE.Vector3(
      n.x + ((source ? 1 : -1) * (n.width ?? 2.2)) / 2,
      n.y + (ports.length - 1) * 0.23 - i * 0.46,
      0.16,
    );
  }
  draw() {
    if (!this.renderer) return;
    for (const obj of [...this.group.children]) {
      this.group.remove(obj);
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => m?.dispose());
    }
    this.labels.replaceChildren();
    const geometry = new THREE.BoxGeometry(1, 1.35, 0.24);
    const material = new THREE.MeshStandardMaterial({
      color: 0x243b33,
      roughness: 0.8,
    });
    const instances = new THREE.InstancedMesh(
      geometry,
      material,
      this.nodes.length,
    );
    const matrix = new THREE.Matrix4();
    this.nodes.forEach((n, i) => {
      matrix.makeScale(n.width ?? 2.2, 1, 1);
      matrix.setPosition(n.x, n.y, 0);
      instances.setMatrixAt(i, matrix);
      instances.setColorAt(
        i,
        new THREE.Color(
          n.id === this.selected || this.highlighted.has(n.id)
            ? 0x527958
            : n.type === "INPUT" || n.type === "OUTPUT"
              ? 0x243a36
              : 0x304a3e,
        ),
      );
    });
    this.group.add(instances);
    for (const wire of this.wires) {
      const a = this.point(wire.source, true),
        b = this.point(wire.target, false);
      const points = [
        a,
        new THREE.Vector3((a.x + b.x) / 2, a.y, 0.16),
        new THREE.Vector3((a.x + b.x) / 2, b.y, 0.16),
        b,
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat =
        wire.value === "X"
          ? new THREE.LineDashedMaterial({
              color: 0x87948c,
              dashSize: 0.15,
              gapSize: 0.13,
            })
          : new THREE.LineBasicMaterial({
              color: wire.active ? 0xe8ba7e : wire.value ? 0xa8d98a : 0x435f52,
            });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      this.group.add(line);
      if (wire.width > 1) {
        const second = line.clone();
        second.geometry = geo.clone();
        second.material = mat.clone();
        second.position.y = 0.06;
        this.group.add(second);
      }
      const midpoint = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, 0.3);
      const badge = document.createElement("button");
      badge.className = "wire-value";
      badge.textContent =
        wire.width > 1
          ? (wire.value === "X" ? "XXXX" : hex(wire.value as number)) +
            ` /${wire.width}`
          : String(wire.value);
      badge.title = `Probe ${wire.id}`;
      badge.onclick = () => this.onProbe(wire.id);
      this.place(badge, midpoint);
    }
    for (const node of this.nodes) {
      const el = document.createElement("div");
      el.className =
        "logic-node" +
        (node.id === this.selected || this.highlighted.has(node.id)
          ? " selected"
          : "");
      el.dataset.nodeId = node.id;
      el.classList.toggle("executing", this.activeNodes.has(node.id));
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Inspect ${node.type} ${node.label}`);
      el.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.onOpen(node.id);
        }
      };
      const width =
        (((node.width ?? 2.2) * this.host.clientWidth) /
          (this.camera.right - this.camera.left)) *
        this.zoom;
      const compact = width < 80;
      el.style.width = `${Math.max(34, width)}px`;
      el.classList.toggle("compact", compact);
      el.title = `${node.type} · ${node.label} — double-click to inspect`;
      const title = document.createElement("strong");
      title.textContent =
        node.type === "INPUT" || node.type === "OUTPUT"
          ? node.label
          : compact
            ? node.type === "Full Adder"
              ? "FA" + node.id.replace("FullAdder", "")
              : node.type === "Half Adder"
                ? "HA"
                : node.type === "Register1"
                  ? "D" + node.id.replace("bit", "")
                  : node.type.replace("16", "")
            : node.type;
      const label = document.createElement("span");
      label.textContent =
        node.label === node.type
          ? node.type === "NAND"
            ? "primitive gate"
            : "double-click to inspect"
          : node.label;
      el.append(title, label);
      el.onpointerdown = (e) => {
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        this.drag = {
          id: node.id,
          x: node.x,
          y: node.y,
          startX: e.clientX,
          startY: e.clientY,
        };
        this.host.setPointerCapture(e.pointerId);
      };
      for (const [ports, isSource] of [
        [node.inputs, false],
        [node.outputs, true],
      ] as const) {
        ports.forEach((p, i) => {
          const button = document.createElement("button");
          button.className = "port " + (isSource ? "output" : "input");
          button.textContent = p.id;
          button.title = `${isSource ? "Output" : "Input"} ${p.id} · ${p.width} bit`;
          button.style.top = `${((i + 1) * 100) / (ports.length + 1)}%`;
          button.onpointerdown = (e) => {
            e.stopPropagation();
            if (isSource) this.connecting = { component: node.id, port: p.id };
          };
          button.onpointerup = (e) => {
            e.stopPropagation();
            if (this.connecting && !isSource) {
              this.onConnect(this.connecting, {
                component: node.id,
                port: p.id,
              });
              this.connecting = null;
            }
          };
          el.append(button);
        });
      }
      this.place(el, new THREE.Vector3(node.x, node.y, 0.3));
    }
    this.renderer.render(this.scene, this.camera);
  }
  private place(el: HTMLElement, point: THREE.Vector3) {
    point.project(this.camera);
    el.style.left = `${(point.x + 1) * 0.5 * this.host.clientWidth}px`;
    el.style.top = `${(-point.y + 1) * 0.5 * this.host.clientHeight}px`;
    this.labels.append(el);
  }
  dispose() {
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }
}
