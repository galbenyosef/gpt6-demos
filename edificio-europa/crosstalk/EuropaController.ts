import type { CrosstalkApplicationEvent } from '../../cross-talk/src/protocol';
import { perspectives, type EuropaState, type ViewMode, type LightMode } from './manifest';
export interface EuropaExplorer {
  setPerspective(view: ViewMode, signal?: AbortSignal): Promise<void>;
  setLighting(mode: LightMode): void;
  setAutoRotate(value: boolean): void;
  adjustZoom(factor: number): void;
  capture(): void;
  getZoomLevel(): EuropaState['zoomLevel'];
  onNavigationChange?(listener: (kind: 'manual' | 'zoom') => void): () => void;
}
/** Shared by the human controls and the Crosstalk adapter. */
export class EuropaController {
  private ready = false;
  private perspective: ViewMode = 'urban';
  private lighting: LightMode = 'day';
  private autoRotate = false;
  private adjusted = false;
  private transitioning = false;
  private revision = 0;
  private listeners = new Set<(event: CrosstalkApplicationEvent) => void>();
  constructor(private explorer: EuropaExplorer, private render: (state: EuropaState) => void = () => {}) {
    explorer.onNavigationChange?.(kind => { if (kind === 'manual') this.adjusted = true; this.changed('navigation.changed'); });
  }
  getState = (): EuropaState => ({ ready: this.ready, perspective: this.perspective, lighting: this.lighting, autoRotate: this.autoRotate,
    zoomLevel: this.explorer.getZoomLevel(), visibleFeatures: this.adjusted || this.transitioning || this.autoRotate ? [] : [...perspectives[this.perspective].visibleFeatures], viewAdjusted: this.adjusted, transitioning: this.transitioning });
  subscribe = (listener: (event: CrosstalkApplicationEvent) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private changed(type: string) { this.render(this.getState()); const event = { type, timestamp: Date.now() }; this.listeners.forEach(listener => listener(event)); }
  setReady(ready: boolean) { this.ready = ready; this.changed('readiness.changed'); }
  async setPerspective(view: ViewMode, signal?: AbortSignal) {
    signal?.throwIfAborted(); const revision = ++this.revision;
    this.perspective = view; this.adjusted = false; this.transitioning = true; this.changed('perspective.changed');
    try { await this.explorer.setPerspective(view, signal); }
    catch (error) { if (this.revision === revision) this.adjusted = true; throw error; }
    finally { if (this.revision === revision) { this.transitioning = false; this.changed('perspective.settled'); } }
  }
  setLighting(mode: LightMode) { this.explorer.setLighting(mode); this.lighting = mode; this.changed('lighting.changed'); }
  setAutoRotate(enabled: boolean) { this.explorer.setAutoRotate(enabled); if (this.autoRotate && !enabled) this.adjusted = true; this.autoRotate = enabled; this.changed('rotation.changed'); }
  adjustZoom(direction: 'closer' | 'farther', amount: 'small' | 'medium' | 'large' = 'medium') {
    const factors = { closer: { small: .90, medium: .82, large: .68 }, farther: { small: 1.10, medium: 1.22, large: 1.45 } };
    this.explorer.adjustZoom(factors[direction][amount]); this.changed('zoom.changed');
  }
  resetPerspective(signal?: AbortSignal) { return this.setPerspective(this.perspective, signal); }
  capture() { this.explorer.capture(); return { width: 3840, height: 2160, format: 'png', downloaded: true }; }
}
