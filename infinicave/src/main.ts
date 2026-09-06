import {
  BUDGETS,
  DEFAULT_SETTINGS,
  DT,
  copy,
  distance,
  type Context,
  type Size,
  type Settings,
  type SaveRecord,
  type World,
  type Vec,
} from "./domain";
import { generateWorld, freshSeed } from "./generation";
import { createContext, tick, interactable, recover } from "./simulation";
import { CaveRenderer } from "./rendering";
import { InputManager } from "./input";
import { hazardActive } from "./physics";
import { GameAudio } from "./audio";
import {
  SaveQueue,
  listContexts,
  loadContext,
  writeContext,
  claimContext,
  deleteContext,
  renameContext,
  importContext,
  exportContext,
} from "./persistence";
const app = document.querySelector<HTMLDivElement>("#app")!,
  hud = document.querySelector<HTMLDivElement>("#hud")!,
  canvas = document.querySelector<HTMLCanvasElement>("#cave")!,
  dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
const paths: Record<string, string> = {
  cave: '<path d="M4 20 12 4l8 16H4Z"/><path d="m9 20 3-7 3 7M7 14h3m5 0h2"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  diagonal: '<path d="M6 18 18 6M6 6h12v12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  import: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  export: '<path d="M12 15V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="m15 4 5 5-10 10-6 1 1-6L15 4Zm-2 2 5 5"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h.01M12 12h.01M16 16h.01M8 16h.01M16 8h.01"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
  save: '<path d="M4 3h13l3 3v15H4V3Zm4 0v6h8V3M8 21v-8h8v8"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 8 15 8 15S25 10 20 5Z"/>',
  keyboard:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.1M10 9h.1M14 9h.1M18 9h.1M6 12h.1M10 12h.1M14 12h.1M18 12h.1M7 16h10"/>',
  volume: '<path d="m3 9 4 0 5-5v16l-5-5H3V9Zm13-2c4 3 4 7 0 10"/>',
};
function icon(name: string) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cave}</svg>`;
}
const brand = `<button class="brand" data-action="home" aria-label="InfiniCave expeditions">${icon("cave")}<span>infinicave</span><sup>EXPEDITIONS</sup></button>`;
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function duration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  return mins >= 60
    ? `${Math.floor(mins / 60)}h ${mins % 60}m`
    : `${mins}m ${Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0")}s`;
}
function key(code: string) {
  return code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace("Arrow", "")
    .replace("Escape", "Esc");
}
let settings: Settings = copy(DEFAULT_SETTINGS);
try {
  const saved = JSON.parse(
    localStorage.getItem("infinicave-settings") || "null",
  );
  if (saved && typeof saved === "object") {
    for (const field of ["effects", "music", "deadZone"] as const)
      if (typeof saved[field] === "number" && Number.isFinite(saved[field]))
        settings[field] = Math.max(
          0,
          Math.min(field === "deadZone" ? 0.5 : 1, saved[field]),
        );
    for (const field of [
      "reducedMotion",
      "reducedFlashing",
      "lowEffects",
    ] as const)
      if (typeof saved[field] === "boolean") settings[field] = saved[field];
    if (
      saved.controls &&
      Object.keys(DEFAULT_SETTINGS.controls).every(
        (k) =>
          typeof saved.controls[k] === "string" &&
          /^[A-Za-z0-9]{1,20}$/.test(saved.controls[k]),
      ) &&
      new Set(Object.values(saved.controls)).size === 8
    )
      settings.controls = saved.controls;
  } else if (matchMedia("(prefers-reduced-motion: reduce)").matches)
    settings.reducedMotion = settings.reducedFlashing = true;
} catch {}
const input = new InputManager(canvas, settings),
  audio = new GameAudio(),
  saves = new SaveQueue();
let renderer: CaveRenderer | null = null,
  rendererError = "";
try {
  renderer = new CaveRenderer(canvas);
  renderer.resize(settings.lowEffects);
} catch {
  rendererError =
    "WebGL could not start. Enable hardware acceleration or try another desktop browser.";
}
type Mode =
  | "home"
  | "new"
  | "generating"
  | "loading"
  | "playing"
  | "paused"
  | "ready"
  | "map"
  | "settings"
  | "controls"
  | "guide"
  | "complete";
let mode: Mode = "home",
  returnMode: Mode = "home",
  context: Context | null = null,
  demo: Context | null = null,
  releaseContext: (() => void) | null = null;
let records: SaveRecord[] = [],
  newSize: Size = "standard",
  generation: Worker | null = null,
  generationToken = 0;
let saveStatus = "",
  saveError = "",
  toastTimeout = 0,
  lastAutosave = 0,
  accumulator = 0,
  previous: Vec | undefined,
  viewToken = 0,
  binding: keyof Settings["controls"] | null = null;
function toast(message: string, error = false) {
  const el = document.querySelector<HTMLDivElement>("#toast")!;
  clearTimeout(toastTimeout);
  el.textContent = message;
  el.className = `visible${error ? " error" : ""}`;
  toastTimeout = window.setTimeout(
    () => (el.className = ""),
    error ? 8000 : 4200,
  );
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function setMode(next: Mode) {
  mode = next;
  input.activate(next === "playing");
  audio.active(next === "playing");
  accumulator = 0;
  previous = undefined;
  if (next !== "playing") hud.innerHTML = "";
}
function focusPanel() {
  requestAnimationFrame(() =>
    app
      .querySelector<HTMLElement>(
        "[autofocus], .primary, .panel button, .nav button",
      )
      ?.focus(),
  );
}
function overlay(content: string, classes = "") {
  app.innerHTML = `<div class="overlay">${brand}<section class="panel ${classes}">${content}</section></div>`;
  focusPanel();
}
async function modal(
  title: string,
  description: string,
  confirm = "Confirm",
  value?: string,
  dangerous = false,
): Promise<string | boolean> {
  input.clear();
  dialog.innerHTML = `<form method="dialog"><h2>${escape(title)}</h2><p>${escape(description)}</p>${value !== undefined ? `<div class="form-field"><label for="dialog-value">Expedition name</label><input id="dialog-value" name="value" maxlength="60" value="${escape(value)}" required></div>` : ""}<div class="panel-actions"><button class="secondary" value="cancel">Cancel</button><button class="${dangerous ? "danger" : "primary"}" value="confirm">${escape(confirm)}</button></div></form>`;
  dialog.showModal();
  (
    dialog.querySelector<HTMLInputElement>("input") ||
    dialog.querySelector<HTMLButtonElement>("button")
  )?.focus();
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () =>
        resolve(
          dialog.returnValue === "confirm"
            ? value !== undefined
              ? dialog.querySelector<HTMLInputElement>("input")!.value
              : true
            : false,
        ),
      { once: true },
    );
  });
}
async function home() {
  const token = ++viewToken;
  if (context) {
    await saves.flush();
    releaseContext?.();
    releaseContext = null;
    context = null;
    saveError = "";
  }
  setMode("home");
  if (demo) renderer?.setWorld(demo.world);
  try {
    records = await listContexts();
  } catch (e) {
    records = [];
    toast(`Local storage is unavailable: ${errorText(e)}`, true);
  }
  if (token !== viewToken) return;
  const recent = records.find(
    (r) => !r.unreadable && r.current.payload.runtime.status === "active",
  );
  app.innerHTML = `<main class="home"><header class="topbar">${brand}<nav class="nav" aria-label="Main navigation"><button class="selected" data-action="home">Expeditions</button><button data-action="guide">Field guide</button><button data-action="settings">Settings</button></nav><div class="local-badge"><i class="dot"></i>Local saves · endless possibilities</div></header><section class="hero"><div class="hero-copy"><div class="eyebrow">Beneath the surface. Beyond the known.</div><h1>The deep<br>is <em>calling.</em></h1><p class="intro">A small helicopter. A forgotten world.<br>Find your way through ancient machinery and living stone. Discover what waits at the heart.</p><div class="hero-actions"><button class="primary" data-action="new">New expedition ${icon("plus")}</button>${recent ? `<button class="secondary" data-action="play" data-id="${escape(recent.id)}">Continue ${icon("arrow")}</button>` : `<button class="secondary" data-action="guide">How to explore ${icon("arrow")}</button>`}</div><div class="keyline">${icon("keyboard")}Made for keyboard & gamepad <span>·</span> No two journeys alike</div></div><div class="hero-coordinate"><span>DOWN HERE, THE WORLD IS DIFFERENT</span><strong>The threshold</strong><div class="coordinate-line">SECTOR 01 / SIGNAL ACTIVE</div></div></section><section class="expeditions"><div class="section-head"><h2>Your expeditions <span class="count">${records.length.toString().padStart(2, "0")}</span></h2><button class="ghost" data-action="import">${icon("import")} Import save</button></div><div class="expedition-grid">${records.length ? records.map(card).join("") : `<div class="empty-card"><div class="empty-icon">${icon("compass")}</div><div><h3>Every descent starts here.</h3><p>Your expeditions will be kept on this device.<br>Start a journey, leave a little of the unknown behind.</p></div></div>`}<button class="new-card" data-action="new"><span class="plus">+</span><strong>Chart a new course</strong><small>A new seed. A world of your own.</small></button></div></section><footer class="footer"><span>${icon("shield")}Your progress stays yours. Saved locally. Export anytime.</span><span class="right">Explore slowly. Fly carefully.</span></footer>${rendererError ? `<div class="error-panel">${escape(rendererError)}</div>` : ""}</main>`;
  for (const record of records) {
    if (record.unreadable) continue;
    const cv = app.querySelector<HTMLCanvasElement>(
      `canvas[data-id="${record.id}"]`,
    );
    if (cv) drawMap(cv, record.current.payload, true);
  }
}
function card(record: SaveRecord) {
  if (record.unreadable)
    return `<article class="expedition-card"><div class="card-body"><div class="eyebrow">Save needs attention</div><h3 style="margin:16px 0">Unreadable expedition</h3><p class="description" style="font-size:12px;line-height:1.8;color:var(--muted)">Its stored data is intact, but no readable revision was found. Other expeditions are unaffected.</p><div class="card-bottom" style="margin-top:20px"><button class="ghost" data-action="play" data-id="${escape(record.id)}">Inspect error</button><button class="icon-button" data-action="delete" data-id="${escape(record.id)}" aria-label="Delete unreadable expedition">${icon("trash")}</button></div></div></article>`;

  const c = record.current.payload,
    completed = c.runtime.status === "completed",
    progress = c.world.relays.filter((r) => c.runtime.relays & r.bit).length;
  const date = new Date(c.lastPlayed).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `<article class="expedition-card"><div class="card-map"><canvas data-id="${escape(record.id)}" aria-label="Explored cave preview"></canvas><span class="card-status ${completed ? "complete" : ""}"><i class="dot"></i>${completed ? "COMPLETED" : "IN PROGRESS"}</span><span class="card-seed">SEED ${escape(c.world.seed.slice(0, 20))}</span></div><div class="card-body"><div class="card-title"><h3>${escape(c.name)}</h3><button data-action="play" data-id="${escape(record.id)}" aria-label="${completed ? "Inspect" : "Play"} ${escape(c.name)}">${icon("arrow")}</button></div><div class="card-meta"><span>${BUDGETS[c.world.size]?.label || "Unknown"} cave</span><span>${duration(c.stats.playTime)}</span><span>${date}</span></div><div class="card-bottom"><div class="relay-dots">${c.world.relays.map((r) => `<i class="${c.runtime.relays & r.bit ? "on" : ""}"></i>`).join("")}<span>${progress}/${c.world.relays.length} relays</span></div><div class="card-menu"><button class="icon-button" data-action="rename" data-id="${escape(record.id)}" aria-label="Rename ${escape(c.name)}" title="Rename">${icon("edit")}</button><button class="icon-button" data-action="export-card" data-id="${escape(record.id)}" aria-label="Export ${escape(c.name)}" title="Export">${icon("export")}</button><button class="icon-button" data-action="delete" data-id="${escape(record.id)}" aria-label="Delete ${escape(c.name)}" title="Delete">${icon("trash")}</button></div></div></div></article>`;
}
function newExpedition() {
  viewToken++;
  setMode("new");
  newSize = "standard";
  overlay(
    `<div class="eyebrow">Into the unknown</div><h2>Begin your descent.</h2><p class="description">A finite world, shaped by a seed. Find its relays, open the ancient passages, and reach the heart.</p><form id="new-form"><div class="form-field"><label for="name">Expedition name <span>Optional</span></label><input id="name" name="name" maxlength="60" placeholder="e.g. The first descent" autofocus></div><div class="form-field"><label for="seed">World seed <span>Optional</span></label><div class="seed-field"><input id="seed" name="seed" maxlength="128" placeholder="Leave blank for a new world"><button type="button" data-action="random-seed" aria-label="Generate a random seed">${icon("dice")}</button></div><small>Same seed + same size = the same cave. Progress stays independent.</small></div><span class="field-label">Expedition size</span><div class="size-grid" role="group" aria-label="Expedition size">${(Object.keys(BUDGETS) as Size[]).map((size) => `<button type="button" data-action="size" data-size="${size}" class="size-option ${size === newSize ? "selected" : ""}" aria-pressed="${size === newSize}">${icon("cave")}<strong>${BUDGETS[size].label}</strong><small>${BUDGETS[size].length}</small></button>`).join("")}</div><div class="note">${icon("shield")}Your expedition is saved before takeoff. Return to checkpoints as often as you need.</div><div class="panel-actions"><button type="button" class="secondary" data-action="home">Back</button><button type="submit" class="primary">Create expedition ${icon("arrow")}</button></div></form>`,
  );
}
async function createExpedition(form: HTMLFormElement) {
  if (rendererError) throw new Error(rendererError);
  const data = new FormData(form),
    seed =
      String(data.get("seed") || "")
        .normalize("NFC")
        .trim() || freshSeed(),
    name =
      String(data.get("name") || "").trim() ||
      `Descent ${String(records.length + 1).padStart(2, "0")}`,
    size = newSize,
    token = ++generationToken;
  setMode("generating");
  overlay(
    `<div class="generation"><div class="loader">${icon("cave")}</div><div class="eyebrow">A world taking shape</div><h2>Carving the unknown.</h2><p class="description">${BUDGETS[size].label} expedition · ${escape(seed)}</p><div class="progress-track"></div><p class="generation-phase" role="status">Planning the descent</p><button class="ghost" data-action="cancel-generation" style="margin-top:25px">Cancel</button></div>`,
  );
  const worker = (generation = new Worker(
    new URL("generation.worker.js", document.baseURI),
    { type: "module" },
  ));
  worker.onmessage = async ({
    data,
  }: MessageEvent<{ phase?: string; world?: World; error?: string }>) => {
    if (token !== generationToken) return;
    if (data.phase) {
      const phase = app.querySelector(".generation-phase");
      if (phase) phase.textContent = data.phase;
    }
    if (data.error) {
      worker.terminate();
      generation = null;
      newExpedition();
      toast(data.error, true);
    }
    if (data.world) {
      worker.terminate();
      generation = null;
      const cancel = app.querySelector<HTMLButtonElement>(
        '[data-action="cancel-generation"]',
      );
      if (cancel) cancel.disabled = true;
      const phase = app.querySelector(".generation-phase");
      if (phase) phase.textContent = "Saving your starting point";
      let release: (() => void) | null = null;
      try {
        const created = createContext(data.world, name);
        release = await claimContext(created.id);
        created.revision = await writeContext(created);
        context = created;
        releaseContext = release;
        lastAutosave = context.stats.playTime;
        renderer?.setWorld(context.world);
        ready(true);
      } catch (e) {
        release?.();
        newExpedition();
        toast(`Expedition could not be saved: ${errorText(e)}`, true);
      }
    }
  };
  worker.onerror = () => {
    if (token !== generationToken) return;
    worker.terminate();
    generation = null;
    newExpedition();
    toast("The cave generator could not start. Please retry.", true);
  };
  worker.postMessage({ seed, size });
}
async function play(id: string) {
  if (rendererError) throw new Error(rendererError);
  setMode("loading");
  overlay(
    `<div class="generation"><div class="loader">${icon("compass")}</div><h2>Finding your way back.</h2><p class="description">Checking the saved world and restoring your expedition.</p></div>`,
  );
  let release: (() => void) | null = null;
  try {
    release = await claimContext(id);
    const loaded = await loadContext(id);
    if (
      loaded.recovered &&
      !(await modal(
        "Recover the previous save?",
        `${loaded.reason} The previous valid revision is available. Continuing will roll back to that revision.`,
        "Recover save",
      ))
    ) {
      release();
      await home();
      return;
    }
    context = loaded.context;
    releaseContext = release;
    context.lastPlayed = new Date().toISOString();
    lastAutosave = context.stats.playTime;
    renderer?.setWorld(context.world);
    if (context.runtime.status === "completed") complete();
    else ready(false);
  } catch (e) {
    release?.();
    await home();
    toast(errorText(e), true);
  }
}
function ready(fresh: boolean) {
  if (!context) return;
  setMode("ready");
  overlay(
    `<div class="eyebrow">${fresh ? "Systems online · expedition saved" : "Your expedition, exactly where you left it"}</div><h2>${fresh ? "Ready for the descent?" : "Ready to continue."}</h2><p class="description">${escape(context.name)}<br>${fresh ? "Take your time. Your craft holds a steady hover when you release the controls." : "Motion, enemies, and machinery are paused. Take a moment to get your bearings."}</p><div class="control-grid"><div class="settings-row"><span>Fly</span><span><kbd>${escape(key(settings.controls.up))}</kbd> <kbd>${escape(key(settings.controls.left))}</kbd> <kbd>${escape(key(settings.controls.down))}</kbd> <kbd>${escape(key(settings.controls.right))}</kbd></span></div><div class="settings-row"><span>Fire</span><kbd>${escape(key(settings.controls.fire))}</kbd></div><div class="settings-row"><span>Interact</span><kbd>${escape(key(settings.controls.interact))}</kbd></div><div class="settings-row"><span>Map / pause</span><span><kbd>${escape(key(settings.controls.map))}</kbd> <kbd>${escape(key(settings.controls.pause))}</kbd></span></div></div><div class="panel-actions"><button class="secondary" data-action="home">Expeditions</button><button class="primary" data-action="resume">${fresh ? "Begin expedition" : "Resume flight"} ${icon("play")}</button></div>`,
  );
}
function resume() {
  if (!context) return;
  setMode("playing");
  app.innerHTML = "";
  renderHud();
  void audio.start(settings).catch(() => {});
}
function pause() {
  if (!context || context.runtime.status === "completed") return;
  setMode("paused");
  pausePanel();
}
function pausePanel() {
  if (!context) return;
  overlay(
    `<div class="eyebrow">Take a breath</div><h2>Flight paused.</h2><p class="description">${escape(context.name)}</p><div class="pause-meta"><span>${duration(context.stats.playTime)} elapsed</span><span>${context.stats.deaths} recoveries</span><span>${Math.round((context.runtime.explored.length / context.world.rooms.length) * 100)}% explored</span></div><div class="pause-menu"><button class="primary resume" data-action="resume">Resume flight ${icon("play")}</button><button class="secondary" data-action="save">${icon("save")}Save expedition</button><button class="secondary" data-action="map">${icon("map")}Cave map</button><button class="secondary" data-action="controls">${icon("keyboard")}Controls</button><button class="secondary" data-action="settings">${icon("settings")}Settings</button><button class="secondary" data-action="export">${icon("export")}Export save</button><button class="secondary" data-action="recover">${icon("back")}Return to checkpoint</button></div><div class="panel-actions"><button class="secondary" data-action="save-exit" style="width:100%">Save & exit ${icon("arrow")}</button></div>${saveErrorMarkup()}`,
  );
}
function saveErrorMarkup() {
  return saveError
    ? `<div class="save-error" role="alert">Your last good save is intact. ${escape(saveError)}<div class="actions"><button class="secondary" data-action="save">Retry save</button><button class="secondary" data-action="export">Export current progress</button><button class="ghost" data-action="exit-without-saving">Exit without saving</button></div></div>`
    : "";
}
async function save(auto = false): Promise<boolean> {
  if (!context) return false;
  const c = context;
  saveStatus = "Saving…";
  try {
    await saves.save(c, auto);
    if (context === c) {
      saveStatus = "Saved";
      saveError = "";
      setTimeout(() => {
        if (saveStatus === "Saved") saveStatus = "";
      }, 2500);
      if (!auto) toast("Expedition saved");
    }
    return true;
  } catch (e) {
    if (context === c) {
      saveStatus = "Save failed";
      saveError = errorText(e);
      toast(
        `Could not save: ${saveError}. Retry or export from the pause menu.`,
        true,
      );
      if (mode === "playing") pause();
      else if (mode === "paused") pausePanel();
      else if (mode === "complete") complete();
    }
    return false;
  }
}
function renderHud() {
  if (!context || mode !== "playing") return;
  hud.innerHTML = `<div class="hud-top"><div class="hud-left"><div class="hud-brand">${icon("cave")}</div><div class="hull"><div class="hud-label"><span>HULL INTEGRITY</span><span id="health-value">100</span></div><div class="hull-track"><i id="health-bar"></i></div></div><div class="hud-objective"><div class="eyebrow" id="relay-progress"></div><p id="objective"></p></div></div><div class="hud-right"><span class="save-indicator" id="save-status" role="status"></span><button data-action="map" aria-label="Open cave map">${icon("map")}<span>${escape(key(settings.controls.map))}</span></button><button data-action="pause" aria-label="Pause flight">${icon("pause")}<span>${escape(key(settings.controls.pause))}</span></button></div></div><div class="hud-bottom"><div><div class="location"><small id="sector"></small><span id="location"></span></div><div class="flight-keys"><span><kbd>${escape([settings.controls.up, settings.controls.left, settings.controls.down, settings.controls.right].map(key).join(""))} / ↑↓←→</kbd> Fly</span><span><kbd>${escape(key(settings.controls.fire))}</kbd> Fire</span><span><kbd>${escape(key(settings.controls.interact))}</kbd> Interact</span></div></div><button class="mini-map" data-action="map" aria-label="Open explored cave map"><canvas id="minimap"></canvas></button></div><div class="interact-prompt hidden" id="interaction"></div>${context.stats.playTime < 25 ? `<div class="tutorial"><strong>FLIGHT NOTES / 01</strong>Release the controls to hover.<br>Approach the lit station and press <kbd>${escape(key(settings.controls.interact))}</kbd> to repair and set a checkpoint.<br>Brush walls gently; pull away before the hull scrapes.<br>Amber machinery opens on a cycle.</div>` : ""}`;
  updateHud();
}
function updateHud() {
  if (!context || mode !== "playing") return;
  const s = context.runtime,
    p = s.player,
    w = context.world;
  document.querySelector("#health-value")!.textContent = String(
    Math.ceil(p.health),
  );
  const bar = document.querySelector<HTMLElement>("#health-bar")!;
  bar.style.width = `${p.health}%`;
  bar.style.background = p.health < 35 ? "#e69b70" : "#a9d4b5";
  document.querySelector("#relay-progress")!.textContent =
    `${w.relays.filter((r) => s.relays & r.bit).length} / ${w.relays.length} RELAYS ONLINE`;
  document.querySelector("#objective")!.textContent = s.objective;
  document.querySelector("#save-status")!.textContent = saveStatus;
  const room = w.rooms.reduce((a, b) =>
    distance(a, p) < distance(b, p) ? a : b,
  );
  document.querySelector("#sector")!.textContent =
    `SECTOR ${String(room.index + 1).padStart(2, "0")} / ${BUDGETS[w.size].label.toUpperCase()} EXPEDITION`;
  document.querySelector("#location")!.textContent = room.name;
  const interaction = document.querySelector<HTMLElement>("#interaction")!,
    target = interactable(context);
  const hazard = w.hazards.find((h) => distance(h, p) < 8);
  const wallPressure = p.wallContact > 0.04;
  interaction.classList.toggle("hidden", !target && !hazard && !wallPressure);
  if (wallPressure) interaction.textContent = "Wall pressure · pull away!";
  else if (target)
    interaction.innerHTML = `<kbd>${escape(key(settings.controls.interact))}</kbd>${escape(target.label)}`;
  else if (hazard) {
    const phase = (s.time + hazard.phase) % hazard.period;
    interaction.textContent = hazardActive(hazard, s.time)
      ? `Wait for the machinery · opens in ${(hazard.active - phase).toFixed(1)}s`
      : `Passage clear · ${(hazard.period - phase).toFixed(1)}s to cross`;
  }
  if (context.stats.playTime >= 25) hud.querySelector(".tutorial")?.remove();
  const minimap = document.querySelector<HTMLCanvasElement>("#minimap");
  if (minimap) drawMap(minimap, context);
}
function drawMap(cv: HTMLCanvasElement, c: Context, preview = false) {
  const width = cv.clientWidth || 400,
    height = cv.clientHeight || 200,
    ratio = Math.min(devicePixelRatio, 2);
  if (
    cv.width !== Math.round(width * ratio) ||
    cv.height !== Math.round(height * ratio)
  ) {
    cv.width = Math.round(width * ratio);
    cv.height = Math.round(height * ratio);
  }
  const g = cv.getContext("2d")!;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);
  g.fillStyle = "#0c1b20";
  g.fillRect(0, 0, width, height);
  g.strokeStyle = "#34504725";
  g.lineWidth = 0.5;
  for (let x = 0; x < width; x += 22) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, height);
    g.stroke();
  }
  for (let y = 0; y < height; y += 22) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();
  }
  const w = c.world,
    s = c.runtime;
  let scale = Math.min((width - 24) / w.width, (height - 20) / w.height),
    ox = (width - w.width * scale) / 2,
    oy = (height + w.height * scale) / 2;
  if (preview) {
    scale = Math.max(scale, 0.9);
    ox = width / 2 - s.player.x * scale;
    oy = height / 2 + s.player.y * scale;
  }
  const x = (v: number) => ox + v * scale,
    y = (v: number) => oy - v * scale;
  const explored = new Set(s.explored);
  for (const e of w.edges) {
    const a = w.rooms.find((r) => r.id === e.a)!,
      b = w.rooms.find((r) => r.id === e.b)!,
      ea = explored.has(a.id),
      eb = explored.has(b.id);
    if (!ea && !eb) continue;
    const start = ea ? a : b,
      end =
        ea && eb
          ? b
          : {
              x: start.x + ((ea ? b : a).x - start.x) * 0.37,
              y: start.y + ((ea ? b : a).y - start.y) * 0.37,
            };
    g.strokeStyle = ea && eb ? "#699184" : "#839789";
    g.lineWidth = Math.max(1.3, e.width * scale);
    g.setLineDash(ea && eb ? [] : [3, 3]);
    g.beginPath();
    g.moveTo(x(start.x), y(start.y));
    g.lineTo(x(end.x), y(end.y));
    g.stroke();
    g.setLineDash([]);
  }
  for (const room of w.rooms)
    if (explored.has(room.id)) {
      g.fillStyle = room.kind === "optional" ? "#465951" : "#3b635a";
      g.strokeStyle = "#7b9c84";
      g.lineWidth = 0.7;
      g.beginPath();
      g.roundRect(
        x(room.x - room.width / 2),
        y(room.y + room.height / 2),
        room.width * scale,
        room.height * scale,
        Math.max(1, 3 * scale),
      );
      g.fill();
      g.stroke();
      const relay = w.relays.find((r) => r.roomId === room.id);
      if (relay) {
        g.fillStyle = s.relays & relay.bit ? "#adf1c7" : "#e4bb78";
        g.save();
        g.translate(x(relay.x), y(relay.y));
        g.rotate(Math.PI / 4);
        g.fillRect(-2.5, -2.5, 5, 5);
        g.restore();
      }
      if (w.checkpoints.some((cp) => cp.roomId === room.id)) {
        g.strokeStyle = "#b8e7ca";
        g.strokeRect(x(room.x) - 2.5, y(room.y) - 2.5, 5, 5);
        if (
          w.checkpoints.some(
            (cp) =>
              cp.roomId === room.id && s.activatedCheckpoints.includes(cp.id),
          )
        ) {
          g.fillStyle = "#b8e7ca";
          g.fillRect(x(room.x) - 1.5, y(room.y) - 1.5, 3, 3);
        }
      }
      if (room.kind === "heart") {
        g.fillStyle = "#e4bb78";
        g.beginPath();
        g.arc(x(room.x), y(room.y), 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  for (const gate of w.gates)
    if ((s.relays & gate.requires) !== gate.requires) {
      const edge = w.edges.find((e) => e.gateId === gate.id);
      if (edge && explored.has(edge.a) && explored.has(edge.b)) {
        g.fillStyle = "#dda263";
        g.fillRect(x(gate.x) - 2, y(gate.y) - 2, 4, 4);
      }
    }
  g.fillStyle = "#f7deb0";
  g.shadowColor = "#f9d69d";
  g.shadowBlur = 9;
  g.beginPath();
  g.arc(x(s.player.x), y(s.player.y), preview ? 3 : 3.5, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
}
function mapPanel() {
  if (!context) return;
  returnMode =
    context.runtime.status === "completed"
      ? "complete"
      : mode === "playing"
        ? "playing"
        : "paused";
  setMode("map");
  overlay(
    `<div class="panel-heading"><div><div class="eyebrow">Charting the unknown</div><h2 style="margin-top:10px">${escape(context.name)}</h2></div><button class="ghost" data-action="close-map" aria-label="Close map">${icon("close")}</button></div><canvas id="full-map" class="map-view" role="img" aria-label="Explored chambers and discovered objective markers. Dashed passages lead into unexplored areas."></canvas><div class="map-legend"><span><i style="border-radius:50%;background:#f7deb0"></i>You</span><span><i class="relay"></i>Relay</span><span><i style="background:none;border:1px solid #b8e7ca"></i>Checkpoint</span><span><i class="unknown"></i>Unexplored exit</span></div><div class="map-stats"><span>${context.runtime.explored.length} / ${context.world.rooms.length} chambers explored</span><span>${context.runtime.discoveries.length} hidden galleries found</span><span>Simulation paused</span></div>`,
    "map-panel",
  );
  requestAnimationFrame(() => {
    const cv = document.querySelector<HTMLCanvasElement>("#full-map");
    if (cv && context) drawMap(cv, context);
  });
}
function settingsPanel() {
  if (mode !== "settings")
    returnMode = context
      ? context.runtime.status === "completed"
        ? "complete"
        : "paused"
      : "home";
  setMode("settings");
  overlay(
    `<div class="panel-heading"><h2>Make yourself at home.</h2><button class="ghost" data-action="back-panel" aria-label="Back">${icon("close")}</button></div><div class="settings-section">Sound</div>${range("effects", "Effects volume", "Rotor, weapons, machinery & signals", 0, 1, 0.05)}${range("music", "Ambient volume", "A quiet undertone for the descent", 0, 1, 0.05)}<div class="settings-section">Comfort & performance</div>${toggle("reducedMotion", "Reduced motion", "Disable banking, screen shake & camera look-ahead")}${toggle("reducedFlashing", "Reduced flashing", "Steady damage feedback & electrical effects")}${toggle("lowEffects", "Lower effects", "Reduced resolution and decorative particles")}<div class="settings-section">Gamepad</div>${range("deadZone", "Stick dead zone", "Ignore small unintended stick movements", 0, 0.5, 0.01)}<div class="panel-actions"><button class="secondary" data-action="controls">Remap controls ${icon("keyboard")}</button><button class="primary" data-action="back-panel">Done</button></div>`,
  );
}
function range(
  name: "effects" | "music" | "deadZone",
  label: string,
  help: string,
  min: number,
  max: number,
  step: number,
) {
  return `<label class="settings-row"><span>${label}<small>${help}</small></span><input type="range" data-setting="${name}" aria-label="${label}" min="${min}" max="${max}" step="${step}" value="${settings[name]}"></label>`;
}
function toggle(
  name: "reducedMotion" | "reducedFlashing" | "lowEffects",
  label: string,
  help: string,
) {
  return `<label class="settings-row"><span>${label}<small>${help}</small></span><input type="checkbox" data-setting="${name}" ${settings[name] ? "checked" : ""}></label>`;
}
function controlsPanel() {
  returnMode = context
    ? context.runtime.status === "completed"
      ? "complete"
      : "paused"
    : "home";
  setMode("controls");
  binding = null;
  const labels = {
    left: "Fly left",
    right: "Fly right",
    up: "Fly up",
    down: "Fly down",
    fire: "Fire",
    interact: "Interact",
    map: "Map",
    pause: "Pause / resume",
  };
  overlay(
    `<div class="eyebrow">Know your craft</div><h2>Flight controls.</h2><p class="description">Select a binding, then press a key to change it. Arrow keys always fly. Your helicopter hovers when you release the controls.</p><div class="control-grid">${Object.entries(
      settings.controls,
    )
      .map(
        ([action, code]) =>
          `<div class="settings-row"><span>${labels[action as keyof typeof labels]}</span><button class="binding" data-action="bind" data-binding="${action}" aria-label="Remap ${labels[action as keyof typeof labels]}">${escape(key(code))}</button></div>`,
      )
      .join(
        "",
      )}</div><div class="note" style="margin-top:25px">${icon("keyboard")}Gamepad: left stick / D-pad to fly, right trigger to fire, south button to interact, north button for map, Menu to pause. Use keyboard or mouse in menus.</div><div class="panel-actions"><button class="secondary" data-action="reset-controls">Restore defaults</button><button class="primary" data-action="back-panel">Done</button></div>`,
  );
}
function guide() {
  returnMode = context ? "paused" : "home";
  setMode("guide");
  overlay(
    `<div class="eyebrow">The explorer’s field guide</div><h2>There’s a way through.</h2><p class="description">InfiniCave is a quiet adventure in a restless place. Every expedition is finite. Every cave has a heart.</p><div class="guide-steps"><div class="guide-step"><span>01 / EXPLORE</span><h3>Follow your curiosity.</h3><p>Use WASD or arrows to fly. Release to hover. Open your map with M; dashed exits lead into the unknown. Side galleries reward a detour.</p></div><div class="guide-step"><span>02 / AWAKEN</span><h3>Bring the ruins to life.</h3><p>Approach amber relay rings and press E. Each relay permanently opens a passage. Green stations repair your hull and capture a checkpoint.</p></div><div class="guide-step"><span>03 / DESCEND</span><h3>Find the heart.</h3><p>When all relays are online, the final seal opens. Wait for amber hazards to retract, pass through, and use the heart’s shutdown control.</p></div></div><div class="guide-copy"><p><strong>Small craft. Unlimited chances.</strong> Space fires in your facing direction. Light wall brushes are forgiven. Keep pushing and your hull takes damage, with a small bounce away. Repeated impacts can destroy the craft. Drones and amber hazards also hurt. The glowing hazard supports mark a crossing: wait back from the beam, then pass when it switches off.</p><p><strong>A checkpoint is a promise.</strong> Destruction restores everything to your last checkpoint, including relays, enemies and exploration. Deaths and elapsed time remain cumulative. Return to Checkpoint does the same without adding a death.</p><p><strong>Your world stays yours.</strong> Progress autosaves every 30 seconds of active play and after important events. Save & Exit waits for storage to finish. Export a save to keep a portable backup. Clearing site data removes local expeditions.</p></div><div class="panel-actions"><button class="secondary" data-action="controls">Controls</button><button class="primary" data-action="back-panel">Back to expeditions ${icon("arrow")}</button></div>`,
    "wide",
  );
}
function complete() {
  if (!context) return;
  setMode("complete");
  overlay(
    `<div class="complete-symbol">${icon("heart")}</div><div class="eyebrow">Expedition complete</div><h2>The mountain falls silent.</h2><p class="description">${escape(context.name)}<br>You found the heart, and gave the deep its rest.</p><div class="complete-stats"><div><strong>${duration(context.stats.playTime)}</strong><small>EXPEDITION TIME</small></div><div><strong>${context.stats.deaths}</strong><small>DEATHS</small></div><div><strong>${Math.round((context.runtime.explored.length / context.world.rooms.length) * 100)}%</strong><small>EXPLORED</small></div></div><p class="completion-note">${saveError ? "Completion is awaiting a successful save." : "Your completed expedition is preserved."}<br>Another world waits whenever you’re ready.</p><div class="complete-actions"><button class="primary" data-action="complete-home">Return to expeditions ${icon("arrow")}</button><button class="secondary" data-action="complete-new">New expedition ${icon("plus")}</button><button class="ghost" data-action="map">Inspect expedition map ${icon("map")}</button></div>${saveErrorMarkup()}`,
    "complete-panel wide",
  );
}
function backPanel() {
  binding = null;
  if (returnMode === "complete") complete();
  else if (returnMode === "playing") resume();
  else if (returnMode === "paused" && context) pause();
  else void home();
}
function persistSettings() {
  input.settings = settings;
  audio.update(settings);
  renderer?.resize(settings.lowEffects);
  try {
    localStorage.setItem("infinicave-settings", JSON.stringify(settings));
  } catch {
    toast(
      "Preferences could not be stored; they still apply for this session.",
      true,
    );
  }
}
async function action(button: HTMLElement) {
  const name = button.dataset.action,
    id = button.dataset.id || "";
  switch (name) {
    case "home":
      if (mode === "generating" || mode === "loading") break;
      if (
        context &&
        mode !== "ready" &&
        context.runtime.status !== "completed"
      ) {
        if (await save()) await home();
      } else await home();
      break;
    case "new":
      newExpedition();
      break;
    case "size":
      newSize = button.dataset.size as Size;
      app.querySelectorAll<HTMLElement>(".size-option").forEach((b) => {
        b.classList.toggle("selected", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
      break;
    case "random-seed":
      app.querySelector<HTMLInputElement>("#seed")!.value = freshSeed();
      break;
    case "cancel-generation":
      generationToken++;
      generation?.terminate();
      generation = null;
      await home();
      break;
    case "play":
      await play(id);
      break;
    case "pause":
      pause();
      break;
    case "resume":
      resume();
      break;
    case "save":
      if (await save()) {
        if (context?.runtime.status === "completed") complete();
        else if (mode === "paused") pausePanel();
      }
      break;
    case "save-exit":
      if (await save()) await home();
      break;
    case "exit-without-saving":
      if (
        await modal(
          "Exit without saving?",
          `Unsaved progress in “${context?.name}” will be lost. Your last successful save is kept.`,
          "Exit without saving",
          undefined,
          true,
        )
      )
        await home();
      break;
    case "recover":
      if (
        context &&
        (await modal(
          "Return to checkpoint?",
          "Relay activations, defeated enemies and exploration since the checkpoint will be rolled back. Elapsed time is kept. This does not add a death.",
          "Return to checkpoint",
        ))
      ) {
        recover(context);
        await save();
        pausePanel();
      }
      break;
    case "map":
      mapPanel();
      break;
    case "close-map":
      backPanel();
      break;
    case "settings":
      if (mode === "playing") pause();
      settingsPanel();
      break;
    case "controls":
      controlsPanel();
      break;
    case "guide":
      guide();
      break;
    case "back-panel":
      backPanel();
      break;
    case "bind":
      binding = button.dataset.binding as keyof Settings["controls"];
      app
        .querySelectorAll(".binding")
        .forEach((b) => b.classList.remove("listening"));
      button.classList.add("listening");
      button.textContent = "Press a key";
      break;
    case "reset-controls":
      settings.controls = copy(DEFAULT_SETTINGS.controls);
      persistSettings();
      controlsPanel();
      break;
    case "import":
      document.querySelector<HTMLInputElement>("#import-file")!.click();
      break;
    case "export":
      if (context) {
        await exportContext(context);
        toast("Portable save exported");
      }
      break;
    case "export-card": {
      const loaded = await loadContext(id);
      if (
        loaded.recovered &&
        !(await modal(
          "Export previous revision?",
          `${loaded.reason} Export the previous valid save instead?`,
          "Export previous save",
        ))
      )
        break;
      await exportContext(loaded.context);
      toast("Portable save exported");
      break;
    }
    case "rename": {
      const record = records.find((r) => r.id === id)!;
      const name = await modal(
        "Rename expedition",
        "The seed, map and progress stay the same.",
        "Rename",
        record.current.payload.name,
      );
      if (typeof name === "string" && name.trim()) {
        await renameContext(id, name);
        await home();
      }
      break;
    }
    case "delete": {
      const record = records.find((r) => r.id === id)!;
      if (
        await modal(
          "Delete expedition?",
          `“${record.unreadable ? "Unreadable expedition " + record.id : record.current.payload.name}” and its local progress will be permanently deleted. An exported backup can be imported later.`,
          "Delete expedition",
          undefined,
          true,
        )
      ) {
        await deleteContext(id);
        await home();
        toast("Expedition deleted");
      }
      break;
    }
    case "complete-home":
      if (await save()) await home();
      break;
    case "complete-new":
      if (await save()) {
        await home();
        newExpedition();
      }
      break;
  }
}
document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-action]",
  );
  if (!button || (button as HTMLButtonElement).disabled) return;
  if (button.dataset.action !== "bind") button.blur();
  if (button instanceof HTMLButtonElement) button.disabled = true;
  void action(button)
    .catch((e) => toast(errorText(e), true))
    .finally(() => {
      if (button instanceof HTMLButtonElement) button.disabled = false;
    });
});
app.addEventListener("submit", (event) => {
  if ((event.target as HTMLElement).id === "new-form") {
    event.preventDefault();
    void createExpedition(event.target as HTMLFormElement).catch((e) => {
      newExpedition();
      toast(errorText(e), true);
    });
  }
});
document
  .querySelector<HTMLInputElement>("#import-file")!
  .addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      await importContext(file);
      await home();
      toast("Expedition imported as an independent copy");
    } catch (e) {
      toast(errorText(e), true);
    } finally {
      input.value = "";
    }
  });
app.addEventListener("input", (event) => {
  const el = event.target as HTMLInputElement,
    field = el.dataset.setting as keyof Settings;
  if (!field) return;
  if (field === "effects" || field === "music" || field === "deadZone")
    settings[field] = Number(el.value);
  else if (
    field === "lowEffects" ||
    field === "reducedMotion" ||
    field === "reducedFlashing"
  )
    settings[field] = el.checked;
  persistSettings();
});
window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) return;
  if (dialog.open) return;
  if (binding) {
    event.preventDefault();
    if (
      ["Meta", "Alt", "Control", "Shift"].some((k) => event.code.startsWith(k))
    )
      return;
    if (
      ["Tab", "Enter", "Backspace"].includes(event.code) ||
      event.code.startsWith("Arrow")
    ) {
      toast(
        "Choose a letter, number, Space, or Escape. Arrow keys stay available for flight.",
      );
      return;
    }
    const old = settings.controls[binding],
      occupied = (
        Object.keys(settings.controls) as (keyof Settings["controls"])[]
      ).find((k) => settings.controls[k] === event.code);
    if (occupied) settings.controls[occupied] = old;
    settings.controls[binding] = event.code;
    binding = null;
    persistSettings();
    controlsPanel();
    return;
  }
  if ((event.target as HTMLElement).matches("input,select,textarea")) return;
  if (
    mode !== "playing" &&
    (event.code === settings.controls.pause || event.code === "Escape")
  ) {
    event.preventDefault();
    if (mode === "paused" || mode === "ready") resume();
    else if (
      mode === "map" ||
      mode === "controls" ||
      mode === "settings" ||
      mode === "guide"
    )
      backPanel();
    else if (mode === "new") void home();
  } else if (mode === "map" && event.code === settings.controls.map) {
    event.preventDefault();
    backPanel();
  }
});
input.onAction = (action) => {
  if (mode === "playing") {
    if (action === "pause") pause();
    else mapPanel();
  } else if ((mode === "paused" || mode === "ready") && action === "pause")
    resume();
  else if (mode === "map") backPanel();
};
window.addEventListener("blur", () => {
  if (mode === "playing") pause();
  input.clear();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "playing") pause();
    input.clear();
    if (context && context.runtime.status === "active") void save(true);
  }
});
window.addEventListener("resize", () => {
  renderer?.resize(settings.lowEffects);
  if (mode === "map" && context) {
    const cv = document.querySelector<HTMLCanvasElement>("#full-map");
    if (cv) drawMap(cv, context);
  }
});
let last = performance.now(),
  hudTime = 0,
  clock = 0,
  completionTimer = 0;
function frame(now: number) {
  const elapsed = Math.min((now - last) / 1000, 0.1);
  last = now;
  clock += elapsed;
  if (mode !== "playing") input.pollMenu();
  if (context && mode === "playing") {
    accumulator = Math.min(accumulator + elapsed, DT * 6);
    while (accumulator >= DT && mode === "playing") {
      const sampled = input.sample();
      if (mode !== "playing") break;
      previous = { x: context.runtime.player.x, y: context.runtime.player.y };
      const events = tick(context, sampled);
      accumulator -= DT;
      for (const event of events) {
        renderer?.event(event, settings);
        audio.event(event, context.runtime.player);
        if (event.text) toast(event.text);
        if (
          event.type === "checkpoint" ||
          event.type === "relay" ||
          event.type === "death"
        ) {
          if (event.type === "death")
            toast("Recovered at your checkpoint · progress rolled back");
          void save(true);
        }
        if (event.type === "complete") {
          setMode("loading");
          app.innerHTML = "";
          hud.innerHTML = "";
          completionTimer = 0;
          const showAfter = clock + 2;
          void save().then((ok) => {
            if (ok) completionTimer = Math.max(showAfter, clock + 0.05);
            else complete();
          });
        }
      }
      if (context.stats.playTime - lastAutosave >= 30) {
        lastAutosave = context.stats.playTime;
        void save(true);
      }
    }
    audio.motion(
      Math.hypot(context.runtime.player.vx, context.runtime.player.vy),
    );
    if (now - hudTime > 100) {
      hudTime = now;
      updateHud();
    }
  }
  if (completionTimer && clock >= completionTimer) {
    completionTimer = 0;
    complete();
  }
  const shown = context || demo;
  if (shown && renderer && !document.hidden)
    renderer.render(
      shown,
      elapsed,
      clock,
      settings,
      !context,
      mode === "playing" ? accumulator / DT : 1,
      mode === "playing" ? previous : undefined,
    );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void (async () => {
  await home();
  try {
    const world = await generateWorld("THE-THRESHOLD", "small");
    demo = createContext(world, "The threshold");
    demo.runtime.player.protection = 0;
    demo.runtime.player.x += 8;
    if (!context) renderer?.setWorld(world);
  } catch (e) {
    toast(errorText(e), true);
  }
})();
