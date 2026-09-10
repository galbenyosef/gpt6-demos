import type { Camera, CanvasObject } from '../../shared/types';
export const clampZoom = (zoom: number) => Math.max(.25, Math.min(2, zoom));
export const screenToWorld = (x: number, y: number, c: Camera) => ({ x: (x - c.x) / c.zoom, y: (y - c.y) / c.zoom });
export const worldToScreen = (x: number, y: number, c: Camera) => ({ x: x * c.zoom + c.x, y: y * c.zoom + c.y });
export function zoomAt(c: Camera, x: number, y: number, zoom: number): Camera {
  const point = screenToWorld(x, y, c); zoom = clampZoom(zoom);
  return { x: x - point.x * zoom, y: y - point.y * zoom, zoom };
}
export function fit(objects: CanvasObject[], width: number, height: number): Camera {
  if (!objects.length) return { x: 0, y: 0, zoom: 1 };
  const left = Math.min(...objects.map(o => o.x)), top = Math.min(...objects.map(o => o.y));
  const w = Math.max(...objects.map(o => o.x + o.width)) - left;
  const h = Math.max(...objects.map(o => o.y + (o.collapsed ? 46 : o.height))) - top;
  const zoom = clampZoom(Math.min((width - 100) / w, (height - 150) / h, 1));
  return { x: (width - w * zoom) / 2 - left * zoom, y: (height - h * zoom) / 2 - top * zoom, zoom };
}
export function placeObject(objects: CanvasObject[], turnId: string) {
  const conversation = objects.find(o => o.type === 'conversation')!;
  const siblings = objects.filter(o => o.turnId === turnId);
  const others = objects.filter(o => o.type !== 'conversation');
  const x = conversation.x + conversation.width + 80;
  const groupTop = siblings.length ? Math.min(...siblings.map(o => o.y)) : Math.max(conversation.y, ...others.map(o => o.y + o.height + 80));
  // Two columns, chronological turn groups. Existing positions are never rewritten.
  const column = siblings.length % 2;
  let y = groupTop;
  const candidateX = x + column * 510;
  for (const o of [...others].sort((a, b) => a.y - b.y)) if (candidateX < o.x + o.width + 24 && candidateX + 480 + 24 > o.x && y < o.y + o.height + 24 && y + 340 + 24 > o.y) y = o.y + o.height + 28;
  return { x: candidateX, y };
}
