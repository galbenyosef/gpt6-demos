import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Upload,
  FileText,
  Check,
  Clock,
  ChevronRight,
  ChevronDown,
  Network,
  BookOpen,
  Table2,
  GitBranch,
  ShieldCheck,
  Package,
  Download,
  Play,
  RefreshCw,
  X,
  Search,
  AlertTriangle,
  Link2,
  History,
  FolderGit2,
  MessageSquare,
  Layers3,
  Braces,
  ExternalLink,
  Pencil,
  Archive,
} from "lucide-react";
import { api, uid } from "./api";
import { useWorkbench } from "./App";
import {
  Badge,
  Empty,
  Field,
  SectionTitle,
  SourceIcon,
  ObjectForm,
  typeIcon,
  useDraftState,
  clearDraft,
} from "./components";
import { elementTypes } from "../../../packages/contracts";
import type {
  Source,
  SourceVersion,
  Evidence,
  ObjectRevision,
  Proposal,
  Operation,
  Semantic,
  Artifact,
  Finding,
  Run,
} from "../../../packages/contracts";
const tone = (v: string) =>
  ["accepted", "ready", "pass", "completed", "public"].includes(v)
    ? "green"
    : [
          "pending",
          "warn",
          "stale",
          "inferred",
          "awaiting-approval",
          "interrupted",
        ].includes(v)
      ? "amber"
      : ["block", "failed", "restricted"].includes(v)
        ? "red"
        : "neutral";
const label = (v: string) => v.replace(/-/g, " ");
const date = (v: string) =>
  new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" });
function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function AIButton({
  kind,
  children,
}: {
  kind: string;
  children: React.ReactNode;
}) {
  const { health, inspect, historical } = useWorkbench();
  return (
    <span
      title={
        !health?.ai
          ? "Set OPENAI_API_KEY on the server to enable AI tasks"
          : undefined
      }
    >
      <button
        className="primary"
        disabled={!health?.ai || historical}
        onClick={() => inspect({ kind: "task", taskKind: kind })}
      >
        <Layers3 size={16} />
        {children}
      </button>
    </span>
  );
}
function EvidenceLinks({ ids }: { ids: string[] }) {
  const { request, inspect } = useWorkbench();
  return (
    <div className="evidence-links">
      {ids.slice(0, 12).map((eid, i) => (
        <button
          key={eid}
          onClick={async () => {
            const e = await request<any>("/evidence/" + eid);
            inspect({
              kind: "source",
              id: e.sourceId,
              sourceVersionId: e.sourceVersionId,
              evidenceId: e.id,
            });
          }}
        >
          <Link2 size={13} /> Evidence {i + 1}
          <ArrowUpRight size={12} />
        </button>
      ))}
    </div>
  );
}
function AIAvailability() {
  const { health } = useWorkbench();
  return !health?.ai ? (
    <div className="inline-note">
      <Layers3 size={17} />
      <span>
        AI is not connected. Add an OpenAI key on the server to interpret
        sources or ask questions. Manual work is available.
      </span>
    </div>
  ) : null;
}
export function SourcesScreen() {
  const { data, inspect, setPage, w, request, notify } = useWorkbench();
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const sources = (data.sources as Source[]).filter(
    (s) =>
      (filter === "all" || s.classification === filter) &&
      s.name.toLowerCase().includes(query.toLowerCase()) &&
      s.status === "active",
  );
  const pending = data.proposals.filter(
    (p: Proposal) => p.status === "pending",
  );
  return (
    <>
      <PageHeading
        title="Start with what you know."
        description="Bring the evidence together. Let a clear picture emerge."
      >
        <button onClick={() => inspect({ kind: "upload" })}>
          <Plus size={16} /> Add sources
        </button>
        <AIButton kind="interpretation">Interpret sources</AIButton>
      </PageHeading>
      {w.example && (
        <div className="example-banner">
          <span className="example-icon">
            <BookOpen size={20} />
          </span>
          <div>
            <strong>A repair service, from brief to blueprint.</strong>
            <p>
              Explore a fictional neighborhood project. Its account-versus-guest
              conflict is intentional.
            </p>
          </div>
          <Badge>Example checkpoint</Badge>
        </div>
      )}
      {pending.length > 0 && (
        <button className="review-callout" onClick={() => setPage("reviews")}>
          <div className="review-callout-icon">
            <GitBranch size={21} />
          </div>
          <div>
            <strong>{pending[0].title}</strong>
            <p>
              {pending[0].critic[0] ?? "A proposal is ready for your review."}
            </p>
          </div>
          <span>
            <Badge tone="amber">{pending.length} pending</Badge>
            <ArrowRight size={18} />
          </span>
        </button>
      )}
      <div className="source-layout">
        <section className="source-collection">
          <div className="collection-toolbar">
            <div className="segmented" aria-label="Source classification">
              {["all", "public", "internal", "restricted"].map((f) => (
                <button
                  key={f}
                  className={filter === f ? "active" : ""}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All sources" : label(f)}
                  {f === "all" && (
                    <span>
                      {
                        data.sources.filter(
                          (s: Source) => s.status === "active",
                        ).length
                      }
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="local-search">
              <Search size={15} />
              <input
                aria-label="Filter source names"
                placeholder="Filter sources"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {sources.length ? (
            <div className="table-scroll">
              <table className="source-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Authority</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => {
                    const versions = data.sourceVersions.filter(
                      (v: SourceVersion) => v.sourceId === source.id,
                    );
                    const latest =
                      versions.find(
                        (v: SourceVersion) => v.id === source.latestVersionId,
                      ) ?? versions[0];
                    return (
                      <tr key={source.id}>
                        <td>
                          <button
                            className="source-name"
                            onClick={() =>
                              inspect({ kind: "document", id: source.id })
                            }
                          >
                            <SourceIcon kind={source.kind} />
                            <span>
                              <strong>{source.name}</strong>
                              <small>
                                {source.classification} <span>·</span> Version{" "}
                                {latest?.ordinal ?? 1}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className={`authority ${source.authority}`}>
                            <span />
                            {source.authority}
                          </span>
                        </td>
                        <td>
                          <Badge tone={tone(latest?.status ?? "queued")}>
                            {latest?.status ?? "queued"}
                          </Badge>
                        </td>
                        <td className="muted">{date(source.createdAt)}</td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Inspect ${source.name}`}
                            onClick={() =>
                              inspect({ kind: "source", id: source.id })
                            }
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={
                query
                  ? "No matching sources"
                  : "Your solution starts with a source."
              }
              action={
                <button onClick={() => inspect({ kind: "upload" })}>
                  <Upload size={16} />
                  Upload a document
                </button>
              }
            >
              Add a brief, stakeholder notes, a contract, or repository
              evidence.
            </Empty>
          )}
          <button
            className="upload-strip"
            onClick={() => inspect({ kind: "upload" })}
          >
            <Upload size={17} />
            <strong>Add another point of view</strong>
            <span>PDF, DOCX, Markdown, text, JSON, YAML, CSV, HTML</span>
            <Plus size={16} />
          </button>
          <div className="collection-footer">
            <span>{sources.length} sources in view</span>
            <span>
              <ShieldCheck size={13} /> Originals and citations are preserved
            </span>
          </div>
        </section>
        <aside className="discovery-notes">
          <h2>From evidence to meaning</h2>
          <ol className="workflow">
            <li>
              <span className="step-icon">
                <FileText size={17} />
              </span>
              <div>
                <strong>Collect the sources</strong>
                <p>
                  Keep the original. Check the extraction. Know whose view it
                  represents.
                </p>
              </div>
            </li>
            <li>
              <span className="step-icon">
                <Layers3 size={17} />
              </span>
              <div>
                <strong>Interpret a scope</strong>
                <p>
                  Find concepts, requirements, and questions—with evidence
                  attached.
                </p>
              </div>
            </li>
            <li>
              <span className="step-icon">
                <Check size={17} />
              </span>
              <div>
                <strong>Make it accepted</strong>
                <p>
                  Review what changes. You decide what becomes part of the
                  model.
                </p>
              </div>
            </li>
          </ol>
          <div className="note-divider" />
          <h3>Uncertainty belongs here.</h3>
          <p>
            Contradictions are useful signals. Keep the question visible until a
            decision resolves it.
          </p>
          <button className="text-button" onClick={() => setPage("model")}>
            Explore the accepted model <ArrowRight size={14} />
          </button>
        </aside>
      </div>
      <AIAvailability />
    </>
  );
}
export function UploadForm({ sourceId }: { sourceId?: string }) {
  const { request, notify, inspect } = useWorkbench();
  const [files, setFiles] = useState<File[]>([]),
    [classification, setClassification] = useState("internal"),
    [authority, setAuthority] = useState("supporting"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="stack-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          for (const file of files) {
            const form = new FormData();
            form.set("file", file);
            form.set("classification", classification);
            form.set("authority", authority);
            await request(
              `/sources${sourceId ? "/" + sourceId + "/versions" : ""}`,
              "POST",
              form,
            );
          }
          notify("Originals saved. Extraction is queued.");
          inspect(null);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        {sourceId
          ? "Upload a replacement. The prior ready version remains available if extraction fails."
          : "Original files stay immutable. You can inspect the extraction before using it."}
      </p>
      <label className="file-drop">
        <Upload size={28} />
        <strong>
          {files.length
            ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
            : "Choose source files"}
        </strong>
        <span>Up to 25 MiB per document</span>
        <input
          required
          type="file"
          multiple={!sourceId}
          accept=".pdf,.docx,.md,.txt,.json,.yaml,.yml,.csv,.html,.htm"
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
        />
      </label>
      {files.map((f) => (
        <span className="small" key={f.name}>
          {f.name}
        </span>
      ))}
      <Field label="Classification">
        <select
          value={classification}
          onChange={(e) => setClassification(e.target.value)}
        >
          <option>internal</option>
          <option>public</option>
          <option>restricted</option>
        </select>
      </Field>
      <p className="muted small">
        Internal sources need workspace permission before AI submission.
        Restricted sources stay available for local work only.
      </p>
      <Field label="Authority">
        <select
          value={authority}
          onChange={(e) => setAuthority(e.target.value)}
        >
          <option>supporting</option>
          <option>authoritative</option>
          <option>informal</option>
        </select>
      </Field>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy || !files.length}>
        {busy ? "Saving originals…" : "Upload and extract"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
export function SourceDetail({
  sourceId,
  initialVersionId,
  evidenceId,
}: {
  sourceId: string;
  initialVersionId?: string;
  evidenceId?: string;
}) {
  const { request, data, inspect, notify } = useWorkbench();
  const [sourceData, setSourceData] = useState<any>(null),
    [vid, setVid] = useState(initialVersionId ?? ""),
    [page, setPage] = useState(0),
    [reclassify, setReclassify] = useState(false);
  useEffect(() => {
    request("/sources/" + sourceId + (vid ? "?version=" + vid : ""))
      .then((result: any) => {
        setSourceData(result);
        if (evidenceId) {
          const index = result.evidence.findIndex(
            (e: Evidence) => e.id === evidenceId,
          );
          if (index >= 0) setPage(Math.floor(index / 10));
        }
      })
      .catch(() => {});
  }, [sourceId, vid, data.sourceVersions.map((v: any) => v.status).join(",")]);
  if (!sourceData) return <p className="inspector-body">Loading source…</p>;
  const { source, versions, evidence, dependents } = sourceData;
  const version =
    versions.find((v: any) => v.id === (vid || source.latestVersionId)) ??
    versions[0];
  return (
    <div className="inspector-body">
      <SourceIcon kind={source.kind} />
      <h3>{source.name}</h3>
      <div className="badge-row">
        <Badge tone={tone(source.classification)}>
          {source.classification}
        </Badge>
        <Badge>{source.authority}</Badge>
      </div>
      <Field label="Source version">
        <select
          value={version?.id}
          onChange={(e) => {
            setVid(e.target.value);
            setPage(0);
          }}
        >
          {versions.map((v: any) => (
            <option key={v.id} value={v.id}>
              Version {v.ordinal} · {v.status}
            </option>
          ))}
        </select>
      </Field>
      {version?.error && (
        <p role="alert" className="error-text">
          {version.error}
        </p>
      )}
      {version?.warnings?.map((warning: string) => (
        <p className="small muted" key={warning}>
          {warning}
        </p>
      ))}
      <div className="button-row">
        <button
          className="primary"
          onClick={() =>
            inspect({
              kind: "document",
              id: source.id,
              sourceVersionId: version?.id,
            })
          }
        >
          <BookOpen size={14} /> Open document
        </button>
        <a
          className="button"
          href={`/api/workspaces/${source.workspaceId}/sources/${source.id}/original?version=${version?.id}`}
        >
          <Download size={14} />
          Original
        </a>
        <button onClick={() => inspect({ kind: "upload", id: source.id })}>
          <RefreshCw size={14} />
          Replace
        </button>
      </div>
      <button
        className="text-button"
        onClick={() => setReclassify(!reclassify)}
      >
        Edit classification and authority
      </button>
      {reclassify && (
        <form
          className="stack-form compact-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await request("/sources/" + source.id, "PATCH", {
              classification: f.get("classification"),
              authority: f.get("authority"),
              reason: f.get("reason"),
            });
            setReclassify(false);
            setSourceData(await request("/sources/" + source.id));
            notify("Source policy updated and audited.");
          }}
        >
          <Field label="Classification">
            <select name="classification" defaultValue={source.classification}>
              <option>public</option>
              <option>internal</option>
              <option>restricted</option>
            </select>
          </Field>
          <Field label="Authority">
            <select name="authority" defaultValue={source.authority}>
              <option>authoritative</option>
              <option>supporting</option>
              <option>informal</option>
            </select>
          </Field>
          <Field label="Reason">
            <input name="reason" required />
          </Field>
          <button>Save policy</button>
        </form>
      )}
      <SectionTitle title="Extracted evidence">
        <span>{evidence.length} passages</span>
      </SectionTitle>
      {evidence.slice(page * 10, (page + 1) * 10).map((e: Evidence) => (
        <div
          className="evidence-passage"
          key={e.id}
          aria-label={e.id === evidenceId ? "Selected citation" : undefined}
        >
          <span className="locator">
            {e.locator.kind === "page"
              ? `Page ${e.locator.page}`
              : e.locator.kind === "pointer"
                ? e.locator.pointer
                : e.locator.kind === "csv"
                  ? `Row ${e.locator.row} · ${e.locator.column}`
                  : e.locator.kind === "block"
                    ? e.locator.block
                    : `Lines ${e.locator.start}–${e.locator.end}`}
          </span>
          <p>{e.excerpt}</p>
          <details>
            <summary>Citation identity</summary>
            <code>{e.id}</code>
            <small>SHA-256 {e.hash}</small>
          </details>
        </div>
      ))}
      {evidence.length > 10 && (
        <div className="button-row">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            {page + 1} / {Math.ceil(evidence.length / 10)}
          </span>
          <button
            disabled={(page + 1) * 10 >= evidence.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      <SectionTitle title="Accepted dependents" />
      {dependents.length ? (
        dependents.map((o: ObjectRevision) => (
          <button
            className="inspector-link"
            key={o.id}
            onClick={() => inspect({ kind: "object", id: o.id })}
          >
            <span>{o.name}</span>
            <ArrowUpRight size={14} />
          </button>
        ))
      ) : (
        <p className="muted small">
          No accepted concept cites this source yet.
        </p>
      )}
      <SectionTitle title="Change impact" />
      <p className="muted small">
        {sourceData.impacts.length} declared dependencies are reachable from
        this source.
      </p>
      {sourceData.impacts.slice(-6).map((p: any) => (
        <p key={p.objectId} className="small">
          {p.name}
        </p>
      ))}
    </div>
  );
}
export function TaskForm({ kind }: { kind: string }) {
  const { w, data, health, request, inspect, notify } = useWorkbench();
  const [selected, setSelected] = useState<string[]>([]),
    [objects, setObjects] = useState<string[]>([]),
    [artifacts, setArtifacts] = useState<string[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [artifactKind, setArtifactKind] = useState("specification"),
    [proposalId, setProposalId] = useState("");
  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  return (
    <form
      className="stack-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await request<any>("/agent-runs", "POST", {
            kind,
            sourceVersionIds: selected,
            elementIds: objects,
            inputArtifactIds: artifacts,
            question,
            expectedContextVersionId: w.headId,
            ...(kind === "artifact" ? { artifactKind } : {}),
            ...(proposalId ? { proposalId } : {}),
          });
          inspect({ kind: "run", id: r.id });
          notify("Task queued with your selected scope.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Badge>{label(kind)}</Badge>
      <p>
        Choose the evidence and accepted objects for this run. AI results remain
        drafts until you review them.
      </p>
      {!health.ai && (
        <p className="error-text">
          Add OPENAI_API_KEY on the server before starting.
        </p>
      )}
      <fieldset>
        <legend>Ready source versions</legend>
        {data.sources
          .filter((s: Source) => s.latestVersionId && s.status === "active")
          .map((s: Source) => (
            <label className="check-row" key={s.id}>
              <input
                type="checkbox"
                disabled={
                  s.classification === "restricted" ||
                  (s.classification === "internal" &&
                    !w.settings.allowInternalAI)
                }
                checked={selected.includes(s.latestVersionId!)}
                onChange={() =>
                  setSelected(toggle(selected, s.latestVersionId!))
                }
              />
              <span>
                {s.name}
                <small>
                  {s.classification}
                  {s.classification === "internal" &&
                  !w.settings.allowInternalAI
                    ? " · permission needed"
                    : ""}
                </small>
              </span>
            </label>
          ))}
      </fieldset>
      <details>
        <summary>Accepted model scope ({objects.length} selected)</summary>
        <fieldset>
          {data.context.objects.map((o: ObjectRevision) => (
            <label className="check-row" key={o.id}>
              <input
                type="checkbox"
                checked={objects.includes(o.id)}
                onChange={() => setObjects(toggle(objects, o.id))}
              />
              <span>
                {o.name}
                <small>{o.kind === "element" ? o.type : o.kind}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </details>
      {["artifact", "code"].includes(kind) && (
        <fieldset>
          <legend>Accepted input artifacts</legend>
          {data.artifacts
            .filter((a: Artifact) => a.review === "accepted")
            .map((a: Artifact) => (
              <label className="check-row" key={a.id}>
                <input
                  type="checkbox"
                  checked={artifacts.includes(a.id)}
                  onChange={() => setArtifacts(toggle(artifacts, a.id))}
                />
                {a.name}
              </label>
            ))}
        </fieldset>
      )}
      {kind === "code" && (
        <p className="small muted">
          Select exactly one bounded context and one accepted OpenAPI contract.
          Generation is limited to a Bun/TypeScript/SQLite service slice.
        </p>
      )}
      {kind === "artifact" && (
        <Field label="Artifact kind">
          <select
            value={artifactKind}
            onChange={(e) => setArtifactKind(e.target.value)}
          >
            {[
              "specification",
              "architecture-report",
              "openapi",
              "json-schema",
              "test-plan",
              "implementation-package",
              "validation-report",
            ].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
      )}
      {kind === "revision" && (
        <Field label="Proposal to revise">
          <select
            required
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
          >
            <option value="">Select proposal</option>
            {data.proposals
              .filter((p: Proposal) => p.status === "pending")
              .map((p: Proposal) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field
        label={
          kind === "question"
            ? "Your question"
            : "Additional direction (optional)"
        }
        hint="Free-form text is internal and uses the workspace submission policy."
      >
        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required={kind === "question"}
        />
      </Field>
      {!w.settings.allowInternalAI && question && (
        <p className="error-text">
          Enable internal submission in workspace settings, or remove the
          additional direction.
        </p>
      )}
      <p className="small muted">
        Selected content will be sent to OpenAI. Restricted sources are
        excluded. Accepted meaning cannot change during this run.
      </p>
      <button
        className="primary"
        disabled={
          busy || !health.ai || (!w.settings.allowInternalAI && !!question)
        }
      >
        {busy ? "Queuing…" : "Start " + label(kind)}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
export function ModelScreen({ glossary = false }: { glossary?: boolean }) {
  const { data, inspect, setPage, historical, request, version, w } =
    useWorkbench();
  const [type, setType] = useState("all"),
    [query, setQuery] = useState(""),
    [relationships, setRelationships] = useState(false),
    [comparison, setComparison] = useState<any>(null);
  const objects = data.context.objects as ObjectRevision[];
  const shown = objects
    .filter((o) =>
      glossary
        ? o.kind === "element" && o.type === "domain-concept"
        : relationships
          ? o.kind === "relationship"
          : o.kind === "element" && (type === "all" || o.type === type),
    )
    .filter((o) =>
      (o.name + " " + o.description)
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  return (
    <>
      <PageHeading
        title={
          glossary
            ? "Give the domain a shared language."
            : "The model, with its meaning intact."
        }
        description={`Accepted version ${data.context.version.sequence}. Every change is deliberate, every earlier version preserved.`}
      >
        <button onClick={() => setPage("canvas")}>
          <Network size={16} /> Canvas
        </button>
        <button
          className="primary"
          disabled={historical}
          onClick={() =>
            inspect({
              kind: "create",
              objectKind: relationships ? "relationship" : "element",
            })
          }
        >
          <Plus size={16} />{" "}
          {relationships ? "Add relationship" : "Add element"}
        </button>
      </PageHeading>
      <div className="model-tabs">
        <button
          className={!glossary ? "active" : ""}
          onClick={() => setPage("model")}
        >
          <Table2 size={16} />
          Object table
        </button>
        <button
          className={glossary ? "active" : ""}
          onClick={() => setPage("glossary")}
        >
          <BookOpen size={16} />
          Glossary
        </button>
        <button onClick={() => setPage("canvas")}>
          <Network size={16} />
          Context map
        </button>
        <button
          onClick={async () => {
            const parent = data.context.version.parentId;
            if (parent)
              setComparison(
                await request(
                  `/context/diff?from=${parent}&to=${data.context.version.id}`,
                ),
              );
          }}
          disabled={!data.context.version.parentId}
        >
          <History size={16} />
          Compare previous
        </button>
      </div>
      {comparison && (
        <div className="comparison-panel">
          <SectionTitle title={`${comparison.changes.length} changed objects`}>
            <button
              className="icon-button"
              aria-label="Close comparison"
              onClick={() => setComparison(null)}
            >
              <X size={15} />
            </button>
          </SectionTitle>
          {comparison.changes.map((c: any) => (
            <div className="diff-row" key={c.id}>
              <span>{c.before?.name ?? "—"}</span>
              <ArrowRight size={15} />
              <strong>{c.after?.name ?? "Superseded"}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="collection-toolbar">
        <div className="segmented">
          <button
            className={!relationships ? "active" : ""}
            onClick={() => setRelationships(false)}
          >
            Elements
          </button>
          <button
            className={relationships ? "active" : ""}
            onClick={() => setRelationships(true)}
          >
            Relationships
          </button>
        </div>
        <div className="filter-row">
          {!glossary && !relationships && (
            <select
              aria-label="Filter model type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">All types</option>
              {elementTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
          <div className="local-search">
            <Search size={15} />
            <input
              aria-label="Filter model objects"
              placeholder="Filter model"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>
      {shown.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{glossary ? "Term" : "Accepted object"}</th>
                <th>
                  {glossary
                    ? "Definition"
                    : relationships
                      ? "Endpoints"
                      : "Type"}
                </th>
                <th>Assertion</th>
                <th>Evidence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 150).map((o) => {
                const Icon = typeIcon("type" in o ? o.type : o.kind);
                return (
                  <tr key={o.id}>
                    <td>
                      <button
                        className="object-name"
                        onClick={() => inspect({ kind: "object", id: o.id })}
                      >
                        <span className="object-icon">
                          <Icon size={17} />
                        </span>
                        <span>
                          <strong>{o.name}</strong>
                          {glossary && o.kind === "element" && (
                            <small>{o.attributes.aliases?.join(", ")}</small>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="type-cell">
                      {glossary && o.kind === "element"
                        ? o.attributes.definition || o.description
                        : o.kind === "relationship"
                          ? `${objects.find((x) => x.id === o.from)?.name} → ${objects.find((x) => x.id === o.to)?.name}`
                          : "type" in o
                            ? label(o.type)
                            : o.kind}
                    </td>
                    <td>
                      <Badge tone={tone(o.assertion)}>
                        {label(o.assertion)}
                      </Badge>
                    </td>
                    <td>
                      {o.evidenceIds.length
                        ? `${o.evidenceIds.length} linked`
                        : "Human provenance"}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Inspect ${o.name}`}
                        onClick={() => inspect({ kind: "object", id: o.id })}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            glossary
              ? "Define your first domain term."
              : "No accepted objects in this view."
          }
          action={
            <button
              disabled={historical}
              onClick={() => inspect({ kind: "create", objectKind: "element" })}
            >
              <Plus size={15} />
              Add an element
            </button>
          }
        >
          Review a proposal or create an explicit human assumption to begin.
        </Empty>
      )}
      {shown.length > 150 && (
        <p className="small muted">
          Showing 150 of {shown.length} objects. Filter by type or name to
          narrow this view.
        </p>
      )}
    </>
  );
}
export function ObjectDetail({ objectId }: { objectId: string }) {
  const { data, inspect, historical, request, notify, w } = useWorkbench();
  const [removing, setRemoving] = useState(false),
    [reason, setReason] = useState("");
  const o = data.context.objects.find(
    (o: ObjectRevision) => o.id === objectId,
  ) as ObjectRevision | undefined;
  if (!o)
    return (
      <p className="inspector-body">
        This object is not active in the selected version.
      </p>
    );
  return (
    <div className="inspector-body">
      <Badge>{"type" in o ? label(o.type) : o.kind}</Badge>
      <h3>{o.name}</h3>
      <p>{o.description}</p>
      <div className="badge-row">
        <Badge tone={tone(o.assertion)}>{label(o.assertion)}</Badge>
        <Badge>{o.classification}</Badge>
      </div>
      {o.kind === "element" &&
        Object.entries(o.attributes).map(([key, value]) => (
          <div className="attribute" key={key}>
            <strong>
              {label(key.replace(/[A-Z]/g, (m) => " " + m.toLowerCase()))}
            </strong>
            <p>{Array.isArray(value) ? value.join(" · ") : String(value)}</p>
          </div>
        ))}
      {o.kind === "decision" && (
        <>
          <div className="attribute">
            <strong>Context</strong>
            <p>{o.context}</p>
          </div>
          <div className="attribute">
            <strong>Chosen option</strong>
            <p>{o.chosen}</p>
          </div>
          <div className="attribute">
            <strong>Alternatives</strong>
            {o.alternatives.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
          <div className="attribute">
            <strong>Consequences</strong>
            {o.consequences.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
          <div className="attribute">
            <strong>Risks</strong>
            {o.risks.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        </>
      )}
      {o.kind === "guardrail" && (
        <>
          <p>Evaluator: {o.evaluator}</p>
          <p>
            {o.enabled ? "Enabled" : "Disabled"} · {o.severity}
          </p>
        </>
      )}
      <SectionTitle title="Supporting evidence" />
      <EvidenceLinks ids={o.evidenceIds} />
      {!o.evidenceIds.length && (
        <p className="small muted">
          {o.evidenceException ||
            "Explicit human-authored assumption. No documentary evidence is claimed."}
        </p>
      )}
      <SectionTitle title="Relationships" />
      {data.context.objects
        .filter(
          (r: ObjectRevision) =>
            r.kind === "relationship" && (r.from === o.id || r.to === o.id),
        )
        .map((r: any) => (
          <button
            className="inspector-link"
            key={r.id}
            onClick={() => inspect({ kind: "object", id: r.id })}
          >
            <span>{r.name}</span>
            <ArrowUpRight size={13} />
          </button>
        ))}
      <div className="button-row">
        <button
          disabled={historical}
          onClick={() => inspect({ kind: "edit", id: o.id })}
        >
          <Pencil size={14} /> Edit meaning
        </button>
        <button disabled={historical} onClick={() => setRemoving(!removing)}>
          Supersede
        </button>
      </div>
      {removing && (
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await request("/context", "POST", {
              expectedContextVersionId: w.headId,
              idempotencyKey: uid(),
              reason,
              operations: [{ id: uid(), action: "supersede", targetId: o.id }],
            });
            inspect(null);
            notify("Object superseded in a new version.");
          }}
        >
          <p className="small muted">
            Explicitly supersede related relationships first; dangling
            references are blocked.
          </p>
          <Field label="Supersession reason">
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button>Confirm supersession</button>
        </form>
      )}
      <details className="technical-details">
        <summary>Revision identity</summary>
        <code>{o.id}</code>
        <code>{o.revisionId}</code>
        <p>{date(o.createdAt)}</p>
      </details>
    </div>
  );
}
export function ReviewsScreen() {
  const { data, w, request, notify, historical, inspect } = useWorkbench();
  const [pid, setPid] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState(
      "Reviewed the selected operations and their evidence.",
    ),
    [exception, setException] = useState<Record<string, string>>({}),
    [editId, setEditId] = useState(""),
    [showHistory, setShowHistory] = useState(false);
  const proposals = data.proposals.filter(
    (p: Proposal) => showHistory || p.status === "pending",
  );
  const p = (proposals.find((p: Proposal) => p.id === pid) ?? proposals[0]) as
    (Proposal & { freshness: string; checks: any[] }) | undefined;
  useEffect(() => {
    if (p) {
      setSelected(p.operations.map((o) => o.id));
      setException({});
      setEditId("");
    }
  }, [p?.id]);
  return (
    <>
      <PageHeading
        title="You decide what becomes true."
        description="Review the evidence, resolve uncertainty, and accept changes into the model."
      >
        <button onClick={() => setShowHistory(!showHistory)}>
          <History size={15} />
          {showHistory ? "Pending only" : "Review history"}
        </button>
        <AIButton kind="revision">Request revision</AIButton>
      </PageHeading>
      {!p ? (
        <Empty title="Nothing waiting for review.">
          Interpret selected sources to receive a proposal, or continue
          modelling by hand.
        </Empty>
      ) : (
        <div className="review-layout">
          <div className="proposal-list">
            {proposals.map((item: any) => (
              <button
                className={item.id === p.id ? "selected" : ""}
                key={item.id}
                onClick={() => setPid(item.id)}
              >
                <div>
                  <Badge tone={tone(item.status)}>{item.status}</Badge>
                  <small>{label(item.kind)}</small>
                </div>
                <strong>{item.title}</strong>
                <span>
                  {item.operations.length} operations <ChevronRight size={15} />
                </span>
              </button>
            ))}
          </div>
          <article className="proposal-detail">
            <div className="proposal-heading">
              <div>
                <Badge tone={tone(p.freshness)}>{p.freshness}</Badge>
                <h2>{p.title}</h2>
              </div>
              <Badge>Draft proposal</Badge>
            </div>
            <p>{p.rationale}</p>
            {p.critic.length > 0 && (
              <div className="critic-note">
                <MessageSquare size={18} />
                <div>
                  <strong>Critic’s advisory review</strong>
                  {p.critic.map((c, i) => (
                    <p key={i}>{c}</p>
                  ))}
                </div>
              </div>
            )}
            {p.checks
              .filter((c) => c.result === "block")
              .map((c) => (
                <p className="error-text" key={c.id}>
                  {c.message}
                </p>
              ))}
            <SectionTitle title="Proposed changes">
              <span>
                {selected.length} of {p.operations.length} selected
              </span>
            </SectionTitle>
            {p.operations.map((op) => (
              <div className="operation" key={op.id}>
                <div className="operation-header">
                  <label>
                    <input
                      aria-label={`Select operation ${op.action === "supersede" ? op.targetId : op.value.name}`}
                      type="checkbox"
                      checked={selected.includes(op.id)}
                      disabled={p.status !== "pending"}
                      onChange={() =>
                        setSelected(
                          selected.includes(op.id)
                            ? selected.filter((x) => x !== op.id)
                            : [...selected, op.id],
                        )
                      }
                    />
                    <Badge tone={op.action === "supersede" ? "red" : "green"}>
                      {op.action === "create"
                        ? "+ Add"
                        : op.action === "update"
                          ? "Edit"
                          : "Supersede"}
                    </Badge>
                    <strong>
                      {op.action === "supersede"
                        ? (data.context.objects.find(
                            (o: any) => o.id === op.targetId,
                          )?.name ?? op.targetId)
                        : op.value.name}
                    </strong>
                  </label>
                  {op.action !== "supersede" && p.status === "pending" && (
                    <button
                      className="icon-button"
                      aria-label={`Edit proposed ${op.value.name}`}
                      onClick={() => setEditId(editId === op.id ? "" : op.id)}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
                {op.action !== "supersede" && (
                  <>
                    <p>{op.value.description}</p>
                    <div className="badge-row">
                      <Badge>
                        {"type" in op.value
                          ? label(op.value.type)
                          : op.value.kind}
                      </Badge>
                      <Badge>{label(op.value.assertion)}</Badge>
                    </div>
                    <EvidenceLinks ids={op.value.evidenceIds} />
                    {op.value.assertion !== "human-assumed" &&
                      !op.value.evidenceIds.length && (
                        <Field label="Human evidence exception">
                          <input
                            value={exception[op.id] ?? ""}
                            onChange={(e) =>
                              setException({
                                ...exception,
                                [op.id]: e.target.value,
                              })
                            }
                            placeholder="Record why this can be accepted without documentary evidence"
                          />
                        </Field>
                      )}
                    {editId === op.id && (
                      <ObjectForm
                        draftKey={`tracework.proposal-form.${w.id}.${p.id}.${op.id}`}
                        object={{
                          ...op.value,
                          id: op.action === "create" ? op.localId : op.targetId,
                          revisionId: "draft",
                          workspaceId: w.id,
                          createdAt: p.createdAt,
                        }}
                        objects={data.context.objects}
                        onCancel={() => setEditId("")}
                        onSave={async (value, editReason) => {
                          const derived = await request<any>(
                            `/proposals/${p.id}/derive`,
                            "POST",
                            {
                              title: p.title,
                              kind: p.kind,
                              baseVersionId: p.baseVersionId,
                              operations: p.operations.map((x) =>
                                x.id === op.id ? { ...op, value } : x,
                              ),
                              rationale:
                                p.rationale + "\nHuman revision: " + editReason,
                              critic: p.critic,
                            },
                          );
                          setPid(derived.id);
                          notify(
                            "A derived proposal is ready for a fresh review.",
                          );
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
            {p.status === "pending" ? (
              <div className="review-actions">
                <Field label="Review comment">
                  <textarea
                    value={reason}
                    required
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <div className="button-row">
                  {p.freshness === "stale" ? (
                    <button
                      className="primary"
                      onClick={async () => {
                        const next = await request<any>(
                          `/proposals/${p.id}/validate`,
                          "POST",
                          {},
                        );
                        setPid(next.id);
                        notify(
                          "Revalidated as a new draft. Review it before accepting.",
                        );
                      }}
                    >
                      <RefreshCw size={15} />
                      Revalidate against current
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={
                        !selected.length || !reason.trim() || historical
                      }
                      onClick={async () => {
                        await request(`/proposals/${p.id}/accept`, "POST", {
                          expectedContextVersionId: w.headId,
                          idempotencyKey: uid(),
                          reason,
                          selectedOperationIds: selected,
                          evidenceExceptions: exception,
                        });
                        notify(
                          "Selected changes accepted. Any remaining operations stay reviewable.",
                        );
                      }}
                    >
                      <Check size={16} />
                      Accept{" "}
                      {selected.length === p.operations.length
                        ? "all changes"
                        : `${selected.length} selected`}
                    </button>
                  )}
                  <button
                    className="danger-text"
                    disabled={!reason.trim()}
                    onClick={async () => {
                      await request(`/proposals/${p.id}/reject`, "POST", {
                        reason,
                      });
                      notify("Proposal rejected with your comment.");
                    }}
                  >
                    Reject proposal
                  </button>
                </div>
                <p className="small muted">
                  A dependency-incomplete selection is blocked. Acceptance
                  creates a new immutable context version.
                </p>
              </div>
            ) : (
              <p className="review-record">
                {p.status} · {p.comment || "Review recorded"}
                {p.derivedFrom && " · Derived revision"}
              </p>
            )}
          </article>
        </div>
      )}
    </>
  );
}
export function DecisionsScreen({
  guardrails = false,
}: {
  guardrails?: boolean;
}) {
  const { data, inspect, historical, setPage } = useWorkbench();
  const objects = data.context.objects.filter(
    (o: ObjectRevision) => o.kind === (guardrails ? "guardrail" : "decision"),
  );
  return (
    <>
      <PageHeading
        title={
          guardrails
            ? "Make the constraints explicit."
            : "Record the choice. Keep the reasoning."
        }
        description={
          guardrails
            ? "Declarative checks govern accepted changes. Advisory reviews remain clearly separate."
            : "Architecture alternatives and decision records stay connected to accepted meaning."
        }
      >
        <button
          disabled={historical}
          onClick={() =>
            inspect({
              kind: "create",
              objectKind: guardrails ? "guardrail" : "decision",
            })
          }
        >
          <Plus size={16} />
          Add {guardrails ? "guardrail" : "decision"}
        </button>
        {!guardrails && (
          <AIButton kind="architecture">Explore alternatives</AIButton>
        )}
      </PageHeading>
      {!guardrails && (
        <div className="model-tabs">
          <button onClick={() => setPage("canvas")}>
            <Network size={16} />
            C4 context & containers
          </button>
          <button onClick={() => setPage("reviews")}>
            <GitBranch size={16} />
            Review architecture proposals
          </button>
        </div>
      )}
      {guardrails && (
        <div className="platform-checks">
          <ShieldCheck size={24} />
          <div>
            <strong>Platform checks are always on.</strong>
            <p>
              Evidence and type validity, workspace ownership, stale-command
              rejection, local data policy, and human acceptance cannot be
              disabled.
            </p>
          </div>
          <Badge tone="green">Enforced</Badge>
        </div>
      )}
      {objects.length ? (
        <div className="decision-list">
          {objects.map((o: any) => (
            <button
              key={o.id}
              onClick={() => inspect({ kind: "object", id: o.id })}
            >
              <span className="decision-symbol">
                {guardrails ? (
                  <ShieldCheck size={21} />
                ) : (
                  <GitBranch size={21} />
                )}
              </span>
              <div>
                <div className="badge-row">
                  <Badge tone="green">
                    {guardrails
                      ? o.enabled
                        ? "Enabled"
                        : "Disabled"
                      : "Accepted decision"}
                  </Badge>
                  {guardrails && <Badge>{o.severity}</Badge>}
                </div>
                <h2>{o.name}</h2>
                <p>{o.kind === "decision" ? o.chosen : o.description}</p>
                <small>{o.evidenceIds.length} evidence links</small>
              </div>
              <ArrowUpRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title={
            guardrails
              ? "Add a rule your solution must follow."
              : "A decision is more than a diagram."
          }
        >
          Record the alternatives, chosen option, consequences, and unresolved
          risks.
        </Empty>
      )}
      <AIAvailability />
    </>
  );
}
export function ArtifactsScreen() {
  const { data, request, inspect, w, notify, historical } = useWorkbench();
  const [generate, setGenerate] = useState(false),
    [kind, setKind] = useState("specification"),
    [selected, setSelected] = useState<string[]>([]),
    [inputs, setInputs] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeading
        title="Give the model a useful next form."
        description="Generate engineering outputs from a frozen accepted version, with provenance attached."
      >
        <AIButton kind="code">Generate service module</AIButton>
        <button
          className="primary"
          disabled={historical}
          onClick={() => setGenerate(!generate)}
        >
          <Plus size={16} />
          Generate artifact
        </button>
      </PageHeading>
      {generate && (
        <form
          className="generation-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await request<any>("/artifacts", "POST", {
                kind,
                contextVersionId: w.headId,
                selectedIds: selected,
                inputArtifactIds: inputs,
              });
              inspect({ kind: "run", id: r.id });
              setGenerate(false);
              notify("Artifact generation queued.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <h2>Freeze the input. Generate a draft.</h2>
            <p>
              Local templates create reviewable starting documents without an AI
              key.
            </p>
          </div>
          <Field label="Output">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {[
                "specification",
                "architecture-report",
                "openapi",
                "json-schema",
                "test-plan",
                "implementation-package",
                "validation-report",
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Model scope"
            hint="Leave empty for the whole workspace, or select specific objects."
          >
            <select
              multiple
              value={selected}
              onChange={(e) =>
                setSelected([...e.target.selectedOptions].map((o) => o.value))
              }
            >
              {data.context.objects.map((o: ObjectRevision) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Include existing artifacts">
            <select
              multiple
              value={inputs}
              onChange={(e) =>
                setInputs([...e.target.selectedOptions].map((o) => o.value))
              }
            >
              {data.artifacts.map((a: Artifact) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.review}
                </option>
              ))}
            </select>
          </Field>
          <div className="button-row">
            <button className="primary" disabled={busy}>
              {busy ? "Queuing…" : "Generate draft"}
            </button>
            <button type="button" onClick={() => setGenerate(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {data.artifacts.length ? (
        <div className="table-scroll">
          <table className="artifact-table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Review</th>
                <th>Freshness</th>
                <th>Checks</th>
                <th>Generated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.artifacts.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    <button
                      className="object-name"
                      onClick={() => inspect({ kind: "artifact", id: a.id })}
                    >
                      <span className="artifact-symbol">
                        {["openapi", "json-schema", "service-module"].includes(
                          a.kind,
                        ) ? (
                          <Braces size={22} />
                        ) : a.kind === "implementation-package" ? (
                          <Package size={22} />
                        ) : (
                          <FileText size={22} />
                        )}
                      </span>
                      <span>
                        <strong>{a.name}</strong>
                        <small>
                          {label(a.kind)} · revision {a.ordinal}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <Badge tone={tone(a.review)}>{a.review}</Badge>
                  </td>
                  <td>
                    <Badge
                      tone={
                        a.freshness.some((c: any) => c.result === "warn")
                          ? "amber"
                          : "green"
                      }
                    >
                      {a.freshness.some((c: any) => c.result === "warn")
                        ? "Review change"
                        : "Current"}
                    </Badge>
                  </td>
                  <td>
                    {a.checks.some((c: any) => c.result === "block") ? (
                      <Badge tone="red">Failed check</Badge>
                    ) : a.kind === "service-module" ? (
                      <Badge tone={a.execution?.passed ? "green" : "neutral"}>
                        {a.execution?.passed ? "Executed" : "Not run"}
                      </Badge>
                    ) : (
                      <span className="check-label">
                        <Check size={14} />
                        Structure checked
                      </span>
                    )}
                  </td>
                  <td className="muted">{date(a.createdAt)}</td>
                  <td>
                    <a
                      className="icon-button"
                      aria-label={`Download ${a.name}`}
                      href={`/api/workspaces/${w.id}/artifacts/${a.id}/download`}
                    >
                      <Download size={16} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Your accepted model is ready to become something useful."
          action={
            <button onClick={() => setGenerate(true)}>
              Generate your first artifact <ArrowRight size={15} />
            </button>
          }
        >
          Specifications, contracts, test plans, and packages preserve their
          exact input version.
        </Empty>
      )}
      <div className="export-note">
        <Package size={22} />
        <p>
          <strong>Take the work with you.</strong> An implementation package
          includes readable artifacts, evidence summaries, constraints, and a
          coding-agent brief. It can be used without Tracework.
        </p>
      </div>
    </>
  );
}
export function ArtifactDetail({ artifactId }: { artifactId: string }) {
  const { request, data, w, inspect, setVersion, setPage, health, notify } =
    useWorkbench();
  const [a, setA] = useState<any>(null),
    [tab, setTab] = useState("preview"),
    [editing, setEditing] = useState(false),
    [content, setContent] = useState(""),
    [reason, setReason] = useDraftState(
      `tracework.artifact.${w.id}.${artifactId}.reason`,
      "",
    );
  const draftKey = `tracework.artifact.${w.id}.${artifactId}`;
  useEffect(() => {
    request("/artifacts/" + artifactId)
      .then((a: any) => {
        setA(a);
        if (!editing) {
          const saved = localStorage.getItem(draftKey + ".content");
          setContent(saved ?? a.content);
          if (saved !== null) setEditing(true);
        }
      })
      .catch(() => {});
  }, [
    artifactId,
    data.artifacts.map((a: any) => a.review + !!a.execution).join(","),
  ]);
  if (!a) return <p className="inspector-body">Loading artifact…</p>;
  let files: any = null;
  try {
    if (a.kind === "service-module") files = JSON.parse(a.content);
  } catch {}
  return (
    <div className="inspector-body artifact-inspector">
      <Badge tone={tone(a.review)}>{a.review}</Badge>
      <h3>{a.name}</h3>
      <div className="button-row">
        <a
          className="button"
          href={`/api/workspaces/${w.id}/artifacts/${a.id}/download`}
        >
          <Download size={14} />
          Download
        </a>
        <button onClick={() => setEditing(!editing)}>
          <Pencil size={14} />
          Edit draft
        </button>
      </div>
      <div className="segmented">
        <button
          className={tab === "preview" ? "active" : ""}
          onClick={() => setTab("preview")}
        >
          Preview
        </button>
        <button
          className={tab === "lineage" ? "active" : ""}
          onClick={() => setTab("lineage")}
        >
          Provenance
        </button>
        <button
          className={tab === "checks" ? "active" : ""}
          onClick={() => setTab("checks")}
        >
          Checks
        </button>
        {files && (
          <button
            className={tab === "diff" ? "active" : ""}
            onClick={() => setTab("diff")}
          >
            Diff
          </button>
        )}
      </div>
      {tab === "preview" &&
        (editing ? (
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const next = await request<any>(
                `/artifacts/${a.id}/edit`,
                "POST",
                { content, reason },
              );
              clearDraft(draftKey);
              inspect({ kind: "artifact", id: next.id });
              setEditing(false);
              notify("New immutable artifact revision created.");
            }}
          >
            <Field label="Artifact content">
              <textarea
                className="code-editor"
                rows={22}
                spellCheck={false}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  localStorage.setItem(draftKey + ".content", e.target.value);
                }}
              />
            </Field>
            <Field label="Edit reason">
              <input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <button className="primary">Save a new revision</button>
          </form>
        ) : (
          <pre className="artifact-preview" tabIndex={0}>
            {a.content}
          </pre>
        ))}
      {tab === "diff" && (
        <pre className="artifact-preview diff-preview" tabIndex={0}>
          {files?.diff}
        </pre>
      )}
      {tab === "lineage" && (
        <>
          <button
            className="inspector-link"
            onClick={() => {
              setVersion(a.manifest.contextVersionId);
              setPage("model");
            }}
          >
            Open input accepted version <ArrowUpRight size={14} />
          </button>
          <p>
            {Object.keys(a.manifest.objectRevisions).length} exact object
            revisions · {a.manifest.evidenceIds.length} evidence passages
          </p>
          <Badge>{a.manifest.scope}</Badge>
          <EvidenceLinks ids={a.manifest.evidenceIds} />
          <details>
            <summary>Full provenance manifest</summary>
            <pre className="artifact-preview">
              {JSON.stringify(a.manifest, null, 2)}
            </pre>
          </details>
          <div className="attribute">
            <strong>Content SHA-256</strong>
            <code>{a.hash}</code>
          </div>
        </>
      )}
      {tab === "checks" && (
        <>
          {[...a.checks, ...a.freshness, ...(a.execution?.checks ?? [])].map(
            (c: any, i) => (
              <div className="check-result" key={c.id + i}>
                <Badge tone={tone(c.result)}>{label(c.result)}</Badge>
                <strong>{label(c.origin)}</strong>
                <p>{c.message}</p>
              </div>
            ),
          )}
          {a.manifest.missingChecks.map((m: string) => (
            <p className="small muted" key={m}>
              Not run: {m}
            </p>
          ))}
        </>
      )}
      {!editing && (
        <form
          className="stack-form review-artifact"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await request(`/artifacts/${a.id}/review`, "POST", {
              status: f.get("status"),
              reason: f.get("reason"),
            });
            notify("Artifact review recorded.");
          }}
        >
          <Field label="Review comment">
            <textarea name="reason" required rows={2} />
          </Field>
          <div className="button-row">
            <button
              name="status"
              value="reviewed"
              onClick={async (e) => {
                const form = e.currentTarget.form!;
                if (!form.reportValidity()) return;
                e.preventDefault();
                await request(`/artifacts/${a.id}/review`, "POST", {
                  status: "reviewed",
                  reason: new FormData(form).get("reason"),
                });
                notify("Marked reviewed.");
              }}
            >
              Mark reviewed
            </button>
            <button
              className="primary"
              name="status"
              value="accepted"
              disabled={a.kind === "service-module" && !a.execution?.passed}
              onClick={async (e) => {
                const form = e.currentTarget.form!;
                if (!form.reportValidity()) return;
                e.preventDefault();
                await request(`/artifacts/${a.id}/review`, "POST", {
                  status: "accepted",
                  reason: new FormData(form).get("reason"),
                });
                notify("Artifact accepted.");
              }}
            >
              Accept artifact
            </button>
          </div>
        </form>
      )}
      {a.kind === "service-module" && (
        <div className="execution-section">
          <h4>Isolated execution</h4>
          <p className="small muted">{health.execution.reason}</p>
          <button
            disabled={!health.execution.available}
            onClick={async () => {
              const r = await request<any>(
                `/artifacts/${a.id}/execute`,
                "POST",
                {},
              );
              inspect({ kind: "run", id: r.id });
            }}
          >
            <Play size={14} />
            Run fixed checks
          </button>
        </div>
      )}
    </div>
  );
}
export function RunsScreen() {
  const { data, inspect } = useWorkbench();
  return (
    <>
      <PageHeading
        title="Every run leaves a record."
        description="Follow progress, inspect results, and recover interrupted work without replaying acceptance."
      >
        <AIButton kind="question">Ask the workspace</AIButton>
      </PageHeading>
      {data.runs.length ? (
        <div className="runs-list">
          {data.runs.map((r: Run) => (
            <button
              className="run-row"
              key={r.id}
              onClick={() => inspect({ kind: "run", id: r.id })}
            >
              <span
                className={`run-symbol ${r.status === "running" ? "running" : ""}`}
              >
                {r.status === "completed" ? (
                  <Check size={19} />
                ) : r.status === "running" ? (
                  <RefreshCw size={19} />
                ) : (
                  <History size={19} />
                )}
              </span>
              <div>
                <strong>{r.recorded ? "Recorded run" : label(r.kind)}</strong>
                <p>
                  {r.error?.message ??
                    (r.result as any)?.summary ??
                    (r.status === "queued"
                      ? "Waiting for a worker"
                      : `Attempt ${r.attempt}`)}
                </p>
              </div>
              <Badge tone={tone(r.status)}>{label(r.status)}</Badge>
              <span className="muted small">{date(r.createdAt)}</span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty title="A clear history starts with the first task.">
          Extraction, validation, generation, and AI tasks appear here with
          their actual outcomes.
        </Empty>
      )}
      <AIAvailability />
    </>
  );
}
export function RunDetail({ runId }: { runId: string }) {
  const { request, w, inspect, notify } = useWorkbench();
  const [r, setR] = useState<any>(null),
    [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    const load = () =>
      request("/runs/" + runId)
        .then((r: any) => {
          if (active) {
            setR(r);
            setEvents(r.events);
          }
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 1800);
    const stream = new EventSource(`/api/runs/${runId}/events`);
    stream.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setEvents((old) =>
        old.some((x) => x.seq === data.seq) ? old : [...old, data],
      );
    };
    return () => {
      active = false;
      clearInterval(timer);
      stream.close();
    };
  }, [runId]);
  if (!r) return <p className="inspector-body">Loading run…</p>;
  return (
    <div className="inspector-body">
      <div className="badge-row">
        <Badge tone={tone(r.status)}>{label(r.status)}</Badge>
        {r.recorded && <Badge>Recorded run</Badge>}
      </div>
      <h3>{label(r.kind)}</h3>
      {r.error && (
        <p role="alert" className="error-text">
          {r.error.message}
        </p>
      )}
      {r.result?.summary && <p>{r.result.summary}</p>}
      {r.result?.proposalIds?.map((pid: string) => (
        <button
          key={pid}
          className="inspector-link"
          onClick={() =>
            notify("Open the review queue to inspect this proposal.")
          }
        >
          Proposal created <Check size={15} />
        </button>
      ))}
      {r.result?.artifactId && (
        <button
          className="inspector-link"
          onClick={() => inspect({ kind: "artifact", id: r.result.artifactId })}
        >
          Open generated artifact <ArrowUpRight size={15} />
        </button>
      )}
      {r.result?.path && (
        <div>
          <p>{r.result.message}</p>
          <code>{r.result.path}</code>
        </div>
      )}
      {r.result?.citations && <EvidenceLinks ids={r.result.citations} />}
      <div className="run-events">
        {events.map((event: any) => (
          <div key={event.seq}>
            <span className="event-marker" />
            <div>
              <strong>{event.message || label(event.type)}</strong>
              <small>{new Date(event.createdAt).toLocaleTimeString()}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="button-row">
        {["queued", "running", "awaiting-approval"].includes(r.status) && (
          <button onClick={() => request(`/runs/${r.id}/cancel`, "POST", {})}>
            <X size={14} />
            Cancel task
          </button>
        )}
        {["failed", "interrupted", "cancelled"].includes(r.status) &&
          !r.recorded && (
            <button onClick={() => request(`/runs/${r.id}/retry`, "POST", {})}>
              <RefreshCw size={14} />
              Retry as new attempt
            </button>
          )}
      </div>
      {r.status === "awaiting-approval" && (
        <div className="approval-request">
          <h4>Additional evidence access</h4>
          <p>
            Approve only the exact listed source versions. Current data policy
            still applies.
          </p>
          <pre className="artifact-preview">
            {JSON.stringify(r.approval, null, 2)}
          </pre>
          <div className="button-row">
            <button
              className="primary"
              onClick={() =>
                request(`/runs/${r.id}/approval`, "POST", {
                  approve: true,
                  stateHash: r.sdkStateHash,
                })
              }
            >
              Approve access
            </button>
            <button
              onClick={() =>
                request(`/runs/${r.id}/approval`, "POST", {
                  approve: false,
                  stateHash: r.sdkStateHash,
                })
              }
            >
              Deny
            </button>
          </div>
        </div>
      )}
      <details>
        <summary>Run inputs and diagnostics</summary>
        <p>
          Model: {r.model ?? "No model call"}
          <br />
          Attempt: {r.attempt}
        </p>
        <p>
          Usage: {r.usage ? JSON.stringify(r.usage) : "Unknown / unavailable"}
        </p>
        {r.plan && (
          <>
            <h4>Context plan</h4>
            <p>
              {r.plan.sourceVersionIds.length} selected sources ·{" "}
              {r.plan.elementRevisionIds.length} object revisions
            </p>
            {r.plan.exclusions.map((x: string) => (
              <p key={x}>{x}</p>
            ))}
          </>
        )}
        <pre className="artifact-preview">
          {JSON.stringify(r.tools, null, 2)}
        </pre>
      </details>
    </div>
  );
}
export function ValidationScreen() {
  const { data, request, inspect, w, notify } = useWorkbench();
  const [filter, setFilter] = useState("all"),
    [active, setActive] = useState<string>("");
  const findings = data.findings.filter(
    (f: Finding) => filter === "all" || f.origin === filter,
  );
  const latest = data.validations[0];
  return (
    <>
      <PageHeading
        title="Understand what changed."
        description="Separate changed inputs, failed checks, and concerns that still need human judgment."
      >
        <AIButton kind="remediation">Propose remediation</AIButton>
        <button
          className="primary"
          onClick={async () => {
            const r = await request<any>("/validation-runs", "POST", {});
            inspect({ kind: "run", id: r.id });
          }}
        >
          <ShieldCheck size={16} />
          Run checks
        </button>
      </PageHeading>
      {w.example && (
        <div className="change-demo">
          <RefreshCw size={21} />
          <div>
            <strong>A new certification requirement</strong>
            <p>
              Introduce a changed brief and trace its effect on scheduling,
              assignments, contracts, and tests.
            </p>
          </div>
          <button
            onClick={async () => {
              await request("/demo/change", "POST", {});
              notify(
                "Changed brief imported. Wait for extraction, then run checks.",
              );
            }}
          >
            Introduce source change <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="validation-key">
        <div>
          <span className="key-dot amber" />
          <strong>Staleness</strong>
          <p>An input changed. This does not prove a defect.</p>
        </div>
        <div>
          <span className="key-dot red" />
          <strong>Deterministic failure</strong>
          <p>A specific check failed against known inputs.</p>
        </div>
        <div>
          <span className="key-dot violet" />
          <strong>Advisory concern</strong>
          <p>An AI observation awaits human review.</p>
        </div>
      </div>
      {latest && (
        <section className="latest-checks">
          <SectionTitle title="Latest deterministic review">
            <span>{date(latest.createdAt)}</span>
          </SectionTitle>
          <div className="check-summary">
            {latest.checks.map((c: any, i: number) => (
              <div key={c.id + i}>
                <Badge tone={tone(c.result)}>{label(c.result)}</Badge>
                <p>{c.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="collection-toolbar">
        <div className="segmented">
          {["all", "staleness", "deterministic", "advisory"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {label(f)}
            </button>
          ))}
        </div>
        <span className="small muted">{findings.length} recorded findings</span>
      </div>
      {findings.length ? (
        <div className="findings-list">
          {findings.map((f: Finding) => (
            <div className="finding" key={f.id}>
              <div className="finding-main">
                <Badge tone={tone(f.result)}>{label(f.origin)}</Badge>
                <p>{f.message}</p>
                <button onClick={() => setActive(active === f.id ? "" : f.id)}>
                  {label(f.disposition)} <ChevronDown size={13} />
                </button>
              </div>
              {active === f.id && (
                <form
                  className="finding-review"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    await request("/findings/" + f.id, "PATCH", {
                      disposition: form.get("disposition"),
                      comment: form.get("comment"),
                    });
                    setActive("");
                    notify(
                      "Finding disposition recorded; check outcome is preserved.",
                    );
                  }}
                >
                  <div className="form-row">
                    <Field label="Disposition">
                      <select name="disposition" defaultValue={f.disposition}>
                        <option>open</option>
                        <option>resolved</option>
                        <option>dismissed</option>
                        <option>accepted-risk</option>
                      </select>
                    </Field>
                    <Field label="Review comment">
                      <input required name="comment" defaultValue={f.comment} />
                    </Field>
                  </div>
                  <button>Record disposition</button>
                  {f.paths?.slice(0, 6).map((p, i) => (
                    <p className="dependency-path" key={i}>
                      {p
                        .map(
                          (oid) =>
                            data.context.objects.find((o: any) => o.id === oid)
                              ?.name ??
                            data.artifacts.find((a: any) => a.id === oid)
                              ?.name ??
                            data.sources.find((s: any) => s.id === oid)?.name ??
                            "Evidence",
                        )
                        .join(" → ")}
                    </p>
                  ))}
                </form>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No findings in this view.">
          Run deterministic checks against current accepted work. Missing
          execution or AI checks remain explicitly unperformed.
        </Empty>
      )}
    </>
  );
}
export function RepositoriesScreen() {
  const { data, request, inspect, notify } = useWorkbench();
  const [adding, setAdding] = useState(false),
    [comparing, setComparing] = useState(""),
    [report, setReport] = useState<any>(null);
  return (
    <>
      <PageHeading
        title="Bring existing code into context."
        description="Read local Git snapshots at exact commits. Working trees, branches, and remotes stay untouched."
      >
        <button className="primary" onClick={() => setAdding(!adding)}>
          <Plus size={16} />
          Register repository
        </button>
      </PageHeading>
      {adding && (
        <form
          className="generation-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await request("/repositories", "POST", {
              name: f.get("name"),
              path: f.get("path"),
            });
            setAdding(false);
            notify("Repository registered for read-only access.");
          }}
        >
          <Field label="Repository name">
            <input name="name" placeholder="Service repository" />
          </Field>
          <Field label="Absolute local root path">
            <input
              required
              name="path"
              placeholder="/home/you/projects/service"
            />
          </Field>
          <button className="primary">Register read-only source</button>
        </form>
      )}
      {data.repositories.length ? (
        data.repositories.map((repo: any) => (
          <section className="repository" key={repo.id}>
            <div className="section-title">
              <h2>
                <FolderGit2 size={20} />
                {repo.name}
              </h2>
              <Badge>Read only</Badge>
            </div>
            <code>{repo.path}</code>
            <form
              className="repository-import"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const r = await request<any>(
                  `/repositories/${repo.id}/import`,
                  "POST",
                  { ref: f.get("ref") },
                );
                inspect({ kind: "run", id: r.id });
              }}
            >
              <Field label="Commit, branch or tag">
                <input required name="ref" defaultValue="HEAD" />
              </Field>
              <button>
                Import pinned snapshot <ArrowRight size={15} />
              </button>
            </form>
            {data.repositorySnapshots
              .filter((s: any) => s.repositoryId === repo.id)
              .map((snap: any) => (
                <details className="repo-snapshot" key={snap.id}>
                  <summary>
                    <Badge tone="green">Pinned commit</Badge>{" "}
                    <code>{snap.commit.slice(0, 12)}</code> ·{" "}
                    {snap.files.length} files{" "}
                    {snap.dirty && (
                      <Badge tone="amber">Working-tree changes excluded</Badge>
                    )}
                  </summary>
                  <ul>
                    {snap.files.map((f: any) => (
                      <li key={f.path}>
                        <button
                          className="text-button"
                          onClick={() =>
                            inspect({ kind: "source", id: f.sourceId })
                          }
                        >
                          {f.path}
                          <ArrowUpRight size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <h4>Excluded inventory</h4>
                  {snap.exclusions.map((x: any) => (
                    <p className="small muted" key={x.path}>
                      {x.path} — {x.reason}
                    </p>
                  ))}
                </details>
              ))}
            <button
              onClick={() => setComparing(comparing === repo.id ? "" : repo.id)}
            >
              Compare snapshots
            </button>
            {comparing === repo.id && (
              <form
                className="stack-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setReport(
                    await request(`/repositories/${repo.id}/compare`, "POST", {
                      from: f.get("from"),
                      to: f.get("to"),
                    }),
                  );
                }}
              >
                <div className="form-row">
                  {["from", "to"].map((name) => (
                    <Field key={name} label={name}>
                      <select name={name}>
                        {data.repositorySnapshots
                          .filter((s: any) => s.repositoryId === repo.id)
                          .map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.commit.slice(0, 12)}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ))}
                </div>
                <button>Compare exact files</button>
              </form>
            )}
          </section>
        ))
      ) : (
        <Empty title="A repository can be evidence, too.">
          Register a local Git repository, select a commit, and inspect
          permitted text files with commit-and-line citations.
        </Empty>
      )}
      {report && (
        <section className="comparison-panel">
          <h2>{report.changes.length} observable file changes</h2>
          <p>{report.boundary}</p>
          {report.changes.map((c: any) => (
            <p key={c.path}>
              <Badge>{c.status}</Badge> {c.path}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
export function SettingsScreen({
  onWorkspaceChange,
}: {
  onWorkspaceChange: (id: string) => void;
}) {
  const { w, data, request, health, notify } = useWorkbench();
  const [backups, setBackups] = useState<any[]>([]);
  useEffect(() => {
    api("/backups").then(setBackups);
  }, [
    data.runs.filter(
      (r: Run) => r.kind === "backup" && r.status === "completed",
    ).length,
  ]);
  return (
    <>
      <PageHeading
        title="Workspace settings"
        description="Manage this workspace, source submission policy, and recoverable local copies."
      />
      <div className="settings-grid">
        <section>
          <h2>Workspace details</h2>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await request("", "PATCH", {
                name: f.get("name"),
                description: f.get("description"),
              });
              notify("Workspace details saved.");
            }}
          >
            <Field label="Name">
              <input name="name" required defaultValue={w.name} />
            </Field>
            <Field label="Description">
              <textarea name="description" defaultValue={w.description} />
            </Field>
            <button>Save details</button>
          </form>
          <button
            className="text-button"
            onClick={async () => {
              await request("", "PATCH", {
                status: w.status === "archived" ? "active" : "archived",
              });
              notify(
                w.status === "archived"
                  ? "Workspace reopened."
                  : "Workspace archived. It can be reopened here.",
              );
            }}
          >
            <Archive size={15} />
            {w.status === "archived"
              ? "Unarchive workspace"
              : "Archive workspace"}
          </button>
        </section>
        <section>
          <h2>Submission to OpenAI</h2>
          <p>
            Public sources may be submitted. Restricted sources are always
            excluded. Internal sources and free-form questions require your
            explicit permission.
          </p>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await request("/settings", "PATCH", {
                allowInternalAI: f.get("allow") === "on",
                reason: f.get("reason"),
              });
              notify("Submission policy updated and audited.");
            }}
          >
            <label className="check-row">
              <input
                type="checkbox"
                name="allow"
                defaultChecked={w.settings.allowInternalAI}
              />
              <span>Allow internal content to be sent to OpenAI</span>
            </label>
            <Field label="Reason for this policy change">
              <textarea required name="reason" rows={2} />
            </Field>
            <button>Save submission policy</button>
          </form>
          <p className="small muted">
            {health.ai
              ? "API credentials are configured server-side."
              : "Set OPENAI_API_KEY in the server environment to enable AI."}{" "}
            Keys are never stored in workspace records or sent to the browser.
          </p>
        </section>
        <section>
          <h2>Backups and recovery</h2>
          <p>
            A backup captures a consistent SQLite snapshot and its referenced
            content. Restore validates it into a separate directory.
          </p>
          <button
            onClick={async () => {
              await request("/backups", "POST", {});
              notify("Backup queued. Follow progress in Runs.");
            }}
          >
            <Download size={15} />
            Create local backup
          </button>
          {backups.map((b) => (
            <div className="backup-row" key={b.id}>
              <span>
                {date(b.createdAt)} · {b.blobHashes.length} blobs
              </span>
              <button
                onClick={async () => {
                  await request(`/backups/${b.id}/restore`, "POST", {});
                  notify(
                    "Restore validation queued. Open its run for the new data-directory path.",
                  );
                }}
              >
                Validate restore
              </button>
            </div>
          ))}
        </section>
        <section>
          <h2>Saved checkpoints</h2>
          <p>
            Clone a checkpoint into a new workspace. Imported runs remain
            historical and cannot resume approvals.
          </p>
          <form
            className="button-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await request("/checkpoints", "POST", { name: f.get("name") });
              notify("Checkpoint save queued.");
            }}
          >
            <input
              required
              name="name"
              aria-label="Checkpoint name"
              placeholder="Checkpoint name"
            />
            <button>
              <Plus size={14} />
              Save
            </button>
          </form>
          {data.checkpoints.map((c: any) => (
            <div className="backup-row" key={c.id}>
              <span>{c.name}</span>
              <button
                onClick={async () => {
                  const clone = await request<any>(
                    `/checkpoints/${c.id}/clone`,
                    "POST",
                    {},
                  );
                  onWorkspaceChange(clone.workspace.id);
                }}
              >
                Clone
              </button>
            </div>
          ))}
          {w.example && (
            <button
              onClick={async () => {
                const fresh = await request<any>("/demo/reset", "POST", {});
                onWorkspaceChange(fresh.id);
                notify(
                  "The prior example was archived; a fresh example is ready.",
                );
              }}
            >
              <RefreshCw size={14} />
              Reset this example
            </button>
          )}
        </section>
        <section>
          <h2>Execution environment</h2>
          <p>{health.execution.reason}</p>
          <Badge tone={health.execution.available ? "green" : "neutral"}>
            {health.execution.available ? "Runner available" : "Not run"}
          </Badge>
          <p className="small muted">
            No generated command runs on the host. Prepare the pinned image with{" "}
            <code>bun run execution:prepare</code>, then run{" "}
            <code>bun run test:execution</code>.
          </p>
        </section>
        <section>
          <h2>Diagnostics</h2>
          <p>
            {health.runtime} · schema {health.schema}
            <br />
            Model: {health.model}
          </p>
          <a
            className="button"
            href="/api/diagnostics"
            download="tracework-diagnostics.json"
          >
            <Download size={15} />
            Redacted diagnostics
          </a>
          <p className="small muted">
            Includes versions and operation IDs. Document content and
            credentials are excluded.
          </p>
        </section>
      </div>
    </>
  );
}
