import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { create } from "zustand";
import { countries, country } from "../../packages/catalogue";
import {
  defaultProfile,
  type Match,
  type Profile,
  type Input,
  type Settings,
  type Setup,
  idleInput,
} from "../../packages/contracts";
import { FootballScene } from "./scene";
import { MatchAudio } from "./audio";
import "./style.css";
type Screen = "home" | "select" | "match";
type AppState = {
  screen: Screen;
  profile: Profile;
  match: Match | null;
  error: string;
  saveWarning: string;
  network: string;
  set: (v: Partial<AppState>) => void;
};
const useApp = create<AppState>((set) => ({
  screen: "home",
  profile: defaultProfile(),
  match: null,
  error: "",
  saveWarning: "",
  network: "",
  set,
}));
async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data.error?.message ?? "Something went wrong. Please try again.",
    );
  return data;
}
const audio = new MatchAudio();
const ballIcon = (
  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="m20 11 9 7-3 11H14l-3-11 9-7ZM20 4v7M5 15l6 3M9 32l5-3m12 0 5 3m-2-14 6-3"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);
function Shirt({ id, large = false }: { id: string; large?: boolean }) {
  const c = country(id);
  return (
    <svg
      className={`shirt ${large ? "large" : ""}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={`stripes-${id}`}
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <rect width="18" height="18" fill={c.primary} />
          <rect width="9" height="18" fill={c.secondary} />
        </pattern>
        <pattern
          id={`checks-${id}`}
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <rect width="24" height="24" fill={c.primary} />
          <path d="M0 0h12v12H0zm12 12h12v12H12z" fill={c.secondary} />
        </pattern>
      </defs>
      <path
        d="m29 16 12-5q9 8 18 0l12 5 23 21-16 17-10-8v43H32V46L22 54 6 37z"
        fill={c.pattern === "plain" ? c.primary : `url(#${c.pattern}-${id})`}
        stroke="#ffffff25"
        strokeWidth="1.5"
      />
      <path
        d="M40 12q10 17 20 0"
        stroke={c.secondary}
        strokeWidth="4"
        fill="none"
      />
      <path d="m9 39 12 12m59 0 11-12" stroke={c.secondary} strokeWidth="4" />
      <text
        x="50"
        y="64"
        textAnchor="middle"
        fill={
          c.group === "light" || c.group === "yellow" ? "#17372e" : "#fff9e9"
        }
        fontSize="24"
        fontWeight="700"
      >
        7
      </text>
    </svg>
  );
}
function App() {
  const state = useApp();
  const { screen, profile, match, error, saveWarning, network } = state;
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<FootballScene | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const input = useRef<Input | null>(null);
  const keys = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [desktop, setDesktop] = useState(false),
    [panel, setPanel] = useState<"settings" | "controls" | null>(null),
    [draft, setDraft] = useState<Settings>(profile.settings),
    [setup, setSetup] = useState<Setup>(profile.setup),
    [confirm, setConfirm] = useState<"restart" | "menu" | null>(null),
    [binding, setBinding] = useState<string | null>(null),
    [recovery, setRecovery] = useState<Match | null>(null),
    [tip, setTip] = useState(true);
  const activeRef = useRef<Match | null>(null),
    eventId = useRef(-1),
    reconnect = useRef<ReturnType<typeof setTimeout> | null>(null),
    connectionGeneration = useRef(0),
    prevButtons = useRef<boolean[]>([]);
  const requestKeys = useRef(new Map<string, string>());
  function fail(e: unknown) {
    state.set({ error: e instanceof Error ? e.message : String(e) });
  }
  function clear() {
    keys.current.clear();
    if (input.current) {
      input.current.x = input.current.z = 0;
      input.current.sprint = input.current.shoot = false;
    }
    if (scene.current) scene.current.input = null;
  }
  function receive(s: Match) {
    activeRef.current = s;
    state.set({ match: s });
    scene.current?.update(s);
    if (eventId.current >= 0 && s.event.id > eventId.current)
      audio.play(s.event.kind);
    eventId.current = s.event.id;
    if (input.current) input.current.seq = Math.max(input.current.seq, s.ack);
  }
  async function action(name: string) {
    const current = activeRef.current;
    if (!current) return;
    clear();
    try {
      const s = await api<Match>(`/matches/${current.id}/${name}`, "POST", {});
      receive(s);
    } catch (e) {
      fail(e);
    }
  }
  function connect(s: Match) {
    connectionGeneration.current++;
    const generation = connectionGeneration.current;
    if (reconnect.current) clearTimeout(reconnect.current);
    socket.current?.close();
    input.current = idleInput(s.id);
    input.current.seq = s.ack;
    eventId.current = s.event.id;
    activeRef.current = s;
    state.set({ screen: "match", network: "Connecting…" });
    scene.current?.update(s);
    const open = () => {
      if (generation !== connectionGeneration.current) return;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/v1/play?version=1&match=${s.id}`,
      );
      socket.current = ws;
      ws.onopen = () => {
        state.set({ network: "" });
      };
      ws.onmessage = (e) => {
        const message = JSON.parse(e.data);
        if (message.type === "snapshot") {
          receive(message.state);
          state.set({ saveWarning: message.saveWarning });
        } else if (message.type === "controlLost") {
          connectionGeneration.current++;
          clear();
          state.set({
            network: "This match is now controlled in another window.",
          });
        }
      };
      ws.onerror = () => {
        state.set({ network: "Connection interrupted. Reconnecting…" });
      };
      ws.onclose = (e) => {
        if (generation !== connectionGeneration.current) return;
        clear();
        if (e.code === 4001) {
          state.set({ network: "This match is controlled in another window." });
          return;
        }
        state.set({ network: "Connection interrupted. Reconnecting…" });
        reconnect.current = setTimeout(open, 1500);
      };
    };
    open();
  }
  useEffect(() => {
    let alive = true;
    let manager: FootballScene;
    try {
      manager = new FootballScene(canvas.current!, (msg) =>
        state.set({ error: msg }),
      );
      scene.current = manager;
    } catch (e) {
      state.set({
        error:
          "3D graphics could not start. Enable hardware acceleration or try a WebGL2-capable browser.",
      });
      return;
    }
    void manager
      .load()
      .then(() => {
        if (alive) setLoaded(true);
      })
      .catch(fail);
    const token = new URLSearchParams(location.hash.slice(1)).get("token");
    if (token) history.replaceState(null, "", location.pathname);
    void api("/session", "POST", token ? { token } : {})
      .then((data) => {
        if (!alive) return;
        setDesktop(data.desktop);
        return api("/profile");
      })
      .then((data) => {
        if (!data || !alive) return;
        state.set({ profile: data.profile, saveWarning: data.saveWarning });
        setSetup(data.profile.setup);
        setDraft(data.profile.settings);
        setRecovery(
          data.match && !["finished", "abandoned"].includes(data.match.phase)
            ? data.match
            : null,
        );
        manager.quality(data.profile.settings);
        audio.configure(data.profile.settings);
      })
      .catch(fail);
    return () => {
      alive = false;
      manager.dispose();
      connectionGeneration.current++;
      socket.current?.close();
      if (reconnect.current) clearTimeout(reconnect.current);
    };
  }, []);
  useEffect(() => {
    if (loaded && screen !== "match")
      scene.current?.previewCountries(
        setup.country,
        setup.opponent === "random"
          ? setup.country === "BRA"
            ? "ARG"
            : "BRA"
          : setup.opponent,
      );
  }, [loaded, setup.country, setup.opponent, screen]);
  useEffect(() => {
    scene.current?.quality(profile.settings);
    audio.configure(profile.settings);
    document.documentElement.style.setProperty(
      "--text-scale",
      String(profile.settings.textScale),
    );
  }, [profile.settings]);
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (binding) {
        e.preventDefault();
        setDraft((d) => ({
          ...d,
          bindings: { ...d.bindings, [binding]: e.code },
        }));
        setBinding(null);
        return;
      }
      if (e.code === "Escape") {
        if (panel) {
          setPanel(null);
          return;
        }
        if (screen === "match") {
          e.preventDefault();
          void action(
            activeRef.current?.phase === "paused" ? "resume" : "pause",
          );
        }
        return;
      }
      if (
        screen !== "match" ||
        panel ||
        confirm ||
        (["INPUT", "SELECT", "BUTTON"].includes(
          (e.target as HTMLElement).tagName,
        ) &&
          e.code === "Space")
      )
        return;
      const bind = profile.settings.bindings;
      if (Object.values(bind).includes(e.code) || e.code.startsWith("Arrow"))
        e.preventDefault();
      if (e.repeat) return;
      keys.current.add(e.code);
      audio.unlock();
      if (input.current) {
        if (e.code === bind.pass) input.current.pass++;
        if (e.code === bind.switch) input.current.switch++;
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => {
      clear();
      if (screen === "match") void action("pause");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("gamepaddisconnected", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("gamepaddisconnected", blur);
    };
  }, [screen, panel, confirm, binding, profile.settings.bindings]);
  useEffect(() => {
    const loop = setInterval(() => {
      const s = activeRef.current,
        controls = input.current;
      const pad = navigator.getGamepads?.()[0];
      const buttons = pad?.buttons.map((b) => b.pressed) ?? [];
      const rising = (i: number) => buttons[i] && !prevButtons.current[i];
      if (
        pad &&
        (screen !== "match" ||
          panel ||
          s?.phase === "paused" ||
          s?.phase === "finished" ||
          s?.phase === "halfTime")
      ) {
        const focusables = Array.from(
          document.querySelectorAll<HTMLElement>(
            "button:not(:disabled),select,input",
          ),
        ).filter((el) => el.offsetParent !== null);
        if (rising(12) || rising(13)) {
          const index = focusables.indexOf(
            document.activeElement as HTMLElement,
          );
          focusables[
            (index + (rising(12) ? -1 : 1) + focusables.length) %
              focusables.length
          ]?.focus();
        }
        if (rising(0)) (document.activeElement as HTMLElement)?.click();
      }
      if (screen === "match" && controls && s) {
        const b = profile.settings.bindings;
        const sign = s.half === 1 ? 1 : -1;
        const pressed = (name: string, alt?: string) =>
          keys.current.has(b[name] ?? "") || (!!alt && keys.current.has(alt));
        let x =
            Number(pressed("right", "ArrowRight")) -
            Number(pressed("left", "ArrowLeft")),
          z =
            Number(pressed("down", "ArrowDown")) -
            Number(pressed("up", "ArrowUp"));
        const dead = profile.settings.deadZone;
        if (pad && Math.hypot(pad.axes[0] ?? 0, pad.axes[1] ?? 0) > dead) {
          x = pad.axes[0] ?? 0;
          z = pad.axes[1] ?? 0;
        }
        const l = Math.max(1, Math.hypot(x, z));
        controls.x = (x / l) * sign;
        controls.z = (z / l) * sign;
        controls.sprint = pressed("sprint") || !!buttons[7];
        controls.shoot = pressed("shoot") || !!buttons[2];
        if (rising(0)) controls.pass++;
        if (rising(4)) controls.switch++;
        if (rising(9)) void action(s.phase === "paused" ? "resume" : "pause");
        if (
          panel ||
          confirm ||
          !["playing", "kickoff", "stoppage"].includes(s.phase)
        ) {
          controls.x = controls.z = 0;
          controls.shoot = controls.sprint = false;
        }
        controls.seq++;
        if (scene.current) scene.current.input = controls;
        if (socket.current?.readyState === WebSocket.OPEN)
          socket.current.send(JSON.stringify(controls));
      }
      prevButtons.current = buttons;
    }, 1000 / 30);
    return () => clearInterval(loop);
  }, [screen, profile.settings, panel, confirm]);
  async function start(rematch = false) {
    if (busy || !loaded) return;
    setBusy(true);
    state.set({ error: "" });
    audio.unlock();
    const keyName = rematch ? (activeRef.current?.id ?? "new") : "new";
    let key = requestKeys.current.get(keyName);
    if (!key) {
      key = crypto.randomUUID();
      requestKeys.current.set(keyName, key);
    }
    try {
      const s = await api<Match>(
        rematch ? `/matches/${activeRef.current!.id}/rematch` : "/matches",
        "POST",
        rematch ? {} : setup,
        key,
      );
      requestKeys.current.delete(keyName);
      connect(s);
      receive(s);
      const ready = await api<Match>(`/matches/${s.id}/ready`, "POST", {});
      receive(ready);
      const data = await api("/profile");
      state.set({ profile: data.profile });
      setRecovery(null);
      setTip(true);
      setTimeout(() => setTip(false), 9000);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function leave(restart = false) {
    setBusy(true);
    try {
      await action("abandon");
      connectionGeneration.current++;
      socket.current?.close();
      if (reconnect.current) clearTimeout(reconnect.current);
      setConfirm(null);
      state.set({ screen: "select", match: null, network: "" });
      activeRef.current = null;
      setRecovery(null);
      if (restart) {
        const s = await api<Match>(
          "/matches",
          "POST",
          setup,
          crypto.randomUUID(),
        );
        connect(s);
        receive(await api<Match>(`/matches/${s.id}/ready`, "POST", {}));
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings() {
    setBusy(true);
    try {
      const result = await api<Profile>("/profile", "PATCH", {
        ...profile,
        settings: draft,
      });
      state.set({ profile: result });
      setPanel(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const phase = match?.phase;
  const inMatch = screen === "match";
  const time = match
    ? `${String(Math.floor(match.elapsed / 60)).padStart(2, "0")}:${String(Math.floor(match.elapsed % 60)).padStart(2, "0")}`
    : "00:00";
  const openPanel = (p: "settings" | "controls") => {
    setDraft(profile.settings);
    setPanel(p);
    if (inMatch) void action("pause");
  };
  return (
    <main className={`app ${inMatch ? "in-match" : ""}`}>
      <canvas
        ref={canvas}
        className="pitch-canvas"
        aria-label="3D football stadium"
      />
      <div className="scene-shade" />
      {!inMatch && (
        <header className="header">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              state.set({ screen: "home" });
            }}
          >
            {ballIcon}
            <span>
              ONE MORE
              <br />
              MATCH
            </span>
          </a>
          <nav>
            <span className="edition">THE BEAUTIFUL GAME. SIMPLIFIED.</span>
            <button
              className="icon-button"
              aria-label="Controls"
              onClick={() => openPanel("controls")}
            >
              ⌘
            </button>
            <button
              className="icon-button"
              aria-label="Settings"
              onClick={() => openPanel("settings")}
            >
              ⚙
            </button>
            {desktop && (
              <button
                className="icon-button"
                aria-label="Quit"
                onClick={() => void api("/quit", "POST", {})}
              >
                ↗
              </button>
            )}
          </nav>
        </header>
      )}
      {screen === "home" && (
        <>
          <section className="hero">
            <div className="eyebrow">
              <span className="live-dot" /> NO LEAGUES. NO WAITING. JUST
              FOOTBALL.
            </div>
            <h1>
              For the love
              <br />
              of <em>one more.</em>
            </h1>
            <p>
              Pick your colours. Find your rhythm.
              <br />
              There’s always time for one more match.
            </p>
            <button
              className="primary hero-button"
              disabled={!loaded || busy}
              onClick={() => {
                audio.unlock();
                state.set({ screen: "select" });
              }}
            >
              {loaded ? "LET’S PLAY" : "PREPARING THE PITCH"} <span>↗</span>
            </button>
            {recovery && (
              <button
                className="resume-link"
                onClick={() => {
                  audio.unlock();
                  connect(recovery);
                  receive(recovery);
                  setRecovery(null);
                }}
              >
                ↻ Resume your match · {country(recovery.setup.country).name}{" "}
                {recovery.score.join(" — ")}
              </button>
            )}
            <div className="hero-facts">
              <div>
                <b>20</b>
                <span>COUNTRIES</span>
              </div>
              <div>
                <b>
                  7<span>v</span>7
                </b>
                <span>PURE FOOTBALL</span>
              </div>
              <div>
                <b>05:00</b>
                <span>ALL IT TAKES</span>
              </div>
            </div>
          </section>
          <div className="stadium-label">
            <span className="live-dot" />
            <span>
              THE COMMON GROUND
              <br />
              <small>GOOD FOOTBALL. GREAT COMPANY.</small>
            </span>
            <span className="sun-icon">☀</span>
          </div>
          <footer>
            <span>A LITTLE RIVALRY. A LOT OF HEART.</span>
            <span>
              ONE PLAYER · COMPUTER OPPONENT <i>↗</i>
            </span>
          </footer>
        </>
      )}
      {screen === "select" && (
        <section className="selection">
          <div className="section-heading">
            <div className="eyebrow">01 / PICK YOUR SIDE</div>
            <h1>
              Your country.
              <br />
              <em>Your colours.</em>
            </h1>
            <p>Twenty teams. One beautiful game.</p>
          </div>
          <div className="selection-layout">
            <div className="country-grid">
              {countries.map((c) => (
                <button
                  key={c.id}
                  className={`country-card ${setup.country === c.id ? "selected" : ""}`}
                  onClick={() => {
                    setSetup({
                      ...setup,
                      country: c.id,
                      opponent:
                        setup.opponent === c.id ? "random" : setup.opponent,
                    });
                    audio.play("menu");
                  }}
                  aria-pressed={setup.country === c.id}
                >
                  <span className="country-code">{c.id}</span>
                  <Shirt id={c.id} />
                  <span className="country-name">{c.name}</span>
                  <span className="card-check">✓</span>
                </button>
              ))}
            </div>
            <aside className="match-card">
              <div className="eyebrow">YOUR MATCHDAY</div>
              <div className="chosen">
                <Shirt id={setup.country} large />
                <h2>{country(setup.country).name}</h2>
                <span>HOME COLOURS · READY TO PLAY</span>
              </div>
              <label>
                THE OPPOSITION
                <select
                  value={setup.opponent}
                  onChange={(e) =>
                    setSetup({ ...setup, opponent: e.target.value })
                  }
                >
                  <option value="random">Surprise me ↗</option>
                  {countries
                    .filter((c) => c.id !== setup.country)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                THE CHALLENGE
                <div className="segmented">
                  {(["easy", "normal", "hard"] as const).map((d) => (
                    <button
                      key={d}
                      className={setup.difficulty === d ? "active" : ""}
                      onClick={() => setSetup({ ...setup, difficulty: d })}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </label>
              <div className="match-detail">
                <span>7 A SIDE</span>
                <span>5 MINUTES</span>
                <span>YOUR RULES*</span>
              </div>
              <button
                className="primary"
                disabled={busy || !loaded}
                onClick={() => {
                  if (recovery) {
                    state.set({
                      error:
                        "Resume or abandon your existing match before starting another.",
                    });
                    return;
                  }
                  void start();
                }}
              >
                {busy ? "GETTING READY…" : "KICK OFF"}
                <span>→</span>
              </button>
              {recovery && (
                <div className="recovery-actions">
                  <button
                    onClick={() => {
                      connect(recovery);
                      receive(recovery);
                    }}
                  >
                    Resume saved match
                  </button>
                  <button
                    onClick={() => {
                      activeRef.current = recovery;
                      setConfirm("menu");
                    }}
                  >
                    Discard saved match
                  </button>
                </div>
              )}
              <small>*No offside. No cards. All football.</small>
            </aside>
          </div>
        </section>
      )}
      {inMatch && match && (
        <>
          <div className="match-top">
            <button
              className="pause-button"
              aria-label="Pause match"
              onClick={() =>
                void action(phase === "paused" ? "resume" : "pause")
              }
            >
              Ⅱ
            </button>
            <div className="scoreboard">
              <div className="score-country">
                <i style={{ background: match.kits[0].primary }} />
                {match.setup.country}
                <small>YOU</small>
              </div>
              <strong>
                {match.score[0]} <span>:</span> {match.score[1]}
              </strong>
              <div className="score-country">
                {match.opponent}
                <i style={{ background: match.kits[1].primary }} />
              </div>
              <div className="timer">
                {time}
                <small>{match.half === 1 ? "1ST" : "2ND"} HALF</small>
              </div>
            </div>
            <span className="match-wordmark">ONE MORE MATCH</span>
          </div>
          <div className="match-bottom">
            <div className="player-card">
              <span className="eyebrow">YOU’RE IN CONTROL</span>
              <strong>
                <b>{match.controlled + 1}</b>{" "}
                {country(match.setup.country).name}
              </strong>
              <div className="stamina">
                <i
                  style={{
                    width: `${(match.players[match.controlled]?.stamina ?? 1) * 100}%`,
                  }}
                />
              </div>
              <small>
                {match.charge > 0 ? "SHOT POWER" : "STAMINA"}
                {match.charge > 0 && (
                  <meter min="0" max="1.2" value={match.charge} />
                )}
              </small>
            </div>
            <div className="radar">
              <svg viewBox="0 0 140 90">
                <path d="M1 1h138v88H1zM70 1v88" />
                <circle cx="70" cy="45" r="12" />
                {match.players.map((p) => (
                  <circle
                    key={p.id}
                    cx={70 + p.x * 1.95}
                    cy={45 + p.z * 1.9}
                    r={p.id === match.controlled ? 3.2 : 2}
                    fill={p.team === 0 ? "#d9f68a" : "#f3eee0"}
                    stroke={p.id === match.controlled ? "#fff" : "none"}
                  />
                ))}
                <circle
                  cx={70 + match.ball.x * 1.95}
                  cy={45 + match.ball.z * 1.9}
                  r="1.8"
                  fill="#ffae68"
                />
              </svg>
            </div>
          </div>
          {tip && phase === "playing" && (
            <div className="controls-toast">
              <span>
                <kbd>W A S D</kbd> MOVE
              </span>
              <span>
                <kbd>J</kbd> PASS / TACKLE
              </span>
              <span>
                <kbd>K</kbd> HOLD TO SHOOT
              </span>
              <span>
                <kbd>L</kbd> SWITCH
              </span>
              <button
                aria-label="Dismiss controls"
                onClick={() => setTip(false)}
              >
                ×
              </button>
            </div>
          )}
          {(phase === "kickoff" ||
            phase === "stoppage" ||
            phase === "goalCelebration") &&
            !panel && (
              <div
                className={`phase-banner ${phase === "goalCelebration" ? "goal-banner" : ""}`}
              >
                <span className="eyebrow">
                  {phase === "goalCelebration"
                    ? "MAKE SOME NOISE"
                    : match.restart.team === 0
                      ? "YOUR BALL"
                      : "OPPOSITION BALL"}
                </span>
                <h2>
                  {phase === "goalCelebration"
                    ? match.event.text
                    : match.restart.kind}
                </h2>
                <p>
                  {phase === "goalCelebration"
                    ? "That’s what we came for."
                    : match.restart.team === 0
                      ? "Aim with movement keys. Press J to play."
                      : "Back into shape. Here we go."}
                </p>
              </div>
            )}
          {(phase === "paused" ||
            phase === "halfTime" ||
            phase === "finished") &&
            !panel && (
              <div className="modal-scrim">
                <section className="match-modal">
                  <div className="eyebrow">
                    {phase === "paused"
                      ? "TAKE A BREATHER"
                      : phase === "halfTime"
                        ? "A GAME OF TWO HALVES"
                        : "THE FINAL WHISTLE"}
                  </div>
                  <h2>
                    {phase === "paused"
                      ? "Football can wait."
                      : phase === "halfTime"
                        ? "Half time."
                        : match.score[0] > match.score[1]
                          ? "Beautifully played."
                          : match.score[0] < match.score[1]
                            ? "There’s always next time."
                            : "Honours even."}
                  </h2>
                  {phase !== "paused" && (
                    <div className="result-score">
                      <span>{match.setup.country}</span>
                      <b>{match.score.join(" — ")}</b>
                      <span>{match.opponent}</span>
                    </div>
                  )}
                  {phase === "paused" && (
                    <p>
                      {match.pauseReason === "recovery"
                        ? "Your match was recovered. Up to five seconds of recent play may have been lost."
                        : match.pauseReason === "connection"
                          ? "Your connection paused the match. Resume when you’re ready."
                          : "The pitch will be right here."}
                    </p>
                  )}
                  {phase === "finished" && (
                    <div className="stats">
                      {[
                        ["Shots", match.stats.shots],
                        ["On target", match.stats.onTarget],
                        ["Passes completed", match.stats.completed],
                        [
                          "Possession",
                          match.stats.possession.map(
                            (v) =>
                              `${Math.round((v / (match.stats.possession[0] + match.stats.possession[1] || 1)) * 100)}%`,
                          ),
                        ],
                      ].map(([name, values]) => (
                        <div key={String(name)}>
                          <b>{(values as any[])[0]}</b>
                          <span>{String(name)}</span>
                          <b>{(values as any[])[1]}</b>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className="primary"
                    disabled={busy || !!network}
                    onClick={() =>
                      phase === "finished"
                        ? void start(true)
                        : void action("resume")
                    }
                  >
                    {phase === "finished"
                      ? "ONE MORE MATCH"
                      : phase === "halfTime"
                        ? "SECOND HALF"
                        : "BACK TO THE MATCH"}
                    <span>→</span>
                  </button>
                  {phase === "finished" ? (
                    <button
                      className="text-button"
                      onClick={() => {
                        connectionGeneration.current++;
                        socket.current?.close();
                        state.set({ screen: "select", network: "" });
                        setSetup(match.setup);
                      }}
                    >
                      Change team
                    </button>
                  ) : (
                    <div className="pause-links">
                      <button onClick={() => openPanel("controls")}>
                        Controls
                      </button>
                      <button onClick={() => openPanel("settings")}>
                        Settings
                      </button>
                      <button onClick={() => setConfirm("restart")}>
                        Restart
                      </button>
                      <button onClick={() => setConfirm("menu")}>
                        Main menu
                      </button>
                    </div>
                  )}
                </section>
              </div>
            )}
        </>
      )}
      {panel && (
        <div className="modal-scrim">
          <section className="settings-modal">
            <button
              className="close"
              aria-label="Close panel"
              onClick={() => {
                setPanel(null);
                setBinding(null);
              }}
            >
              ×
            </button>
            <div className="eyebrow">MAKE YOURSELF AT HOME</div>
            <h2>
              {panel === "settings"
                ? "Just how you like it."
                : "A few good moves."}
            </h2>
            {panel === "controls" ? (
              <>
                <p>One player at a time. Your teammates do the rest.</p>
                <div className="control-list">
                  {[
                    ["Move", "W A S D / Arrows", "Left stick"],
                    ["Sprint", "Shift", "Right trigger"],
                    ["Pass / Tackle", "J", "A"],
                    ["Hold & release to shoot", "K", "X"],
                    ["Switch player", "L", "Left bumper"],
                    ["Pause", "Escape", "Menu"],
                  ].map(([a, b, c]) => (
                    <div key={a}>
                      <span>{a}</span>
                      <kbd>{b}</kbd>
                      <small>{c}</small>
                    </div>
                  ))}
                </div>
                <p className="fine-print">
                  Aim towards a teammate to pass. Hold your shot for more power.
                  Press J to win the ball when defending.
                </p>
                <button className="primary" onClick={() => setPanel(null)}>
                  GOT IT <span>✓</span>
                </button>
              </>
            ) : (
              <>
                <div className="settings-grid">
                  <label>
                    GRAPHICS
                    <select
                      value={draft.quality}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          quality: e.target.value as Settings["quality"],
                        })
                      }
                    >
                      {["auto", "low", "medium", "high"].map((q) => (
                        <option key={q}>{q}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    RENDER SCALE <span>{draft.renderScale.toFixed(1)}×</span>
                    <input
                      type="range"
                      min=".5"
                      max="2"
                      step=".1"
                      value={draft.renderScale}
                      onChange={(e) =>
                        setDraft({ ...draft, renderScale: +e.target.value })
                      }
                    />
                  </label>
                  {(["master", "effects", "crowd"] as const).map((k) => (
                    <label key={k}>
                      {k.toUpperCase()} VOLUME
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step=".05"
                        value={draft[k]}
                        onChange={(e) =>
                          setDraft({ ...draft, [k]: +e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    TEXT SIZE
                    <input
                      type="range"
                      min=".8"
                      max="1.4"
                      step=".1"
                      value={draft.textScale}
                      onChange={(e) =>
                        setDraft({ ...draft, textScale: +e.target.value })
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.muted}
                      onChange={(e) =>
                        setDraft({ ...draft, muted: e.target.checked })
                      }
                    />{" "}
                    Mute audio
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.reducedMotion}
                      onChange={(e) =>
                        setDraft({ ...draft, reducedMotion: e.target.checked })
                      }
                    />{" "}
                    Reduced camera motion
                  </label>
                </div>
                <details>
                  <summary>Keyboard bindings</summary>
                  <div className="bindings">
                    {Object.entries(draft.bindings).map(([k, v]) => (
                      <button key={k} onClick={() => setBinding(k)}>
                        <span>{k}</span>
                        <kbd>
                          {binding === k
                            ? "Press a key…"
                            : v.replace("Key", "")}
                        </kbd>
                      </button>
                    ))}
                  </div>
                </details>
                <div className="modal-actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      if (document.fullscreenElement)
                        void document.exitFullscreen();
                      else void document.documentElement.requestFullscreen();
                    }}
                  >
                    Toggle fullscreen ↗
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void saveSettings()}
                  >
                    SAVE SETTINGS <span>✓</span>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-scrim confirmation">
          <section className="match-modal">
            <div className="eyebrow">LEAVE THIS MATCH?</div>
            <h2>
              {confirm === "restart" ? "A fresh start." : "Call it a day?"}
            </h2>
            <p>Your current match progress will be discarded.</p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void leave(confirm === "restart")}
            >
              {confirm === "restart" ? "RESTART MATCH" : "LEAVE MATCH"}
              <span>→</span>
            </button>
            <button className="text-button" onClick={() => setConfirm(null)}>
              Keep playing
            </button>
          </section>
        </div>
      )}
      {network && inMatch && (
        <div className="connection-banner" role="status">
          {network}
          <button
            onClick={async () => {
              try {
                await api("/control", "POST", {});
                connect(activeRef.current!);
              } catch (e) {
                fail(e);
              }
            }}
          >
            Take control / Reconnect
          </button>
        </div>
      )}
      {saveWarning && (
        <div className="save-warning" role="status">
          {saveWarning}
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button
            onClick={() => state.set({ error: "" })}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
