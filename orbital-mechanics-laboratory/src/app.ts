import {
  preset,
  bodyState,
  createCraft,
  soi,
  G0,
  AU,
  type Mission,
  type Maneuver,
} from "./mission/model";
import { parseMission } from "./mission/serialization";
import { elements, hohmann } from "./physics/orbits";
import { relative, norm, v, type Vec3 } from "./physics/math";
import { dominant, type Snapshot } from "./simulation/Simulation";
import type { Prediction } from "./simulation/worker";
import { SceneRenderer } from "./rendering/SceneRenderer";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fmt = (n: number, d = 1) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })
    : "—";
const duration = (s: number) => {
  const sign = s < 0 ? "−" : "";
  s = Math.abs(Math.floor(s));
  return (
    sign +
    [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
      .map((n) => String(n).padStart(2, "0"))
      .join(":")
  );
};
const icon = `<svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="8" stroke="currentColor"/><ellipse cx="20" cy="20" rx="19" ry="7" transform="rotate(-38 20 20)" stroke="currentColor"/><circle cx="32" cy="10" r="2.5" fill="currentColor"/></svg>`;
$("app").innerHTML = `
<header><a class="brand" href="./">${icon}<span>ORBITAL<small>MECHANICS LABORATORY</small></span></a><span class="workspace-name">Mission workspace <span>/</span> <b id="mission-label">Earth orbit</b></span><div class="header-actions"><button id="explorer-toggle" class="mobile-explorer" title="Open mission explorer">☰</button><span class="local-tag"><i></i> LOCAL SIMULATION</span><button id="save">Save mission</button><button id="mission-menu" class="icon-btn" title="Mission files & settings">•••</button></div></header>
<div class="transport"><div class="mission-clock"><span class="eyebrow">MISSION ELAPSED</span><strong id="clock">T+00:00:00</strong><span id="date">08 SEP 2026</span></div><div class="playback"><button id="reset" title="Reset scenario">↺</button><button id="reverse" title="Replay backwards">↶</button><button id="play" class="play" title="Play / pause (Space)">▶</button><select id="speed" aria-label="Time acceleration"><option value="1">1×</option><option value="10" selected>10×</option><option value="100">100×</option><option value="1000">1,000×</option><option value="10000">10,000×</option><option value="100000">100,000×</option></select><span id="running-status">PAUSED</span></div><div class="frame-control"><span>REFERENCE FRAME</span><select id="frame" aria-label="Reference frame"><option value="earth">Earth-centred inertial</option><option value="moon">Moon-centred inertial</option><option value="mars">Mars-centred inertial</option><option value="global">Global inertial</option><option value="rotating">Earth-centred rotating</option><option value="local">Spacecraft local</option></select></div></div>
<main><aside class="left-panel"><div class="panel-heading">MISSION EXPLORER <span>01</span></div><label class="field-label" for="scenario">SCENARIO</label><select id="scenario"><option value="earth">Earth orbit</option><option value="moon">Earth → Moon</option><option value="mars">Earth → Mars</option></select><div class="section-title">CELESTIAL SYSTEM <span>⌄</span></div><div id="object-tree"></div><button id="add-craft" class="subtle-button">＋ Add spacecraft</button><div class="sidebar-rule"></div><div class="section-title">VIEW LAYERS</div><div class="layers"><label><input type="checkbox" id="layer-prediction" checked><span class="line-key green"></span>Predicted trajectory</label><label><input type="checkbox" id="layer-baseline" checked><span class="line-key dashed"></span>Coasting trajectory</label><label><input type="checkbox" id="layer-vectors" checked>Velocity vectors</label><label><input type="checkbox" id="layer-grid" checked>Reference grid</label><label><input type="checkbox" id="layer-soi">Spheres of influence</label><label><input type="checkbox" id="layer-lagrange">Lagrange points</label></div><div class="guide"><div class="eyebrow">MISSION BRIEF <span>↗</span></div><h3 id="guide-title">A small burn.<br>A different orbit.</h3><p id="guide-text">Start 300 km above Earth. Add 120 m/s of prograde velocity and watch your apoapsis rise.</p><button id="lunar-example" hidden>Load worked lunar plan <span>↗</span></button><button id="guide-burn">Plan a manoeuvre <span>→</span></button></div><button id="debug-toggle" class="debug-toggle">⌘ <span>Physics diagnostics</span><span id="debug-state">OFF</span></button></aside>
<section class="viewport" id="viewport"><div class="scene-heading"><div class="eyebrow"><i></i> ORBITAL VIEW <span>/ 3D</span></div><h1 id="view-title">Earth orbit</h1><p id="view-subtitle">Low Earth orbit <span>·</span> Earth-centred inertial</p></div><div class="view-buttons"><button id="view-fit" title="Fit predicted trajectory">Fit path</button><button id="view-top">Top</button><button id="view-side">Side</button><button id="view-earth" class="active">Earth</button><button id="view-moon">Moon</button><button id="view-solar">Solar system</button></div><div class="scene-scale"><span class="scale-rule"></span><span id="scale-text">SI physics · local rendering origin</span></div><div class="scene-bottom"><span><i class="green-dot"></i><span id="solver-status">INITIALIZING PHYSICS</span></span><div><button id="view-spacecraft" title="Follow spacecraft">◎ Follow</button><select id="camera-mode" aria-label="Camera mode"><option value="orbit">Orbit camera</option><option value="free">Free camera</option><option value="reference">Frame camera</option><option value="follow">Follow camera</option></select></div></div><div class="scene-help">Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Right-drag to pan</div><div id="debug-overlay" hidden></div><div id="prediction-progress" hidden>Calculating trajectory… <span>0%</span></div></section>
<aside class="inspector"><div class="panel-heading">INSPECTOR <span>↗</span></div><div class="selected-object"><div class="craft-icon">◇</div><div><h2 id="selected-name">Explorer 1</h2><span id="selected-kind">SPACECRAFT <i>●</i> NOMINAL</span></div><span class="object-menu">⌖</span></div><div class="inspector-tabs"><button class="active" data-tab="orbit">Orbit</button><button data-tab="state">State</button><button data-tab="maneuver">Manoeuvre</button></div><div id="inspector-content"></div><div class="encounter-box"><div class="eyebrow">ENCOUNTER ANALYSIS <span id="encounter-status">—</span></div><label class="target-row">Target<select id="target"><option value="moon">Moon</option><option value="earth">Earth</option><option value="mars">Mars</option></select></label><div id="encounter-data">Calculating closest approach…</div></div><div class="prediction-control"><label for="horizon">PREDICTION HORIZON</label><select id="horizon"><option value="0">1 orbit</option><option value="21600">6 hours</option><option value="86400">24 hours</option><option value="604800">7 days</option><option value="2592000">30 days</option><option value="31557600">1 year</option></select><p id="prediction-note">Propagated states · adaptive sampling</p></div></aside>
<section class="bottom-panel"><div class="timeline-panel"><div class="bottom-heading"><div class="bottom-tabs"><button class="active" id="tab-plan">Flight plan <span id="node-count">0</span></button><button id="tab-events">Events</button></div><button id="open-planner">⇄ Transfer planner</button><button id="add-node" class="accent-button">＋ Add manoeuvre</button></div><div id="timeline"></div><div class="timeline-scrub"><span id="scrub-start">T+00:00:00</span><input id="scrubber" type="range" min="0" max="5400" value="0" aria-label="Mission timeline"><span id="scrub-end">T+01:30:00</span></div></div><div class="chart-panel"><div class="bottom-heading"><select id="chart-kind" aria-label="Analysis chart"><option value="altitude">Altitude</option><option value="speed">Velocity</option><option value="energy">Specific energy</option><option value="distance">Distance to target</option></select><span class="chart-legend"><i></i> PREDICTED <span id="chart-unit">km</span></span></div><canvas id="chart" aria-label="Trajectory analysis chart"></canvas><div id="chart-tooltip" hidden></div></div></section></main>
<footer><span><i class="green-dot"></i> ALL SYSTEMS NOMINAL</span><span>Newtonian dynamics <b>·</b> Circular body ephemerides <b>·</b> No atmosphere</span><span>ORBITAL LAB <b>v1.0</b></span></footer>
<dialog id="files-dialog"><div class="dialog-heading"><h2>Mission & settings</h2><button data-close="files-dialog">×</button></div><p>Your mission is stored locally in this browser. Export a file to keep a portable copy.</p><div class="dialog-actions"><button id="load">Load saved mission</button><button id="export">Export JSON</button><button id="import">Import JSON</button></div><div class="notice">Model: prescribed circular celestial ephemerides; hybrid two-body / Newtonian multi-body spacecraft dynamics. No atmosphere, oblateness or precision ephemerides. Event times are step-resolved; closest approach is sampled. Reverse time replays the initial state and its burn history.</div><p>Shortcuts: <kbd>Space</kbd> play / pause · <kbd>M</kbd> add manoeuvre. Drag to rotate, right-drag to pan, scroll to zoom. Free camera: W/A/S/D, Q/E to translate.</p></dialog>
<dialog id="craft-dialog"><div class="dialog-heading"><h2>Place a spacecraft</h2><button data-close="craft-dialog">×</button></div><p>A circular initial orbit at mission epoch. Existing manoeuvres are replayed.</p><form id="craft-form"><label>Name<input id="craft-name" value="Explorer 2" required maxlength="40"></label><label>Primary body<select id="craft-body"><option value="earth">Earth</option><option value="moon">Moon</option><option value="mars">Mars</option><option value="sun">Sun</option></select></label><div class="form-row"><label>Altitude (km)<input id="craft-altitude" type="number" value="300" min="1" max="1000000000" required></label><label>Inclination (°)<input id="craft-inclination" type="number" value="28.5" min="0" max="180" step="0.1" required></label></div><button class="accent-button" type="submit">Create spacecraft</button></form></dialog>
<dialog id="planner-dialog"><div class="dialog-heading"><h2>Hohmann transfer</h2><button data-close="planner-dialog">×</button></div><p>Two tangential burns between coplanar circular orbits. Nodes remain editable and are propagated by the simulation.</p><div class="form-row"><label>Origin radius (km)<input id="transfer-origin" type="number" min="1" value="6671"></label><label>Target radius (km)<input id="transfer-target" type="number" min="1" value="42164"></label></div><label>Departure (mission seconds)<input id="transfer-time" type="number" min="0" value="60"></label><div id="transfer-output"></div><div class="notice" id="transfer-notice">The helper assumes a circular departure. It does not align a moving target or guarantee capture.</div><button class="accent-button" id="generate-transfer">Generate manoeuvre nodes</button></dialog>
<input id="import-file" type="file" accept=".json,application/json" hidden><div id="toast" role="status" hidden></div>`;
let acceptedMission: Mission = preset();
let mission: Mission = preset(),
  snapshot: Snapshot = {
    time: 0,
    crafts: structuredClone(mission.spacecraft),
    events: [],
    diagnostics: {},
  },
  prediction: Prediction | undefined,
  selected = "explorer-1",
  selectedNode: string | undefined,
  tab = "orbit",
  eventsTab = false,
  playing = false,
  reversing = false,
  busy = false,
  requestId = 0,
  predictTimer: ReturnType<typeof setTimeout>,
  toastTimer: ReturnType<typeof setTimeout>;
const scene = new SceneRenderer($("viewport"));
const worker = new Worker("./worker.js", { type: "module" });
function toast(message: string) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function craft() {
  return snapshot.crafts.find((c) => c.id === selected) ?? snapshot.crafts[0]!;
}
function primary() {
  return dominant(craft().state, snapshot.time, mission.bodies);
}
function orbit() {
  return elements(
    relative(
      craft().state,
      bodyState(primary(), snapshot.time, mission.bodies),
    ),
    primary().mu,
  );
}
function requestPrediction() {
  clearTimeout(predictTimer);
  predictTimer = setTimeout(() => {
    requestId++;
    $("prediction-progress").hidden = false;
    worker.postMessage({
      type: "predict",
      id: requestId,
      craftId: craft().id,
      targetId: $<HTMLSelectElement>("target").value,
      horizon: +$<HTMLSelectElement>("horizon").value,
    });
  }, 100);
}
function reload(time = snapshot.time) {
  requestId++;
  clearTimeout(predictTimer);
  busy = true;
  $("encounter-status").textContent = "UPDATING";
  $("encounter-data").textContent = "Calculating closest approach…";
  $("prediction-note").textContent = "Updating propagated states…";
  prediction = undefined;
  scene.prediction = undefined;
  worker.postMessage({ type: "load", mission, time });
}
function seek(t: number) {
  requestId++;
  clearTimeout(predictTimer);
  playing = false;
  updatePlay();
  busy = true;
  worker.postMessage({ type: "seek", time: t });
}
function updatePlay() {
  $("play").textContent = playing ? "Ⅱ" : "▶";
  $("running-status").textContent = playing
    ? reversing
      ? "REVERSING"
      : "RUNNING"
    : "PAUSED";
  $("running-status").classList.toggle("running", playing);
  $("reverse").classList.toggle("active", reversing);
}
function row(label: string, value: string, unit = "", className = "") {
  return `<div class="data-row ${className}"><span>${label}</span><strong>${value}<small>${unit}</small></strong></div>`;
}
function node() {
  return mission.manoeuvres.find((n) => n.id === selectedNode);
}
function renderTree() {
  const tree = $("object-tree");
  tree.replaceChildren();
  for (const b of mission.bodies) {
    const button = document.createElement("button");
    button.className = `tree-object ${selected === b.id ? "selected" : ""} ${b.parentId ? "child" : ""} ${b.id === "moon" ? "grandchild" : ""}`;
    const dot = document.createElement("i");
    dot.style.background = b.color;
    button.append(dot, document.createTextNode(b.name));
    const small = document.createElement("small");
    small.textContent =
      b.id === "earth"
        ? "PRIMARY"
        : b.id === "sun"
          ? "STAR"
          : b.id === "moon"
            ? "SATELLITE"
            : "";
    button.append(small);
    button.onclick = () => select(b.id);
    tree.append(button);
    if (b.id === "earth")
      for (const c of snapshot.crafts) {
        const btn = document.createElement("button");
        btn.className = `tree-object craft-tree grandchild ${selected === c.id ? "selected" : ""}`;
        btn.textContent = `◇  ${c.name}`;
        btn.onclick = () => select(c.id);
        tree.append(btn);
      }
  }
}
function select(id: string) {
  if (id.startsWith("event:")) {
    seek(+id.slice(6));
    return;
  }
  if (mission.manoeuvres.some((n) => n.id === id)) {
    selectedNode = id;
    selected = mission.manoeuvres.find((n) => n.id === id)!.craftId;
    tab = "maneuver";
  } else selected = id;
  scene.selected = craft().id;
  scene.history = [];
  renderTree();
  renderInspector();
  scene.draw();
  requestPrediction();
}
scene.onSelect = select;
function renderInspector() {
  acceptedMission = structuredClone(mission);
  document
    .querySelectorAll<HTMLButtonElement>("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const b = mission.bodies.find((b) => b.id === selected),
    c = craft(),
    p = primary(),
    el = orbit(),
    rel = relative(c.state, bodyState(p, snapshot.time, mission.bodies));
  $("selected-name").textContent = b?.name ?? c.name;
  $("selected-kind").textContent = b
    ? "CELESTIAL BODY"
    : c.collided
      ? `IMPACT · ${c.collided.toUpperCase()}`
      : "SPACECRAFT · NOMINAL";
  const content = $("inspector-content");
  if (b) {
    content.innerHTML = `<div class="inspector-section-label">PHYSICAL PROPERTIES</div>${row("Radius", fmt(b.radiusM / 1000), "km")}${row("Mass", b.massKg.toExponential(4), "kg")}${row("Gravitational μ", b.mu.toExponential(5), "m³/s²")}${row("Rotation period", fmt(b.rotationPeriodS / 3600), "h")}${row("Sphere of influence", Number.isFinite(soi(b, mission.bodies)) ? fmt(soi(b, mission.bodies) / 1000) : "Unbounded", "km")}<button class="wide-button" id="focus-body">Focus body →</button>`;
    $("focus-body").onclick = () => setView(b.id === "sun" ? "solar" : b.id);
    return;
  }
  if (tab === "orbit") {
    content.innerHTML = `<div class="primary-label"><span class="blue-dot"></span> Primary body <strong>${escapeHTML(p.name)}</strong><span class="pill">${el.eccentricity < 1 ? "BOUND" : "ESCAPE"}</span></div><div class="altitude-card"><span>ALTITUDE</span><strong>${fmt((norm(rel.position) - p.radiusM) / 1000)}<small>km</small></strong><div><span>Relative velocity</span><b>${fmt(norm(rel.velocity) / 1000, 3)} <small>km/s</small></b></div></div><div class="inspector-section-label">OSCULATING ELEMENTS</div>${row("Periapsis", fmt((el.periapsis - p.radiusM) / 1000), "km")}${row("Apoapsis", el.apoapsis ? fmt((el.apoapsis - p.radiusM) / 1000) : "Unbounded", el.apoapsis ? "km" : "")}${row("Orbital period", el.period ? fmt(el.period / 60, 2) : "—", "min")}${row("Inclination", fmt((el.inclination * 180) / Math.PI, 2), "°")}${row("Eccentricity", fmt(el.eccentricity, 5))}${row("Semi-major axis", fmt(el.semiMajorAxis / 1000), "km")}<details><summary>More orbital elements</summary>${row("Ascending node", fmt((el.longitudeAscendingNode * 180) / Math.PI, 2), "°")}${row("Periapsis argument", fmt((el.argumentOfPeriapsis * 180) / Math.PI, 2), "°")}${row("True anomaly", fmt((el.trueAnomaly * 180) / Math.PI, 2), "°")}${row("Specific energy", fmt(el.energy / 1e6, 3), "MJ/kg")}${row("Angular momentum", el.angularMomentum.toExponential(3), "m²/s")}</details><button id="inspector-add" class="wide-button">＋ Plan a manoeuvre</button>`;
    $("inspector-add").onclick = addNode;
  }
  if (tab === "state") {
    content.innerHTML = `<div class="inspector-section-label">INERTIAL STATE · SI UNITS</div>${(["x", "y", "z"] as const).map((k) => row(`Position ${k}`, c.state.position[k].toExponential(6), "m")).join("")}${(["x", "y", "z"] as const).map((k) => row(`Velocity ${k}`, fmt(c.state.velocity[k], 3), "m/s")).join("")}${row("Relative velocity", fmt(norm(rel.velocity), 3), "m/s")}${row("Total mass", fmt(c.dryMassKg + c.fuelMassKg), "kg")}${row("Dry mass", fmt(c.dryMassKg), "kg")}${row("Remaining fuel", fmt(c.fuelMassKg), "kg")}${row("Available Δv", fmt(c.engine.ispSeconds * G0 * Math.log((c.dryMassKg + c.fuelMassKg) / c.dryMassKg)), "m/s")}${row("Max thrust", fmt(c.engine.maxThrustN / 1000), "kN")}${row("Specific impulse", fmt(c.engine.ispSeconds), "s")}`;
  }
  if (tab === "maneuver") {
    const n = node();
    if (!n) {
      content.innerHTML =
        '<div class="empty-inspector"><span>⌁</span><h3>Shape your next orbit.</h3><p>Add a manoeuvre node to explore how a velocity change reshapes your trajectory.</p><button class="accent-button" id="empty-add">＋ Add manoeuvre</button></div>';
      $("empty-add").onclick = addNode;
      return;
    }
    content.innerHTML = `<div class="node-editor"><div class="inspector-section-label">MANOEUVRE ${mission.manoeuvres.indexOf(n) + 1}<button id="delete-node" title="Delete manoeuvre">×</button></div><div class="form-row"><label>Burn type<select id="burn-type"><option value="impulse">Impulsive</option><option value="finite">Finite thrust</option></select></label><label>Frame<select id="burn-frame"><option value="LOCAL_ORBITAL">Local orbital</option><option value="INERTIAL">Inertial XYZ</option></select></label></div><label>Mission time (seconds)<input id="burn-time" type="number" min="0" step="1" value="${n.time}"></label>${(["x", "y", "z"] as const).map((axis, i) => `<label class="axis-label">${n.frame === "INERTIAL" ? axis.toUpperCase() : ["Prograde / retrograde", "Normal / antinormal", "Radial out / in"][i]} <span>${n.type === "finite" ? "direction" : "m/s"}</span><div class="axis-control"><button aria-label="Decrease ${["prograde", "normal", "radial"][i]}" data-axis="${axis}" data-sign="-1">−</button><input aria-label="${["Prograde", "Normal", "Radial"][i]}" data-axis-input="${axis}" type="number" value="${n.deltaV[axis]}" step="10"><button aria-label="Increase ${["prograde", "normal", "radial"][i]}" data-axis="${axis}" data-sign="1">＋</button></div></label>`).join("")}${n.type === "finite" ? `<div class="form-row"><label>Duration (s)<input id="burn-duration" type="number" min="0.1" value="${n.durationS}"></label><label>Throttle (%)<input id="burn-throttle" type="number" min="0" max="100" value="${n.throttle * 100}"></label></div>` : ""}<div id="burn-result"></div><p class="microcopy">Changes update the predicted path. Play past the node to execute the burn.</p><button class="wide-button" id="execute-node">Go to burn completion →</button></div>`;
    $<HTMLSelectElement>("burn-type").value = n.type;
    $<HTMLSelectElement>("burn-frame").value = n.frame;
    const changed = () => {
      try {
        parseMission(JSON.stringify(mission));
        acceptedMission = structuredClone(mission);
        reload();
        renderTimeline();
        updateBurnResult();
      } catch (e) {
        mission = structuredClone(acceptedMission);
        toast((e as Error).message);
        renderInspector();
      }
    };
    $("burn-type").onchange = () => {
      n.type = $<HTMLSelectElement>("burn-type").value as Maneuver["type"];
      changed();
      renderInspector();
    };
    $("burn-frame").onchange = () => {
      n.frame = $<HTMLSelectElement>("burn-frame").value as Maneuver["frame"];
      changed();
      renderInspector();
    };
    $("burn-time").onchange = () => {
      const val = +$<HTMLInputElement>("burn-time").value;
      if (Number.isFinite(val) && val >= 0) {
        n.time = val;
        changed();
      }
    };
    document.querySelectorAll<HTMLInputElement>("[data-axis-input]").forEach(
      (input) =>
        (input.oninput = () => {
          if (input.value === "" || !Number.isFinite(+input.value)) return;
          n.deltaV[input.dataset.axisInput as keyof Vec3] = +input.value;
          changed();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>("[data-axis]").forEach(
      (b) =>
        (b.onclick = () => {
          n.deltaV[b.dataset.axis as keyof Vec3] += +b.dataset.sign! * 10;
          changed();
          renderInspector();
        }),
    );
    if (n.type === "finite") {
      $("burn-duration").onchange = () => {
        n.durationS = Math.max(
          0.1,
          +$<HTMLInputElement>("burn-duration").value,
        );
        changed();
      };
      $("burn-throttle").onchange = () => {
        n.throttle = Math.max(
          0,
          Math.min(1, +$<HTMLInputElement>("burn-throttle").value / 100),
        );
        changed();
      };
    }
    $("delete-node").onclick = () => {
      mission.manoeuvres = mission.manoeuvres.filter((x) => x.id !== n.id);
      selectedNode = undefined;
      reload();
      renderInspector();
      renderTimeline();
    };
    $("execute-node").onclick = () =>
      seek(n.time + (n.type === "finite" ? n.durationS : 0) + 0.01);
    updateBurnResult();
  }
}
function updateBurnResult() {
  const out = $("burn-result"),
    n = node();
  if (!out || !n) return;
  const executed =
    n.time <= snapshot.time &&
    snapshot.events.some(
      (e) =>
        e.type === "MANEUVER_START" &&
        e.spacecraftId === n.craftId &&
        Math.abs(e.time - n.time) < 0.01,
    );
  const c = craft(),
    dv = norm(n.deltaV),
    cost =
      (c.dryMassKg + c.fuelMassKg) *
      (1 - Math.exp(-dv / (c.engine.ispSeconds * G0)));
  out.innerHTML = executed
    ? row("Burn status", "Executed")
    : n.type === "impulse"
      ? row("Total Δv", fmt(dv, 1), "m/s", "accent-row") +
        row("Estimated fuel cost", fmt(cost, 1), "kg")
      : row(
          "Mass flow",
          fmt(
            (c.engine.maxThrustN * n.throttle) / (c.engine.ispSeconds * G0),
            2,
          ),
          "kg/s",
        );
  if (prediction) {
    const fc = prediction.final.crafts.find((x) => x.id === c.id)!;
    const b = dominant(fc.state, prediction.final.time, mission.bodies),
      e = elements(
        relative(fc.state, bodyState(b, prediction.final.time, mission.bodies)),
        b.mu,
      );
    out.innerHTML +=
      `<div class="inspector-section-label">PREDICTED FINAL ORBIT · ${escapeHTML(b.name.toUpperCase())}</div>` +
      row("Periapsis", fmt((e.periapsis - b.radiusM) / 1000), "km") +
      row(
        "Apoapsis",
        e.apoapsis ? fmt((e.apoapsis - b.radiusM) / 1000) : "Unbounded",
        e.apoapsis ? "km" : "",
      ) +
      row("Period", e.period ? fmt(e.period / 60) : "—", "min");
  }
}
function addNode() {
  selected = craft().id;
  const n: Maneuver = {
    id: `node-${Date.now().toString(36)}`,
    craftId: selected,
    time: Math.ceil(snapshot.time + 60),
    type: "impulse",
    frame: "LOCAL_ORBITAL",
    deltaV: v(120),
    durationS: 30,
    throttle: 1,
  };
  mission.manoeuvres.push(n);
  selectedNode = n.id;
  tab = "maneuver";
  playing = false;
  updatePlay();
  reload();
  renderInspector();
  renderTimeline();
  renderTree();
}
function renderTimeline() {
  $("node-count").textContent = String(mission.manoeuvres.length);
  const list = $("timeline");
  list.replaceChildren();
  const initial = document.createElement("button");
  initial.className = "timeline-event launch-event";
  initial.innerHTML =
    '<span class="timeline-symbol">◎</span><span><b>Initial orbit</b><small>T+00:00:00</small></span><em>Launch state</em>';
  initial.onclick = () => seek(0);
  list.append(initial);
  if (eventsTab) {
    for (const e of [...snapshot.events, ...(prediction?.events ?? [])]
      .filter(
        (e, i, a) =>
          a.findIndex(
            (x) =>
              x.type === e.type &&
              Math.abs(x.time - e.time) < 0.01 &&
              x.spacecraftId === e.spacecraftId,
          ) === i,
      )
      .slice(0, 30)) {
      const btn = document.createElement("button");
      btn.className = "timeline-event";
      btn.innerHTML = `<span class="timeline-symbol">○</span><span><b>${e.type.replaceAll("_", " ").toLowerCase()}</b><small>T+${duration(e.time)}</small></span>`;
      btn.onclick = () => seek(e.time);
      list.append(btn);
    }
  } else
    for (const [i, n] of [...mission.manoeuvres]
      .sort((a, b) => a.time - b.time)
      .entries()) {
      const btn = document.createElement("button");
      btn.className = `timeline-event ${selectedNode === n.id ? "active" : ""}`;
      btn.innerHTML = `<span class="timeline-symbol burn">◇</span><span><b>Manoeuvre ${i + 1}</b><small>T+${duration(n.time)}</small></span><em>${n.type === "finite" ? n.durationS + " s burn" : fmt(norm(n.deltaV), 0) + " m/s"}</em>`;
      btn.onclick = () => select(n.id);
      list.append(btn);
    }
  if (!eventsTab && !mission.manoeuvres.length) {
    const hint = document.createElement("div");
    hint.className = "timeline-empty";
    hint.textContent =
      "Your next move starts here. Add a manoeuvre to plan a new orbit.";
    list.append(hint);
  }
  const max =
    prediction?.points.at(-1)?.t ?? Math.max(5400, snapshot.time + 5400);
  $<HTMLInputElement>("scrubber").max = String(max);
  $<HTMLInputElement>("scrubber").value = String(snapshot.time);
  $("scrub-end").textContent = `T+${duration(max)}`;
}
function renderEncounter() {
  const e = prediction?.encounter;
  if (!e) return;
  const body = mission.bodies.find((b) => b.id === e.bodyId)!;
  $("encounter-status").textContent =
    e.soiEntry !== null ? "SOI ENTRY" : "NO SOI ENTRY";
  $("encounter-status").classList.toggle(
    "encounter-active",
    e.soiEntry !== null,
  );
  $("encounter-data").innerHTML =
    row("Closest approach", fmt(e.distance / 1000, 0), "km") +
    row("Relative velocity", fmt(e.velocity / 1000, 3), "km/s") +
    row("Encounter time", `T+${duration(e.time)}`) +
    (e.soiEntry !== null
      ? row("SOI entry", `T+${duration(e.soiEntry)}`) +
        row("Osculating periapsis", fmt(e.periapsis / 1000), "km")
      : "");
}
function updateState() {
  const c = craft(),
    p = primary(),
    d = snapshot.diagnostics[c.id];
  $("clock").textContent = `T+${duration(snapshot.time)}`;
  $("date").textContent =
    new Date(mission.epoch + snapshot.time * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19) + " UTC";
  $("solver-status").textContent =
    d?.propagator.toUpperCase() ?? "KEPLER · UNIVERSAL";
  $("mission-label").textContent = mission.name.split(" · ")[0]!;
  $("view-subtitle").textContent =
    `${p.name} primary · ${$<HTMLSelectElement>("frame").selectedOptions[0]?.textContent}`;
  $("debug-overlay").innerHTML =
    `<b>PHYSICS DIAGNOSTICS</b><br>Propagator: ${d?.propagator ?? "Kepler"}<br>Step: ${fmt(d?.step ?? 0, 3)} s<br>Dominant body: ${p.name}<br>Local step Δε/ε: ${(d?.energyDrift ?? 0).toExponential(2)}<br>Local step Δh/h: ${(d?.momentumDrift ?? 0).toExponential(2)}<br>Active SOI: ${p.name}<br>Error estimator: unavailable (fixed-order RK4)<br>Energy includes physical perturbations / thrust.`;
  if (tab !== "maneuver") renderInspector();
  scene.update(mission, snapshot, prediction);
  $<HTMLInputElement>("scrubber").value = String(snapshot.time);
  if (c.collided) {
    playing = false;
    updatePlay();
    toast(`Surface impact on ${c.collided}. Reset or edit your manoeuvres.`);
  }
}
worker.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "state") {
    if (m.loaded) scene.history = [];
    snapshot = m.snapshot;
    const hc =
      snapshot.crafts.find((c) => c.id === selected) ?? snapshot.crafts[0]!;
    scene.history.push({ position: hc.state.position, t: snapshot.time });
    if (scene.history.length > 3000) scene.history.shift();
    busy = false;
    updateState();
    if (m.loaded) {
      renderTree();
      renderTimeline();
      requestPrediction();
    }
  }
  if (m.type === "prediction" && m.prediction.id === requestId) {
    prediction = m.prediction;
    $("prediction-progress").hidden = true;
    scene.update(mission, snapshot, prediction);
    renderEncounter();
    renderTimeline();
    drawChart();
    updateBurnResult();
    $("prediction-note").textContent =
      `${prediction!.points.length} propagated samples · ${prediction!.events.length} events`;
  }
  if (m.type === "progress" && m.id === requestId) {
    $("prediction-progress").querySelector("span")!.textContent =
      `${Math.round(m.progress * 100)}%`;
  }
  if (m.type === "error") {
    busy = false;
    playing = false;
    updatePlay();
    $("prediction-progress").hidden = true;
    toast(m.message);
  }
};
worker.onerror = (e) => {
  busy = false;
  toast("Simulation worker error: " + e.message);
};
setInterval(() => {
  if (!playing || busy) return;
  const dt = +$<HTMLSelectElement>("speed").value * 0.1;
  busy = true;
  if (reversing) {
    worker.postMessage({ type: "seek", time: Math.max(0, snapshot.time - dt) });
    if (snapshot.time - dt <= 0) {
      playing = false;
      updatePlay();
    }
  } else worker.postMessage({ type: "advance", dt });
}, 100);
setInterval(() => {
  if (playing && !busy) requestPrediction();
}, 3000);
$("play").onclick = () => {
  playing = !playing;
  updatePlay();
};
$("reverse").onclick = () => {
  reversing = !reversing;
  updatePlay();
};
$("reset").onclick = () => {
  mission = preset($<HTMLSelectElement>("scenario").value);
  snapshot.time = 0;
  selected = mission.spacecraft[0]!.id;
  selectedNode = undefined;
  playing = false;
  tab = "orbit";
  updatePlay();
  reload(0);
  renderTimeline();
};
$("lunar-example").onclick = () => {
  mission = preset("moon");
  mission.manoeuvres = [
    {
      id: "lunar-injection",
      craftId: "explorer-1",
      time: 0,
      type: "impulse",
      frame: "LOCAL_ORBITAL",
      deltaV: v(3108.8374),
      durationS: 30,
      throttle: 1,
    },
    {
      id: "lunar-capture",
      craftId: "explorer-1",
      time: 391870,
      type: "impulse",
      frame: "LOCAL_ORBITAL",
      deltaV: v(-816.63254),
      durationS: 30,
      throttle: 1,
    },
  ];
  selected = "explorer-1";
  selectedNode = "lunar-injection";
  tab = "maneuver";
  playing = false;
  updatePlay();
  reload(0);
  renderInspector();
  renderTimeline();
  toast(
    "Worked plan loaded. Both burns remain editable; the trajectory is simulated.",
  );
};
$("add-node").onclick = addNode;
$("guide-burn").onclick = addNode;
$("add-craft").onclick = () => {
  $<HTMLInputElement>("craft-name").value =
    `Explorer ${mission.spacecraft.length + 1}`;
  $<HTMLDialogElement>("craft-dialog").showModal();
};
$("craft-form").onsubmit = (e) => {
  e.preventDefault();
  const c = createCraft(
    mission.bodies,
    $<HTMLSelectElement>("craft-body").value,
    +$<HTMLInputElement>("craft-altitude").value * 1000,
    (+$<HTMLInputElement>("craft-inclination").value * Math.PI) / 180,
    0,
    `explorer-${Date.now()}`,
  );
  c.name = $<HTMLInputElement>("craft-name").value;
  mission.spacecraft.push(c);
  selected = c.id;
  reload();
  $<HTMLDialogElement>("craft-dialog").close();
  toast("Spacecraft placed in a circular orbit.");
};
$("scenario").onchange = () => {
  ($("reset") as HTMLButtonElement).click();
  const kind = $<HTMLSelectElement>("scenario").value;
  $("lunar-example").hidden = kind !== "moon";
  setView(kind === "mars" ? "solar" : "earth");
  $("guide-title").textContent =
    kind === "moon"
      ? "Make the Moon. Earn the capture."
      : kind === "mars"
        ? "A window to another world."
        : "A small burn. A different orbit.";
  $("guide-text").textContent =
    kind === "moon"
      ? "Plan about 3,110 m/s prograde for a translunar coast. Set a 7-day horizon, then tune departure time to intersect the Moon. At encounter, switch to the lunar frame and plan retrograde capture. Objective: a 100 km lunar orbit."
      : kind === "mars"
        ? "Start on a heliocentric orbit at 1 AU. Use the Hohmann helper to reach 1.524 AU. The phase angle is approximate; verify the Mars encounter."
        : "Start 300 km above Earth. Add 120 m/s of prograde velocity and watch your apoapsis rise.";
  $<HTMLSelectElement>("horizon").value =
    kind === "moon" ? "604800" : kind === "mars" ? "31557600" : "0";
  $<HTMLSelectElement>("target").value = kind === "mars" ? "mars" : "moon";
};
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab!;
      renderInspector();
    }),
);
function setView(id: string) {
  scene.view(id);
  $<HTMLSelectElement>("frame").value = scene.frame;
  $<HTMLSelectElement>("camera-mode").value = scene.mode;
  $("view-title").textContent =
    id === "solar"
      ? "Solar system"
      : id === "spacecraft"
        ? craft().name
        : id === "top" || id === "side"
          ? $("view-title").textContent
          : mission.bodies.find((b) => b.id === id)?.name + " orbit";
  document
    .querySelectorAll(".view-buttons button")
    .forEach((b) => b.classList.toggle("active", b.id === `view-${id}`));
}
for (const id of ["top", "side", "earth", "moon", "solar", "spacecraft"])
  $(`view-${id}`).onclick = () => setView(id);
$("view-fit").onclick = () => scene.fit();
$("frame").onchange = () => {
  scene.frame = $<HTMLSelectElement>("frame").value;
  scene.focus = primary().id;
  scene.mode = "reference";
  scene.controls.enableRotate = false;
  $<HTMLSelectElement>("camera-mode").value = "reference";
  scene.draw();
  updateState();
};
$("camera-mode").onchange = () => {
  scene.mode = $<HTMLSelectElement>("camera-mode").value;
  scene.controls.enableRotate = scene.mode !== "reference";
  scene.draw();
};
for (const [id, property] of [
  ["baseline", "showBaseline"],
  ["vectors", "showVectors"],
  ["grid", "showGrid"],
  ["soi", "showSOI"],
  ["lagrange", "showLagrange"],
] as const)
  $(`layer-${id}`).onchange = () => {
    scene[property] = $<HTMLInputElement>(`layer-${id}`).checked;
    scene.draw();
  };
$("layer-prediction").onchange = () => {
  scene.showPrediction = $<HTMLInputElement>("layer-prediction").checked;
  scene.draw();
};
$("debug-toggle").onclick = () => {
  scene.debug = !scene.debug;
  $("debug-state").textContent = scene.debug ? "ON" : "OFF";
  $("debug-overlay").hidden = !scene.debug;
  scene.draw();
};
$("horizon").onchange = requestPrediction;
$("target").onchange = requestPrediction;
$("tab-plan").onclick = () => {
  eventsTab = false;
  $("tab-plan").classList.add("active");
  $("tab-events").classList.remove("active");
  renderTimeline();
};
$("tab-events").onclick = () => {
  eventsTab = true;
  $("tab-events").classList.add("active");
  $("tab-plan").classList.remove("active");
  renderTimeline();
};
$("scrubber").onchange = () => seek(+$<HTMLInputElement>("scrubber").value);
$("explorer-toggle").onclick = () =>
  document.querySelector(".left-panel")!.classList.toggle("open");
$("save").onclick = () => {
  try {
    localStorage.setItem(
      "orbital-mission",
      JSON.stringify({ mission, time: snapshot.time }),
    );
    toast("Mission saved in this browser.");
  } catch {
    toast("Browser storage is unavailable. Export JSON instead.");
  }
};
$("mission-menu").onclick = () =>
  $<HTMLDialogElement>("files-dialog").showModal();
$("load").onclick = () => {
  try {
    const raw = localStorage.getItem("orbital-mission");
    if (!raw) throw Error("No saved mission found.");
    const save = JSON.parse(raw);
    mission = parseMission(JSON.stringify(save.mission));
    selected = mission.spacecraft[0]!.id;
    selectedNode = undefined;
    tab = "orbit";
    playing = false;
    updatePlay();
    reload(Number.isFinite(save.time) ? Math.max(0, save.time) : 0);
    $<HTMLDialogElement>("files-dialog").close();
    toast("Saved mission loaded.");
  } catch (e) {
    toast((e as Error).message);
  }
};
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(mission, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "orbital-mission.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Mission initial state and manoeuvre plan exported.");
};
$("import").onclick = () => $("import-file").click();
$("import-file").onchange = async () => {
  const file = $<HTMLInputElement>("import-file").files?.[0];
  if (!file) return;
  try {
    if (file.size > 2e6)
      throw Error("Mission file is too large (maximum 2 MB).");
    const parsed = parseMission(await file.text());
    mission = parsed;
    selected = mission.spacecraft[0]!.id;
    selectedNode = undefined;
    tab = "orbit";
    playing = false;
    updatePlay();
    reload(0);
    $<HTMLDialogElement>("files-dialog").close();
    toast("Mission imported.");
  } catch (e) {
    toast((e as Error).message);
  }
  $<HTMLInputElement>("import-file").value = "";
};
document
  .querySelectorAll<HTMLButtonElement>("[data-close]")
  .forEach(
    (b) => (b.onclick = () => $<HTMLDialogElement>(b.dataset.close!).close()),
  );
function transfer() {
  return hohmann(
    primary().mu,
    +$<HTMLInputElement>("transfer-origin").value * 1000,
    +$<HTMLInputElement>("transfer-target").value * 1000,
  );
}
function updateTransfer() {
  try {
    const h = transfer();
    $("transfer-output").innerHTML =
      row("Departure burn", fmt(h.first, 1), "m/s") +
      row("Transfer duration", fmt(h.duration / 3600, 2), "h") +
      row("Arrival burn", fmt(h.second, 1), "m/s") +
      row("Total Δv", fmt(h.total, 1), "m/s", "accent-row");
    if (primary().id === "sun") {
      const r2 = +$<HTMLInputElement>("transfer-target").value * 1000,
        required =
          ((Math.PI - Math.sqrt(primary().mu / r2 ** 3) * h.duration) * 180) /
          Math.PI,
        mars = mission.bodies.find((b) => b.id === "mars");
      if (mars) {
        const time = +$<HTMLInputElement>("transfer-time").value,
          ms = bodyState(mars, time, mission.bodies).position,
          cs = craft().state.position,
          current =
            ((Math.atan2(ms.y, ms.x) - Math.atan2(cs.y, cs.x)) * 180) / Math.PI;
        $("transfer-output").innerHTML +=
          row("Required target phase", fmt(required, 2), "°") +
          row("Approx. current phase", fmt(current, 2), "°");
      }
    }
  } catch {
    $("transfer-output").textContent = "Enter positive orbit radii.";
  }
}
$("open-planner").onclick = () => {
  $<HTMLInputElement>("transfer-origin").value = String(
    Math.round(
      norm(
        relative(
          craft().state,
          bodyState(primary(), snapshot.time, mission.bodies),
        ).position,
      ) / 1000,
    ),
  );
  $<HTMLInputElement>("transfer-target").value = String(
    primary().id === "sun"
      ? Math.round((1.523679 * AU) / 1000)
      : primary().id === "moon"
        ? 1837.4
        : 42164,
  );
  $<HTMLInputElement>("transfer-time").value = String(
    Math.ceil(snapshot.time + 60),
  );
  updateTransfer();
  $<HTMLDialogElement>("planner-dialog").showModal();
};
for (const id of ["transfer-origin", "transfer-target", "transfer-time"])
  $(id).oninput = updateTransfer;
$("generate-transfer").onclick = () => {
  try {
    const h = transfer(),
      time = +$<HTMLInputElement>("transfer-time").value;
    if (!Number.isFinite(time) || time < 0)
      throw Error("Departure time must be nonnegative.");
    const r = +$<HTMLInputElement>("transfer-origin").value * 1000;
    if (
      r <= primary().radiusM ||
      +$<HTMLInputElement>("transfer-target").value * 1000 <= primary().radiusM
    )
      throw Error("Both orbits must be above the surface.");
    const current = norm(
      relative(
        craft().state,
        bodyState(primary(), snapshot.time, mission.bodies),
      ).position,
    );
    if (Math.abs(current - r) / current > 0.01 || orbit().eccentricity > 0.01)
      throw Error(
        "Hohmann nodes require a circular departure matching the current orbit radius.",
      );
    const newNodes = [h.first, h.second].map((dv, i): Maneuver => ({
      id: `transfer-${Date.now()}-${i}`,
      craftId: craft().id,
      time: time + (i ? h.duration : 0),
      type: "impulse",
      frame: "LOCAL_ORBITAL",
      deltaV: v(dv),
      durationS: 30,
      throttle: 1,
    }));
    parseMission(
      JSON.stringify({
        ...mission,
        manoeuvres: [...mission.manoeuvres, ...newNodes],
      }),
    );
    mission.manoeuvres.push(...newNodes);
    selectedNode = newNodes[0]!.id;
    selected = craft().id;
    tab = "maneuver";
    reload();
    renderInspector();
    renderTimeline();
    $<HTMLDialogElement>("planner-dialog").close();
    toast(
      "Two transfer nodes added. Check target alignment and predicted encounter.",
    );
  } catch (e) {
    toast((e as Error).message);
  }
};
function nearestSample(x: number, rect: DOMRect) {
  const pts = prediction!.points,
    t =
      pts[0]!.t +
      Math.max(0, Math.min(1, (x - rect.left - 55) / (rect.width - 73))) *
        (pts.at(-1)!.t - pts[0]!.t);
  let best = 0;
  for (let i = 1; i < pts.length; i++)
    if (Math.abs(pts[i]!.t - t) < Math.abs(pts[best]!.t - t)) best = i;
  return best;
}
function drawChart() {
  const canvas = $<HTMLCanvasElement>("chart"),
    ctx = canvas.getContext("2d")!,
    rect = canvas.getBoundingClientRect(),
    w = rect.width,
    h = rect.height;
  canvas.width = w * devicePixelRatio;
  canvas.height = h * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, w, h);
  if (!prediction?.points.length) return;
  const kind = $<HTMLSelectElement>("chart-kind").value as
      "altitude" | "speed" | "energy" | "distance",
    divisor = kind === "energy" ? 1e6 : 1000,
    pts = prediction.points,
    values = pts.map((p) => p[kind] / divisor);
  const min = Math.min(...values),
    max = Math.max(...values),
    padding = Math.max((max - min) * 0.1, Math.abs(max) * 0.0001, 0.01),
    lo = min - padding,
    hi = max + padding,
    left = 55,
    right = w - 18,
    top = 12,
    bottom = h - 25;
  $("chart-unit").textContent =
    kind === "energy" ? "MJ/kg" : kind === "speed" ? "km/s" : "km";
  ctx.font = "10px ui-monospace, monospace";
  for (let i = 0; i < 3; i++) {
    const y = top + ((bottom - top) * i) / 2;
    ctx.strokeStyle = "#252c32";
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = "#7b858d";
    ctx.fillText(
      fmt(hi - ((hi - lo) * i) / 2, Math.abs(hi) < 100 ? 2 : 0),
      3,
      y + 4,
    );
  }
  const xy = (i: number) => ({
    x:
      left +
      ((pts[i]!.t - pts[0]!.t) / (pts.at(-1)!.t - pts[0]!.t || 1)) *
        (right - left),
    y: bottom - ((values[i]! - lo) / (hi - lo)) * (bottom - top),
  });
  ctx.beginPath();
  pts.forEach((p, i) => {
    const { x, y } = xy(i);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = "#b2cba6";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const end = xy(pts.length - 1);
  ctx.lineTo(end.x, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, "#b2cba625");
  gradient.addColorStop(1, "#b2cba600");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.fillStyle = "#77828a";
  ctx.fillText(duration(pts[0]!.t), left, h - 5);
  ctx.textAlign = "right";
  ctx.fillText(duration(pts.at(-1)!.t), right, h - 5);
}
new ResizeObserver(drawChart).observe($("chart"));
$("chart-kind").onchange = drawChart;
$("chart").onpointermove = (e) => {
  if (!prediction) return;
  const rect = $("chart").getBoundingClientRect(),
    i = nearestSample(e.clientX, rect),
    p = prediction.points[i]!;
  scene.setHover(p.position, p.t);
  $("chart-tooltip").hidden = false;
  $("chart-tooltip").textContent =
    `T+${duration(p.t)} · ${fmt(p[$<HTMLSelectElement>("chart-kind").value as "altitude"] / ($<HTMLSelectElement>("chart-kind").value === "energy" ? 1e6 : 1000), 2)} ${$("chart-unit").textContent}`;
};
$("chart").onpointerleave = () => {
  scene.setHover();
  $("chart-tooltip").hidden = true;
};
$("chart").onclick = (e) => {
  if (!prediction) return;
  const rect = $("chart").getBoundingClientRect();
  seek(prediction.points[nearestSample(e.clientX, rect)]!.t);
};
document.addEventListener("keydown", (e) => {
  if (
    (e.target as HTMLElement).matches("input,select,textarea") ||
    document.querySelector("dialog[open]")
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    $("play").click();
  }
  if (e.key.toLowerCase() === "m") addNode();
  if (scene.mode === "free") {
    const amount =
      scene.camera.position.distanceTo(scene.controls.target) * 0.06;
    const directions: Record<string, [number, number, number]> = {
      w: [0, 0, -1],
      s: [0, 0, 1],
      a: [-1, 0, 0],
      d: [1, 0, 0],
      q: [0, -1, 0],
      e: [0, 1, 0],
    };
    const dir = directions[e.key];
    if (dir) {
      const delta = scene.camera.position
        .clone()
        .set(...dir)
        .applyQuaternion(scene.camera.quaternion)
        .multiplyScalar(amount);
      scene.camera.position.add(delta);
      scene.controls.target.add(delta);
    }
  }
});
renderTree();
renderInspector();
renderTimeline();
scene.update(mission, snapshot);
reload(0);
