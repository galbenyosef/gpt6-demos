import { SceneInput, ensure } from "../../../../packages/contracts";
import type { ObjectRevision } from "../../../../packages/contracts";
import { Store, id, now } from "../storage/store";
export type Scene = {
  id: string;
  workspaceId: string;
  revision: number;
  projection?: string;
  name: string;
  contextVersionId: string;
  elements: unknown[];
  hiddenIds: string[];
  updatedAt: string;
};
export function saveScene(s: Store, w: string, viewId: string, input: unknown) {
  const c = SceneInput.parse(input);
  s.version(w, c.contextVersionId);
  return s.tx(() => {
    const old = s.maybe<Scene>("scene", w, viewId);
    ensure(
      (old?.revision ?? 0) === c.expectedSceneRevision,
      "SCENE_CONFLICT",
      "Another tab saved this view. Your unsaved draft is preserved; reload or save as a new view.",
      409,
    );
    const value: Scene = {
      id: viewId,
      workspaceId: w,
      revision: (old?.revision ?? 0) + 1,
      projection: c.projection,
      name: c.name,
      contextVersionId: c.contextVersionId,
      elements: c.elements,
      hiddenIds: c.hiddenIds,
      updatedAt: now(),
    };
    if (old) s.update("scene", w, value);
    else s.insert("scene", w, value);
    return value;
  });
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function exportProjection(
  s: Store,
  w: string,
  versionId: string,
  filter: string,
) {
  const snap = s.snapshot(w, versionId);
  const nodes = snap.objects.filter(
    (o) =>
      o.kind === "element" &&
      (filter === "all" || filter === "context"
        ? filter === "all" || ["actor", "software-system"].includes(o.type)
        : filter === "container"
          ? ["actor", "software-system", "container"].includes(o.type)
          : o.type === filter),
  );
  const positions = new Map(
    nodes.map((o, i) => [
      o.id,
      { x: 40 + (i % 4) * 250, y: 90 + Math.floor(i / 4) * 150 },
    ]),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${Math.max(320, Math.ceil(nodes.length / 4) * 150 + 100)}" role="img" aria-label="Accepted semantic projection"><metadata>Tracework context ${escape(snap.version.id)}, version ${snap.version.sequence}</metadata><rect width="100%" height="100%" fill="#faf9f5"/><text x="40" y="40" font-family="sans-serif" font-size="20">${escape(s.getWorkspace(w).name)} · accepted version ${snap.version.sequence}</text>${snap.objects
    .filter((o) => o.kind === "relationship")
    .map((o) => {
      if (o.kind !== "relationship") return "";
      const a = positions.get(o.from),
        b = positions.get(o.to);
      return a && b
        ? `<path d="M${a.x + 105} ${a.y + 80} L${b.x + 105} ${b.y}" stroke="#87948f" fill="none"/><text x="${(a.x + b.x) / 2 + 105}" y="${(a.y + b.y) / 2 + 40}" font-size="10" fill="#42554b">${escape(o.type)}</text>`
        : "";
    })
    .join("")}${nodes
    .map((o) => {
      const p = positions.get(o.id)!;
      return `<g><rect x="${p.x}" y="${p.y}" width="210" height="80" rx="6" fill="#eef2ec" stroke="#82958a"/><text x="${p.x + 12}" y="${p.y + 27}" font-family="sans-serif" font-size="12" fill="#496451">${o.kind === "element" ? escape(o.type) : ""}</text><text x="${p.x + 12}" y="${p.y + 53}" font-family="sans-serif" font-size="14">${escape(o.name.slice(0, 27))}</text></g>`;
    })
    .join("")}</svg>`;
}
