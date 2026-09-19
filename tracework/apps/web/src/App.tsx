import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
import {
  Search,
  ChevronDown,
  ArrowUpRight,
  Plus,
  FileText,
  Network,
  GitBranch,
  ShieldCheck,
  Package,
  FolderGit2,
  ScanLine,
  History,
  Settings2,
  PanelRightClose,
  Layers3,
  Check,
  ArrowRight,
  Menu,
  BookOpen,
  Inbox,
  X,
  ArrowLeft,
} from "lucide-react";
import { api, initSession, uid } from "./api";
import { Badge, Empty, Field, Inspector, ObjectForm } from "./components";
import {
  SourcesScreen,
  SourceDetail,
  ReviewsScreen,
  ModelScreen,
  ObjectDetail,
  DecisionsScreen,
  ArtifactsScreen,
  ArtifactDetail,
  RunsScreen,
  RunDetail,
  ValidationScreen,
  RepositoriesScreen,
  SettingsScreen,
  UploadForm,
  TaskForm,
} from "./screens";
import type {
  Workspace,
  ObjectRevision,
  Semantic,
  Snapshot,
  Version,
} from "../../../packages/contracts";
const CanvasScreen = lazy(() => import("./Canvas"));
export type Page =
  | "sources"
  | "model"
  | "canvas"
  | "glossary"
  | "decisions"
  | "guardrails"
  | "artifacts"
  | "repositories"
  | "validation"
  | "runs"
  | "reviews"
  | "settings";
type InspectorState = {
  kind:
    | "source"
    | "object"
    | "artifact"
    | "run"
    | "upload"
    | "task"
    | "create"
    | "edit";
  id?: string;
  objectKind?: Semantic["kind"];
  taskKind?: string;
  sourceVersionId?: string;
  evidenceId?: string;
} | null;
type AppState = {
  w: Workspace;
  data: any;
  health: any;
  historical: boolean;
  page: Page;
  setPage: (p: Page) => void;
  inspect: (i: InspectorState) => void;
  refresh: () => Promise<void>;
  request: <T = any>(
    path: string,
    method?: string,
    data?: unknown,
  ) => Promise<T>;
  notify: (message: string) => void;
  version: string;
  setVersion: (id: string) => void;
};
export const WorkbenchContext = createContext<AppState>(null!);
export const useWorkbench = () => useContext(WorkbenchContext);
const nav = [
  ["sources", "Sources", FileText],
  ["model", "Model", Network],
  ["decisions", "Decisions", GitBranch],
  ["guardrails", "Guardrails", ShieldCheck],
  ["artifacts", "Artifacts", Package],
  ["repositories", "Repositories", FolderGit2],
  ["validation", "Validation", ScanLine],
  ["runs", "Runs", History],
] as const;
const modePages: { name: string; page: Page; includes: Page[] }[] = [
  { name: "Discover", page: "sources", includes: ["sources", "repositories"] },
  {
    name: "Model",
    page: "model",
    includes: ["model", "canvas", "glossary", "reviews"],
  },
  { name: "Design", page: "decisions", includes: ["decisions", "guardrails"] },
  { name: "Generate", page: "artifacts", includes: ["artifacts"] },
  { name: "Validate", page: "validation", includes: ["validation", "runs"] },
];
export function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [wid, setWid] = useState(localStorage.getItem("tracework.workspace") ?? ""),
    [data, setData] = useState<any>(null),
    [health, setHealth] = useState<any>(null),
    [page, setPageState] = useState<Page>("sources"),
    [inspector, setInspector] = useState<InspectorState>(null),
    [version, setVersionState] = useState(""),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [showWorkspaces, setShowWorkspaces] = useState(false),
    [newWorkspace, setNewWorkspace] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [search, setSearch] = useState(""),
    [searchResults, setSearchResults] = useState<any[]>([]),
    [searchOpen, setSearchOpen] = useState(false);
  const [evidenceOptions, setEvidenceOptions] = useState<
    { id: string; label: string }[]
  >([]);
  useEffect(() => {
    if (!wid || !ready || !["create", "edit"].includes(inspector?.kind ?? ""))
      return;
    let cancelled = false;
    setEvidenceOptions([]);
    (async () => {
      const all: { id: string; label: string }[] = [];
      for (let offset = 0; !cancelled; offset += 200) {
        const page = await api(
          `/workspaces/${wid}/evidence/catalog?offset=${offset}`,
        );
        all.push(...page.items);
        if (all.length >= page.total) break;
      }
      if (!cancelled) setEvidenceOptions(all);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wid, ready, inspector?.kind]);
  const searchInput = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLElement>(null),
    workspaceTrigger = useRef<HTMLButtonElement>(null),
    modalOpener = useRef<HTMLElement | null>(null);
  const activeWid = useRef(wid),
    activeVersion = useRef(version);
  useEffect(() => {
    if (!newWorkspace) return;
    const trigger = modalOpener.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNewWorkspace(false);
      }
      if (event.key === "Tab") {
        const all = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button,input,textarea,select,[tabindex="0"]',
          ) ?? []),
        ].filter((e) => !e.hasAttribute("disabled"));
        const first = all[0],
          last = all.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (trigger?.isConnected) trigger.focus();
      else workspaceTrigger.current?.focus();
    };
  }, [newWorkspace]);
  const notify = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 5500);
  }, []);
  const refresh = useCallback(async () => {
    const [ws, h] = await Promise.all([
      api<Workspace[]>("/workspaces"),
      api("/health"),
    ]);
    setWorkspaces(ws);
    setHealth(h);
    if (wid && ws.some((w) => w.id === wid)) {
      const d = await api(
        `/workspaces/${wid}/overview${version ? "?version=" + version : ""}`,
      );
      if (activeWid.current === wid && activeVersion.current === version)
        setData(d);
    } else if (ws.some((w) => w.status === "active")) {
      const next = ws.find((w) => w.status === "active")!;
      activeWid.current = next.id;
      setWid(next.id);
      localStorage.setItem("tracework.workspace", next.id);
    } else setData(null);
  }, [wid, version]);
  useEffect(() => {
    initSession()
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!ready) return;
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, [ready, refresh]);
  useEffect(() => {
    if (!wid || !search.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(
      () =>
        api(`/workspaces/${wid}/evidence?q=${encodeURIComponent(search)}`)
          .then(setSearchResults)
          .catch(() => {}),
      250,
    );
    return () => clearTimeout(timer);
  }, [search, wid]);
  const request = useCallback(
    async <T,>(path: string, method = "GET", value?: unknown): Promise<T> => {
      try {
        const result = await api<T>(`/workspaces/${wid}${path}`, method, value);
        if (method !== "GET") await refresh();
        return result;
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [wid, refresh],
  );
  const switchWorkspace = (id: string) => {
    activeWid.current = id;
    activeVersion.current = "";
    setWid(id);
    localStorage.setItem("tracework.workspace", id);
    setData(null);
    setVersionState("");
    setInspector(null);
    setShowWorkspaces(false);
  };
  const setPage = (p: Page) => {
    setPageState(p);
    setInspector(null);
    setMobileNav(false);
  };
  const setVersion = (id: string) => {
    activeVersion.current = id;
    setVersionState(id);
    setInspector(null);
  };
  const activeMode =
    modePages.find((m) => m.includes.includes(page))?.name ?? "Discover";
  async function example() {
    try {
      const r = await api("/demo", "POST", {});
      switchWorkspace(r.workspaceId);
      notify("Preparing a labelled example workspace…");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // A seed job returns the new workspace; follow it once, without hiding real workspaces.
  useEffect(() => {
    const r = data?.runs?.find(
      (r: any) =>
        r.kind === "demo-seed" && r.status === "completed" && r.result?.id,
    );
    if (r && data.workspace.name === "Preparing example")
      switchWorkspace(r.result.id);
  }, [data]);
  const w = data?.workspace as Workspace | undefined;
  const historical = !!version && version !== w?.headId;
  const pending =
    data?.proposals?.filter((p: any) => p.status === "pending").length ?? 0;
  const context = w
    ? {
        w,
        data,
        health,
        historical,
        page,
        setPage,
        inspect: setInspector,
        refresh,
        request,
        notify,
        version,
        setVersion,
      }
    : null;
  function content() {
    switch (page) {
      case "sources":
        return <SourcesScreen />;
      case "model":
      case "glossary":
        return <ModelScreen glossary={page === "glossary"} />;
      case "canvas":
        return (
          <Suspense
            fallback={
              <Empty title="Loading the canvas…">
                The accepted model remains available in the table.
              </Empty>
            }
          >
            <CanvasScreen />
          </Suspense>
        );
      case "reviews":
        return <ReviewsScreen />;
      case "decisions":
      case "guardrails":
        return <DecisionsScreen guardrails={page === "guardrails"} />;
      case "artifacts":
        return <ArtifactsScreen />;
      case "validation":
        return <ValidationScreen />;
      case "repositories":
        return <RepositoriesScreen />;
      case "runs":
        return <RunsScreen />;
      case "settings":
        return <SettingsScreen onWorkspaceChange={switchWorkspace} />;
    }
  }
  const edited = inspector?.id
    ? data?.context.objects.find((o: ObjectRevision) => o.id === inspector.id)
    : undefined;
  async function saveObject(value: Semantic, reason: string) {
    await request("/context", "POST", {
      expectedContextVersionId: w!.headId,
      idempotencyKey: uid(),
      reason,
      operations: [
        edited
          ? { id: uid(), action: "update", targetId: edited.id, value }
          : { id: uid(), action: "create", localId: uid(), value },
      ],
    });
    setInspector(null);
    notify("Accepted as a new model version.");
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a className="brand" href="/" aria-label="Tracework home">
          <svg viewBox="0 0 32 32" width="29" height="29" aria-hidden="true">
            <path
              d="M6 8h20M16 8v18M8 16h16"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
            />
            <circle cx="16" cy="26" r="2" fill="currentColor" />
          </svg>
          <span>
            tracework<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-switch">
          <button
            ref={workspaceTrigger}
            aria-expanded={showWorkspaces}
            onClick={() => setShowWorkspaces(!showWorkspaces)}
          >
            <span className="workspace-avatar">
              {w?.name.slice(0, 1) || "W"}
            </span>
            <span className="workspace-name">
              {w?.name ?? "Your workspaces"}
              <small>
                {w?.example ? "Example workspace" : "Local workspace"}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          {showWorkspaces && (
            <div className="workspace-menu">
              {workspaces.map((ws) => (
                <button key={ws.id} onClick={() => switchWorkspace(ws.id)}>
                  {ws.name}
                  {ws.status === "archived" && <small>Archived</small>}
                </button>
              ))}
              <button
                onClick={(event) => {
                  modalOpener.current = event.currentTarget;
                  setNewWorkspace(true);
                  setShowWorkspaces(false);
                }}
              >
                <Plus size={14} /> New workspace
              </button>
              <button onClick={example}>Open repair-service example</button>
            </div>
          )}
        </div>
        <nav aria-label="Workspace navigation">
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              aria-current={page === key ? "page" : undefined}
              onClick={() => setPage(key)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === "sources" && data && (
                <small>{data.sources.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-review">
          <button
            className={page === "reviews" ? "active" : ""}
            onClick={() => setPage("reviews")}
          >
            <Inbox size={18} />
            <span>Review queue</span>
            <b>{pending}</b>
          </button>
          <p>
            Proposed by AI.
            <br />
            Accepted by you.
          </p>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setPage("settings")}>
            <Settings2 size={17} /> Workspace settings
          </button>
          <div className="local-status">
            <span />
            <span>
              Saved on this machine
              <small>
                {health?.ai ? "AI connection configured" : "AI setup needed"}
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="workspace-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{w?.name ?? "Welcome"}</strong>
          </div>
          <div className={`global-search ${searchOpen ? "search-open" : ""}`}>
            <button
              className="icon-button search-toggle"
              aria-label="Open workspace search"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen(true);
                searchInput.current?.focus();
              }}
            >
              <Search size={16} />
            </button>
            <input
              ref={searchInput}
              aria-label="Search workspace evidence"
              placeholder="Search evidence, concepts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {(search || searchOpen) && (
              <button
                className="icon-button"
                aria-label="Close search"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
              >
                <X size={14} />
              </button>
            )}
            {search && (
              <div className="search-results">
                {searchResults.length ? (
                  searchResults.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={async () => {
                        if (r.kind === "evidence") {
                          const e = await request<any>("/evidence/" + r.id);
                          setInspector({
                            kind: "source",
                            id: e.sourceId,
                            sourceVersionId: e.sourceVersionId,
                            evidenceId: e.id,
                          });
                          setPageState("sources");
                        } else {
                          const o = data.context.objects.find(
                            (o: any) => o.revisionId === r.id,
                          );
                          if (o) {
                            setInspector({ kind: "object", id: o.id });
                            setPageState("model");
                          } else {
                            const snapshot = await request<any>(
                              "/context/" + r.versionId,
                            );
                            const original = snapshot.objects.find(
                              (o: any) => o.revisionId === r.id,
                            );
                            if (original) {
                              const overview = await request<any>(
                                "/overview?version=" + r.versionId,
                              );
                              activeVersion.current = r.versionId;
                              setVersionState(r.versionId);
                              setData(overview);
                              setInspector({ kind: "object", id: original.id });
                              setPageState("model");
                            }
                          }
                        }
                        setSearch("");
                      }}
                    >
                      <Badge>{r.kind}</Badge>
                      <span>{r.excerpt}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))
                ) : (
                  <p>No matching evidence. Try another term.</p>
                )}
              </div>
            )}
          </div>
          <button
            className="review-top"
            aria-label={`Review queue, ${pending} pending`}
            onClick={() => setPage("reviews")}
          >
            <Inbox size={16} />
            <span>Review</span>
            <b>{pending}</b>
          </button>
        </header>
        {w && (
          <div className="modebar">
            <nav aria-label="Product mode">
              {modePages.map((m) => (
                <button
                  key={m.name}
                  className={activeMode === m.name ? "active" : ""}
                  aria-current={activeMode === m.name ? "page" : undefined}
                  onClick={() => setPage(m.page)}
                >
                  {m.name}
                </button>
              ))}
            </nav>
            <label className="version-switch">
              <span className="accepted-dot" />
              <select
                aria-label="Accepted context version"
                value={version || w.headId}
                onChange={(e) =>
                  setVersion(e.target.value === w.headId ? "" : e.target.value)
                }
              >
                {data.versions.map((v: Version) => (
                  <option key={v.id} value={v.id}>
                    {v.id === w.headId ? "Accepted" : "Historical"} v
                    {v.sequence}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </label>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="toast">
            <Check size={16} />
            {notice}
          </div>
        )}
        {historical && (
          <div className="history-banner">
            <History size={16} /> Viewing accepted version{" "}
            {data.context.version.sequence}. Historical meaning is read-only.
            <button onClick={() => setVersion("")}>Return to current</button>
          </div>
        )}
        {!w ? (
          <main id="main" className="welcome">
            <div className="welcome-mark">
              <Network size={40} />
            </div>
            <h1>
              From scattered information
              <br />
              to a shared understanding.
            </h1>
            <p>
              Bring your sources together. Review the meaning.
              <br />
              Build a solution you can trace back to the evidence.
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={(event) => {
                  modalOpener.current = event.currentTarget;
                  setNewWorkspace(true);
                }}
              >
                <Plus size={17} />
                Create a workspace
              </button>
              <button onClick={example}>
                Explore the example <ArrowRight size={16} />
              </button>
            </div>
            <div className="welcome-note">
              <ShieldCheck size={18} />
              <p>
                Your work stays on this machine.
                <br />
                <span>You choose which sources can be sent to OpenAI.</span>
              </p>
            </div>
          </main>
        ) : (
          <WorkbenchContext.Provider value={context!}>
            <div className={`work-area ${inspector ? "with-inspector" : ""}`}>
              <main
                id="main"
                className={`main-pane ${page === "canvas" ? "canvas-main" : ""}`}
              >
                {content()}
              </main>
              {inspector && (
                <Inspector
                  key={`${inspector.kind}-${inspector.id ?? inspector.objectKind ?? inspector.taskKind ?? ""}`}
                  title={
                    inspector.kind === "upload"
                      ? "Add sources"
                      : inspector.kind === "task"
                        ? "Scope an AI task"
                        : inspector.kind === "create"
                          ? `New ${inspector.objectKind ?? "element"}`
                          : inspector.kind === "edit"
                            ? "Edit accepted meaning"
                            : inspector.kind === "source"
                              ? "Source inspector"
                              : inspector.kind === "artifact"
                                ? "Artifact inspector"
                                : inspector.kind === "run"
                                  ? "Run activity"
                                  : "Model inspector"
                  }
                  onClose={() => setInspector(null)}
                >
                  {inspector.kind === "source" && (
                    <SourceDetail
                      key={`${inspector.id}-${inspector.sourceVersionId ?? ""}-${inspector.evidenceId ?? ""}`}
                      sourceId={inspector.id!}
                      initialVersionId={inspector.sourceVersionId}
                      evidenceId={inspector.evidenceId}
                    />
                  )}{" "}
                  {inspector.kind === "object" && (
                    <ObjectDetail key={inspector.id} objectId={inspector.id!} />
                  )}{" "}
                  {inspector.kind === "artifact" && (
                    <ArtifactDetail
                      key={inspector.id}
                      artifactId={inspector.id!}
                    />
                  )}{" "}
                  {inspector.kind === "run" && (
                    <RunDetail key={inspector.id} runId={inspector.id!} />
                  )}{" "}
                  {inspector.kind === "upload" && (
                    <UploadForm sourceId={inspector.id} />
                  )}{" "}
                  {inspector.kind === "task" && (
                    <TaskForm
                      key={inspector.taskKind}
                      kind={inspector.taskKind ?? "interpretation"}
                    />
                  )}{" "}
                  {(inspector.kind === "create" ||
                    inspector.kind === "edit") && (
                    <ObjectForm
                      key={inspector.id ?? inspector.objectKind}
                      draftKey={`tracework.form.${w!.id}.${edited?.revisionId ?? "new"}.${inspector.objectKind ?? edited?.kind ?? "element"}`}
                      object={edited}
                      kind={inspector.objectKind}
                      objects={data.context.objects}
                      evidenceOptions={evidenceOptions}
                      onSave={saveObject}
                      onCancel={() => setInspector(null)}
                    />
                  )}
                </Inspector>
              )}
            </div>
          </WorkbenchContext.Provider>
        )}
        <footer className="statusbar">
          <span>
            <span className="tiny-dot" /> Local workspace
          </span>
          <span>
            {data
              ? `${data.context.objects.filter((o: any) => o.kind === "element").length} accepted elements · ${pending} pending reviews`
              : "Tracework"}
            <span className="status-divider">/</span>Evidence before assumptions
          </span>
        </footer>
      </div>
      {newWorkspace && (
        <div className="sheet-backdrop">
          <section
            ref={dialog}
            className="creation-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Create workspace"
          >
            <div className="inspector-heading">
              <h2>Create a workspace</h2>
              <button
                className="icon-button"
                aria-label="Close create workspace"
                onClick={() => setNewWorkspace(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p>Give this solution a place to take shape.</p>
            <form
              className="stack-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  const w = await api<Workspace>("/workspaces", "POST", {
                    name: f.get("name"),
                    description: f.get("description"),
                  });
                  setNewWorkspace(false);
                  switchWorkspace(w.id);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Field label="Workspace name">
                <input
                  autoFocus
                  name="name"
                  required
                  maxLength={160}
                  placeholder="e.g. Community lending service"
                />
              </Field>
              <Field label="Description">
                <textarea
                  name="description"
                  rows={3}
                  placeholder="What are you trying to understand or build?"
                />
              </Field>
              <button className="primary">
                Create workspace <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
