import { executionView, type StopReason } from "./ui/execution";
import { library } from "./logic/library";
import { hex, ref, type Circuit, type Ref, type Library } from "./logic/model";
import { compile, dependencies } from "./compiler/compiler";
import { Workspace, type ViewNode, type ViewWire } from "./rendering/Workspace";
import { programs } from "./examples/programs";
import { MAP, PHASES } from "./machine/InstructionSet";
import { ALU_OPS, type MachineState } from "./machine/H16";
import { type Assembly, lex } from "./assembler/Assembler";
import {
  groupComponents,
  parseProject,
  type Project,
} from "./persistence/project";
import type { TraceSample } from "./simulator/Simulator";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const escape = (s: unknown) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const app = $("app");
app.innerHTML = `
<header class="topbar"><div class="brand"><div class="brand-mark">◧</div><div><h1>Digital Logic Laboratory</h1><small>THE MACHINE / H16</small></div></div><nav class="mode-tabs" aria-label="Application mode"><button id="machine-mode" class="active">The Machine</button><button id="lab-mode">Laboratory</button></nav><div class="top-actions"><button id="save" title="Save project locally">↓ <span class="save-label">Save</span></button><button id="export" title="Export project JSON">Export</button><button id="import">Import</button><input id="import-file" type="file" accept=".json,application/json" hidden></div></header>
<div class="toolbar"><button id="run" class="primary">▶ Run</button><button id="pause">Ⅱ Pause</button><span class="separator"></span><button id="step-instruction" title="Advance to the end of the current instruction">↦ Instruction</button><button id="step-phase" title="Advance one CPU phase">↦ Phase</button><button id="step-clock" title="Advance one clock edge">⌁ Clock</button><button id="reset" title="Reset the CPU">↺ Reset</button><span class="separator"></span><label>Clock <select id="speed"><option value="1">1 Hz</option><option value="10">10 Hz</option><option value="100" selected>100 Hz</option><option value="1000">1 kHz</option><option value="max">Maximum</option></select></label><span class="status" id="execution-mode"><span class="live-dot"></span>INSPECTABLE</span></div>
<section id="execution" class="execution" aria-label="Execution activity"><div class="execution-state"><span id="execution-badge" role="status">READY</span><span id="execution-program">Addition</span></div><div class="execution-story"><strong id="execution-title">Program loaded · ready to run</strong><p id="execution-detail">Run executes the program. Watch slowly follows one CPU phase per second.</p><div id="execution-phases" class="execution-phases"></div></div><div class="execution-controls"><button id="watch-slowly">▷ Watch slowly</button><span id="execution-count">0 instructions · 0 clocks</span></div></section><main class="app-grid"><aside class="sidebar"><section><div class="eyebrow" id="sidebar-title">Architecture</div><nav class="tree" id="tree"><button data-nav="Machine">▧ H16 computer <span>16 BIT</span></button><button data-nav="CPU" class="indent active">⌘ CPU <span>5 PHASE</span></button><button data-nav="ALU16" class="deep">◇ ALU <span>16</span></button><button data-nav="RegisterFile" class="deep">▤ Register file <span>8 × 16</span></button><button data-nav="RAM" class="indent">▦ Memory <span>64K</span></button><button data-nav="Display" class="indent">▣ Display <span>128²</span></button><button data-nav="Keyboard" class="indent">⌨ Keyboard</button></nav></section><section><div class="eyebrow">Circuit library</div><select id="circuit-select" aria-label="Open a laboratory circuit" style="width:100%;margin-bottom:8px"></select><button id="open-circuit" style="width:100%;margin-bottom:10px">Open circuit</button><div class="palette" id="palette"></div></section><div class="side-note"><strong>Follow the signal.</strong>Double-click a component to open it. Scroll to zoom.<br><br>In Laboratory, drag components to arrange them. Connect an output dot to an input dot.</div></aside>
<section class="workspace-panel" aria-label="Interactive circuit workspace"><div class="workspace-head"><nav id="breadcrumbs" class="breadcrumbs" aria-label="Circuit hierarchy"></nav><div class="scene-actions"><button id="fit">⊞ Fit</button><button id="zoom-in" aria-label="Zoom in">＋</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="upstream">← Inputs</button><button id="downstream">Outputs →</button></div></div><div class="scene-host" id="scene"></div><div class="workspace-footer"><span id="scene-caption">H16 · Multi-cycle processor</span><div class="legend"><span><i></i>0</span><span><i class="high"></i>1</span><span><i class="unknown"></i>X</span><span>═ 16-bit bus</span></div></div></section>
<aside class="inspector"><section class="panel-section" id="instruction-section"><div class="section-title"><h2>Instruction</h2><span id="phase-tag" class="tag">FETCH</span></div><div class="key-value"><span>ADDRESS</span><span id="instruction-address">0x8000</span></div><div class="instruction" id="instruction-text">LDI R1, 23</div><div id="instruction-binary" class="mono muted" style="font-size:12px">00011 001 000 00000</div><div class="phase-track" id="phase-track"></div><div id="alu-inputs"></div><button id="inspect-alu" style="width:100%;margin-top:12px;font-size:12px">Inspect active ALU →</button></section>
<section class="panel-section" id="selected-section"><div class="section-title"><h2 id="selected-title">Signal inspector</h2><span class="tag" id="selected-tag">LIVE</span></div><div id="selected-content" class="help-text">Select a component or a bus to inspect its current values.</div></section>
<section class="panel-section" id="register-section"><div class="section-title"><h2>Registers</h2><span class="eyebrow">HEX</span></div><div class="registers" id="registers"></div><div class="flags" id="flags"></div></section>
<section class="panel-section"><div class="section-title"><h2>Display</h2><span class="tag">MMIO</span></div><canvas id="display" class="framebuffer" width="128" height="128" tabindex="0" aria-label="H16 display. Focus here and use up and down arrow keys to play Pong."></canvas><div class="display-caption"><span>128 × 128 · 1 BIT</span><span>0xC000</span></div><p class="help-text">Pong: focus the display, then use ↑ ↓.<br>Pause the CPU to freeze the game.</p></section></aside>
<section class="bottom-panel"><nav class="bottom-tabs" aria-label="Debugger panels"><button data-tab="code" class="active">Assembly</button><button data-tab="scope">Oscilloscope</button><button data-tab="memory">Memory</button><button data-tab="trace">Trace</button><button data-tab="truth">Truth table</button><span class="right" id="program-status">H16 ASSEMBLER</span></nav><div class="bottom-content" id="bottom-content"></div></section></main>
<footer class="footer"><span><span class="live-dot"></span><span id="machine-status">Ready</span></span><span id="gate-count">970 NAND gates / ALU</span><span id="cycle-count">0 cycles</span><span class="right" id="footer-message">16-bit words · 64K address space</span></footer><div id="toast" class="toast hidden" role="status"></div>`;
const inspector = document.querySelector<HTMLElement>(".inspector")!;
const displaySection = $("display").closest<HTMLElement>("section")!;
inspector.prepend($("register-section"));
$("register-section").after(displaySection);
let mode: "machine" | "lab" = "machine";
let view = "CPU";
let navigation: { name: string; type: string; path: string }[] = [];
let tab = "code";
let source = programs.Addition;
let custom: Library = {};
let workspace: Circuit = structuredClone(library["Full Adder"]);
workspace.id = "Workbench";
workspace.name = "Full Adder";
let labInputs: Record<string, number | "X"> = { A: 1, B: 1, Cin: 0 };
let labValues: Record<string, number | "X"> = {};
let machineValues: Record<string, number | "X"> = {};
let state: MachineState | null = null;
let oldRegisters: number[] = [];
let assembly: Assembly | null = null;
let breakLines = new Set<number>();
let addressBreakpoints = new Set<number>();
let probes = ["CLK", "ALU_RESULT", "PC"];
let traces: TraceSample[] = [];
let running = false;
let stopReason: StopReason = "ready";
let lastLabTime = 0;
let labValid = false;
let loadedProgram = "Addition";
let recentChanges = new Map<number, number>();
let selected = new Set<string>();
let inspectDevice = "ALU";
let selectedWire: string | null = null;
let truthRows: {
  inputs: Record<string, number>;
  outputs: Record<string, number | "X">;
}[] = [];
let memoryWords: number[] = [];
let memoryAddress: number = MAP.ROM_START;
let pendingSave: "local" | "export" | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let savedMachine: MachineState | undefined;
let labTimer: ReturnType<typeof setInterval> | null = null;
let compileTimer: ReturnType<typeof setTimeout>;
let manualPropagation = false;
const worker = new Worker("/worker.js", { type: "module" });
const send = (message: unknown) => worker.postMessage(message);
worker.onerror = (e) => toast(`Simulation worker failed: ${e.message}`, true);
let scene: Workspace;
try {
  scene = new Workspace($("scene"));
} catch (error) {
  $("scene").innerHTML =
    '<div class="empty">WebGL is unavailable. Enable hardware acceleration to use the spatial workbench. The assembler and debugger remain available.</div>';
  scene = null as unknown as Workspace;
}
function toast(message: string, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").className = "toast" + (error ? " error" : "");
  toastTimer = setTimeout(
    () => $("toast").classList.add("hidden"),
    error ? 10000 : 4000,
  );
}
function currentCircuit() {
  if (navigation.length) return library[navigation.at(-1)!.type];
  return mode === "lab" ? workspace : null;
}
function currentPath() {
  return navigation.at(-1)?.path ?? workspace.id;
}
function circuitValues() {
  return mode === "lab" ? labValues : machineValues;
}
function fillPalette() {
  const names = [
    "NAND",
    "NOT",
    "AND",
    "OR",
    "XOR",
    "MUX",
    "DEMUX",
    "Half Adder",
    "Full Adder",
    "Adder16",
    "D Flip-Flop",
    "Register16",
    "Counter",
    "ALU16",
    ...Object.keys(custom),
  ];
  $("circuit-select").innerHTML = names
    .map((n) => `<option>${escape(n)}</option>`)
    .join("");
  $("open-circuit").onclick = () =>
    openLab($<HTMLSelectElement>("circuit-select").value);
  $("palette").innerHTML = names
    .map(
      (n) =>
        `<button data-component="${escape(n)}">${escape(n)} <small>＋</small></button>`,
    )
    .join("");
  $("palette")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach(
      (button) =>
        (button.onclick = () => {
          const name = button.dataset.component!;
          if (mode === "machine" || navigation.length) {
            openLab(name);
            return;
          }
          if (workspace.primitive) {
            toast(
              "Use New circuit to build a circuit, or Open circuit to inspect a different component.",
            );
            return;
          }
          const i = workspace.components.length;
          workspace.components.push({
            id: `${name.replaceAll(" ", "")}_${Date.now().toString(36)}`,
            type: name,
            position: {
              x: (i % 4) * 3.5 - 5,
              y: 3 - Math.floor(i / 4) * 2.5,
              z: 0,
            },
          });
          drawWorkspace();
          scheduleCompile();
        }),
    );
}
function openLab(type: string) {
  clearTimeout(compileTimer);
  pause();
  mode = "lab";
  workspace = structuredClone(library[type]);
  workspace.id = "Workbench";
  workspace.name = type;
  navigation = [];
  labInputs = Object.fromEntries(
    workspace.inputs.map((p) => [p.id, p.id === "A" ? 1 : 0]),
  );
  if (type === "Full Adder") labInputs = { A: 1, B: 1, Cin: 0 };
  if (type === "ALU16") labInputs = { A: 23, B: 35, OP: 0 };
  selected.clear();
  selectedWire = null;
  updateMode();
  probes = ["CLK", ...workspace.outputs.map((p) => workspace.id + ":" + p.id)];
  send({ type: "probes", probes });
  truthRows = [];
  compileLab();
  drawWorkspace(true);
  renderSelected();
  if (tab === "scope" || tab === "truth") renderBottom();
}
function updateMode() {
  inspector.classList.toggle("lab-inspector", mode === "lab");
  updateExecution();
  $("machine-mode").classList.toggle("active", mode === "machine");
  $("lab-mode").classList.toggle("active", mode === "lab");
  $("sidebar-title").textContent =
    mode === "lab" ? "Workspace" : "Architecture";
  $("step-instruction").textContent =
    mode === "lab" ? "↦ Propagate" : "↦ Instruction";
  $("step-phase").textContent = mode === "lab" ? "↦ Gate stage" : "↦ Phase";
  $("instruction-section").classList.toggle("hidden", mode === "lab");
  $("register-section").classList.toggle("hidden", mode === "lab");
  $("tree").classList.toggle("hidden", mode === "lab");
  $("selected-section").classList.remove("hidden");
  renderSelected();
}
function enterMachine(type = "CPU") {
  pause();
  if (mode === "lab") {
    probes = ["CLK", "ALU_RESULT", "PC"];
    send({ type: "probes", probes });
    if (tab === "scope") renderBottom();
  }
  mode = "machine";
  view = type;
  navigation = [];
  if (type === "ALU16") {
    inspectDevice = "ALU";
    navigation = [{ name: "ALU", type: "ALU16", path: "ALU16" }];
  }
  if (type === "RegisterFile") {
    inspectDevice = "RegisterFile";
    navigation = [
      { name: "Register file", type: "RegisterFile", path: "RegisterFile" },
    ];
  }
  if (["PC", "SP", "IR"].includes(type)) {
    inspectDevice = type;
    navigation = [{ name: type, type: "Register16", path: "Register16" }];
  }
  selected.clear();
  selectedWire = null;
  updateMode();
  if (navigation.length)
    send({ type: "inspect", path: currentPath(), device: inspectDevice });
  drawWorkspace(true);
  renderSelected();
}
function drawWorkspace(fit = false) {
  if (fit && scene) scene.highlighted.clear();
  const circuit = currentCircuit();
  const prefix =
    mode === "machine"
      ? ["H16", ...(view === "Machine" ? [] : ["CPU"])]
      : ["Laboratory", workspace.name];
  $("breadcrumbs").innerHTML =
    prefix
      .map((n, i) => `<button data-root="${i}">${escape(n)}</button>`)
      .join('<span class="crumb-sep">/</span>') +
    navigation
      .map(
        (n, i) =>
          `<span class="crumb-sep">/</span><button data-depth="${i}">${escape(n.name)}</button>`,
      )
      .join("");
  $("breadcrumbs")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.depth !== undefined)
            navigation = navigation.slice(0, Number(b.dataset.depth) + 1);
          else {
            navigation = [];
            if (mode === "machine")
              view = b.dataset.root === "0" ? "Machine" : "CPU";
          }
          selected.clear();
          selectedWire = null;
          if (navigation.length)
            send({
              type: "inspect",
              path: currentPath(),
              device: inspectDevice,
            });
          drawWorkspace(true);
          renderSelected();
        }),
    );
  if (circuit) {
    if (scene) scene.activeNodes.clear();
    const path = currentPath().split("@")[0];
    scene?.circuit(circuit, circuitValues(), path);
    $("scene-caption").textContent =
      `${circuit.name} · ${circuit.primitive ? "primitive" : circuit.components.length + " components"}${mode === "machine" ? " · live CPU signals" : ""}`;
  } else {
    const nodes: ViewNode[] =
      view === "Machine"
        ? [
            {
              id: "CPU",
              type: "H16 CPU",
              label: "5-phase · 16-bit",
              x: -2,
              y: 1,
              inputs: [
                { id: "DATA", width: 16 },
                { id: "KEY", width: 16 },
              ],
              outputs: [
                { id: "ADDRESS", width: 16 },
                { id: "WRITE", width: 16 },
              ],
            },
            {
              id: "RAM",
              type: "Memory",
              label: "64K × 16 words",
              x: 5,
              y: 3,
              inputs: [
                { id: "ADDRESS", width: 16 },
                { id: "WRITE", width: 16 },
              ],
              outputs: [{ id: "DATA", width: 16 }],
            },
            {
              id: "Display",
              type: "Framebuffer",
              label: "0xC000 · 128²",
              x: 5,
              y: -2,
              inputs: [{ id: "VIDEO", width: 16 }],
              outputs: [],
            },
            {
              id: "Keyboard",
              type: "Keyboard",
              label: "0xE000",
              x: -8,
              y: -2,
              inputs: [],
              outputs: [{ id: "KEY", width: 16 }],
            },
          ]
        : [
            {
              id: "RAM",
              type: "Memory",
              label: "RAM / program ROM",
              x: -10,
              y: 3,
              inputs: [
                { id: "ADDRESS", width: 16 },
                { id: "WRITE", width: 16 },
              ],
              outputs: [{ id: "DATA", width: 16 }],
            },
            {
              id: "IR",
              type: "Instruction",
              label: state ? "0x" + hex(state.ir) : "Instruction register",
              x: -3.3,
              y: 3,
              inputs: [{ id: "D", width: 16 }],
              outputs: [{ id: "Q", width: 16 }],
            },
            {
              id: "Decoder",
              type: "Control unit",
              label: state ? PHASES[state.phase] : "FETCH",
              x: 3.3,
              y: 3,
              inputs: [{ id: "INSTR", width: 16 }],
              outputs: [
                { id: "OP", width: 3 },
                { id: "WE", width: 1 },
              ],
            },
            {
              id: "Registers",
              type: "Register file",
              label: "8 × Register16",
              x: -9,
              y: -3,
              inputs: [
                { id: "D", width: 16 },
                { id: "WE", width: 1 },
              ],
              outputs: [
                { id: "A", width: 16 },
                { id: "B", width: 16 },
              ],
            },
            {
              id: "ALU",
              type: "ALU16",
              label: state ? ALU_OPS[state.alu.op] : "NAND-derived datapath",
              x: 0,
              y: -3,
              inputs: [
                { id: "A", width: 16 },
                { id: "B", width: 16 },
                { id: "OP", width: 3 },
              ],
              outputs: [{ id: "OUT", width: 16 }],
            },
            {
              id: "PC",
              type: "Program counter",
              label: state ? "0x" + hex(state.pc) : "0x8000",
              x: 10,
              y: 3,
              inputs: [{ id: "D", width: 16 }],
              outputs: [{ id: "Q", width: 16 }],
            },
            {
              id: "SP",
              type: "Stack pointer",
              label: state ? "0x" + hex(state.sp) : "0x7FFF",
              x: 9,
              y: -3,
              inputs: [],
              outputs: [{ id: "Q", width: 16 }],
            },
          ];
    const w = (
      id: string,
      a: string,
      p: string,
      b: string,
      q: string,
      width: number,
      value: number | "X",
    ): ViewWire => ({
      id,
      source: ref(a, p),
      target: ref(b, q),
      width,
      value,
      active:
        !!state &&
        ((["ADDRESS", "INSTRUCTION"].includes(id) && state.phase === 1) ||
          (id === "DECODE" && state.phase === 2) ||
          (["READ_A", "READ_B", "ALU_OP", "ALU_RESULT"].includes(id) &&
            state.phase === 3) ||
          (id === "WRITE_ENABLE" && state.phase === 0)),
    });
    const r = state?.registers ?? Array(8).fill(0);
    const wires =
      view === "Machine"
        ? [
            w(
              "ADDRESS",
              "CPU",
              "ADDRESS",
              "RAM",
              "ADDRESS",
              16,
              state?.pc ?? 0x8000,
            ),
            w("DATA", "RAM", "DATA", "CPU", "DATA", 16, state?.ir ?? 0),
            w(
              "VIDEO",
              "CPU",
              "WRITE",
              "Display",
              "VIDEO",
              16,
              state?.pending ?? 0,
            ),
            w(
              "KEYBOARD",
              "Keyboard",
              "KEY",
              "CPU",
              "KEY",
              16,
              state?.keyCode ?? 0,
            ),
          ]
        : [
            w("ADDRESS", "PC", "Q", "RAM", "ADDRESS", 16, state?.pc ?? 0x8000),
            w("INSTRUCTION", "RAM", "DATA", "IR", "D", 16, state?.ir ?? 0),
            w("DECODE", "IR", "Q", "Decoder", "INSTR", 16, state?.ir ?? 0),
            w("READ_A", "Registers", "A", "ALU", "A", 16, state?.alu.a ?? 0),
            w("READ_B", "Registers", "B", "ALU", "B", 16, state?.alu.b ?? 0),
            w("ALU_OP", "Decoder", "OP", "ALU", "OP", 3, state?.alu.op ?? 0),
            w(
              "WRITE_ENABLE",
              "Decoder",
              "WE",
              "Registers",
              "WE",
              1,
              state?.phase === 4 ? 1 : 0,
            ),
            w(
              "ALU_RESULT",
              "ALU",
              "OUT",
              "Registers",
              "D",
              16,
              state?.alu.result ?? 0,
            ),
          ];
    nodes.forEach((n) => (n.width = 5.8));
    if (scene)
      scene.activeNodes = new Set(
        state ? executionView(state, running, stopReason).nodes : [],
      );
    scene?.set(nodes, wires);
    $("scene-caption").textContent =
      view === "Machine"
        ? "H16 · Programmable 16-bit computer"
        : "H16 · Multi-cycle processor";
  }
  if (fit) scene?.fit();
}
function invalidateLab() {
  labValid = false;
  labValues = {};
  if (labTimer) clearInterval(labTimer);
  labTimer = null;
  if (mode === "lab") running = false;
  send({ type: "labInvalidate" });
  updateExecution();
}
function compileLab() {
  invalidateLab();
  try {
    compile(workspace, library);
    send({
      type: "labCompile",
      circuit: workspace,
      inputs: labInputs,
      library: custom,
    });
    $("footer-message").textContent = "Circuit valid · ready to simulate";
  } catch (error) {
    $("footer-message").textContent = "Circuit incomplete · connect all inputs";
    toast(error instanceof Error ? error.message : String(error), true);
  }
}
function scheduleCompile() {
  invalidateLab();
  clearTimeout(compileTimer);
  compileTimer = setTimeout(compileLab, 300);
}
if (scene) {
  scene.onSelect = (id) => {
    if (!shiftHeld) selected.clear();
    if (id) selected.add(id);
    selectedWire = null;
    renderSelected();
  };
  scene.onOpen = (id) => {
    if (id.startsWith("$")) return;
    const c = currentCircuit();
    if (c) {
      const child = c.components.find((n) => n.id === id);
      if (!child) return;
      if (mode === "machine" && child.type === "D Flip-Flop")
        toast("D flip-flops store state on a rising clock edge.");
      navigation.push({
        name: child.id,
        type: child.type,
        path: currentPath().split("@")[0] + "/" + child.id,
      });
      if (mode === "machine")
        send({ type: "inspect", path: currentPath(), device: inspectDevice });
      drawWorkspace(true);
      renderSelected();
    } else if (["ALU", "Registers", "CPU"].includes(id))
      enterMachine(
        id === "ALU" ? "ALU16" : id === "Registers" ? "RegisterFile" : "CPU",
      );
    else if (id === "PC" || id === "SP" || id === "IR") {
      enterMachine(id);
    } else if (id === "RAM") {
      setTab("memory");
    } else if (id === "Display") $("display").focus();
    else if (id === "Keyboard")
      toast(
        "Keyboard code: 0xE000 · key state: 0xE001. Focus the display to send input.",
      );
    else
      toast(
        "The control unit is an explicit five-phase state machine. Step Phase to inspect each register transfer.",
      );
  };
  scene.onMove = (id, x, y) => {
    const c = currentCircuit();
    if (mode === "lab" && !navigation.length) {
      const n = c?.components.find((n) => n.id === id);
      if (n) n.position = { x, y, z: 0 };
    }
  };
  scene.onProbe = (id) => {
    selectedWire = id;
    selected.clear();
    renderSelected();
  };
  scene.onConnect = (a, b) => {
    if (mode !== "lab" || navigation.length) {
      toast("Open a circuit in Laboratory to edit connections.");
      return;
    }
    const normalize = (r: Ref) =>
      r.component.startsWith("$")
        ? { ...r, component: r.component.split(":")[0] }
        : r;
    const source = normalize(a),
      target = normalize(b);
    const definition = (r: Ref) =>
      r.component === "$in" || r.component === "$out"
        ? workspace
        : library[
            workspace.components.find((n) => n.id === r.component)?.type ?? ""
          ];
    const pa =
      definition(source)?.outputs.find((p) => p.id === source.port) ??
      definition(source)?.inputs.find((p) => p.id === source.port);
    const pb =
      definition(target)?.inputs.find((p) => p.id === target.port) ??
      definition(target)?.outputs.find((p) => p.id === target.port);
    if (!pa || !pb) return;
    if (pa.width !== pb.width) {
      toast(
        `Width mismatch: ${pa.width} → ${pb.width}. Use the bit adapter controls in the inspector.`,
        true,
      );
      return;
    }
    workspace.nets.forEach(
      (n) =>
        (n.targets = n.targets.filter(
          (t) => t.component !== target.component || t.port !== target.port,
        )),
    );
    workspace.nets = workspace.nets.filter((n) => n.targets.length);
    workspace.nets.push({
      id: `wire_${Date.now().toString(36)}`,
      width: pa.width,
      sources: [source],
      targets: [target],
    });
    drawWorkspace();
    scheduleCompile();
  };
}
let shiftHeld = false;
window.addEventListener("keydown", (e) => {
  shiftHeld = e.shiftKey;
});
window.addEventListener("keyup", (e) => {
  shiftHeld = e.shiftKey;
});
function renderSelected() {
  const c = currentCircuit(),
    editable = mode === "lab" && !navigation.length;
  const content = $("selected-content");
  content.className = "";
  $("selected-title").textContent =
    mode === "lab" ? "Circuit inspector" : "Signal inspector";
  $("selected-tag").textContent = mode === "lab" ? "LAB" : "LIVE";
  if (selectedWire && scene) {
    const wire = scene.wires.find((w) => w.id === selectedWire);
    if (wire) {
      $("selected-title").textContent = "Bus / signal";
      const v = wire.value ?? "X";
      content.innerHTML = `<div class="stack-path">${escape(wire.id)}</div><div class="key-value"><span>WIDTH</span><span>${wire.width} bit</span></div><div class="key-value"><span>HEX</span><span>${v === "X" ? "X" : hex(v)}</span></div><div class="key-value"><span>UNSIGNED</span><span>${v}</span></div><div class="key-value"><span>SIGNED</span><span>${v === "X" ? "X" : wire.width === 16 && v >= 32768 ? v - 65536 : v}</span></div><p class="help-text mono">${
        v === "X"
          ? "Unresolved"
          : v
              .toString(2)
              .padStart(wire.width, "0")
              .replace(/(.{4})/g, "$1 ")
      }</p><p class="help-text">${escape(wire.source.component + "." + wire.source.port)}<br>↓ ${escape(wire.target.component + "." + wire.target.port)}</p><div class="button-row"><button id="probe-selected">＋ Probe</button>${editable ? '<button id="delete-wire">Delete wire</button>' : ""}</div>`;
      $("probe-selected").onclick = () => {
        let p = wire.id;
        if (c) {
          const n = c.nets.find((n) => wire.id.startsWith(n.id + ":"));
          if (n) {
            const r = n.sources[0];
            p = `${r.component === "$in" ? currentPath() : currentPath() + "/" + r.component}:${r.port}`;
          }
        }
        addProbe(p);
      };
      if (editable)
        $("delete-wire").onclick = () => {
          workspace.nets = workspace.nets.filter(
            (n) => !wire.id.startsWith(n.id + ":"),
          );
          selectedWire = null;
          drawWorkspace();
          compileLab();
          renderSelected();
        };
      return;
    }
  }
  const id = [...selected].at(-1),
    child = c?.components.find((n) => n.id === id);
  if (child) {
    const definition = library[child.type];
    const path = currentPath().split("@")[0] + "/" + child.id;
    content.innerHTML = `<div class="stack-path">${escape(child.type)} / ${escape(child.id)}</div><p class="help-text">${definition.primitive ? "Primitive " + definition.primitive : definition.components.length + " child components"}</p>${[...definition.inputs, ...definition.outputs].map((p) => `<div class="key-value"><span>${escape(p.id)} / ${p.width}</span><span>${formatValue(circuitValues()[`${path}:${p.id}`], p.width)}</span></div>`).join("")}<div class="button-row"><button id="open-component">Open →</button>${editable ? '<button id="duplicate">Duplicate</button><button id="delete">Delete</button><button id="group-selected">Group selected</button>' : ""}</div>${editable ? '<p class="help-text">Shift-click to select several components.</p>' : ""}`;
    $("open-component").onclick = () => scene?.onOpen(child.id);
    if (editable) {
      $("group-selected").onclick = groupSelection;
      $("duplicate").onclick = () => {
        const copy = structuredClone(child);
        copy.id += `_${Date.now().toString(36)}`;
        copy.position.x += 3;
        copy.position.y -= 2;
        workspace.components.push(copy);
        drawWorkspace();
        scheduleCompile();
      };
      $("delete").onclick = () => {
        workspace.components = workspace.components.filter(
          (n) => !selected.has(n.id),
        );
        workspace.nets = workspace.nets
          .filter((n) => !selected.has(n.sources[0].component))
          .map((n) => ({
            ...n,
            targets: n.targets.filter((t) => !selected.has(t.component)),
          }))
          .filter((n) => n.targets.length);
        selected.clear();
        drawWorkspace();
        scheduleCompile();
        renderSelected();
      };
    }
    return;
  }
  if (c) {
    const path = currentPath().split("@")[0];
    content.innerHTML = `<div class="stack-path">${escape(c.name)}</div><div class="inspect-inputs">${c.inputs.map((p) => (editable ? `<div class="input-row"><label for="in-${escape(p.id)}">${escape(p.id)}</label><input id="in-${escape(p.id)}" data-input="${escape(p.id)}" aria-label="${escape(p.id)} input, ${p.width} bits" value="${labInputs[p.id] === "X" ? "X" : p.width === 1 ? (labInputs[p.id] ?? 0) : "0x" + hex((labInputs[p.id] as number) || 0)}">${p.width === 1 ? `<button data-toggle="${escape(p.id)}">↔</button>` : ""}</div>` : `<div class="key-value"><span>${escape(p.id)}</span><span>${formatValue(circuitValues()[`${path}:${p.id}`], p.width)}</span></div>`)).join("")}</div>${c.outputs.map((p) => `<div class="output-row"><span>${escape(p.id)}</span><span id="out-${escape(p.id)}">${formatValue(circuitValues()[`${path}:${p.id}`], p.width)}</span></div>`).join("")}${c.id === "ALU16" || (editable && workspace.name === "ALU16") ? `<p class="help-text">OP: ${ALU_OPS.map((op, i) => i + " " + op).join(" · ")}</p>` : ""}${editable ? '<div class="button-row"><button id="validate">Validate</button><button id="input-stage">Auto settle</button><button id="port-settings">Edit ports</button><button id="save-circuit">Save component</button><button id="group">Group selected</button><button id="new-circuit">New circuit</button><button id="adapter">Connect bit…</button></div>' : '<p class="help-text inspection-badge">These values come from the running machine. Pause and step a phase to follow the current instruction.</p>'}`;
    content
      .querySelectorAll<HTMLInputElement>("[data-input]")
      .forEach((input) => {
        const commit = (report: boolean) => {
          const p = c.inputs.find((p) => p.id === input.dataset.input)!;
          const text = input.value.trim();
          const value = text.toUpperCase() === "X" ? "X" : Number(text);
          if (
            !text ||
            (value !== "X" &&
              (!Number.isInteger(value) || value < 0 || value >= 2 ** p.width))
          ) {
            if (report)
              toast(`Enter 0–${2 ** p.width - 1} or X for ${p.id}.`, true);
            return;
          }
          labInputs[p.id] = value;
          send({
            type: "labInput",
            name: p.id,
            value,
            stage: manualPropagation,
          });
        };
        input.oninput = () => commit(false);
        input.onchange = () => commit(true);
        input.onkeydown = (e) => {
          if (e.key === "Enter") commit(true);
        };
      });
    content.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach(
      (b) =>
        (b.onclick = () => {
          const name = b.dataset.toggle!;
          labInputs[name] = labInputs[name] === 1 ? 0 : 1;
          send({
            type: "labInput",
            name,
            value: labInputs[name],
            stage: manualPropagation,
          });
          renderSelected();
        }),
    );
    if (editable) {
      $("input-stage").classList.toggle("active", !manualPropagation);
      $("input-stage").textContent = manualPropagation
        ? "Manual propagation"
        : "Auto settle";
      $("input-stage").onclick = () => {
        manualPropagation = !manualPropagation;
        renderSelected();
        toast(
          manualPropagation
            ? "Change an input, then step Gate stage to propagate it."
            : "Input changes now settle automatically.",
        );
      };
      $("port-settings").onclick = editPorts;
      $("validate").onclick = compileLab;
      $("save-circuit").onclick = () => {
        const name = prompt(
          "Reusable component name",
          workspace.name + " custom",
        );
        if (!name) return;
        if (library[name]) {
          toast("Choose a new component name.", true);
          return;
        }
        try {
          compile(workspace, library);
          const copy = structuredClone(workspace);
          copy.id = name;
          copy.name = name;
          custom[name] = copy;
          library[name] = copy;
          fillPalette();
          toast(
            `Saved ${name} to your component library. Save the project to keep it.`,
          );
        } catch (e) {
          toast(String(e), true);
        }
      };
      $("group").onclick = groupSelection;
      $("new-circuit").onclick = () => {
        workspace = {
          id: "Workbench",
          name: "Untitled circuit",
          inputs: [
            { id: "A", name: "A", width: 1, direction: "INPUT" },
            { id: "B", name: "B", width: 1, direction: "INPUT" },
          ],
          outputs: [{ id: "OUT", name: "OUT", width: 1, direction: "OUTPUT" }],
          components: [],
          nets: [],
        };
        clearTimeout(compileTimer);
        invalidateLab();
        labInputs = { A: 0, B: 0 };
        probes = ["CLK", "Workbench:OUT"];
        send({ type: "probes", probes });
        truthRows = [];
        labValues = {};
        drawWorkspace(true);
        renderSelected();
        toast("Place gates from the library and connect their ports.");
      };
      $("adapter").onclick = connectBit;
    }
  } else {
    content.innerHTML =
      '<p class="help-text">Select a component or a bus to inspect its current values.</p><p class="help-text">Double-click ALU16 to follow the active datapath down to NAND gates.</p>';
  }
}
function editPorts() {
  const text = prompt(
    "Ports: input A:1, input B:16, output OUT:16",
    [
      ...workspace.inputs.map((p) => "input " + p.id + ":" + p.width),
      ...workspace.outputs.map((p) => "output " + p.id + ":" + p.width),
    ].join(", "),
  );
  if (!text) return;
  try {
    const ports = text.split(",").map((part) => {
      const m = part
        .trim()
        .match(/^(input|output) ([A-Za-z][A-Za-z0-9_]*):(1|3|4|8|16)$/);
      if (!m)
        throw new Error(
          "Use input NAME:WIDTH or output NAME:WIDTH; widths 1, 3, 4, 8, 16",
        );
      return {
        id: m[2],
        name: m[2],
        direction: (m[1] === "input" ? "INPUT" : "OUTPUT") as
          "INPUT" | "OUTPUT",
        width: Number(m[3]),
      };
    });
    if (new Set(ports.map((p) => p.id)).size !== ports.length)
      throw new Error("Port names must be unique");
    workspace.inputs = ports.filter((p) => p.direction === "INPUT");
    workspace.outputs = ports.filter((p) => p.direction === "OUTPUT");
    labInputs = Object.fromEntries(workspace.inputs.map((p) => [p.id, 0]));
    drawWorkspace(true);
    renderSelected();
    scheduleCompile();
  } catch (e) {
    toast(String(e), true);
  }
}
function groupSelection() {
  const name = prompt("Name for grouped component", "My component");
  if (!name) return;
  try {
    if (library[name] || name === workspace.id)
      throw new Error("Choose a new component name");
    const group = groupComponents(workspace, selected, name);
    custom[name] = group;
    library[name] = group;
    selected.clear();
    fillPalette();
    drawWorkspace(true);
    compileLab();
    renderSelected();
  } catch (e) {
    toast(String(e), true);
  }
}
function connectBit() {
  const description =
    "Use component.port or $in.A / $out.OUT. Add [bit] to select one bit.";
  const s = prompt("Source output. " + description);
  if (!s) return;
  const t = prompt("Target input. " + description);
  if (!t) return;
  const parse = (v: string): Ref => {
    const match = v.match(/^(.+)\.([^.[\]]+)(?:\[(\d+)\])?$/);
    if (!match) throw new Error("Use component.port[bit]");
    return ref(
      match[1],
      match[2],
      match[3] === undefined ? undefined : Number(match[3]),
    );
  };
  try {
    const source = parse(s),
      target = parse(t);
    workspace.nets.push({
      id: `adapter_${Date.now()}`,
      width: 1,
      sources: [source],
      targets: [target],
    });
    drawWorkspace();
    compileLab();
  } catch (e) {
    toast(String(e), true);
  }
}
function formatValue(v: number | "X" | undefined, width = 16) {
  return v === undefined || v === "X"
    ? "X"
    : width === 1
      ? String(v)
      : "0x" + hex(v, Math.ceil(width / 4));
}
function pause() {
  send({ type: "pause" });
  if (labTimer) clearInterval(labTimer);
  labTimer = null;
  running = false;
  updateExecution();
}
$("machine-mode").onclick = () => enterMachine();
$("lab-mode").onclick = () => {
  pause();
  mode = "lab";
  navigation = [];
  updateMode();
  probes = ["CLK", ...workspace.outputs.map((p) => workspace.id + ":" + p.id)];
  send({ type: "probes", probes });
  compileLab();
  drawWorkspace(true);
};
$("tree")
  .querySelectorAll<HTMLButtonElement>("button")
  .forEach(
    (b) =>
      (b.onclick = () => {
        const n = b.dataset.nav!;
        if (n === "RAM") {
          setTab("memory");
          return;
        }
        if (n === "Display") {
          $("display").focus();
          return;
        }
        if (n === "Keyboard") {
          toast(
            "Focus the display; keyboard events are read at 0xE000 and 0xE001.",
          );
          return;
        }
        $("tree")
          .querySelectorAll("button")
          .forEach((b) => b.classList.remove("active"));
        b.classList.add("active");
        enterMachine(n);
      }),
  );
$("run").onclick = () => {
  if (mode === "machine") {
    if (state?.halted) send({ type: "reset" });
    send({ type: "run" });
  } else if (!labTimer) {
    const frequency = $<HTMLSelectElement>("speed").value;
    labTimer = setInterval(
      () => send({ type: "labStep", kind: "clock" }),
      frequency === "max" ? 16 : Math.max(16, 1000 / Number(frequency)),
    );
    running = true;
    updateExecution();
  }
};
$("pause").onclick = () => {
  pause();
  updateExecution();
};
$("step-instruction").onclick = () => {
  pause();
  send(
    mode === "machine"
      ? { type: "step", kind: "instruction" }
      : { type: "labStep", kind: "gate" },
  );
};
$("step-phase").onclick = () => {
  pause();
  send(
    mode === "machine"
      ? { type: "step", kind: "phase" }
      : { type: "labStep", kind: "gate" },
  );
};
$("step-clock").onclick = () => {
  pause();
  send(
    mode === "machine"
      ? { type: "step", kind: "phase" }
      : { type: "labStep", kind: "clock" },
  );
};
$("reset").onclick = () => {
  pause();
  if (mode === "machine") send({ type: "reset" });
  else compileLab();
};
$("speed").onchange = () => {
  const v = $<HTMLSelectElement>("speed").value;
  send({
    type: "speed",
    hz: v === "max" ? 1000 : Number(v),
    fast: v === "max",
  });
  $("execution-mode").innerHTML =
    `<span class="live-dot"></span>${v === "max" ? "FAST / SAMPLED" : "INSPECTABLE"}`;
  if (mode === "lab" && labTimer) {
    pause();
    $("run").click();
  }
};
$("fit").onclick = () => scene?.fit();
$("zoom-in").onclick = () => {
  if (scene) {
    scene.zoom = Math.min(3, scene.zoom * 1.3);
    scene.resize();
  }
};
$("zoom-out").onclick = () => {
  if (scene) {
    scene.zoom = Math.max(0.2, scene.zoom / 1.3);
    scene.resize();
  }
};
for (const d of ["upstream", "downstream"] as const)
  $(d).onclick = () => {
    const c = currentCircuit();
    const id = [...selected].at(-1);
    if (!c || !id) {
      toast("Select a component to highlight its dependencies.");
      return;
    }
    const ids = dependencies(c, id, d);
    selected = ids;
    toast(
      `${d}: ${[...ids].filter((n) => n !== id).join(", ") || "No dependencies"}`,
    );
    if (scene) {
      scene.selected = id;
      scene.highlighted = ids;
      scene.draw();
    }
    renderSelected();
  };
$("inspect-alu").onclick = () => enterMachine("ALU16");
function setTab(next: string) {
  tab = next;
  document
    .querySelectorAll<HTMLButtonElement>("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === next));
  renderBottom();
}
document
  .querySelectorAll<HTMLButtonElement>("[data-tab]")
  .forEach((b) => (b.onclick = () => setTab(b.dataset.tab!)));
function renderBottom() {
  const host = $("bottom-content");
  if (tab === "code") {
    host.innerHTML = `<div class="editor-toolbar"><select id="program-select" aria-label="Example program">${Object.keys(
      programs,
    )
      .map(
        (p) =>
          `<option${programs[p] === source ? " selected" : ""}>${escape(p)}</option>`,
      )
      .join(
        "",
      )}</select><button id="load-program">Load</button><button id="assemble" class="primary">Assemble & load</button><span class="message" id="assembly-message">${assembly && !assembly.diagnostics.length ? assembly.words.length + " words · assembled" : "Edit source, then assemble"}</span></div><div class="editor"><div id="gutter" class="gutter"></div><div class="code-layer"><pre id="highlight" aria-hidden="true"></pre><textarea id="source" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="H16 assembly source"></textarea></div></div>`;
    const editor = $<HTMLTextAreaElement>("source");
    editor.value = source;
    editor.oninput = () => {
      source = editor.value;
      highlightSource();
      $("assembly-message").textContent = "Modified · assemble to apply";
    };
    editor.onscroll = () => {
      $("highlight").scrollTop = editor.scrollTop;
      $("highlight").scrollLeft = editor.scrollLeft;
      $("gutter").scrollTop = editor.scrollTop;
    };
    editor.onkeydown = (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = editor.selectionStart;
        editor.setRangeText("  ", start, editor.selectionEnd, "end");
        source = editor.value;
        highlightSource();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        assembleSource();
      }
    };
    $("load-program").onclick = () => {
      source = programs[$<HTMLSelectElement>("program-select").value];
      breakLines.clear();
      addressBreakpoints.clear();
      assembleSource();
      renderBottom();
    };
    $("assemble").onclick = assembleSource;
    highlightSource();
  } else if (tab === "scope") {
    host.innerHTML = `<div class="scope-controls"><span>Probes</span>${probes.map((p, i) => `<button data-remove="${i}" title="Remove probe">${escape(p)} ×</button>`).join("")}<input id="probe-name" aria-label="Signal to probe" placeholder="R0, PC, CLK…"><button id="add-probe">＋</button></div><canvas id="scope" class="scope"></canvas>`;
    host.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          probes.splice(Number(b.dataset.remove), 1);
          send({ type: "probes", probes });
          renderBottom();
        }),
    );
    $("add-probe").onclick = () =>
      addProbe($<HTMLInputElement>("probe-name").value);
    drawScope();
  } else if (tab === "memory") {
    host.innerHTML = `<div class="memory-toolbar"><label for="memory-address">Address / label</label><input id="memory-address" value="0x${hex(memoryAddress)}"><button id="memory-go">Go</button><button id="memory-pc">PC</button><button id="memory-sp">SP</button><button id="address-breakpoint">Breakpoint</button></div><table class="memory-table"><thead><tr><th>Address</th><th>Hex</th><th>Unsigned</th><th>ASCII</th><th>Source</th></tr></thead><tbody id="memory-rows"></tbody></table>`;
    const navigate = (address: number) => {
      if (!Number.isInteger(address) || address < 0 || address > 65535) {
        toast(
          "Enter an address from 0x0000 to 0xFFFF or a defined label.",
          true,
        );
        return;
      }
      send({ type: "memory", address });
    };
    $("memory-go").onclick = () => {
      const input = $<HTMLInputElement>("memory-address").value.trim();
      navigate(assembly?.symbols[input] ?? Number(input));
    };
    $("memory-pc").onclick = () => navigate(state?.pc ?? MAP.ROM_START);
    $("memory-sp").onclick = () => navigate(state?.sp ?? MAP.RAM_END);
    $("address-breakpoint").onclick = () => {
      const input = $<HTMLInputElement>("memory-address").value.trim();
      const address = assembly?.symbols[input] ?? Number(input);
      if (!Number.isInteger(address) || address < 0 || address > 65535) {
        toast("Enter a valid breakpoint address.", true);
        return;
      }
      if (addressBreakpoints.has(address)) addressBreakpoints.delete(address);
      else addressBreakpoints.add(address);
      syncBreakpoints();
      renderMemory();
      toast(
        `${addressBreakpoints.has(address) ? "Set" : "Removed"} breakpoint at 0x${hex(address)}`,
      );
    };
    renderMemory();
  } else if (tab === "trace") renderTrace();
  else {
    host.innerHTML =
      '<div class="scope-controls"><button id="truth-generate">Generate truth table</button><span>Combinational circuits · up to 8 input bits</span></div><div id="truth-rows"></div>';
    $("truth-generate").onclick = () => {
      if (mode !== "lab") {
        toast("Open a combinational circuit in Laboratory first.");
        return;
      }
      send({ type: "truth" });
    };
    renderTruth();
  }
}
function highlightSource() {
  const editor = $<HTMLTextAreaElement>("source");
  if (!editor) return;
  const lines = source.split("\n");
  $("gutter").innerHTML = lines
    .map(
      (_, i) =>
        `<button data-line="${i + 1}" aria-label="Toggle breakpoint on line ${i + 1}" title="Toggle breakpoint on line ${i + 1}" class="${breakLines.has(i + 1) ? "breakpoint " : ""}${assembly?.sourceMap[state?.instructionPC ?? -1] === i + 1 ? "current " : ""}${assembly?.diagnostics.some((d) => d.line === i + 1) ? "error-line" : ""}">${breakLines.has(i + 1) ? "● " : ""}${i + 1}</button>`,
    )
    .join("");
  $("gutter")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const line = Number(b.dataset.line);
          if (breakLines.has(line)) breakLines.delete(line);
          else breakLines.add(line);
          syncBreakpoints();
          highlightSource();
        }),
    );
  $("highlight").innerHTML =
    lines
      .map((line) => {
        const comment = line.indexOf(";");
        const code = comment >= 0 ? line.slice(0, comment) : line;
        const colored = escape(code)
          .replace(/\b(R[0-7])\b/gi, '<span class="syntax-register">$1</span>')
          .replace(
            /\b(0x[\dA-Fa-f]+|\d+)\b/g,
            '<span class="syntax-number">$1</span>',
          )
          .replace(
            /\b(NOP|HALT|LDI|MOV|LD|ST|ADD|SUB|INC|DEC|AND|OR|XOR|NOT|JMP|JZ|JNZ|JC|CALL|RET|PUSH|POP)\b/gi,
            '<span class="syntax-op">$1</span>',
          );
        return (
          colored +
          (comment >= 0
            ? '<span class="syntax-comment">' +
              escape(line.slice(comment)) +
              "</span>"
            : "")
        );
      })
      .join("\n") + "\n";
  $("gutter").scrollTop = editor.scrollTop;
}
function assembleSource() {
  pause();
  send({ type: "assemble", source });
}
function syncBreakpoints() {
  send({
    type: "breakpoints",
    addresses: [
      ...addressBreakpoints,
      ...[...breakLines]
        .map((line) => assembly?.lineAddresses[line])
        .filter((n) => n !== undefined),
    ],
  });
}
function renderMemory() {
  if (!$("memory-rows")) return;
  $("memory-rows").innerHTML = memoryWords
    .map(
      (v, i) =>
        `<tr class="${state?.pc === memoryAddress + i ? "current" : ""}"><td>${addressBreakpoints.has(memoryAddress + i) ? "● " : ""}${hex(memoryAddress + i)}</td><td>${hex(v)}</td><td>${v}</td><td>${v >= 32 && v < 127 ? escape(String.fromCharCode(v)) : "·"}</td><td>${assembly?.sourceMap[memoryAddress + i] ?? "—"}</td></tr>`,
    )
    .join("");
}
function renderTrace() {
  $("bottom-content").innerHTML = traces.length
    ? traces
        .slice(-60)
        .reverse()
        .map(
          (sample) =>
            `<div class="trace-row"><span class="muted">t=${sample.time.toString().padStart(8, "0")}</span>　${Object.entries(
              sample.values,
            )
              .map(([p, v]) => `${escape(p)} ${v === "X" ? "X" : hex(v)}`)
              .join("　")}</div>`,
        )
        .join("")
    : '<div class="empty">Step the machine or circuit to record signal transitions.</div>';
}
function renderTruth() {
  if (!$("truth-rows")) return;
  if (!truthRows.length) {
    $("truth-rows").innerHTML =
      '<div class="empty">Generate a table, then click a row to apply its inputs to the circuit.</div>';
    return;
  }
  const inputs = Object.keys(truthRows[0].inputs),
    outputs = Object.keys(truthRows[0].outputs);
  $("truth-rows").innerHTML =
    `<table class="truth-table"><thead><tr>${[...inputs, ...outputs].map((p) => `<th>${escape(p)}</th>`).join("")}</tr></thead><tbody>${truthRows.map((r, i) => `<tr data-row="${i}" tabindex="0">${inputs.map((p) => `<td>${r.inputs[p]}</td>`).join("")}${outputs.map((p) => `<td class="truth-output">${r.outputs[p]}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $("truth-rows")
    .querySelectorAll<HTMLTableRowElement>("tr[data-row]")
    .forEach((row) => {
      const apply = () => {
        labInputs = { ...truthRows[Number(row.dataset.row)].inputs };
        for (const [name, value] of Object.entries(labInputs))
          send({ type: "labInput", name, value });
        renderSelected();
      };
      row.onclick = apply;
      row.onkeydown = (e) => {
        if (e.key === "Enter") apply();
      };
    });
}
function addProbe(name: string) {
  name = name.trim();
  if (!name) return;
  if (!probes.includes(name)) probes.push(name);
  send({ type: "probes", probes });
  setTab("scope");
}
function drawScope() {
  const canvas = $<HTMLCanvasElement>("scope");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, rect.width * devicePixelRatio);
  canvas.height = Math.max(1, rect.height * devicePixelRatio);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const w = rect.width,
    h = rect.height;
  ctx.fillStyle = "#111b15";
  ctx.fillRect(0, 0, w, h);
  ctx.font = '11px "IBM Plex Mono", monospace';
  const names = probes.length ? probes : ["CLK"];
  const rowHeight = Math.min(42, (h - 15) / names.length);
  for (let i = 0; i < names.length; i++) {
    const y = 15 + i * rowHeight;
    ctx.fillStyle = "#96ac8c";
    ctx.fillText(
      names[i].length > 17 ? "…" + names[i].slice(-16) : names[i],
      10,
      y + 12,
    );
    ctx.strokeStyle = "#293d2c";
    ctx.beginPath();
    ctx.moveTo(140, y + rowHeight - 3);
    ctx.lineTo(w, y + rowHeight - 3);
    ctx.stroke();
    const samples = traces.slice(-70),
      count = Math.max(2, samples.length);
    const values = samples.map((s) => s.values[names[i]] ?? "X");
    const bus =
      values.some((v) => v !== "X" && v > 1) ||
      (!["CLK"].includes(names[i]) && !names[i].endsWith(":OUT"));
    ctx.strokeStyle = "#b9df94";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    values.forEach((v, j) => {
      const x = 145 + (j * (w - 157)) / (count - 1);
      const py =
        y +
        (bus
          ? rowHeight * 0.5
          : v === "X"
            ? rowHeight * 0.5
            : v
              ? 5
              : rowHeight - 8);
      if (j === 0) ctx.moveTo(x, py);
      else {
        ctx.lineTo(
          x,
          y +
            (bus
              ? rowHeight * 0.5
              : values[j - 1] === "X"
                ? rowHeight * 0.5
                : values[j - 1]
                  ? 5
                  : rowHeight - 8),
        );
        ctx.lineTo(x, py);
      }
      if (bus && (j === 0 || v !== values[j - 1])) {
        ctx.fillStyle = "#bfd6a7";
        ctx.fillText(v === "X" ? "X" : hex(v), x + 3, py - 4);
      }
    });
    ctx.stroke();
  }
}
const display = $<HTMLCanvasElement>("display"),
  displayContext = display.getContext("2d")!;
const pixels = displayContext.createImageData(128, 128);
function drawDisplay(words: Uint16Array) {
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const on = (words[y * 8 + (x >> 4)] >> (15 - (x & 15))) & 1;
      const p = (y * 128 + x) * 4;
      pixels.data[p] = on ? 192 : 11;
      pixels.data[p + 1] = on ? 226 : 20;
      pixels.data[p + 2] = on ? 150 : 11;
      pixels.data[p + 3] = 255;
    }
  displayContext.putImageData(pixels, 0, 0);
}
for (const event of ["keydown", "keyup"] as const)
  display.addEventListener(event, (e) => {
    e.preventDefault();
    send({
      type: "key",
      code:
        e.key === "ArrowUp" || e.key.toLowerCase() === "w"
          ? 38
          : e.key === "ArrowDown" || e.key.toLowerCase() === "s"
            ? 40
            : e.key.length === 1
              ? e.key.charCodeAt(0)
              : 0,
      down: event === "keydown",
    });
  });
display.addEventListener("blur", () =>
  send({ type: "key", code: 0, down: false }),
);
function updateExecution() {
  const labMode = mode === "lab";
  const v = state ? executionView(state, running, stopReason) : null;
  const label = labMode
    ? !labValid
      ? "Incomplete"
      : running
        ? "Running"
        : "Paused"
    : (v?.label ?? "Ready");
  $("execution").dataset.state = label.toLowerCase();
  $("execution-badge").textContent = label.toUpperCase();
  $("execution-program").textContent = labMode ? workspace.name : loadedProgram;
  $("execution-title").textContent = labMode
    ? !labValid
      ? "Connect the circuit before running"
      : running
        ? "Laboratory clock is advancing"
        : "Laboratory clock paused"
    : (v?.title ?? "Loading machine…");
  $("execution-detail").textContent = labMode
    ? !labValid
      ? "Connect all required ports, then Validate. The previous circuit is not running."
      : `${
          Object.entries(labValues)
            .filter(([k]) =>
              workspace.outputs.some((p) => k === workspace.id + ":" + p.id),
            )
            .map(([k, val]) => k.split(":").at(-1) + " = " + val)
            .join(" · ") || "Toggle an input or step the clock."
        } · ${["Counter", "Register16", "D Flip-Flop"].includes(workspace.name) || workspace.components.some((c) => ["Counter", "Register16", "D Flip-Flop"].includes(c.type)) ? "Sequential state updates on clock edges." : "Combinational outputs change when inputs change."}`
    : (v?.detail ?? "");
  $("execution-phases").innerHTML = labMode
    ? ""
    : PHASES.map(
        (p, i) =>
          `<span class="${v?.phase === i && !state?.halted ? "current" : ""}">${i + 1} ${p}</span>`,
      ).join("");
  $("execution-count").textContent = labMode
    ? `Circuit t = ${lastLabTime}`
    : `${state?.instructions ?? 0} instructions · ${state?.cycles ?? 0} clocks`;
  $("run").textContent = running
    ? "▶ Running…"
    : !labMode && state?.halted
      ? "↻ Run again"
      : !labMode && state?.cycles
        ? "▶ Resume"
        : "▶ Run";
  $<HTMLButtonElement>("run").disabled = running || (labMode && !labValid);
  $<HTMLButtonElement>("watch-slowly").disabled = labMode && !labValid;
  for (const id of ["step-instruction", "step-phase", "step-clock"])
    $<HTMLButtonElement>(id).disabled = labMode && !labValid;
  $<HTMLButtonElement>("pause").disabled = !running;
  $("run").classList.toggle("active", running);
  $("run").removeAttribute("aria-pressed");
  $("machine-status").textContent = label;
  $("watch-slowly").textContent =
    !labMode && state?.halted ? "↻ Replay slowly" : "▷ Watch slowly";
}
$("watch-slowly").onclick = () => {
  $<HTMLSelectElement>("speed").value = "1";
  $("speed").dispatchEvent(new Event("change"));
  if (!running) $("run").click();
};
function updateMachine() {
  if (!state) return;
  $("phase-tag").textContent = state.halted
    ? "HALTED"
    : "NEXT: " + PHASES[state.phase];
  $("phase-track").innerHTML = PHASES.map(
    (p, i) =>
      `<div title="${p}" class="${i === state!.phase ? "on" : ""}"></div>`,
  ).join("");
  $("instruction-address").textContent = "0x" + hex(state.instructionPC);
  const { op, a, b } = state.decoded;
  const no = ["NOP", "HALT", "RET"].includes(op);
  const one = ["INC", "DEC", "NOT", "PUSH", "POP"].includes(op);
  const branch = ["JMP", "JZ", "JNZ", "JC", "CALL"].includes(op);
  $("instruction-text").textContent =
    op +
    (no
      ? ""
      : branch
        ? " 0x" + hex(state.immediate)
        : " R" +
          a +
          (one
            ? ""
            : op === "LDI"
              ? ", 0x" + hex(state.immediate)
              : ", R" + b));
  $("instruction-binary").textContent = state.ir
    .toString(2)
    .padStart(16, "0")
    .replace(/(.{5})(.{3})(.{3})(.{5})/, "$1 $2 $3 $4");
  $("alu-inputs").innerHTML =
    `<div class="key-value"><span>A / B</span><span>${hex(state.alu.a)} / ${hex(state.alu.b)}</span></div><div class="key-value"><span>${ALU_OPS[state.alu.op]}</span><span>→ ${hex(state.alu.result)}</span></div>`;
  const regs = [...state.registers, state.pc, state.sp];
  regs.forEach((v, i) => {
    if (oldRegisters[i] !== undefined && oldRegisters[i] !== v)
      recentChanges.set(i, performance.now());
  });
  $("registers").innerHTML = regs
    .map(
      (v, i) =>
        `<button data-register="${i}" class="register ${(recentChanges.get(i) ?? -2000) > performance.now() - 1500 ? "changed" : ""}"><span>${i < 8 ? "R" + i : i === 8 ? "PC" : "SP"}</span>${hex(v)}</button>`,
    )
    .join("");
  $("registers")
    .querySelectorAll<HTMLButtonElement>("[data-register]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const i = Number(b.dataset.register);
          if (i >= 8) {
            enterMachine(i === 8 ? "PC" : "SP");
            return;
          }
          enterMachine("RegisterFile");
          navigation.push({
            name: "R" + i,
            type: "Register16",
            path: "RegisterFile/R" + i,
          });
          send({
            type: "inspect",
            path: currentPath(),
            device: "RegisterFile",
          });
          drawWorkspace(true);
          renderSelected();
        }),
    );
  oldRegisters = regs;
  $("flags").innerHTML = Object.entries(state.flags)
    .map(([k, v]) => `<span class="flag ${v ? "on" : ""}">${k} ${v}</span>`)
    .join("");
  $("machine-status").textContent = state.fault
    ? "Fault: " + state.fault
    : state.halted
      ? "Halted"
      : running
        ? "Running"
        : "Paused";
  $("cycle-count").textContent =
    state.cycles.toLocaleString() +
    " clocks · " +
    state.instructions.toLocaleString() +
    " instructions";
  updateExecution();
  if (tab === "code") {
    const line = assembly?.sourceMap[state.instructionPC];
    $("gutter")
      ?.querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) =>
        b.classList.toggle(
          "current",
          Number(b.dataset.line) ===
            (stopReason === "breakpoint"
              ? assembly?.sourceMap[state!.pc]
              : line),
        ),
      );
  }
  const currentLine =
    assembly?.sourceMap[
      stopReason === "breakpoint" ? state.pc : state.instructionPC
    ];
  const codeLayer = document.querySelector<HTMLElement>(".code-layer");
  if (codeLayer)
    codeLayer.style.setProperty(
      "--active-line-y",
      `${9 + ((currentLine ?? 0) - 1) * 21 - ($<HTMLTextAreaElement>("source")?.scrollTop ?? 0)}px`,
    );
  if (tab === "memory") renderMemory();
  if (tab === "scope") drawScope();
  if (tab === "trace") renderTrace();
}
worker.onmessage = (event) => {
  const m = event.data;
  if (m.type === "state") {
    state = m.state;
    stopReason = m.stopReason ?? "paused";
    running = mode === "machine" ? m.running : running;
    machineValues = m.registerValues ?? m.values;
    memoryWords = m.memory;
    memoryAddress = m.memoryAddress;
    if (mode === "machine") traces = m.trace;
    drawDisplay(m.video);
    updateMachine();
    if (mode === "machine") {
      $("gate-count").textContent = `${m.gateCount} NAND gates / ALU`;
      drawWorkspace();
      renderSelected();
    }
  } else if (m.type === "lab") {
    labValid = true;
    labValues = m.values;
    lastLabTime = m.time;
    updateExecution();
    traces = m.trace;
    if (mode === "lab") {
      drawWorkspace();
      if (!$("selected-content").contains(document.activeElement))
        renderSelected();
      else
        for (const p of currentCircuit()?.outputs ?? []) {
          const el = $("out-" + p.id);
          if (el)
            el.textContent = formatValue(
              labValues[currentPath() + ":" + p.id],
              p.width,
            );
        }
      $("gate-count").textContent =
        `${m.gateCount.toLocaleString()} primitive gates`;
      $("cycle-count").textContent = `Laboratory t = ${m.time}`;
      if (tab === "scope") drawScope();
      if (tab === "trace") renderTrace();
    }
  } else if (m.type === "assembly") {
    assembly = m;
    if (m.diagnostics.length) {
      toast(
        m.diagnostics
          .map((d: any) => `Line ${d.line}:${d.column} — ${d.message}`)
          .join("\n"),
        true,
      );
      if ($("assembly-message"))
        $("assembly-message").textContent = "Assembly failed";
    } else {
      loadedProgram =
        Object.entries(programs).find(([, p]) => p === source)?.[0] ??
        "Custom program";
      syncBreakpoints();
      if ($("assembly-message"))
        $("assembly-message").textContent =
          `${m.words.length} words · assembled`;
      $("program-status").textContent = `${m.words.length} WORDS / 0x8000`;
      if (savedMachine) {
        send({ type: "restore", state: savedMachine });
        savedMachine = undefined;
      }
    }
    if (tab === "code") highlightSource();
  } else if (m.type === "truth") {
    truthRows = m.rows;
    renderTruth();
  } else if (m.type === "error") toast(m.message, true);
  else if (m.type === "saved") {
    const project = projectData(m.state);
    if (pendingSave === "export") {
      const blob = new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "h16-laboratory.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Project exported, including the complete machine state.");
    } else {
      try {
        localStorage.setItem("h16-project", JSON.stringify(project));
        toast("Project and machine state saved on this device.");
      } catch {
        toast("Browser storage is full. Export the project instead.", true);
      }
    }
    pendingSave = null;
  }
};
function projectData(machine?: MachineState): Project {
  return {
    version: 1,
    source,
    breakpoints: [...breakLines],
    addressBreakpoints: [...addressBreakpoints],
    probes,
    custom,
    workspace,
    preferences: {
      hz: Number($<HTMLSelectElement>("speed").value) || 1000,
      fast: $<HTMLSelectElement>("speed").value === "max",
    },
    machine,
  };
}
$("save").onclick = () => {
  pendingSave = "local";
  send({ type: "save" });
};
$("export").onclick = () => {
  pendingSave = "export";
  send({ type: "save" });
};
$("import").onclick = () => $("import-file").click();
$<HTMLInputElement>("import-file").onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    restoreProject(parseProject(await file.text()));
    toast("Project restored.");
  } catch (error) {
    toast(String(error), true);
  }
};
function restoreProject(p: Project) {
  pause();
  source = p.source;
  breakLines = new Set(p.breakpoints);
  addressBreakpoints = new Set(p.addressBreakpoints ?? []);
  probes = p.probes;
  custom = p.custom;
  Object.assign(library, custom);
  workspace = p.workspace;
  savedMachine = p.machine;
  $<HTMLSelectElement>("speed").value = p.preferences?.fast
    ? "max"
    : String(p.preferences?.hz ?? 100);
  $("speed").dispatchEvent(new Event("change"));
  send({ type: "probes", probes });
  fillPalette();
  assembleSource();
  renderBottom();
  if (mode === "lab") compileLab();
  drawWorkspace(true);
}
fillPalette();
renderBottom();
drawWorkspace(true);
try {
  const saved = localStorage.getItem("h16-project");
  if (saved) restoreProject(parseProject(saved));
  else assembleSource();
} catch {
  assembleSource();
  toast(
    "The previous saved project could not be read. Examples are still available.",
    true,
  );
}
window.addEventListener("resize", () => {
  if (tab === "scope") drawScope();
});
// Preserve unsaved source and layout without serializing the 64K machine every keystroke.
window.addEventListener("pagehide", () => {
  try {
    const previous = localStorage.getItem("h16-project");
    const prior = previous ? parseProject(previous) : undefined;
    const machine = prior?.source === source ? prior.machine : undefined;
    localStorage.setItem("h16-project", JSON.stringify(projectData(machine)));
  } catch {}
});
function workerCommand(
  type: string,
  body: Record<string, unknown> = {},
  response = "state",
): Promise<any> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const listener = (event: MessageEvent) => {
      if (event.data.requestId !== requestId) return;
      if (event.data.type === "error") {
        cleanup();
        reject(new Error(event.data.message));
      } else if (event.data.type === response) {
        cleanup();
        resolve(event.data);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Simulation response timed out"));
    }, 10000);
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", listener);
    };
    worker.addEventListener("message", listener);
    send({ type, ...body, requestId });
  });
}
import { registerLabTools, type ToolContext } from "./ui/webmcp";
const unregister = registerLabTools(
  (document as Document & { modelContext?: ToolContext }).modelContext,
  {
    read: () => ({ state, running, mode }),
    assemble: async (text) => {
      pause();
      source = text;
      renderBottom();
      const result = await workerCommand("assemble", { source }, "assembly");
      await workerCommand("pause");
      return {
        words: result.words.length,
        diagnostics: result.diagnostics,
        symbols: result.symbols,
      };
    },
    step: async (count, kind) => {
      enterMachine();
      let result;
      for (let i = 0; i < count; i++) {
        result = await workerCommand("step", { kind });
        if (result.state.halted) break;
      }
      return { state: result.state, running: result.running };
    },
  },
);
window.addEventListener("pagehide", unregister, { once: true });
