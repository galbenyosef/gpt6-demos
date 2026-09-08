import {
  newProject,
  activatePattern,
  patternTrackId,
  History,
  barTicks,
  patternTicks,
  changeKey,
  lockedPitch,
  defaultVoice,
  type Project,
  type Track,
  type Voice,
  type Pattern,
} from '../document';
import {
  MODES,
  KEYS,
  PPQ,
  pitchName,
  scalePitches,
  inScale,
  chordPitches,
  voiceLead,
  progression,
  classification,
  nearest,
  degreePitch,
} from '../theory';
import { Store, RecoveryError, download, exportProject, importProject } from '../persistence';
import { Transport, tickSeconds, eventsFor } from '../scheduler';
import { renderAudio, wav, midi, thumbnail } from '../render';
import { decodeSample, Capture } from '../sampler';
import { TEMPLATES, applyTemplate, type TemplateId } from '../templates';
import { Visual } from '../visual';
import { Engine } from '../engine';
import { loadPacks, type Pack } from '../packs';
import { anchoredScroll, visibleBarCount } from './viewport';
import { language, setLanguage, t, esc } from './strings';
const app = document.querySelector<HTMLElement>('#app')!,
  modal = document.querySelector<HTMLDialogElement>('#modal')!,
  store = new Store(),
  history = new History(),
  capture = new Capture();
let selectedTemplate: TemplateId = 'ambient';
let looping = true,
  metronome = false;
let project: Project | null = null,
  library: Project[] = [],
  trackIndex = 4,
  patternIndex = 0,
  bar = 0,
  view: 'desk' | 'instrument' | 'mixer' = 'desk',
  screen: 'desk' | 'projects' = 'desk',
  transport: Transport | null = null,
  visual: Visual | null = null,
  packs: Pack[] = [],
  dirty = false,
  saveState = 'Saved',
  selectedStep = 0,
  selectedPitch = 60,
  octave = 4,
  armed = false,
  flash = localStorage.getItem('tonada-flash') !== 'false',
  showVisual = localStorage.getItem('tonada-visual') !== 'false',
  scope: 'pattern' | 'song' = 'pattern',
  toastTimer: ReturnType<typeof setTimeout> | undefined,
  rendering = false,
  recording = false,
  raf = 0,
  lastFrame = 0,
  editVersion = 0;
let horizontalZoom: 1 | 2 | 'fit' = 1;
let pitchRowHeight = 25;
let gridScroll = { left: 0, top: 0 };
let gridViewKey = '';
let restoreGridScroll: (() => void) | null = null;
const p = () => project!;
const pattern = () => p().patterns[patternIndex]!;
const track = () => (trackIndex === 8 ? p().chordTrack : p().tracks[trackIndex]!);
const logo =
  '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M3 9h26M16 9v20M7 17h18" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="3" r="2" fill="currentColor"/></svg>';
const button = (action: string, label: string, extra = '') =>
  `<button data-action="${action}" ${extra}>${label}</button>`;
const enumSpanish: Record<string, string> = {
  major: 'mayor',
  minor: 'menor',
  dorian: 'dórico',
  phrygian: 'frigio',
  lydian: 'lidio',
  mixolydian: 'mixolidio',
  locrian: 'locrio',
  'harmonic minor': 'menor armónica',
  'melodic minor': 'menor melódica',
  'major pentatonic': 'pentatónica mayor',
  'minor pentatonic': 'pentatónica menor',
  subtractive: 'sustractivo',
  sampler: 'muestreador',
  sine: 'senoidal',
  triangle: 'triangular',
  sawtooth: 'diente de sierra',
  square: 'cuadrada',
  pitch: 'tono',
  filter: 'filtro',
  amplitude: 'amplitud',
  diatonic: 'diatónico',
  diminished: 'disminuido',
};
const options = (items: string[], selected: string) =>
  items
    .map(
      (x) =>
        `<option value="${esc(x)}" ${x === selected ? 'selected' : ''}>${esc(language === 'es' ? (enumSpanish[x] ?? x) : x)}</option>`,
    )
    .join('');
function notify(message: string) {
  const toast = document.querySelector('#toast')!;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
}
function fail(error: unknown) {
  console.error(error);
  notify(error instanceof Error ? error.message : String(error));
}
function edit(fn: () => void, structural = false, redraw = true) {
  history.push(p());
  fn();
  if (pattern().sound)
    pattern().sound = structuredClone({ tracks: p().tracks, chordTrack: p().chordTrack });
  dirty = true;
  editVersion++;
  saveState = t('Unsaved', 'Sin guardar');
  if (redraw) draw();
  else updateSaveState();
  if (structural) void save().catch(fail);
}
function updateSaveState() {
  const el = document.querySelector('.save-state');
  if (el) el.textContent = saveState;
}
async function save() {
  if (!project) return;
  const current = p(),
    version = editVersion;
  saveState = t('Saving…', 'Guardando…');
  updateSaveState();
  try {
    await store.save(current);
    if (project === current && version === editVersion) {
      dirty = false;
      saveState = t('Saved', 'Guardado');
      updateSaveState();
    }
  } catch (e) {
    saveState = t('Save failed · retry', 'Error · reintentar');
    updateSaveState();
    throw e;
  }
}
let auditionContext: AudioContext | null = null,
  auditionEngine: Engine | null = null,
  auditionTimer: ReturnType<typeof setTimeout> | undefined;
function endAudition() {
  clearTimeout(auditionTimer);
  auditionEngine?.dispose();
  auditionEngine = null;
  void auditionContext?.close();
  auditionContext = null;
}
async function audition(pitch: number) {
  if (
    transport?.engine &&
    transport.context &&
    transport.engine.tracks.has(patternTrackId(pattern(), track().id))
  ) {
    transport.engine.schedule({
      track: track().id,
      channel: patternTrackId(pattern(), track().id),
      pitch,
      velocity: 0.7,
      time: transport.context.currentTime + 0.01,
      duration: 0.2,
      key: 'keyboard',
    });
    return;
  }
  if (!auditionContext) {
    auditionContext = new AudioContext();
    auditionEngine = new Engine(
      auditionContext,
      [...p().tracks, p().chordTrack],
      p().master,
      p().seed,
      p().samples,
      p().tempo,
    );
  }
  await auditionContext.resume();
  auditionEngine!.update([...p().tracks, p().chordTrack], p().master.level);
  auditionEngine!.schedule({
    track: track().id,
    pitch,
    velocity: 0.7,
    time: auditionContext.currentTime + 0.01,
    duration: 0.2,
    key: 'keyboard',
  });
  clearTimeout(auditionTimer);
  auditionTimer = setTimeout(endAudition, 5000);
}
function stop() {
  endAudition();
  transport?.stop();
  transport = null;
  capture.stop();
}
async function openProject(value: Project) {
  const old = project;
  if (!(await store.acquire(value.id)))
    throw new Error(
      t(
        'This project is being edited in another tab.',
        'Este proyecto se está editando en otra pestaña.',
      ),
    );
  try {
    if (old) {
      stop();
      if (dirty) await save();
      await store.flush(old.id);
      if (old.id !== value.id) store.release(old.id);
    }
  } catch (e) {
    if (old?.id !== value.id) store.release(value.id);
    throw e;
  }
  project = value;
  project.lastOpened = new Date().toISOString();
  history.past = [];
  history.future = [];
  patternIndex = 0;
  selectedStep = 0;
  activatePattern(p(), 0);
  bar = 0;
  trackIndex = 4;
  screen = 'desk';
  dirty = false;
  saveState = t('Saved', 'Guardado');
  localStorage.setItem('tonada-last', value.id);
  draw();
  app.focus();
}
async function load(id: string) {
  try {
    await openProject(await store.load(id));
  } catch (e) {
    if (e instanceof RecoveryError) {
      if (
        confirm(
          t(
            'The latest revision is damaged. Restore the previous valid revision?',
            'La última revisión está dañada. ¿Restaurar la revisión anterior?',
          ),
        )
      ) {
        await openProject(e.previous);
        await save();
      }
    } else throw e;
  }
}
async function create(value: Project) {
  if (!(await store.acquire(value.id))) throw new Error('Could not lock new project.');
  await store.save(value);
  await openProject(value);
}
function header() {
  return `<header class="top"><div class="brand">${logo}tonada</div><span class="separator"></span><div class="project-title">${esc(project?.name ?? t('Your projects', 'Tus proyectos'))}<small>${t('COMPOSITION DESK', 'MESA DE COMPOSICIÓN')}</small></div><div class="top-actions">${project ? `<span class="save-state">${saveState}</span>` : ''}${button('projects', t('Projects', 'Proyectos'), 'class="quiet"')}${button('save', t('Save', 'Guardar'), 'class="quiet"')}${button('language', language === 'en' ? 'ES' : 'EN', 'class="quiet" aria-label="Change language / Cambiar idioma"')}${button('render', t('Export audio ↗', 'Exportar audio ↗'), 'class="primary"')}</div></header>`;
}
function transportBar() {
  return `<section class="transport" aria-label="${t('Transport', 'Transporte')}"><div class="transport-controls">${button('play', transport?.playing ? 'Ⅱ' : '▶', `class="play primary" aria-label="${t('Play / stop', 'Reproducir / parar')}"`)}${button('stop', '■', `class="icon quiet" aria-label="${t('Stop', 'Parar')}"`)}${button('loop', '↻', `class="icon ${looping ? 'active' : ''}" aria-label="${t('Loop', 'Bucle')}" aria-pressed="${looping}"`)}</div><div class="position" id="position">01 : 01</div><span class="separator"></span><label>${t('Tempo', 'Tempo')}<input id="tempo" type="number" min="40" max="240" value="${p().tempo}" aria-label="${t('Tempo in BPM', 'Tempo en BPM')}"></label><label>${t('Key', 'Tonalidad')}<select id="tonic">${KEYS.map((x, i) => `<option value="${i}" ${i === p().tonic ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>${t('Mode', 'Modo')}<select id="mode">${options(Object.keys(MODES), p().mode)}</select></label><span class="tag">${p().signature.join(' / ')}</span>${button('metro', '♩', `class="icon quiet ${metronome ? 'active' : ''}" aria-label="${t('Metronome', 'Metrónomo')}" aria-pressed="${metronome}"`)}<label>${t('Play', 'Reproducir')}<select id="scope"><option value="pattern" ${scope === 'pattern' ? 'selected' : ''}>${t('Pattern', 'Patrón')}</option><option value="song" ${scope === 'song' ? 'selected' : ''}>${t('Song', 'Canción')}</option></select></label><div class="master"><label>${t('Master', 'Máster')}<input aria-label="${t('Master level', 'Nivel máster')}" data-master="level" type="range" min="0" max="1" step=".01" value="${p().master.level}"></label><meter id="meter" min="0" max="1" value="0" aria-label="${t('Output level', 'Nivel de salida')}"></meter></div></section>`;
}
function trackRow(item: Track, index: number) {
  return `<div class="track ${index === trackIndex ? 'selected' : ''} ${index === 8 ? 'chord' : ''}" style="--track:${item.color}"><div class="track-head"><span class="track-number">${index === 8 ? '♯' : String(index + 1).padStart(2, '0')}</span><button class="select-track" data-track="${index}" aria-pressed="${index === trackIndex}"><span class="track-name">${esc(item.name)}</span><small>${esc(item.instrument)}</small></button></div><div class="track-tools"><input aria-label="${esc(item.name)} ${t('level', 'nivel')}" data-mix="level" data-index="${index}" type="range" min="0" max="1.5" step=".01" value="${item.level}"><button data-mute="${index}" aria-label="${t('Mute', 'Silenciar')} ${esc(item.name)}" aria-pressed="${item.mute}">M</button><button data-solo="${index}" aria-label="Solo ${esc(item.name)}" aria-pressed="${item.solo}">S</button></div></div>`;
}
function gridRows() {
  if (track().percussive) return [42, 38, 36];
  const root = degreePitch(0, p().tonic, p().mode, octave);
  const lo = Math.max(0, Math.min(24, root - 5)),
    hi = Math.min(127, Math.max(108, root + 18));
  const rows = p().scaleLock
    ? scalePitches(p().tonic, p().mode, lo, hi)
    : Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  for (const note of pattern().notes.filter((n) => n.track === track().id))
    if (!rows.includes(note.pitch)) rows.push(note.pitch);
  return rows.sort((a, b) => b - a);
}
function grid() {
  const pat = pattern(),
    percussive = track().percussive;
  const count = Math.ceil(patternTicks(p(), pat) / pat.resolution);
  selectedStep = Math.max(0, Math.min(count - 1, selectedStep));
  const rows = gridRows();
  if (!rows.includes(selectedPitch)) selectedPitch = nearest(selectedPitch, rows);
  const notes = new Map(
    pat.notes.map((n) => [`${n.track}:${n.pitch}:${Math.round(n.tick / pat.resolution)}`, n]),
  );
  let chordEnd = 0;
  const chords = pat.chords.map((chord) => {
    const start = chordEnd;
    chordEnd += chord.duration;
    return { chord, start, end: chordEnd };
  });
  const sounding = Array.from(
    { length: count },
    (_, step) =>
      chords.find((c) => step * pat.resolution >= c.start && step * pat.resolution < c.end)?.chord,
  );
  let html = `<div class="grid-wrap"><div id="grid-scroll" class="grid-scroll ${percussive ? 'drum-scroll' : ''}" tabindex="-1" aria-label="${t('Scrollable note editor', 'Editor de notas desplazable')}"><div class="grid ${percussive ? 'drum' : ''}" role="grid" aria-label="${t('Note editor', 'Editor de notas')}" style="--cols:${count};--track:${track().color};--row-height:${pitchRowHeight}px;--zoom-ratio:${pat.bars / visibleBarCount(horizontalZoom, pat.bars)}"><span class="step-number corner">${percussive ? t('VOICE', 'VOZ') : t('NOTE', 'NOTA')}</span>`;
  for (let step = 0; step < count; step++) {
    const tick = step * pat.resolution,
      local = tick % barTicks(p()),
      start = local === 0;
    html += `<span class="step-number ${start ? 'bar-start' : ''}" title="${t('Bar', 'Compás')} ${Math.floor(tick / barTicks(p())) + 1}">${start ? `${Math.floor(tick / barTicks(p())) + 1}.1` : local % PPQ === 0 ? String(Math.floor(local / PPQ) + 1) : '·'}</span>`;
  }
  for (const pitch of rows) {
    const actualTrack = percussive ? [2, 1, 0][[42, 38, 36].indexOf(pitch)]! : trackIndex;
    const labelChord = pat.chords[Math.min(bar, pat.chords.length - 1)];
    const rowKind = labelChord ? classification(pitch, labelChord, p().tonic, p().mode) : 'scale';
    html += `<span class="pitch ${rowKind === 'chord' ? 'chord-tone' : ''}" data-row-pitch="${pitch}">${percussive ? esc(p().tracks[actualTrack]!.name) : `${rowKind === 'chord' ? '◆' : rowKind === 'tension' ? '!' : '·'} ${pitchName(pitch)}`}</span>`;
    for (let step = 0; step < count; step++) {
      const tick = step * pat.resolution,
        atBar = Math.floor(tick / barTicks(p())),
        localStep = Math.floor((tick % barTicks(p())) / pat.resolution);
      const note = notes.get(`${p().tracks[actualTrack]!.id}:${pitch}:${step}`),
        kind = sounding[step]
          ? classification(pitch, sounding[step]!, p().tonic, p().mode)
          : 'scale';
      const selected = selectedStep === step && selectedPitch === pitch;
      html += `<button class="cell ${note ? 'on' : ''} ${tick % PPQ === 0 ? 'beat' : ''} ${tick % barTicks(p()) === 0 ? 'bar-start' : ''} ${kind === 'chord' ? 'harmony' : ''} ${selected ? 'selected' : ''}" data-step="${step}" data-pitch="${pitch}" data-note-track="${actualTrack}" role="gridcell" aria-label="${percussive ? esc(p().tracks[actualTrack]!.name) : pitchName(pitch)}, ${t('bar', 'compás')} ${atBar + 1}, ${t('step', 'paso')} ${localStep + 1}, ${note ? t('on', 'activo') : t('off', 'inactivo')}" aria-selected="${!!note}" tabindex="${selected ? 0 : -1}" style="--track:${p().tracks[actualTrack]!.color};--note-span:${percussive ? 1 : Math.min(count - step, (note?.duration ?? pat.resolution) / pat.resolution)}"></button>`;
    }
  }
  return (
    html +
    `</div></div><div class="grid-caption"><span>${t('Click to add/remove · Shift-click to select', 'Clic para añadir/quitar · Mayús-clic para seleccionar')}</span><span class="legend">◆ ${t('Chord tone', 'Nota del acorde')} &nbsp; · ${t('Scale tone', 'Nota de escala')}</span></div></div>`
  );
}
function zoomControls() {
  return `<div class="zoom-toolbar"><label for="roll-zoom">${t('View', 'Vista')}</label><select id="roll-zoom" aria-label="${t('Horizontal zoom', 'Zoom horizontal')}"><option value="1" ${horizontalZoom === 1 ? 'selected' : ''}>${t('1 bar', '1 compás')}</option><option value="2" ${horizontalZoom === 2 ? 'selected' : ''}>${t('2 bars', '2 compases')}</option><option value="fit" ${horizontalZoom === 'fit' ? 'selected' : ''}>${t('Whole pattern', 'Patrón completo')}</option></select>${button('fit-pattern', t('Fit pattern', 'Ajustar patrón'))}<label for="pitch-zoom">${t('Rows', 'Filas')}</label><select id="pitch-zoom" aria-label="${t('Pitch row height', 'Altura de las filas')}" ${track().percussive ? 'disabled' : ''}>${[18, 25, 36, 48].map((height, i) => `<option value="${height}" ${pitchRowHeight === height ? 'selected' : ''}>${[t('Compact', 'Compactas'), t('Normal', 'Normales'), t('Large', 'Grandes'), t('Extra large', 'Muy grandes')][i]}</option>`).join('')}</select><small>${t('Alt + wheel: time zoom · Shift + Alt + wheel: pitch zoom', 'Alt + rueda: zoom temporal · Mayús + Alt + rueda: zoom de notas')}</small></div>`;
}
function setRollZoom(
  zoom: 1 | 2 | 'fit',
  height = pitchRowHeight,
  anchorX?: number,
  anchorY?: number,
) {
  const scroller = document.querySelector<HTMLElement>('#grid-scroll');
  if (!scroller) return;
  const oldBars = visibleBarCount(horizontalZoom, pattern().bars),
    newBars = visibleBarCount(zoom, pattern().bars);
  const x = anchorX ?? (scroller.clientWidth + 58) / 2,
    y = anchorY ?? scroller.clientHeight / 2;
  const left =
    zoom === 'fit' ? 0 : anchoredScroll(scroller.scrollLeft, x, 58, 1 / oldBars, 1 / newBars);
  const top = track().percussive
    ? scroller.scrollTop
    : anchoredScroll(scroller.scrollTop, y, 32, pitchRowHeight, height);
  horizontalZoom = zoom;
  pitchRowHeight = height;
  restoreGridScroll = () => {
    const grid = document.querySelector<HTMLElement>('#grid-scroll');
    if (grid) {
      grid.scrollLeft = left;
      grid.scrollTop = top;
    }
  };
  draw();
}
function focusGridSelection() {
  const scroller = document.querySelector<HTMLElement>('#grid-scroll'),
    cell = document.querySelector<HTMLElement>(
      `[data-step="${selectedStep}"][data-pitch="${selectedPitch}"]`,
    );
  if (!scroller || !cell) return;
  const bounds = scroller.getBoundingClientRect(),
    rect = cell.getBoundingClientRect();
  if (rect.left < bounds.left + 58) scroller.scrollLeft -= bounds.left + 58 - rect.left;
  else if (rect.right > bounds.right) scroller.scrollLeft += rect.right - bounds.right;
  if (rect.top < bounds.top + 32) scroller.scrollTop -= bounds.top + 32 - rect.top;
  else if (rect.bottom > bounds.bottom) scroller.scrollTop += rect.bottom - bounds.bottom;
  cell.focus({ preventScroll: true });
}

function chordName(c: ReturnType<typeof progression>[number]) {
  const pitches = chordPitches(c.degree, p().tonic, p().mode, c.quality),
    root = KEYS[pitches[0]! % 12],
    interval = pitches[1]! - pitches[0]!,
    fifth = pitches[2]! - pitches[0]!;
  const quality = fifth === 6 ? '°' : interval === 3 ? 'm' : '';
  const bass = c.voicing[0]! % 12;
  return `${root}${quality}${bass !== pitches[0]! % 12 ? '/' + KEYS[bass] : ''}`;
}
function chords() {
  return `<section><div class="section-title"><span class="eyebrow">${t('Chord lane', 'Línea de acordes')}</span>${button('generate', t('↻ Suggest progression', '↻ Sugerir progresión'))}</div><div class="chord-lane" style="--bars:${pattern().bars}">${Array.from(
    { length: pattern().bars },
    (_, i) => {
      const c = pattern().chords[i];
      return `<button class="chord-slot" data-chord="${i}"><strong>${c ? chordName(c) : '＋'}</strong><small>${t('BAR', 'COMPÁS')} ${String(i + 1).padStart(2, '0')} ${c ? '· ' + ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][c.degree] : ''}</small></button>`;
    },
  ).join('')}</div></section>`;
}
function song() {
  return `<section><div class="section-title"><span class="eyebrow">${t('Song · pattern chain', 'Canción · cadena de patrones')}</span><span><select id="pattern-select" aria-label="${t('Active pattern', 'Patrón activo')}">${p()
    .patterns.map(
      (x, i) =>
        `<option value="${i}" ${i === patternIndex ? 'selected' : ''}>${esc(x.name)}</option>`,
    )
    .join(
      '',
    )}</select> ${button('duplicate-pattern', t('＋ Pattern', '＋ Patrón'))}</span></div><div class="song-slots">${p()
    .song.map(
      (id, i) =>
        `<div class="song-slot"><small>${String(i + 1).padStart(2, '0')}</small><span>${esc(p().patterns.find((x) => x.id === id)!.name)}</span><button data-remove-slot="${i}" ${p().song.length === 1 ? 'disabled' : ''} aria-label="${t('Remove slot', 'Quitar posición')} ${i + 1}">×</button></div>`,
    )
    .join(
      '',
    )}${button('add-slot', '＋', `aria-label="${t('Append active pattern', 'Añadir patrón activo')}"`)}</div></section>`;
}
function spectrum() {
  return `<section class="spectrum-card"><div class="spectrum-title"><span>${t('SPECTRUM SURFACE', 'SUPERFICIE ESPECTRAL')} <span class="muted">/ ${esc(track().name)}</span></span><span>${transport?.playing ? t('LIVE', 'EN VIVO') : t('AWAITING SOUND', 'ESPERANDO SONIDO')}</span></div><div class="visual" id="visual"></div><div class="spectrum-axes"><span>20 Hz</span><span>200 Hz</span><span>2 kHz</span><span>20 kHz</span></div></section>`;
}
function templateChooser() {
  const selected = TEMPLATES.find((x) => x.id === selectedTemplate)!;
  return `<section class="template-chooser" aria-label="${t('Arrangement templates', 'Plantillas de arreglos')}"><div class="template-controls"><label for="arrangement-template">${t('Start from a template', 'Partir de una plantilla')}</label><select id="arrangement-template">${TEMPLATES.map((item) => `<option value="${item.id}" ${selectedTemplate === item.id ? 'selected' : ''}>${item.name[language]}</option>`).join('')}</select>${button('apply-template', t('＋ Add pattern', '＋ Añadir patrón'), `class="primary" ${p().patterns.length >= 64 ? 'disabled' : ''}`)}</div><p id="template-description">${selected.description[language]} <span>${t('New pattern · current key & tempo · existing work kept', 'Nuevo patrón · tonalidad y tempo actuales · conserva tu trabajo')}</span></p></section>`;
}
function desk() {
  return `${templateChooser()}<div class="view-title"><div><span class="eyebrow">${esc(pattern().name)} / ${t('EDITOR', 'EDITOR')}</span><h2 style="margin-top:7px">${esc(track().name)} <span class="muted" style="font-weight:400">${track().percussive ? t('sequence', 'secuencia') : t('piano roll', 'piano roll')}</span></h2></div><div class="bars">${Array.from({ length: pattern().bars }, (_, i) => `<button data-bar="${i}" class="${bar === i ? 'active' : ''}" aria-label="${t('Bar', 'Compás')} ${i + 1}">${String(i + 1).padStart(2, '0')}</button>`).join('')}</div></div><div class="editor-toolbar">${button('lock', `♧ ${t('Scale lock', 'Bloqueo de escala')}`, `aria-pressed="${p().scaleLock}"`)}${button('arm', `● ${t('Step entry', 'Entrada por pasos')}`, `aria-pressed="${armed}"`)}<span class="spacer"></span><select id="pattern-bars" aria-label="${t('Pattern bars', 'Compases del patrón')}">${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}" ${pattern().bars === i + 1 ? 'selected' : ''}>${i + 1} ${t('bars', 'compases')}</option>`).join('')}</select><select id="resolution" aria-label="${t('Grid resolution', 'Resolución de cuadrícula')}">${[120, 240, 480, 960].map((v) => `<option value="${v}" ${v === pattern().resolution ? 'selected' : ''}>1/${(PPQ * 4) / v}</option>`).join('')}</select>${button('oct-down', '−8', `aria-label="${t('Octave down', 'Bajar octava')}"`)}${button('oct-up', '+8', `aria-label="${t('Octave up', 'Subir octava')}"`)}</div>${zoomControls()}${grid()}<div class="editor-toolbar"><div class="note-tools">${button('snap', t('Snap to harmony', 'Ajustar a armonía'))}${button('fit', t('Fit rhythm', 'Ajustar ritmo'))}${button('transpose', t('↑ Scale degree', '↑ Grado de escala'))}${button('clear', t('Clear track', 'Vaciar pista'))}</div><span class="spacer"></span><label class="hint">${t('Length (steps)', 'Duración (pasos)')} <input id="note-length" type="number" min=".25" max="${patternTicks(p(), pattern()) / pattern().resolution}" step=".25" value="${selectedNote() ? Number((selectedNote()!.duration / pattern().resolution).toFixed(2)) : 0.8}" ${selectedNote() ? '' : 'disabled'}></label><span class="velocity"><small>${t('Velocity', 'Velocidad')}</small> <input id="velocity" type="range" min=".01" max="1" step=".01" value="${selectedNote()?.velocity ?? 0.7}" aria-label="${t('Selected note velocity', 'Velocidad de nota seleccionada')}"></span></div>${chords()}${showVisual ? spectrum() : ''}${song()}`;
}
const voiceLabels: Record<string, [string, string, string]> = {
  detune: ['Detune', 'Desafinación', 'ct'],
  sub: ['Sub oscillator', 'Suboscilador', '%'],
  noise: ['Noise', 'Ruido', '%'],
  attack: ['Attack', 'Ataque', 's'],
  decay: ['Decay', 'Caída', 's'],
  sustain: ['Sustain', 'Sostenido', '%'],
  release: ['Release', 'Liberación', 's'],
  cutoff: ['Cutoff', 'Frecuencia de corte', 'Hz'],
  resonance: ['Resonance', 'Resonancia', 'Q'],
  filterDepth: ['Envelope depth', 'Profundidad de envolvente', 'Hz'],
  filterAttack: ['Filter attack', 'Ataque del filtro', 's'],
  filterDecay: ['Filter decay', 'Caída del filtro', 's'],
  filterSustain: ['Filter sustain', 'Sostenido del filtro', '%'],
  filterRelease: ['Filter release', 'Liberación del filtro', 's'],
  ratio: ['FM ratio', 'Relación FM', '×'],
  index: ['FM index', 'Índice FM', ''],
  modDecay: ['Modulator decay', 'Caída del modulador', 's'],
  lfoRate: ['LFO rate', 'Frecuencia LFO', 'Hz'],
  lfoDepth: ['LFO depth', 'Profundidad LFO', ''],
  velocityAmp: ['Velocity → amplitude', 'Velocidad → amplitud', '%'],
  velocityCutoff: ['Velocity → filter', 'Velocidad → filtro', 'Hz'],
  pan: ['Voice pan', 'Panorama de voz', ''],
  pitchDrop: ['Pitch drop', 'Caída de tono', 'Hz'],
};
function valueLabel(value: number, unit: string) {
  return unit === '%'
    ? `${Math.round(value * 100)}%`
    : unit === 's'
      ? `${Math.round(value * 1000)} ms`
      : unit === 'Hz' && Math.abs(value) >= 1000
        ? `${(value / 1000).toFixed(1)} kHz`
        : `${Number(value.toFixed(2))} ${unit}`;
}
function voiceRange(key: keyof Voice, min: number, max: number, step: number) {
  const labels = voiceLabels[key]!;
  return `<div class="control"><label for="v-${key}">${t(labels[0], labels[1])}<output>${valueLabel(track().voice[key] as number, labels[2])}</output></label><input id="v-${key}" data-voice="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${track().voice[key]}"></div>`;
}
function group(title: string, content: string) {
  return `<section class="control-group"><h3>${title}</h3>${content}</section>`;
}
function sampler() {
  const s = p().samples.find((s) => s.id === track().voice.sampleId);
  return `<select id="sample-select" class="wide" aria-label="${t('Stored samples', 'Muestras guardadas')}"><option value="">${t('Choose a sample…', 'Elegir una muestra…')}</option>${p()
    .samples.map(
      (item) =>
        `<option value="${item.id}" ${s?.id === item.id ? 'selected' : ''}>${esc(item.name)}</option>`,
    )
    .join(
      '',
    )}</select><div class="sample-controls">${button('import-sample', t('＋ Audio file', '＋ Archivo de audio'))}${button('record', recording ? t('■ Stop recording', '■ Parar grabación') : t('● Microphone', '● Micrófono'), `class="${recording ? 'recording' : ''}"`)}</div><p class="hint">${t('Local only · 30 seconds per sample · 16 MiB per project', 'Solo local · 30 segundos por muestra · 16 MiB por proyecto')}</p>${
    s
      ? `<div class="sample-wave">${Array.from({ length: 48 }, (_, i) => {
          const data = s.channels[0]!;
          let peak = 0;
          const begin = Math.floor((i * data.length) / 48),
            end = Math.floor(((i + 1) * data.length) / 48);
          for (let j = begin; j < end; j += 8) peak = Math.max(peak, Math.abs(data[j]!));
          return `<i style="height:${Math.max(2, peak * 48)}px"></i>`;
        }).join(
          '',
        )}</div><p class="hint">${esc(s.name)}</p><div class="form-grid"><label>${t('Root MIDI pitch', 'Nota MIDI raíz')}<input data-sample="root" type="number" min="0" max="127" value="${s.root}"></label><label>${t('Loop', 'Bucle')}<input data-sample="loop" type="checkbox" ${s.loop ? 'checked' : ''}></label>${(['start', 'end', 'loopStart', 'loopEnd'] as const).map((k) => `<label>${{ start: t('Trim start (s)', 'Inicio (s)'), end: t('Trim end (s)', 'Fin (s)'), loopStart: t('Loop start (s)', 'Inicio bucle (s)'), loopEnd: t('Loop end (s)', 'Fin bucle (s)') }[k]}<input data-sample="${k}" type="number" min="0" max="${s.channels[0]!.length / s.rate}" step=".001" value="${s[k]}"></label>`).join('')}</div>`
      : ''
  }`;
}
function instrument(full = false) {
  return `<div class="instrument-title"><div><span class="eyebrow">${t('INSTRUMENT', 'INSTRUMENTO')}</span><h3 style="margin-top:7px">${esc(track().instrument)}</h3></div><span class="instrument-icon">∿</span></div><select class="preset-select" id="preset" aria-label="${t('Instrument preset', 'Preajuste de instrumento')}"><option value="">${t('Choose a preset…', 'Elegir un preajuste…')}</option>${packs.map((pack) => `<optgroup label="${esc(pack.name[language])}">${pack.presets.map((pre) => `<option value="${esc(pack.slug + '/' + pre.id)}">${esc(pre.name[language])}</option>`).join('')}</optgroup>`).join('')}</select><div class="${full ? 'instrument-full' : ''}"><div>${group(t('Character', 'Carácter'), `<div class="control"><label>${t('Engine', 'Motor')}</label><select id="voice-mode">${options(['subtractive', 'fm', 'sampler'], track().voice.mode)}</select></div>${track().voice.mode === 'sampler' ? sampler() : `<div class="control"><label>${t('Waveform', 'Forma de onda')}</label><select data-voice="wave">${options(['sine', 'triangle', 'sawtooth', 'square'], track().voice.wave)}</select></div>${track().voice.mode === 'fm' ? voiceRange('ratio', 0.25, 12, 0.25) + voiceRange('index', 0, 12, 0.1) + voiceRange('modDecay', 0.005, 4, 0.005) : voiceRange('detune', 0, 50, 1) + (full ? voiceRange('pan', -1, 1, 0.01) + voiceRange('sub', 0, 1, 0.01) + voiceRange('noise', 0, 1, 0.01) + voiceRange('pitchDrop', 0, 300, 1) : '')}`}`)}${group(t('Filter', 'Filtro'), voiceRange('cutoff', 30, 18000, 10) + voiceRange('resonance', 0.1, 12, 0.1) + (full ? voiceRange('filterDepth', -15000, 15000, 10) + voiceRange('filterAttack', 0.001, 3, 0.001) + voiceRange('filterDecay', 0.005, 3, 0.005) + voiceRange('filterSustain', 0, 1, 0.01) + voiceRange('filterRelease', 0.005, 4, 0.005) : ''))}</div><div>${group(t('Envelope', 'Envolvente'), voiceRange('attack', 0.001, 3, 0.001) + (full ? voiceRange('decay', 0.005, 3, 0.005) + voiceRange('sustain', 0, 1, 0.01) : '') + voiceRange('release', 0.005, 4, 0.005))}${full ? group(t('Motion', 'Movimiento'), voiceRange('lfoRate', 0.1, 20, 0.1) + voiceRange('lfoDepth', 0, 200, 1) + `<div class="control"><label>LFO →</label><select data-voice="lfoTarget">${options(['pitch', 'filter', 'amplitude'], track().voice.lfoTarget)}</select></div>` + voiceRange('velocityAmp', 0, 1, 0.01) + voiceRange('velocityCutoff', 0, 6000, 10)) : ''}${group(t('Space', 'Espacio'), mixRange(track(), trackIndex, 'reverb', t('Reverb send', 'Envío a reverb'), 0, 1, 0.01) + mixRange(track(), trackIndex, 'delay', t('Delay send', 'Envío a delay'), 0, 1, 0.01))}${!full ? button('instrument', t('All instrument controls ↗', 'Todos los controles ↗'), 'class="quiet wide"') : ''}</div></div>`;
}
function mixRange(
  item: Track,
  i: number,
  key: 'level' | 'pan' | 'reverb' | 'delay' | 'saturation' | 'cutoff',
  label: string,
  min: number,
  max: number,
  step: number,
) {
  const unit = key === 'cutoff' ? 'Hz' : key === 'pan' ? '' : '%';
  return `<div class="control"><label>${label}<output>${valueLabel(item[key], unit)}</output></label><input aria-label="${esc(item.name)} ${label}" data-mix="${key}" data-index="${i}" type="range" min="${min}" max="${max}" step="${step}" value="${item[key]}"></div>`;
}
function mixer() {
  return `<div class="view-title"><h2>${t('A space for every sound', 'Un espacio para cada sonido')}</h2><span class="tag">${t('PAN × REVERB', 'PAN × REVERB')}</span></div><p class="hint">${t('Drag a voice left or right to pan. Move it up to send more sound into the room.', 'Arrastra una voz a izquierda o derecha para panoramizar. Sube para enviar más sonido a la sala.')}</p>${showVisual ? '<div class="spectrum-card"><div id="visual" class="visual mixer-space"></div><div class="spectrum-axes"><span>← L</span><span>↑ REVERB</span><span>R →</span></div></div>' : ''}<div class="mixer-channels">${[...p().tracks, p().chordTrack].map((tr, i) => `<section class="mixer-channel" style="--track:${tr.color}"><h3>${i + 1} · ${esc(tr.name)}</h3>${mixRange(tr, i, 'level', t('Level', 'Nivel'), 0, 1.5, 0.01)}${mixRange(tr, i, 'pan', t('Pan', 'Panorama'), -1, 1, 0.01)}${mixRange(tr, i, 'reverb', t('Reverb', 'Reverb'), 0, 1, 0.01)}${mixRange(tr, i, 'delay', t('Delay', 'Delay'), 0, 1, 0.01)}${mixRange(tr, i, 'saturation', t('Saturation', 'Saturación'), 0, 1, 0.01)}${mixRange(tr, i, 'cutoff', t('Filter', 'Filtro'), 30, 18000, 10)}</section>`).join('')}</div>${group(t('Master room', 'Sala máster'), `<div class="form-grid">${(['reverbDecay', 'preDelay', 'delayDivision', 'feedback'] as const).map((key, i) => `<label>${[t('Decay (s)', 'Caída (s)'), t('Pre-delay (s)', 'Pre-delay (s)'), t('Delay (beats)', 'Delay (pulsos)'), t('Feedback', 'Realimentación')][i]}<input data-master="${key}" type="number" min="${[0.1, 0, 0.125, 0][i]}" max="${[4, 0.2, 2, 0.75][i]}" step="${[0.1, 0.01, 0.125, 0.01][i]}" value="${p().master[key]}"></label>`).join('')}</div><p class="hint">${t('Master limiter always active · −1 dBFS ceiling. Room changes take effect on the next playback.', 'Limitador máster siempre activo · techo de −1 dBFS. Los cambios de sala se aplican en la próxima reproducción.')}</p>`)}`;
}
function draw() {
  const oldGrid = document.querySelector<HTMLElement>('#grid-scroll');
  if (oldGrid) gridScroll = { left: oldGrid.scrollLeft, top: oldGrid.scrollTop };
  visual?.dispose();
  visual = null;
  const focused = (document.activeElement as HTMLElement)?.id;
  const focusedAction = (document.activeElement as HTMLElement)?.dataset.action;
  document.documentElement.lang = language;
  if (screen === 'projects') {
    app.innerHTML =
      header() +
      `<section class="library"><div class="library-head"><div><span class="eyebrow">${t('YOUR LOCAL STUDIO', 'TU ESTUDIO LOCAL')}</span><h2 style="margin-top:10px">${t('A place for your next idea.', 'Un lugar para tu próxima idea.')}</h2></div><div>${button('import-project', t('Import project', 'Importar proyecto'))} ${button('new', t('＋ New project', '＋ Nuevo proyecto'), 'class="primary"')}</div></div>${project ? button('continue', t('Continue → ', 'Continuar → ') + esc(project.name), 'style="margin-bottom:24px"') : ''}<div class="project-cards">${library.map((item) => `<article class="project-card"><div class="mini-wave">${(item.thumbnail ?? Array(48).fill(0.02)).map((v) => `<i style="height:${Math.max(2, v * 55)}px"></i>`).join('')}</div><h3>${esc(item.name)}</h3><p>${KEYS[item.tonic]} ${esc(item.mode)} · ${item.tempo} BPM · ${Math.round(tickSeconds(eventsFor(item, 'song').ticks, item.tempo))} s</p><p style="margin-top:7px">${new Date(item.updated).toLocaleDateString(language)}</p><div class="card-actions">${button('open', t('Open', 'Abrir'), `data-id="${item.id}" class="primary"`)}${button('rename', t('Rename', 'Renombrar'), `data-id="${item.id}"`)}${button('duplicate', t('Duplicate', 'Duplicar'), `data-id="${item.id}"`)}${button('export-project', t('Export', 'Exportar'), `data-id="${item.id}"`)}${button('delete', t('Delete', 'Eliminar'), `data-id="${item.id}"`)}</div></article>`).join('')}</div>${!library.length ? `<div class="empty">${t('No saved projects yet.', 'Aún no hay proyectos guardados.')}</div>` : ''}</section>`;
    return;
  }
  if (!project) return;
  app.innerHTML =
    header() +
    transportBar() +
    `<div class="workspace"><aside class="tracks"><div class="eyebrow">${t('TRACKS', 'PISTAS')}<span>08</span></div>${p().tracks.map(trackRow).join('')}${trackRow(p().chordTrack, 8)}</aside><section class="main-surface"><nav class="view-tabs" aria-label="${t('Workspace', 'Área de trabajo')}">${(['desk', 'instrument', 'mixer'] as const).map((v, i) => button(v, [t('Compose', 'Componer'), t('Instrument', 'Instrumento'), t('Mixer', 'Mezclador')][i]!, `class="${view === v ? 'active' : ''}"`)).join('')}<span style="margin-left:auto;align-self:center">${button('undo', '↶', `class="quiet" aria-label="${t('Undo', 'Deshacer')}" ${history.past.length ? '' : 'disabled'}`)}${button('redo', '↷', `class="quiet" aria-label="${t('Redo', 'Rehacer')}" ${history.future.length ? '' : 'disabled'}`)}</span></nav>${view === 'desk' ? desk() : view === 'instrument' ? instrument(true) + chords() : mixer()}</section><aside class="inspector">${view === 'instrument' ? group(t('Feel', 'Expresión'), feel()) : instrument()}</aside></div><footer class="footer"><span><span class="dot"></span>${t('All sound stays on your device', 'Todo el sonido permanece en tu dispositivo')}</span><div class="settings"><label><input id="show-visual" type="checkbox" ${showVisual ? 'checked' : ''}> ${t('3D views', 'Vistas 3D')}</label><label><input id="reduced-flash" type="checkbox" ${flash ? 'checked' : ''}> ${t('Reduced flashing', 'Destellos reducidos')}</label>${button('feel', t('Feel', 'Expresión'), 'class="quiet"')}${button('help', '?', `class="quiet" aria-label="${t('Keyboard shortcuts', 'Atajos de teclado')}"`)}</div><span><kbd>SPACE</kbd> ${t('play', 'reproducir')} &nbsp; <kbd>⌘ Z</kbd> ${t('undo', 'deshacer')}</span></footer>`;
  const scroller = document.querySelector<HTMLElement>('#grid-scroll');
  if (scroller) {
    const key = `${p().id}/${pattern().id}/${trackIndex}/${p().tonic}/${p().mode}/${p().scaleLock}`;
    if (key !== gridViewKey) {
      gridViewKey = key;
      const rows = gridRows(),
        topPitch = nearest(degreePitch(0, p().tonic, p().mode, octave) + 18, rows);
      gridScroll = {
        left: 0,
        top: track().percussive ? 0 : rows.indexOf(topPitch) * pitchRowHeight,
      };
    }
    scroller.scrollLeft = gridScroll.left;
    scroller.scrollTop = gridScroll.top;
    restoreGridScroll?.();
    restoreGridScroll = null;
    scroller.addEventListener(
      'wheel',
      (event) => {
        if (!event.altKey) return;
        event.preventDefault();
        const bounds = scroller.getBoundingClientRect();
        if (event.shiftKey && !track().percussive) {
          const sizes = [18, 25, 36, 48],
            at = sizes.indexOf(pitchRowHeight);
          setRollZoom(
            horizontalZoom,
            sizes[Math.max(0, Math.min(3, at + (event.deltaY < 0 ? 1 : -1)))]!,
            event.clientX - bounds.left,
            event.clientY - bounds.top,
          );
        } else {
          const levels: (1 | 2 | 'fit')[] = ['fit', 2, 1];
          const at = levels.indexOf(horizontalZoom);
          setRollZoom(
            levels[Math.max(0, Math.min(2, at + (event.deltaY < 0 ? 1 : -1)))]!,
            pitchRowHeight,
            event.clientX - bounds.left,
            event.clientY - bounds.top,
          );
        }
      },
      { passive: false },
    );
  }
  const host = document.querySelector<HTMLElement>('#visual');
  if (host) {
    try {
      visual = new Visual(
        host,
        view === 'mixer' ? 'mixer' : 'spectrum',
        [...p().tracks, p().chordTrack],
        (id, pan, reverb) =>
          edit(() => {
            const tr = [...p().tracks, p().chordTrack].find((x) => x.id === id)!;
            tr.pan = pan;
            tr.reverb = reverb;
          }),
        flash,
      );
      visual.setAnalyser(
        transport?.engine?.tracks.get(patternTrackId(pattern(), track().id))?.analyser,
      );
    } catch {
      host.innerHTML = `<div class="no-gl">${t('WebGL is unavailable. Use the mixer sliders; every sound control remains available.', 'WebGL no está disponible. Usa los controles del mezclador; todos los controles de sonido siguen disponibles.')}</div>`;
    }
  }
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  else if (focusedAction)
    document
      .querySelector<HTMLElement>(`[data-action="${focusedAction}"]`)
      ?.focus({ preventScroll: true });
  if (!modal.open && document.activeElement === document.body) app.focus({ preventScroll: true });
}
function feel() {
  return `<div class="control"><label>${t('Swing', 'Swing')}<output>${p().swing}%</output></label><input id="swing" type="range" min="0" max="65" step="1" value="${p().swing}"></div><div class="control"><label>${t('Humanization', 'Humanización')}<output>${Math.round(p().humanize * 100)}%</output></label><input id="humanize" type="range" min="0" max="1" step=".01" value="${p().humanize}"></div><p class="hint">${t('Timing ±24 ticks and velocity ±12% at full amount. Your notes stay unchanged.', 'Tiempo ±24 ticks y velocidad ±12% al máximo. Tus notas no cambian.')}</p>`;
}
function editNotes() {
  const selected = selectedNote();
  return selected ? [selected] : pattern().notes.filter((n) => n.track === track().id);
}
function selectedNote() {
  return pattern().notes.find(
    (n) =>
      n.track === track().id &&
      n.pitch === selectedPitch &&
      Math.round(n.tick / pattern().resolution) === selectedStep,
  );
}
function toggleNote(step: number, pitch: number, index = trackIndex) {
  if (index === 8) return;
  const tr = p().tracks[index]!;
  if (p().scaleLock && !tr.percussive && !inScale(pitch, p().tonic, p().mode)) {
    const existing = pattern().notes.find(
      (n) => n.track === tr.id && n.pitch === pitch && n.tick === step * pattern().resolution,
    );
    if (!existing) return;
  }
  selectedStep = step;
  bar = Math.floor((step * pattern().resolution) / barTicks(p()));
  selectedPitch = pitch;
  trackIndex = index;
  edit(() => {
    const tick = step * pattern().resolution;
    const at = pattern().notes.findIndex(
      (n) =>
        n.track === tr.id &&
        n.pitch === pitch &&
        Math.round(n.tick / pattern().resolution) === Math.round(tick / pattern().resolution),
    );
    if (at >= 0) pattern().notes.splice(at, 1);
    else
      pattern().notes.push({
        id: crypto.randomUUID(),
        track: tr.id,
        tick,
        pitch,
        duration: Math.min(pattern().resolution * 0.8, patternTicks(p(), pattern()) - tick),
        velocity: 0.7,
      });
  });
  document
    .querySelector<HTMLButtonElement>(`[data-step="${step}"][data-pitch="${pitch}"]`)
    ?.focus({ preventScroll: true });
}
function dialog(title: string, body: string, actions = '') {
  modal.innerHTML = `<h2>${title}</h2>${body}<div class="dialog-actions">${button('close-modal', t('Close', 'Cerrar'))}${actions}</div>`;
  modal.showModal();
}
function newDialog() {
  dialog(
    t('Start a new sketch', 'Empieza un nuevo boceto'),
    `<p>${t('A key, a pulse, and a little room to play.', 'Una tonalidad, un pulso y espacio para tocar.')}</p><div class="form-grid"><label class="span-2">${t('Project name', 'Nombre del proyecto')}<input id="new-name" value="" placeholder="${t('Untitled sketch', 'Boceto sin título')}" maxlength="100"></label><label>${t('Key', 'Tonalidad')}<select id="new-key">${KEYS.map((x, i) => `<option value="${i}">${x}</option>`).join('')}</select></label><label>${t('Mode', 'Modo')}<select id="new-mode">${options(Object.keys(MODES), 'minor')}</select></label><label>BPM<input id="new-tempo" type="number" min="40" max="240" value="96"></label><label>${t('Time signature', 'Compás')}<select id="new-signature">${options(['4/4', '3/4', '6/8', '5/4'], '4/4')}</select></label><label class="span-2">${t('Seed (optional)', 'Semilla (opcional)')}<input id="new-seed" maxlength="200" placeholder="${t('A fresh seed if left blank', 'Una semilla nueva si se deja vacío')}"></label><label class="span-2">${t('Starting point', 'Punto de partida')}<select id="new-template"><option value="starter">${t('First light · four-bar starter', 'Primera luz · cuatro compases')}</option><option value="empty">${t('Empty desk', 'Mesa vacía')}</option></select></label></div>`,
    button('create', t('Create project →', 'Crear proyecto →'), 'class="primary"'),
  );
}
function renderDialog() {
  dialog(
    t('Make it a file', 'Conviértelo en archivo'),
    `<p>${t('Render quietly, entirely on this device. Includes the effect tails. Maximum 180 seconds.', 'Renderiza en silencio en este dispositivo. Incluye las colas de efectos. Máximo 180 segundos.')}</p><div class="form-grid"><label>${t('Range', 'Rango')}<select id="render-range"><option value="pattern">${t('Current pattern', 'Patrón actual')}</option><option value="song">${t('Entire song', 'Canción completa')}</option></select></label><label>${t('Sample rate', 'Frecuencia de muestreo')}<select id="render-rate"><option value="44100">44.1 kHz</option><option value="48000">48 kHz</option></select></label><label>${t('Bit depth', 'Profundidad de bits')}<select id="render-depth"><option value="16">16 bit</option><option value="24">24 bit</option></select></label></div><progress id="render-progress" max="1" value="0" hidden></progress><div id="render-result" role="status"></div><p>${t('MIDI exports notes and timing, not the instrument sound.', 'MIDI exporta notas y tiempos, no el sonido de los instrumentos.')}</p>`,
    button('midi', t('Export MIDI', 'Exportar MIDI')) +
      button('render-wav', t('Render WAV ↓', 'Renderizar WAV ↓'), 'class="primary"'),
  );
}
async function chooseFile(accept: string) {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
async function addSample(blob: Blob, name: string, origin: string) {
  const target = p(),
    index = trackIndex;
  notify(t('Preparing local sample…', 'Preparando muestra local…'));
  const sample = await decodeSample(blob, name, target, origin);
  if (project !== target) return;
  edit(() => {
    p().samples.push(sample);
    const tr = index === 8 ? p().chordTrack : p().tracks[index]!;
    tr.voice = { ...defaultVoice, mode: 'sampler', sampleId: sample.id };
    tr.instrument = sample.name;
    tr.percussive = false;
  }, true);
  notify(
    t(
      'Sample ready. Root pitch can be corrected below.',
      'Muestra lista. Puedes corregir la nota raíz abajo.',
    ),
  );
}
async function action(action: string, el: HTMLElement) {
  switch (action) {
    case 'play':
      if (transport?.playing) {
        stop();
        draw();
      } else {
        transport = new Transport(p, scope, pattern().id, () => {
          visual?.setAnalyser();
          draw();
        });
        transport.loop = looping;
        transport.metronome = metronome;
        await transport.play();
        draw();
      }
      break;
    case 'stop':
      stop();
      draw();
      break;
    case 'loop':
      looping = !looping;
      if (transport) transport.loop = looping;
      draw();
      break;
    case 'metro':
      metronome = !metronome;
      if (transport) transport.metronome = metronome;
      draw();
      break;
    case 'projects':
      stop();
      if (dirty) await save();
      library = await store.list();
      screen = 'projects';
      draw();
      break;
    case 'continue':
      screen = 'desk';
      draw();
      break;
    case 'new':
      newDialog();
      break;
    case 'create': {
      const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
      const tempo = Number(val('new-tempo'));
      if (tempo < 40 || tempo > 240 || !Number.isFinite(tempo))
        throw new Error(t('Tempo must be 40–240 BPM.', 'El tempo debe ser 40–240 BPM.'));
      const next = newProject(
        {
          name: val('new-name').trim() || t('Untitled sketch', 'Boceto sin título'),
          tonic: Number(val('new-key')),
          mode: val('new-mode') as Project['mode'],
          tempo,
          signature: val('new-signature').split('/').map(Number) as [number, number],
          seed: val('new-seed'),
        },
        val('new-template') === 'empty',
      );
      await create(next);
      modal.close();
      break;
    }
    case 'open':
      await load(el.dataset.id!);
      break;
    case 'save':
      await save();
      notify(t('Project saved locally.', 'Proyecto guardado localmente.'));
      break;
    case 'rename': {
      const item = await store.load(el.dataset.id!);
      const name = prompt(t('Project name', 'Nombre del proyecto'), item.name);
      if (name?.trim()) {
        if (item.id === project?.id) {
          edit(() => (p().name = name.trim().slice(0, 100)));
          await save();
        } else {
          if (!(await store.acquire(item.id))) throw new Error('Project is open in another tab.');
          item.name = name.trim().slice(0, 100);
          try {
            await store.save(item);
          } finally {
            store.release(item.id);
          }
        }
        library = await store.list();
        draw();
      }
      break;
    }
    case 'duplicate': {
      const item = await store.load(el.dataset.id!);
      item.sourceId = item.id;
      item.id = crypto.randomUUID();
      item.name = (item.name + t(' copy', ' copia')).slice(0, 100);
      item.revision = 0;
      item.created = new Date().toISOString();
      await create(item);
      break;
    }
    case 'delete': {
      const item = library.find((x) => x.id === el.dataset.id)!;
      if (
        confirm(
          t(
            `Delete “${item.name}”? This cannot be undone.`,
            `¿Eliminar «${item.name}»? No se puede deshacer.`,
          ),
        )
      ) {
        await store.remove(item.id);
        if (project?.id === item.id) {
          project = null;
          dirty = false;
        }
        library = await store.list();
        draw();
      }
      break;
    }
    case 'export-project': {
      const item = el.dataset.id ? await store.load(el.dataset.id) : p();
      download(await exportProject(item), 'application/json', `${item.name}.tonada.json`);
      break;
    }
    case 'import-project': {
      const file = await chooseFile('.json,.tonada');
      if (file) await create(await importProject(file));
      break;
    }
    case 'language':
      setLanguage(language === 'en' ? 'es' : 'en');
      draw();
      break;
    case 'desk':
    case 'instrument':
    case 'mixer':
      view = action;
      draw();
      break;
    case 'lock':
      edit(() => (p().scaleLock = !p().scaleLock));
      break;
    case 'arm':
      armed = !armed;
      draw();
      break;
    case 'oct-up':
      octave = Math.min(7, octave + 1);
      gridViewKey = '';
      draw();
      break;
    case 'oct-down':
      octave = Math.max(1, octave - 1);
      gridViewKey = '';
      draw();
      break;
    case 'undo':
      if (history.past.length) {
        project = history.undo(p());
        patternIndex = Math.min(patternIndex, p().patterns.length - 1);
        bar = Math.min(bar, pattern().bars - 1);
        dirty = true;
        editVersion++;
        saveState = t('Unsaved', 'Sin guardar');
        draw();
      }
      break;
    case 'redo':
      if (history.future.length) {
        project = history.redo(p());
        patternIndex = Math.min(patternIndex, p().patterns.length - 1);
        bar = Math.min(bar, pattern().bars - 1);
        dirty = true;
        editVersion++;
        saveState = t('Unsaved', 'Sin guardar');
        draw();
      }
      break;
    case 'clear':
      edit(() => (pattern().notes = pattern().notes.filter((n) => n.track !== track().id)));
      break;
    case 'fit':
      edit(() =>
        editNotes().forEach((n) => {
          n.tick = Math.min(
            patternTicks(p(), pattern()) - pattern().resolution,
            Math.round(n.tick / pattern().resolution) * pattern().resolution,
          );
          n.duration = Math.min(
            patternTicks(p(), pattern()) - n.tick,
            Math.max(
              pattern().resolution,
              Math.round(n.duration / pattern().resolution) * pattern().resolution,
            ),
          );
        }),
      );
      break;
    case 'snap':
      edit(() =>
        editNotes().forEach((n) => {
          const c = pattern().chords[Math.floor(n.tick / barTicks(p()))];
          if (c) {
            const tones = scalePitches(p().tonic, p().mode, 0, 127).filter((pitch) =>
              c.voicing.some((cp) => cp % 12 === pitch % 12),
            );
            if (tones.length) n.pitch = nearest(n.pitch, tones);
          }
        }),
      );
      break;
    case 'transpose':
      edit(() => {
        const pitches = scalePitches(p().tonic, p().mode, 0, 127);
        editNotes().forEach(
          (n) =>
            (n.pitch =
              pitches[
                Math.min(pitches.length - 1, pitches.indexOf(nearest(n.pitch, pitches)) + 1)
              ]!),
        );
      });
      break;
    case 'generate':
      edit(() => {
        pattern().chords = progression(
          `${p().seed}:${pattern()
            .chords.map((c) => c.degree)
            .join('-')}`,
          p().tonic,
          p().mode,
          pattern().bars,
        );
        pattern().chords.forEach((c) => (c.duration = barTicks(p())));
      });
      break;
    case 'apply-template':
      if (p().patterns.length >= 64)
        throw new Error(t('Maximum 64 patterns.', 'Máximo 64 patrones.'));
      // Construct first so a capacity error cannot create an undo entry or alter the document.
      {
        const next = structuredClone(p());
        const index = applyTemplate(next, selectedTemplate, language);
        stop();
        edit(() => {
          project = next;
          patternIndex = index;
          selectedStep = 0;
          bar = 0;
          trackIndex = 4;
          scope = 'pattern';
        }, true);
        notify(
          t(
            'Template added as a new pattern. Press Play to hear it.',
            'Plantilla añadida como nuevo patrón. Pulsa Reproducir para escucharla.',
          ),
        );
      }
      break;
    case 'fit-pattern':
      setRollZoom('fit');
      break;
    case 'duplicate-pattern':
      if (p().patterns.length >= 64) throw new Error('Maximum 64 patterns.');
      edit(() => {
        const next = structuredClone(pattern());
        next.id = crypto.randomUUID();
        next.name = `${String.fromCharCode(65 + p().patterns.length)} · ${t('Variation', 'Variación')}`;
        next.notes.forEach((n) => (n.id = crypto.randomUUID()));
        p().patterns.push(next);
        patternIndex = p().patterns.length - 1;
      }, true);
      break;
    case 'add-slot':
      if (p().song.length >= 64) throw new Error('Maximum 64 song slots.');
      edit(() => p().song.push(pattern().id), true);
      break;
    case 'close-modal':
      if (!rendering) modal.close();
      break;
    case 'render':
      if (!project) {
        newDialog();
        break;
      }
      renderDialog();
      break;
    case 'render-wav': {
      if (rendering) return;
      stop();
      await save();
      rendering = true;
      const range = (document.querySelector('#render-range') as HTMLSelectElement).value as
          | 'pattern'
          | 'song',
        rate = Number((document.querySelector('#render-rate') as HTMLSelectElement).value),
        depth = Number((document.querySelector('#render-depth') as HTMLSelectElement).value) as
          | 16
          | 24;
      const progress = document.querySelector<HTMLProgressElement>('#render-progress')!;
      progress.hidden = false;
      el.setAttribute('disabled', '');
      const snapshot = structuredClone(p());
      try {
        const buffer = await renderAudio(
          snapshot,
          range,
          pattern().id,
          rate,
          (value) => (progress.value = value),
        );
        const bytes = wav(buffer, depth);
        const result = document.querySelector('#render-result')!;
        result.innerHTML = '';
        const link = document.createElement('button');
        link.className = 'primary';
        link.textContent = t('Download WAV ↓', 'Descargar WAV ↓');
        link.onclick = () => download(bytes, 'audio/wav', `${snapshot.name}.wav`);
        result.append(link);
        p().thumbnail = thumbnail(buffer);
        await save();
      } finally {
        rendering = false;
        el.removeAttribute('disabled');
      }
      break;
    }
    case 'midi':
      download(
        midi(
          p(),
          (document.querySelector('#render-range') as HTMLSelectElement).value as
            | 'pattern'
            | 'song',
          pattern().id,
        ),
        'audio/midi',
        `${p().name}.mid`,
      );
      break;
    case 'import-sample': {
      const file = await chooseFile('audio/*');
      if (file) await addSample(file, file.name, 'file');
      break;
    }
    case 'record':
      if (recording) {
        capture.stop();
        recording = false;
        draw();
      } else {
        stop();
        await capture.start((blob) => {
          recording = false;
          draw();
          void addSample(blob, t('Microphone sample', 'Muestra del micrófono'), 'microphone').catch(
            fail,
          );
        });
        recording = true;
        draw();
      }
      break;
    case 'feel':
      dialog(t('Give it a little feel', 'Dale un poco de expresión'), feel());
      break;
    case 'help':
      dialog(
        t('Keyboard at your fingertips', 'El teclado a tu alcance'),
        `<p>${t('Shortcuts work while the desk has focus.', 'Los atajos funcionan cuando la mesa tiene el foco.')}</p><p>Space · ${t('play / stop', 'reproducir / parar')}<br>L · ${t('loop', 'bucle')}<br>R · ${t('step entry', 'entrada por pasos')}<br>Z–M / Q–P · ${t('musical keyboard', 'teclado musical')}<br>, / . · ${t('octave', 'octava')}<br>↑ ↓ ← → · ${t('move selection', 'mover selección')}<br>Enter · ${t('toggle note', 'activar nota')}<br>Shift ↑ / ↓ · ${t('velocity', 'velocidad')}<br>M / S · ${t('mute / solo', 'silencio / solo')}<br>K · ${t('metronome', 'metrónomo')}<br>Ctrl / ⌘ Z · ${t('undo', 'deshacer')}<br>Ctrl / ⌘ Shift Z · ${t('redo', 'rehacer')}<br>Ctrl / ⌘ S · ${t('save', 'guardar')}</p>`,
        button('export-project', t('Export project JSON', 'Exportar proyecto JSON')),
      );
      break;
    case 'save-chord': {
      const slot = Number(el.dataset.slot),
        degree = Number((document.querySelector('#chord-degree') as HTMLSelectElement).value),
        quality = (document.querySelector('#chord-quality') as HTMLSelectElement)
          .value as 'diatonic',
        inversion = Number((document.querySelector('#chord-inversion') as HTMLSelectElement).value);
      edit(() => {
        while (pattern().chords.length <= slot)
          pattern().chords.push({
            degree: 0,
            quality: 'diatonic',
            inversion: 0,
            duration: barTicks(p()),
            voicing: chordPitches(0, p().tonic, p().mode),
          });
        let voicing = chordPitches(degree, p().tonic, p().mode, quality);
        if (p().scaleLock) voicing = voicing.map((n) => lockedPitch(p(), n));
        voicing = voicing.map((n, i) => n + (i < inversion ? 12 : 0)).sort((a, b) => a - b);
        pattern().chords[slot] = { degree, quality, inversion, duration: barTicks(p()), voicing };
      });
      modal.close();
      break;
    }
  }
}
document.addEventListener('click', (event) => {
  const el = (event.target as HTMLElement).closest<HTMLElement>('button');
  if (!el || el.hasAttribute('disabled')) return;
  void (async () => {
    if (el.dataset.action) {
      await action(el.dataset.action, el);
      return;
    }
    if (el.dataset.track) {
      trackIndex = Number(el.dataset.track);
      if (trackIndex === 8) view = 'instrument';
      draw();
      return;
    }
    if (el.dataset.bar) {
      bar = Number(el.dataset.bar);
      selectedStep = Math.ceil((bar * barTicks(p())) / pattern().resolution);
      restoreGridScroll = () => {
        const grid = document.querySelector<HTMLElement>('#grid-scroll');
        if (grid)
          grid.scrollLeft =
            (bar * (grid.clientWidth - 58)) / visibleBarCount(horizontalZoom, pattern().bars);
      };
      draw();
      return;
    }
    if (el.dataset.mute) {
      const index = Number(el.dataset.mute);
      edit(() => {
        const tr = index === 8 ? p().chordTrack : p().tracks[index]!;
        tr.mute = !tr.mute;
      });
      return;
    }
    if (el.dataset.solo) {
      const index = Number(el.dataset.solo);
      edit(() => {
        const tr = index === 8 ? p().chordTrack : p().tracks[index]!;
        tr.solo = !tr.solo;
      });
      return;
    }
    if (el.dataset.step) {
      if (event.shiftKey) {
        selectedStep = Number(el.dataset.step);
        bar = Math.floor((selectedStep * pattern().resolution) / barTicks(p()));
        selectedPitch = Number(el.dataset.pitch);
        trackIndex = Number(el.dataset.noteTrack);
        draw();
        return;
      }
      toggleNote(Number(el.dataset.step), Number(el.dataset.pitch), Number(el.dataset.noteTrack));
      return;
    }
    if (el.dataset.removeSlot) {
      edit(() => p().song.splice(Number(el.dataset.removeSlot), 1), true);
      return;
    }
    if (el.dataset.chord) {
      const slot = Number(el.dataset.chord),
        c = pattern().chords[slot];
      dialog(
        t('Shape this chord', 'Da forma a este acorde'),
        `<div class="form-grid"><label>${t('Scale degree', 'Grado de escala')}<select id="chord-degree">${MODES[p().mode].map((_, i) => `<option value="${i}" ${c?.degree === i ? 'selected' : ''}>${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i]}</option>`).join('')}</select></label><label>${t('Quality', 'Calidad')}<select id="chord-quality">${options(p().scaleLock ? ['diatonic'] : ['diatonic', 'major', 'minor', 'diminished'], c?.quality ?? 'diatonic')}</select></label><label>${t('Inversion', 'Inversión')}<select id="chord-inversion">${options(['0', '1', '2'], String(c?.inversion ?? 0))}</select></label></div>`,
        button(
          'save-chord',
          t('Apply chord', 'Aplicar acorde'),
          `class="primary" data-slot="${slot}"`,
        ),
      );
    }
  })().catch(fail);
});
document.addEventListener('change', (event) => {
  const el = event.target as HTMLInputElement;
  void (async () => {
    if (el.dataset.voice) {
      const key = el.dataset.voice as keyof Voice;
      const value = el.tagName === 'SELECT' ? el.value : Number(el.value);
      edit(() => Object.assign(track().voice, { [key]: value }));
    } else if (el.dataset.mix) {
      const index = Number(el.dataset.index);
      edit(() =>
        Object.assign(index === 8 ? p().chordTrack : p().tracks[index]!, {
          [el.dataset.mix!]: Number(el.value),
        }),
      );
    } else if (el.dataset.master) {
      edit(() => Object.assign(p().master, { [el.dataset.master!]: Number(el.value) }));
    } else if (el.dataset.sample) {
      const sample = p().samples.find((s) => s.id === track().voice.sampleId);
      if (!sample) return;
      const key = el.dataset.sample;
      const value = key === 'loop' ? el.checked : Number(el.value);
      const next = { ...sample, [key]: value };
      if (
        next.start >= next.end ||
        next.loopStart < next.start ||
        next.loopEnd > next.end ||
        next.loopStart >= next.loopEnd ||
        next.end > next.channels[0]!.length / next.rate ||
        next.root < 0 ||
        next.root > 127 ||
        !Number.isInteger(next.root)
      )
        throw new Error(
          t(
            'Keep loop points within the trim range, and the start before the end.',
            'Mantén el bucle dentro del recorte y el inicio antes del fin.',
          ),
        );
      edit(() => Object.assign(sample, next), true);
    } else
      switch (el.id) {
        case 'arrangement-template':
          if (TEMPLATES.some((item) => item.id === el.value)) {
            selectedTemplate = el.value as TemplateId;
            draw();
          }
          break;
        case 'tempo': {
          const value = Number(el.value);
          if (value < 40 || value > 240 || !Number.isFinite(value)) {
            draw();
            throw new Error('Tempo must be 40–240 BPM.');
          }
          edit(() => (p().tempo = value));
          break;
        }
        case 'tonic':
          edit(() => changeKey(p(), Number(el.value), p().mode));
          break;
        case 'mode':
          edit(() => changeKey(p(), p().tonic, el.value as Project['mode']));
          break;
        case 'scope':
          scope = el.value as 'pattern' | 'song';
          stop();
          draw();
          break;
        case 'pattern-select':
          stop();
          patternIndex = Number(el.value);
          selectedStep = 0;
          activatePattern(p(), patternIndex);
          bar = 0;
          draw();
          break;
        case 'pattern-bars': {
          const bars = Number(el.value),
            end = bars * barTicks(p());
          if (pattern().notes.some((n) => n.tick + n.duration > end)) {
            draw();
            throw new Error(
              t(
                'Move or remove notes in the later bars before shortening this pattern.',
                'Mueve o elimina las notas de los compases posteriores antes de acortar este patrón.',
              ),
            );
          }
          stop();
          edit(() => {
            pattern().bars = bars;
            pattern().chords = pattern().chords.slice(0, bars);
            bar = Math.min(bar, bars - 1);
          }, true);
          break;
        }
        case 'roll-zoom':
          setRollZoom(el.value === 'fit' ? 'fit' : (Number(el.value) as 1 | 2));
          break;
        case 'pitch-zoom':
          setRollZoom(horizontalZoom, Number(el.value));
          break;
        case 'resolution':
          edit(() => {
            selectedStep = Math.floor((selectedStep * pattern().resolution) / Number(el.value));
            pattern().resolution = Number(el.value);
          });
          break;
        case 'note-length':
          if (selectedNote()) {
            const n = selectedNote()!,
              duration = Number(el.value) * pattern().resolution;
            if (duration < 1 || duration > patternTicks(p(), pattern()) - n.tick)
              throw new Error(
                t('The note must fit inside the pattern.', 'La nota debe caber dentro del patrón.'),
              );
            edit(() => (n.duration = duration));
          }
          break;
        case 'velocity':
          if (selectedNote()) edit(() => (selectedNote()!.velocity = Number(el.value)));
          break;
        case 'swing':
          edit(() => (p().swing = Number(el.value)));
          break;
        case 'humanize':
          edit(() => (p().humanize = Number(el.value)));
          break;
        case 'sample-select':
          if (p().samples.some((s) => s.id === el.value))
            edit(() => {
              track().voice.sampleId = el.value;
              track().voice.mode = 'sampler';
              track().instrument = p().samples.find((s) => s.id === el.value)!.name;
            }, true);
          break;
        case 'voice-mode':
          edit(() => {
            track().voice.mode = el.value as Voice['mode'];
            if (el.value === 'sampler') track().percussive = false;
          });
          break;
        case 'preset': {
          const [slug, id] = el.value.split('/');
          const pre = packs.find((x) => x.slug === slug)?.presets.find((x) => x.id === id);
          if (!pre) return;
          if (pre.voice.mode === 'sampler' && pre.audio) {
            const response = await fetch(pre.audio);
            if (!response.ok) throw new Error('Generated sample is unavailable.');
            const sample = await decodeSample(
              await response.blob(),
              pre.name[language],
              p(),
              'generated',
            );
            edit(() => {
              p().samples.push(sample);
              track().voice = { ...pre.voice, sampleId: sample.id };
              track().instrument = pre.name[language];
              track().preset = el.value;
              track().percussive = false;
            }, true);
          } else
            edit(() => {
              track().voice = structuredClone(pre.voice);
              track().instrument = pre.name[language];
              track().preset = el.value;
            });
          break;
        }
        case 'show-visual':
          showVisual = el.checked;
          localStorage.setItem('tonada-visual', String(showVisual));
          draw();
          break;
        case 'reduced-flash':
          flash = el.checked;
          localStorage.setItem('tonada-flash', String(flash));
          draw();
          break;
      }
  })().catch(fail);
});
document.addEventListener('input', (event) => {
  const el = event.target as HTMLInputElement;
  if (el.type !== 'range') return;
  const output = el.parentElement?.querySelector('output');
  if (output)
    output.textContent = el.dataset.voice
      ? valueLabel(Number(el.value), voiceLabels[el.dataset.voice]?.[2] ?? '')
      : `${Number(el.value).toFixed(2)}`;
});
app.addEventListener('keydown', (event) => {
  const el = event.target as HTMLElement;
  if (screen !== 'desk' || !project || modal.open || el.matches('input,select,textarea')) return;
  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  if (command) {
    if (['s', 'z'].includes(key)) {
      event.preventDefault();
      void action(key === 's' ? 'save' : event.shiftKey ? 'redo' : 'undo', app).catch(fail);
    }
    return;
  }
  if (event.altKey) return;
  if (key === 'tab' && el.matches('[data-step]')) {
    event.preventDefault();
    trackIndex = (trackIndex + (event.shiftKey ? 7 : 1)) % 8;
    draw();
    document.querySelector<HTMLElement>(`[data-track="${trackIndex}"]`)?.focus();
    return;
  }
  if (key === 'escape') {
    document.querySelector<HTMLElement>('[data-action="desk"]')?.focus();
    return;
  }
  const notes = 'zxcvbnm',
    upper = 'qwertyuiop';
  if (
    (armed || !['r', 'l', 'k', 'm', 's'].includes(key)) &&
    (notes.includes(key) || upper.includes(key)) &&
    !event.repeat
  ) {
    event.preventDefault();
    const degree = notes.includes(key)
      ? notes.indexOf(key)
      : upper.indexOf(key) + MODES[p().mode].length;
    const pitch = p().scaleLock
      ? degreePitch(degree, p().tonic, p().mode, octave)
      : (octave + 1) * 12 + degree;
    const safePitch = Math.max(0, Math.min(127, pitch));
    void audition(safePitch).catch(fail);
    if (armed) {
      toggleNote(selectedStep, safePitch);
      selectedStep =
        (selectedStep + 1) % Math.ceil(patternTicks(p(), pattern()) / pattern().resolution);
      bar = Math.floor((selectedStep * pattern().resolution) / barTicks(p()));
      draw();
      focusGridSelection();
    }
    return;
  }
  const shortcuts: Record<string, string> = {
    ' ': 'play',
    l: 'loop',
    r: 'arm',
    k: 'metro',
    ',': 'oct-down',
    '.': 'oct-up',
  };
  if (shortcuts[key]) {
    event.preventDefault();
    if (!event.repeat) void action(shortcuts[key]!, app).catch(fail);
    return;
  }
  if (key === 'm' || key === 's') {
    event.preventDefault();
    edit(() => {
      if (key === 'm') track().mute = !track().mute;
      else track().solo = !track().solo;
    });
    return;
  }
  if (key.startsWith('arrow')) {
    event.preventDefault();
    if (event.shiftKey && (key === 'arrowup' || key === 'arrowdown')) {
      if (selectedNote())
        edit(
          () =>
            (selectedNote()!.velocity = Math.max(
              0.01,
              Math.min(1, selectedNote()!.velocity + (key === 'arrowup' ? 0.05 : -0.05)),
            )),
        );
      return;
    }
    const count = Math.ceil(patternTicks(p(), pattern()) / pattern().resolution);
    if (key === 'arrowleft') selectedStep = (selectedStep + count - 1) % count;
    if (key === 'arrowright') selectedStep = (selectedStep + 1) % count;
    if (key === 'arrowup' || key === 'arrowdown') {
      const pitches = Array.from(document.querySelectorAll<HTMLElement>('[data-step="0"]'), (x) =>
        Number(x.dataset.pitch),
      );
      let index = pitches.indexOf(selectedPitch);
      index = (index + (key === 'arrowup' ? -1 : 1) + pitches.length) % pitches.length;
      selectedPitch = pitches[index] ?? 60;
    }
    bar = Math.floor((selectedStep * pattern().resolution) / barTicks(p()));
    draw();
    focusGridSelection();
    return;
  }
  if (key === 'enter' && el.matches('[data-step]')) {
    event.preventDefault();
    if (event.shiftKey) {
      selectedStep = Number(el.dataset.step);
      bar = Math.floor((selectedStep * pattern().resolution) / barTicks(p()));
      selectedPitch = Number(el.dataset.pitch);
      draw();
      return;
    }
    toggleNote(Number(el.dataset.step), Number(el.dataset.pitch), Number(el.dataset.noteTrack));
  }
});
const meterData = new Uint8Array(128);
function frame(now: number) {
  if (now - lastFrame > 65 && transport?.playing && screen === 'desk') {
    lastFrame = now;
    const pos = transport.position();
    const display = document.querySelector('#position');
    if (display)
      display.textContent = `${String(Math.floor(pos / barTicks(p())) + 1).padStart(2, '0')} : ${String((Math.floor(pos / PPQ) % p().signature[0]) + 1).padStart(2, '0')}`;
    const step = Math.floor((pos % patternTicks(p(), pattern())) / pattern().resolution);
    document
      .querySelectorAll<HTMLElement>('[data-step]')
      .forEach((el) => el.classList.toggle('playing', Number(el.dataset.step) === step));
    if (transport.engine) {
      transport.engine.analyser.getByteTimeDomainData(meterData);
      let peak = 0;
      for (const value of meterData) peak = Math.max(peak, Math.abs(value - 128) / 128);
      const meter = document.querySelector<HTMLMeterElement>('#meter');
      if (meter) meter.value = peak;
    }
  }
  raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);
setInterval(() => {
  if (dirty && project && !rendering) void save().catch(fail);
}, 30000);
window.addEventListener('blur', () => {
  endAudition();
  if (transport?.playing) {
    stop();
    draw();
  }
  if (recording) {
    capture.stop();
    recording = false;
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop();
    visual?.setAnalyser();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  stop();
  capture.dispose();
  visual?.dispose();
  cancelAnimationFrame(raf);
  if (project) store.release(p().id);
});
modal.addEventListener('cancel', (e) => {
  if (rendering) e.preventDefault();
});
async function init() {
  try {
    await store.init();
    try {
      packs = await loadPacks();
    } catch (e) {
      fail(e);
    }
    library = await store.list();
    const last = localStorage.getItem('tonada-last');
    if (last && library.some((x) => x.id === last)) await load(last);
    else if (library.length) {
      screen = 'projects';
      draw();
    } else await create(newProject());
  } catch (e) {
    app.innerHTML = `<section class="library"><div class="brand">${logo}tonada</div><h2 style="margin-top:35px">${t('Could not open the local studio', 'No se pudo abrir el estudio local')}</h2><p class="hint" style="margin-top:20px">${esc(e instanceof Error ? e.message : e)}</p><p class="hint">${t('Allow local storage and use a browser with IndexedDB and Web Locks. Reload to retry.', 'Permite el almacenamiento local y usa un navegador con IndexedDB y Web Locks. Recarga para reintentar.')}</p></section>`;
    fail(e);
  }
}
void init();
