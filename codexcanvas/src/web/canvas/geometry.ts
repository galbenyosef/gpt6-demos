import { isVisible } from '../../shared/presentation';
import type { Camera, CanvasObject, ObjectType } from '../../shared/types';
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
export function placeObject(objects: CanvasObject[], turnId: string, type: ObjectType = 'activity', width = 480, height = 340) {
  const conversation = objects.find(o => o.type === 'conversation')!;
  // Reuse predictable slots for each turn. Historical and hidden cards reserve no space.
  const x = conversation.x + conversation.width + 80 + (type === 'activity' ? 510 : 0);
  let y = conversation.y + (type === 'diff' ? 328 : 0);
  const obstacles = objects.filter(o => o.type !== 'conversation' && isVisible(o, turnId));
  for (const o of obstacles.sort((a, b) => a.y - b.y)) {
    const bottom = o.y + (o.collapsed ? 46 : o.height);
    if (x < o.x + o.width + 24 && x + width + 24 > o.x && y < bottom + 24 && y + height + 24 > o.y) y = bottom + 28;
  }
  return { x, y };
}
