import { test, expect } from 'bun:test';
import { EuropaController, type EuropaExplorer } from './EuropaController';
import { createEuropaCrosstalkAdapter } from './adapter';
import { validateRegistration } from '../../cross-talk/src/protocol/validation';
import { ToolExecutor } from '../../cross-talk/src/client/ToolExecutor';
import type { EuropaState } from './manifest';

test('all seven Europa tools share state, rendering and semantic events with manual operations', async () => {
  let zoom: EuropaState['zoomLevel'] = 'normal', downloads = 0, renders: EuropaState[] = [], events = 0, manual: ((kind: 'manual' | 'zoom') => void) | undefined;
  const explorer: EuropaExplorer = {
    async setPerspective() { zoom = 'normal'; }, setLighting() {}, setAutoRotate() {}, adjustZoom(factor) { zoom = factor < 1 ? 'close' : 'wide'; }, capture() { downloads++; }, getZoomLevel: () => zoom,
    onNavigationChange(fn) { manual = fn; return () => {}; },
  };
  let fullscreen = false, displayChanges = 0, fullscreenChanged = () => {};
  const controller = new EuropaController(explorer, state => renders.push(state), {
    isFullscreen: () => fullscreen,
    async setFullscreen(enabled) { fullscreen = enabled; displayChanges++; fullscreenChanged(); },
    onFullscreenChange(listener) { fullscreenChanged = listener; return () => {}; },
  }); controller.subscribe(() => events++);
  const application = createEuropaCrosstalkAdapter(controller); controller.setReady(true);
  validateRegistration({ manifest: application.manifest, tools: application.tools.map(t => t.definition), state: controller.getState() });
  expect(application.tools).toHaveLength(7);
  const executor = new ToolExecutor(application, 'session');
  const run = (tool: string, args: unknown, explicit = true) => executor.execute({ type: 'tool.invoke', invocationId: crypto.randomUUID(), delegationId: 'goal', sessionId: 'session', tool, arguments: args, explicitUserRequest: explicit, confirmed: false, expiresAt: Date.now() + 5000 });
  expect((await run('set_fullscreen', { enabled: 'true' })).ok).toBe(false);
  expect(displayChanges).toBe(0);
  for (const enabled of [true, true, false, false]) {
    expect((await run('set_fullscreen', { enabled })).ok).toBe(true);
    expect(controller.getState().fullscreen).toBe(enabled);
  }
  expect(displayChanges).toBe(2);
  fullscreen = true; fullscreenChanged(); expect(renders.at(-1)?.fullscreen).toBe(true);
  fullscreen = false; fullscreenChanged(); expect(renders.at(-1)?.fullscreen).toBe(false);
  for (const perspective of ['urban', 'street', 'aerial'] as const) {
    expect((await run('show_perspective', { perspective })).ok).toBe(true); expect(controller.getState().perspective).toBe(perspective); expect(controller.getState().transitioning).toBe(false); expect(controller.getState().visibleFeatures.length).toBeGreaterThan(0);
  }
  for (const lighting of ['day', 'golden', 'blue'] as const) { expect((await run('set_lighting', { lighting })).ok).toBe(true); expect(controller.getState().lighting).toBe(lighting); }
  for (const enabled of [true, false]) { await run('set_auto_rotation', { enabled }); expect(controller.getState().autoRotate).toBe(enabled); }
  await run('adjust_zoom', { direction: 'closer' }); expect(controller.getState().zoomLevel).toBe('close');
  await run('adjust_zoom', { direction: 'farther', amount: 'large' }); expect(controller.getState().zoomLevel).toBe('wide');
  await run('reset_view', {}); expect(controller.getState().zoomLevel).toBe('normal');
  expect((await run('capture_view', {}, false)).ok).toBe(false); expect(downloads).toBe(0);
  expect((await run('capture_view', {})).ok).toBe(true); expect(downloads).toBe(1);
  controller.setLighting('golden'); expect(application.getState()).toMatchObject({ lighting: 'golden' });
  manual?.('manual'); expect(controller.getState().visibleFeatures).toEqual([]); expect(controller.getState().viewAdjusted).toBe(true);
  expect(renders.at(-1)).toEqual(controller.getState()); expect(events).toBe(renders.length);
});

test('cancelled camera movement reports an unsettled view and rejects tool success', async () => {
  const explorer: EuropaExplorer = { setPerspective: (_, signal) => new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))), setLighting() {}, setAutoRotate() {}, adjustZoom() {}, capture() {}, getZoomLevel: () => 'normal' };
  const controller = new EuropaController(explorer); controller.setReady(true);
  const signal = new AbortController(); const movement = controller.setPerspective('aerial', signal.signal);
  expect(controller.getState().transitioning).toBe(true); signal.abort(); await expect(movement).rejects.toThrow();
  expect(controller.getState()).toMatchObject({ transitioning: false, viewAdjusted: true, visibleFeatures: [] });
});
