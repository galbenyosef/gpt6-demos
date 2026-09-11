import type { CrosstalkApplication, CrosstalkTool, CrosstalkToolDefinition, CrosstalkToolContext } from '../../cross-talk/src/protocol';
import { CrosstalkError } from '../../cross-talk/src/protocol';
import { europaManifest, type EuropaState } from './manifest';
import type { EuropaController } from './EuropaController';
const input = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
export function createEuropaCrosstalkAdapter(controller: EuropaController): CrosstalkApplication<EuropaState> {
  const tool = (definition: Omit<CrosstalkToolDefinition, 'effect' | 'confirmation' | 'interruptible'> & Partial<CrosstalkToolDefinition>, execute: (args: any, context: CrosstalkToolContext) => unknown): CrosstalkTool => ({
    definition: { effect: 'navigation', confirmation: 'never', interruptible: false, ...definition },
    execute(args, context) {
      context.signal.throwIfAborted();
      if (!controller.getState().ready) throw new CrosstalkError('APPLICATION_NOT_READY', 'The 3D explorer is still loading.', true);
      return execute(args, context);
    },
  });
  return { manifest: europaManifest, getState: controller.getState, subscribe: controller.subscribe, tools: [
    tool({ name: 'show_perspective', title: 'Show architectural perspective', description: 'Move to urban (wide surroundings), street (entrance) or aerial (roof) view. Use for a new angle or to guide exploration. Resolves after the camera settles.', inputSchema: input({ perspective: { type: 'string', enum: ['urban', 'street', 'aerial'] } }), interruptible: true, expectedDurationMs: 1400 }, async ({ perspective }, context) => { await controller.setPerspective(perspective, context.signal); return { perspective, settled: true }; }),
    tool({ name: 'set_lighting', title: 'Change environmental lighting', description: 'Change simulated time of day: day for daylight, golden for sunset, blue for blue hour or dusk.', inputSchema: input({ lighting: { type: 'string', enum: ['day', 'golden', 'blue'] } }) }, ({ lighting }) => { controller.setLighting(lighting); return { lighting }; }),
    tool({ name: 'set_auto_rotation', title: 'Control automatic rotation', description: 'Start or stop the slow automatic orbit around the building.', inputSchema: input({ enabled: { type: 'boolean' } }) }, ({ enabled }) => { controller.setAutoRotate(enabled); return { autoRotate: enabled }; }),
    tool({ name: 'adjust_zoom', title: 'Adjust view distance', description: 'Move closer to or farther from the current focus. The default amount is medium.', inputSchema: input({ direction: { type: 'string', enum: ['closer', 'farther'] }, amount: { type: 'string', enum: ['small', 'medium', 'large'] } }, ['direction']) }, ({ direction, amount }) => { controller.adjustZoom(direction, amount); return { zoomLevel: controller.getState().zoomLevel }; }),
    tool({ name: 'reset_view', title: 'Reset current perspective', description: 'Return the camera to its currently selected predefined perspective without changing lighting.', inputSchema: input({}), interruptible: true, expectedDurationMs: 1400 }, async (_, context) => { await controller.resetPerspective(context.signal); return { perspective: controller.getState().perspective, settled: true }; }),
    tool({ name: 'capture_view', title: 'Save current architectural view', description: 'Download the visible perspective as a 3840 × 2160 PNG. Only execute for a direct save request or after confirmation; a question about saving does not request a download.', inputSchema: input({}), effect: 'external', confirmation: 'when-not-explicit' }, () => controller.capture()),
  ] };
}
