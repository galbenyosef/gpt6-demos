import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Download,
  Pencil,
  Save,
  FileText,
  PanelRightOpen,
} from "lucide-react";
import type { Source, SourceVersion } from "../../../packages/contracts";
import { useWorkbench } from "./App";
import { Badge, SourceIcon } from "./components";
const PdfReader = lazy(() => import("./PdfReader"));
const MarkdownSource = lazy(() => import("./MarkdownSource"));

export default function SourceReader({
  sourceId,
  initialVersionId,
}: {
  sourceId: string;
  initialVersionId?: string;
}) {
  const { data, w, setPage } = useWorkbench();
  const [selected, setSelected] = useState(initialVersionId ?? "");
  const heading = useRef<HTMLHeadingElement>(null);
  const source = (data.sources as Source[]).find((s) => s.id === sourceId);
  const versions = (data.sourceVersions as SourceVersion[])
    .filter((v) => v.sourceId === sourceId)
    .sort((a, b) => b.ordinal - a.ordinal);
  const version =
    versions.find((v) => v.id === (selected || source?.latestVersionId)) ??
    versions[0];
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [sourceId]);
  if (!source || !version)
    return <p role="status">This source is no longer available.</p>;
  return (
    <section className="source-reader" aria-label="Source document">
      <button
        className="text-button reader-back"
        onClick={() => setPage("sources")}
      >
        <ArrowLeft size={16} /> All sources
      </button>
      <header className="reader-heading">
        <SourceIcon kind={source.kind} />
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {source.name}
          </h1>
          <div className="reader-metadata">
            <span>{source.classification}</span>
            <span>{source.authority}</span>
            <span>
              Version {version.ordinal}
              {version.id !== versions[0]?.id ? " · Historical" : ""}
            </span>
            <Badge>{version.status}</Badge>
          </div>
        </div>
      </header>
      <DocumentVersion
        key={version.id}
        source={source}
        version={version}
        versions={versions}
        editable={
          w.status === "active" &&
          source.status === "active" &&
          version.id === versions[0]?.id
        }
        onVersion={setSelected}
      />
    </section>
  );
}

function DocumentVersion({
  source,
  version,
  versions,
  editable,
  onVersion,
}: {
  source: Source;
  version: SourceVersion;
  versions: SourceVersion[];
  editable: boolean;
  onVersion: (id: string) => void;
}) {
  const { request, inspect, notify } = useWorkbench();
  const [text, setText] = useState<string | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [raw, setRaw] = useState(false),
    [preview, setPreview] = useState(false);
  const draftKey = `tracework.source-draft.${source.workspaceId}.${version.id}`;
  const [savedDraft, setSavedDraft] = useState<string | null>(() => {
    try {
      return localStorage.getItem(draftKey);
    } catch {
      return null;
    }
  });
  const [draftStored, setDraftStored] = useState(true);
  const fileName = String(version.metadata.originalName ?? source.name);
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  const isMarkdown = ["md", "markdown"].includes(extension),
    isPdf = extension === "pdf";
  const isText = [
    "md",
    "markdown",
    "txt",
    "text",
    "json",
    "yaml",
    "yml",
    "csv",
    "html",
    "htm",
  ].includes(extension);
  const canEdit =
    editable && ["md", "markdown", "txt", "text"].includes(extension);
  const base = `/sources/${source.id}`,
    query = `?version=${encodeURIComponent(version.id)}`;
  const original = `/api/workspaces/${source.workspaceId}${base}/original${query}`;
  const dirty = editing && draft !== text;
  useEffect(() => {
    if (isPdf) return;
    let cancelled = false;
    setText(null);
    setError("");
    request<any>(base + (isText ? "/content" : "") + query)
      .then((result) => {
        if (!cancelled)
          setText(
            isText
              ? result.text
              : result.evidence.map((e: any) => e.excerpt).join("\n\n"),
          );
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [version.id, retry, isPdf]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function changeDraft(value: string) {
    setDraft(value);
    try {
      localStorage.setItem(draftKey, value);
      setSavedDraft(value);
      setDraftStored(true);
    } catch {
      setDraftStored(false);
    }
  }
  function clearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setSavedDraft(null);
  }
  function downloadDraft() {
    const url = URL.createObjectURL(
      new Blob([savedDraft ?? draft], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `draft-${fileName}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function cancel() {
    if (dirty && !window.confirm("Discard your unsaved edits to this version?"))
      return;
    clearDraft();
    setEditing(false);
    setPreview(false);
    setError("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await request<any>(base + "/content", "POST", {
        expectedVersionId: version.id,
        text: draft,
      });
      clearDraft();
      setEditing(false);
      onVersion(result.version.id);
      notify(
        result.reused
          ? "This content already exists in a saved version."
          : "New source version saved. Evidence extraction is queued.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="reader-toolbar">
        <div className="reader-controls">
          {editing ? (
            <strong className="reader-edit-label">
              <Pencil size={15} /> Editing version {version.ordinal}
            </strong>
          ) : (
            <label className="reader-version">
              Version
              <select
                aria-label="Document version"
                value={version.id}
                onChange={(e) => onVersion(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.ordinal} · {v.status}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isMarkdown && (
            <div className="segmented" aria-label="Document display">
              {(editing ? ["Write", "Preview"] : ["Read", "Source"]).map(
                (name, index) => (
                  <button
                    key={name}
                    aria-pressed={index === Number(editing ? preview : raw)}
                    className={
                      index === Number(editing ? preview : raw) ? "active" : ""
                    }
                    onClick={() =>
                      editing ? setPreview(!!index) : setRaw(!!index)
                    }
                  >
                    {name}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
        <div className="reader-controls">
          {editing ? (
            <>
              <button onClick={cancel} disabled={busy}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={save}
                disabled={busy || !dirty}
              >
                <Save size={15} />
                {busy ? "Saving…" : "Save new version"}
              </button>
            </>
          ) : (
            <>
              <a className="button" href={original} download>
                <Download size={15} /> Download
              </a>
              <button
                aria-label="Inspect source evidence"
                onClick={() =>
                  inspect({
                    kind: "source",
                    id: source.id,
                    sourceVersionId: version.id,
                  })
                }
              >
                <PanelRightOpen size={15} />
                <span className="reader-details-label">Details</span>
              </button>
              {canEdit && (
                <button
                  className="primary"
                  disabled={text === null}
                  onClick={() => {
                    setDraft(savedDraft ?? text ?? "");
                    setEditing(true);
                    setPreview(false);
                    setError("");
                  }}
                >
                  <Pencil size={15} />
                  {savedDraft !== null ? "Resume edits" : "Edit"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {editing && (
        <div className="reader-notice" role="status">
          <span>
            Saving creates a new version. Earlier versions and citations stay
            available.
          </span>
          <span>
            {dirty
              ? draftStored
                ? "Draft saved on this device"
                : "Draft could not be stored. Keep this page open until you save."
              : "No changes yet"}
          </span>
        </div>
      )}
      {!editing && savedDraft !== null && (
        <div className="reader-notice">
          <span>
            You have a saved draft for this version.{" "}
            {canEdit
              ? "Choose Resume edits to continue."
              : "This version is read-only."}
          </span>
          <button onClick={downloadDraft}>
            <Download size={15} /> Download draft
          </button>
        </div>
      )}
      {!editing && !editable && (
        <p className="reader-notice">
          Read-only version. Select the newest version in an active workspace to
          edit.
        </p>
      )}
      {version.error && (
        <p className="reader-notice" role="status">
          Evidence extraction failed: {version.error}. The original is still
          available below.
        </p>
      )}
      {error && (
        <div className="reader-error" role="alert">
          <p>{error}</p>
          {!editing && (
            <button onClick={() => setRetry((r) => r + 1)}>Try again</button>
          )}
        </div>
      )}
      {isPdf ? (
        <Suspense
          fallback={
            <div className="reader-loading" role="status">
              Opening PDF…
            </div>
          }
        >
          <PdfReader url={original} name={source.name} />
        </Suspense>
      ) : text === null ? (
        !error && (
          <div className="reader-loading" role="status">
            Opening document…
          </div>
        )
      ) : (
        <div className="document-sheet">
          {!isText && (
            <p className="reader-notice">
              <FileText size={16} /> Extracted text. Download the original to
              see its full formatting.
            </p>
          )}
          {isMarkdown && (editing || raw) && (
            <Suspense fallback={<p role="status">Opening Markdown source…</p>}>
              <MarkdownSource
                value={editing ? draft : text}
                readOnly={!editing || busy}
                hidden={editing && preview}
                label={editing ? "Document text" : "Document content"}
                onChange={changeDraft}
              />
            </Suspense>
          )}
          {editing && !preview && !isMarkdown ? (
            <textarea
              className="document-editor"
              aria-label="Document text"
              value={draft}
              onChange={(e) => changeDraft(e.target.value)}
              spellCheck={!isMarkdown}
              autoFocus
              disabled={busy}
            />
          ) : isMarkdown && ((editing && preview) || (!editing && !raw)) ? (
            <article className="document-prose" aria-label="Markdown document">
              <Markdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                  pre: ({ node, ...props }) => <pre {...props} tabIndex={0} />,
                  table: ({ node, ...props }) => (
                    <div
                      className="document-table"
                      tabIndex={0}
                      role="region"
                      aria-label="Document table"
                    >
                      <table {...props} />
                    </div>
                  ),
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                  img: ({ alt }) => (
                    <span className="document-image-placeholder">
                      Image: {alt || "No description"}
                    </span>
                  ),
                }}
              >
                {editing ? draft : text}
              </Markdown>
              {!(editing ? draft : text).trim() && (
                <p className="muted">This document is empty.</p>
              )}
            </article>
          ) : (
            !isMarkdown && (
              <pre className="document-plain" aria-label="Document content">
                {text || "This document is empty."}
              </pre>
            )
          )}
        </div>
      )}
    </>
  );
}
