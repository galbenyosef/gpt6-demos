import React, { useState, useEffect, useRef } from "react";
import {
  X,
  ArrowUpRight,
  Check,
  FileText,
  GitBranch,
  BookOpen,
  Box,
  Shield,
  MessageSquare,
} from "lucide-react";
import {
  elementTypes,
  relationshipTypes,
  guardrailTypes,
} from "../../../packages/contracts";
import type {
  ObjectRevision,
  Semantic,
  Operation,
} from "../../../packages/contracts";
import { uid } from "./api";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-rule" />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<any>, {
            "aria-label": (children.props as any)["aria-label"] ?? label,
          })
        : children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Inspector({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    trigger.current = document.activeElement as HTMLElement;
    heading.current?.focus({ preventScroll: true });
    if (innerWidth <= 1000)
      heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
    return () => {
      trigger.current?.focus({ preventScroll: true });
    };
  }, [title]);
  return (
    <aside className="inspector" aria-label={title}>
      <div className="inspector-heading">
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button
          className="icon-button"
          aria-label="Close inspector"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </aside>
  );
}
export function SectionTitle({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function SourceIcon({ kind }: { kind: string }) {
  return (
    <div className={`file-icon ${kind === "json" ? "code" : ""}`}>
      <FileText size={19} />
      <span>{kind.slice(0, 4).toUpperCase()}</span>
    </div>
  );
}
export const typeIcon = (type: string) =>
  type === "domain-concept"
    ? BookOpen
    : type === "bounded-context"
      ? Box
      : type === "requirement"
        ? Check
        : type === "open-question"
          ? MessageSquare
          : type === "constraint" || type === "invariant"
            ? Shield
            : GitBranch;
export function useDraftState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : JSON.parse(saved);
    } catch {
      return initial;
    }
  });
  const update: React.Dispatch<React.SetStateAction<T>> = (next) =>
    setValue((previous) => {
      const result =
        typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      localStorage.setItem(key, JSON.stringify(result));
      return result;
    });
  return [value, update] as const;
}
export function clearDraft(prefix: string) {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix + "."))
    .forEach((key) => localStorage.removeItem(key));
}
export function ObjectForm({
  object,
  kind = "element",
  objects,
  onSave,
  onCancel,
  evidenceOptions = [],
  draftKey,
}: {
  object?: ObjectRevision;
  kind?: Semantic["kind"];
  objects: ObjectRevision[];
  onSave: (value: Semantic, reason: string) => Promise<void>;
  onCancel: () => void;
  evidenceOptions?: { id: string; label: string }[];
  draftKey: string;
}) {
  const actual = object?.kind ?? kind;
  const [name, setName] = useDraftState(draftKey + ".name", object?.name ?? "");
  const [description, setDescription] = useDraftState(
    draftKey + ".description",
    object?.description ?? "",
  );
  const [type, setType] = useDraftState(
    draftKey + ".type",
    object && "type" in object ? object.type : "domain-concept",
  );
  const [classification, setClassification] = useDraftState(
    draftKey + ".classification",
    object?.classification ?? "internal",
  );
  const [assertion, setAssertion] = useDraftState(
    draftKey + ".assertion",
    object?.assertion ?? "human-assumed",
  );
  const [reason, setReason] = useDraftState(draftKey + ".reason", "");
  const [evidenceIds, setEvidenceIds] = useDraftState(
    draftKey + ".evidenceIds",
    object?.evidenceIds ?? [],
  );
  const [exception, setException] = useDraftState(
    draftKey + ".exception",
    object?.evidenceException ?? "",
  );
  const [definition, setDefinition] = useDraftState(
    draftKey + ".definition",
    object?.kind === "element" ? (object.attributes.definition ?? "") : "",
  );
  const [aliases, setAliases] = useDraftState(
    draftKey + ".aliases",
    object?.kind === "element"
      ? (object.attributes.aliases?.join(", ") ?? "")
      : "",
  );
  const [criteria, setCriteria] = useDraftState(
    draftKey + ".criteria",
    object?.kind === "element"
      ? (object.attributes.acceptanceCriteria?.join("\n") ?? "")
      : "",
  );
  const [technology, setTechnology] = useDraftState(
    draftKey + ".technology",
    object?.kind === "element" ? (object.attributes.technology ?? "") : "",
  );
  const [from, setFrom] = useDraftState(
    draftKey + ".from",
    object?.kind === "relationship" ? object.from : "",
  );
  const [to, setTo] = useDraftState(
    draftKey + ".to",
    object?.kind === "relationship" ? object.to : "",
  );
  const [context, setContext] = useDraftState(
    draftKey + ".context",
    object?.kind === "decision" ? object.context : "",
  );
  const [alternatives, setAlternatives] = useDraftState(
    draftKey + ".alternatives",
    object?.kind === "decision" ? object.alternatives.join("\n") : "",
  );
  const [chosen, setChosen] = useDraftState(
    draftKey + ".chosen",
    object?.kind === "decision" ? object.chosen : "",
  );
  const [consequences, setConsequences] = useDraftState(
    draftKey + ".consequences",
    object?.kind === "decision" ? object.consequences.join("\n") : "",
  );
  const [risks, setRisks] = useDraftState(
    draftKey + ".risks",
    object?.kind === "decision" ? object.risks.join("\n") : "",
  );
  const [related, setRelated] = useDraftState(
    draftKey + ".related",
    object?.kind === "decision" ? object.elementIds : [],
  );
  const [evaluator, setEvaluator] = useDraftState(
    draftKey + ".evaluator",
    object?.kind === "guardrail" ? object.evaluator : "require-evidence",
  );
  const [quality, setQuality] = useDraftState(
    draftKey + ".quality",
    object?.kind === "guardrail" ? (object.parameters.quality ?? "") : "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lines = (s: string) =>
    s
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const common = {
        name,
        description,
        classification,
        assertion,
        evidenceIds,
        ...(exception ? { evidenceException: exception } : {}),
      };
      let value: Semantic;
      if (actual === "element") {
        const attributes = {
          ...(object?.kind === "element" ? object.attributes : {}),
          ...(type === "domain-concept"
            ? {
                definition,
                aliases: aliases
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : {}),
          ...(type === "requirement"
            ? { acceptanceCriteria: lines(criteria) }
            : {}),
          ...([
            "container",
            "component",
            "software-system",
            "interface",
          ].includes(type) && technology
            ? { technology }
            : {}),
        };
        value = { kind: "element", type: type as any, ...common, attributes };
      } else if (actual === "relationship")
        value = {
          kind: "relationship",
          type: (relationshipTypes.includes(type as any)
            ? type
            : "depends-on") as any,
          ...common,
          from,
          to,
          attributes: {},
        };
      else if (actual === "decision")
        value = {
          kind: "decision",
          ...common,
          context,
          alternatives: lines(alternatives),
          chosen,
          consequences: lines(consequences),
          risks: lines(risks),
          elementIds: related,
          author: "Local operator",
        };
      else
        value = {
          kind: "guardrail",
          ...common,
          evaluator,
          enabled: true,
          severity:
            evaluator === "advisory-architecture-review" ? "warn" : "block",
          parameters: {
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(quality ? { quality } : {}),
          },
          scope: [],
        };
      await onSave(value, reason);
      clearDraft(draftKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const options = objects
    .filter((o) => o.kind === "element")
    .map((o) => (
      <option key={o.id} value={o.id}>
        {o.name}
      </option>
    ));
  return (
    <form className="stack-form" onSubmit={submit}>
      <p className="muted">
        Unsaved fields stay in this browser for this object revision.
      </p>
      <Field label="Name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      {(actual === "element" || actual === "relationship") && (
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as any)}>
            {(actual === "element" ? elementTypes : relationshipTypes).map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
        </Field>
      )}
      <Field label="Description">
        <textarea
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {actual === "element" && type === "domain-concept" && (
        <>
          <Field label="Definition">
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
            />
          </Field>
          <Field label="Aliases" hint="Separate alternate terms with commas.">
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
            />
          </Field>
        </>
      )}
      {actual === "element" && type === "requirement" && (
        <Field
          label="Acceptance criteria"
          hint="One observable outcome per line."
        >
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
        </Field>
      )}
      {actual === "element" &&
        ["container", "component", "software-system", "interface"].includes(
          type,
        ) && (
          <Field label="Technology">
            <input
              value={technology}
              onChange={(e) => setTechnology(e.target.value)}
            />
          </Field>
        )}
      {actual === "relationship" && (
        <>
          <Field label="From">
            <select
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              <option value="">Select element</option>
              {options}
            </select>
          </Field>
          <Field label="To">
            <select required value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Select element</option>
              {options}
            </select>
          </Field>
        </>
      )}
      {actual === "decision" && (
        <>
          <Field label="Decision context">
            <textarea
              required
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </Field>
          <Field label="Alternatives considered" hint="One per line.">
            <textarea
              required
              value={alternatives}
              onChange={(e) => setAlternatives(e.target.value)}
            />
          </Field>
          <Field label="Chosen option">
            <input
              required
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            />
          </Field>
          <Field label="Consequences">
            <textarea
              value={consequences}
              onChange={(e) => setConsequences(e.target.value)}
            />
          </Field>
          <Field label="Unresolved risks">
            <textarea
              value={risks}
              onChange={(e) => setRisks(e.target.value)}
            />
          </Field>
          <Field label="Affected elements">
            <select
              multiple
              value={related}
              onChange={(e) =>
                setRelated([...e.target.selectedOptions].map((o) => o.value))
              }
            >
              {options}
            </select>
          </Field>
        </>
      )}
      {actual === "guardrail" && (
        <>
          <Field label="Evaluator">
            <select
              value={evaluator}
              onChange={(e) => setEvaluator(e.target.value as any)}
            >
              {guardrailTypes.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          {evaluator === "forbid-context-dependency" && (
            <>
              <Field label="Disallowed dependency from">
                <select
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  <option value="">Choose context</option>
                  {options}
                </select>
              </Field>
              <Field label="To">
                <select
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                >
                  <option value="">Choose context</option>
                  {options}
                </select>
              </Field>
            </>
          )}
          {evaluator === "require-quality-attribute" && (
            <Field label="Required quality attribute">
              <input
                required
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              />
            </Field>
          )}
        </>
      )}
      <div className="form-row">
        <Field label="Assertion">
          <select
            value={assertion}
            onChange={(e) => setAssertion(e.target.value as any)}
          >
            <option>human-assumed</option>
            <option>source-stated</option>
            <option>inferred</option>
          </select>
        </Field>
        <Field label="Classification">
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value as any)}
          >
            <option>internal</option>
            <option>public</option>
            <option>restricted</option>
          </select>
        </Field>
      </div>
      {evidenceOptions.length > 0 && (
        <Field label="Supporting evidence">
          <select
            multiple
            value={evidenceIds}
            onChange={(e) =>
              setEvidenceIds([...e.target.selectedOptions].map((o) => o.value))
            }
          >
            {evidenceOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {assertion !== "human-assumed" && !evidenceIds.length && (
        <Field
          label="Evidence exception reason"
          hint="This human exception will remain in the audit history."
        >
          <textarea
            required
            value={exception}
            onChange={(e) => setException(e.target.value)}
          />
        </Field>
      )}
      <Field label="Reason for this change">
        <textarea
          required
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Accept change"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="muted small">
        Creates a new accepted version. Earlier versions remain readable.
      </p>
    </form>
  );
}
