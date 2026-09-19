import React, { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToSvg,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { Download, Save, Table2, Network, Plus, RefreshCw } from "lucide-react";
import { useWorkbench } from "./App";
import { Badge } from "./components";
import type { ObjectRevision } from "../../../packages/contracts";
import { uid } from "./api";
export function projectedObjects(objects: ObjectRevision[], view: string) {
  return objects.filter(
    (o) =>
      o.kind === "element" &&
      (view === "semantic" ||
        (view === "context-map" &&
          ["bounded-context", "domain-concept", "domain-event"].includes(
            o.type,
          )) ||
        (view === "c4-context" &&
          ["actor", "software-system"].includes(o.type)) ||
        (view === "c4-container" &&
          ["actor", "software-system", "container", "interface"].includes(
            o.type,
          ))),
  );
}
export default function Canvas() {
  const { w, data, historical, request, setPage, inspect, notify } =
    useWorkbench();
  const [view, setView] = useState("semantic"),
    [api, setApi] = useState<any>(null),
    [revision, setRevision] = useState(0),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false),
    [sceneId, setSceneId] = useState("semantic"),
    [message, setMessage] = useState(""),
    [hidden, setHidden] = useState<string[]>([]);
  const [overlay, setOverlay] = useState("");
  const draft = useRef<any[]>([]),
    loading = useRef(false),
    canonical = useRef<Map<string, any>>(new Map()),
    savedHash = useRef("");
  const version = data.context.version.id;
  const savedScene = data.scenes.find((s: any) => s.id === view);
  const projection =
    savedScene?.projection ??
    (["semantic", "context-map", "c4-context", "c4-container"].includes(view)
      ? view
      : "semantic");
  const proposal = data.proposals.find((p: any) => p.id === overlay);
  const preview = new Map<string, any>(
    data.context.objects.map((o: ObjectRevision) => [o.id, o]),
  );
  const proposedIds = new Set<string>();
  if (proposal) {
    const locals = new Map<string, string>(
      proposal.operations
        .filter((o: any) => o.action === "create")
        .map((o: any) => [o.localId, `${proposal.id}:${o.localId}`]),
    );
    for (const op of proposal.operations) {
      if (op.action === "supersede") {
        preview.delete(op.targetId);
        continue;
      }
      const id = op.action === "create" ? locals.get(op.localId)! : op.targetId;
      const value = { ...op.value, id };
      if (value.kind === "relationship") {
        value.from = locals.get(value.from) ?? value.from;
        value.to = locals.get(value.to) ?? value.to;
      }
      preview.set(id, value);
      proposedIds.add(id);
    }
  }
  const displayObjects = [...preview.values()] as ObjectRevision[];
  const objects = projectedObjects(displayObjects, projection);
  function project(existing: any[], hiddenIds: string[], auto = false) {
    const previous = new Map(existing.map((e) => [e.id, e]));
    const nodes = objects.filter((o) => !hiddenIds.includes(o.id));
    const specs: any[] = [];
    for (const [i, o] of nodes.entries()) {
      const oid = "object-" + o.id,
        prev = previous.get(oid);
      const x = auto ? 80 + (i % 3) * 300 : (prev?.x ?? 80 + (i % 3) * 300),
        y = auto
          ? 70 + Math.floor(i / 3) * 180
          : (prev?.y ?? 70 + Math.floor(i / 3) * 180);
      specs.push({
        id: oid,
        type: "rectangle",
        x,
        y,
        width: prev?.width ?? 240,
        height: prev?.height ?? 106,
        strokeColor: proposedIds.has(o.id) ? "#9a6323" : "#64816e",
        backgroundColor: proposedIds.has(o.id)
          ? "#fff1d6"
          : o.kind === "element" && o.type === "bounded-context"
            ? "#dce7d7"
            : "#f4f5ef",
        fillStyle: "solid",
        strokeWidth: 1,
        roughness: 0,
        roundness: { type: 3 },
        customData: {
          managed: true,
          traceworkObjectId: o.id,
          objectKind: "element",
          contextVersionId: version,
        },
        label: {
          text:
            o.name +
            "\n" +
            (proposedIds.has(o.id) ? "PROPOSED · " : "") +
            (o.kind === "element" ? o.type : ""),
          fontSize: 15,
          fontFamily: 2,
          strokeColor: "#263a30",
        },
      });
    }
    let generated = convertToExcalidrawElements(specs, {
      regenerateIds: false,
    });
    const index = new Map(generated.map((e) => [e.id, e]));
    for (const g of generated as any[]) {
      if (g.type === "text" && g.containerId) {
        const box = index.get(g.containerId) as any;
        g.customData = { ...box?.customData, label: true };
      }
    }
    const connectors: any[] = [];
    for (const o of displayObjects)
      if (o.kind === "relationship") {
        const a = index.get("object-" + o.from),
          b = index.get("object-" + o.to);
        if (!a || !b) continue;
        connectors.push({
          id: "object-" + o.id,
          type: "arrow",
          x: a.x + a.width / 2,
          y: a.y + a.height,
          width: b.x - a.x,
          height: b.y - a.y - a.height,
          points: [
            [0, 0],
            [b.x - a.x, b.y - a.y - a.height],
          ],
          strokeColor: proposedIds.has(o.id) ? "#9a6323" : "#829589",
          strokeWidth: 1,
          roughness: 0,
          customData: {
            managed: true,
            traceworkObjectId: o.id,
            objectKind: "relationship",
            contextVersionId: version,
          },
          endArrowhead: "arrow",
        });
      }
    generated = [
      ...generated,
      ...convertToExcalidrawElements(connectors, { regenerateIds: false }),
    ];
    canonical.current = new Map(generated.map((e) => [e.id, e]));
    const free = existing.filter((e) => !e.customData?.managed);
    return [...generated, ...free];
  }
  useEffect(() => {
    if (!api) return;
    let current = true;
    loading.current = true;
    setSceneId(view);
    request<any>("/views/" + view)
      .then((scene) => {
        if (!current) return;
        const stash = localStorage.getItem(`tracework.scene.${w.id}.${view}`);
        const local = stash ? JSON.parse(stash) : null;
        const existing = local?.elements ?? scene?.elements ?? [];
        const hiddenIds = local?.hiddenIds ?? scene?.hiddenIds ?? [];
        setRevision(scene?.revision ?? 0);
        setHidden(hiddenIds);
        setDirty(!!local);
        setConflict(!!local && local.revision !== (scene?.revision ?? 0));
        const projected = project(existing, hiddenIds);
        draft.current = projected;
        savedHash.current = JSON.stringify(projected);
        api.updateScene({
          elements: projected,
          appState: { viewBackgroundColor: "#fafbf7" },
        });
        setTimeout(() => {
          loading.current = false;
          api.scrollToContent(projected, {
            fitToContent: true,
            animate: false,
          });
        }, 100);
      })
      .catch(() => {
        loading.current = false;
      });
    return () => {
      current = false;
    };
  }, [api, view, version, overlay]);
  function changed(elements: readonly any[]) {
    if (loading.current || historical || overlay) return;
    let corrected = false;
    const next = elements.map((e) => {
      const base = canonical.current.get(e.id);
      if (!base) return e;
      if (e.customData?.label && e.text !== base.text) {
        corrected = true;
        return { ...e, text: base.text, originalText: base.originalText };
      }
      if (
        e.customData?.objectKind === "relationship" &&
        JSON.stringify(e.points) !== JSON.stringify(base.points)
      ) {
        corrected = true;
        return {
          ...e,
          points: base.points,
          startBinding: base.startBinding,
          endBinding: base.endBinding,
        };
      }
      return e;
    });
    if (corrected) {
      setMessage(
        "Managed meaning is restored. Use Edit meaning in the object table to rename or reconnect.",
      );
      loading.current = true;
      api.updateScene({ elements: next });
      queueMicrotask(() => (loading.current = false));
    }
    const removed = next
      .filter(
        (e) => e.customData?.managed && e.isDeleted && !e.customData.label,
      )
      .map((e) => e.customData.traceworkObjectId);
    const hiddenIds = [...new Set([...hidden, ...removed])];
    draft.current = next;
    const hash = JSON.stringify(next);
    if (hash !== savedHash.current) {
      setDirty(true);
      localStorage.setItem(
        `tracework.scene.${w.id}.${view}`,
        JSON.stringify({ elements: next, hiddenIds, revision }),
      );
      if (removed.length)
        setMessage(
          "Removed managed shapes are hidden in this view. The accepted model is unchanged.",
        );
    }
  }
  async function save(asNew = false) {
    const target = asNew ? uid() : sceneId;
    const removed = draft.current
      .filter((e) => e.customData?.managed && e.isDeleted)
      .map((e) => e.customData.traceworkObjectId);
    const hiddenIds = [...new Set([...hidden, ...removed])];
    try {
      const result = await request<any>("/views/" + target, "PUT", {
        expectedSceneRevision: asNew ? 0 : revision,
        projection,
        contextVersionId: version,
        elements: draft.current,
        name: asNew ? "Saved view " + new Date().toLocaleTimeString() : view,
        hiddenIds,
      });
      setSceneId(target);
      setRevision(result.revision);
      setHidden(hiddenIds);
      savedHash.current = JSON.stringify(draft.current);
      setDirty(false);
      setConflict(false);
      localStorage.removeItem(`tracework.scene.${w.id}.${view}`);
      if (asNew) setView(target);
      notify("Visual layout saved. Accepted meaning is unchanged.");
    } catch (e) {
      if ((e as Error).message.includes("SCENE_CONFLICT")) setConflict(true);
    }
  }
  async function download() {
    const svg = await exportToSvg({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
    });
    const metadata = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "metadata",
    );
    metadata.textContent = `Tracework accepted context ${version}, version ${data.context.version.sequence}`;
    svg.appendChild(metadata);
    const url = URL.createObjectURL(
      new Blob([svg.outerHTML], { type: "image/svg+xml" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `tracework-${view}-v${data.context.version.sequence}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="canvas-page">
      <div className="canvas-heading">
        <div>
          <h1>A view of the accepted model.</h1>
          <p>Move the layout. Keep the meaning governed.</p>
        </div>
        <button onClick={() => setPage("model")}>
          <Table2 size={16} />
          Object table
        </button>
      </div>
      <div className="canvas-toolbar">
        <select
          aria-label="Canvas projection"
          value={view}
          onChange={(e) => setView(e.target.value)}
        >
          <option value="semantic">Semantic model</option>
          <option value="context-map">Bounded-context map</option>
          <option value="c4-context">C4 system context</option>
          <option value="c4-container">C4 containers</option>
          {data.scenes
            .filter(
              (s: any) =>
                ![
                  "semantic",
                  "context-map",
                  "c4-context",
                  "c4-container",
                ].includes(s.id),
            )
            .map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Proposal overlay"
          value={overlay}
          onChange={(e) => setOverlay(e.target.value)}
          disabled={historical}
        >
          <option value="">Accepted model only</option>
          {data.proposals
            .filter((p: any) => p.status === "pending")
            .map((p: any) => (
              <option key={p.id} value={p.id}>
                Proposed: {p.title}
              </option>
            ))}
        </select>
        <Badge tone={dirty ? "amber" : "green"}>
          {historical
            ? "Historical / read only"
            : dirty
              ? "Visual draft"
              : "Layout saved"}
        </Badge>
        <div className="spacer" />
        <button
          disabled={historical || !!overlay}
          onClick={() => {
            loading.current = true;
            const next = project(draft.current, hidden, true);
            api.updateScene({ elements: next });
            draft.current = next;
            setDirty(true);
            setTimeout(() => (loading.current = false), 50);
          }}
        >
          <Network size={15} />
          Auto-layout
        </button>
        <button onClick={download}>
          <Download size={15} />
          SVG
        </button>
        <button
          className="primary"
          disabled={!dirty || historical || !!overlay}
          onClick={() => save()}
        >
          <Save size={15} />
          Save view
        </button>
      </div>
      {(message || conflict) && (
        <div className="canvas-message">
          {conflict
            ? "Another tab saved this view. Your local draft is preserved."
            : message}
          {conflict && (
            <>
              <button onClick={() => save(true)}>Save as new view</button>
              <button
                onClick={() => {
                  localStorage.removeItem(`tracework.scene.${w.id}.${view}`);
                  setConflict(false);
                  setApi(null);
                  setTimeout(() => location.reload(), 0);
                }}
              >
                Reload saved view
              </button>
            </>
          )}
        </div>
      )}
      <div className="excalidraw-host">
        <Excalidraw
          excalidrawAPI={setApi}
          onChange={changed}
          viewModeEnabled={historical || !!overlay}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: false,
            },
          }}
        />
      </div>
      <div className="canvas-footer">
        <span>
          <Network size={14} />
          {objects.length} projected elements · managed shapes preserve accepted
          names and connections
        </span>
        <button
          disabled={historical}
          onClick={() => inspect({ kind: "create", objectKind: "element" })}
        >
          <Plus size={14} />
          Promote a sketch through a human command
        </button>
      </div>
    </div>
  );
}
