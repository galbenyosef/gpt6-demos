import type { CrosstalkApplicationManifest } from '../../cross-talk/src/protocol';
import { buildingReference, compassPoints, sideSectors, type SpatialState } from '../spatial';
export type ViewMode = 'urban' | 'street' | 'aerial';
export type LightMode = 'day' | 'golden' | 'blue';
export interface EuropaState {
  ready: boolean; perspective: ViewMode; lighting: LightMode; autoRotate: boolean; fullscreen: boolean;
  zoomLevel: 'close' | 'normal' | 'wide'; visibleFeatures: string[];
  viewAdjusted: boolean; transitioning: boolean;
  spatial: SpatialState | null;
}
export const perspectives = {
  urban: { description: 'Wide view of the overall silhouette and urban surroundings.', visibleFeatures: ['overall-form', 'vertical-stone-ribs', 'reflective-glass', 'corner-entrance', 'urban-context'] },
  street: { description: 'Ground-level view of the entrance, facade scale and street relationship.', visibleFeatures: ['entrance', 'glazed-lobby', 'canopy', 'vertical-stone-ribs', 'reflective-glass', 'landscaping'] },
  aerial: { description: 'Elevated view of the roof geometry and surrounding urban fabric.', visibleFeatures: ['roof', 'plant-area', 'building-massing', 'urban-context'] },
};
export const europaManifest: CrosstalkApplicationManifest = {
  schemaVersion: '1.0',
  application: { id: 'edificio-europa', name: 'Edificio Europa', version: '1.0.0', summary: 'Interactive 3D architectural reconstruction of Edificio Europa in Valencia, Spain.', purpose: 'Explore the exterior building and its urban context through several viewpoints and lighting conditions.' },
  domain: {
    concepts: [
      { id: 'perspective', name: 'Perspective', description: Object.entries(perspectives).map(([id, p]) => `${id}: ${p.description}`).join(' ') },
      { id: 'lighting', name: 'Lighting', description: 'day means daylight; golden means warm sunset or golden hour; blue means blue hour or dusk.' },
      { id: 'feature', name: 'Architectural feature', description: 'A recognizable part of the reconstructed exterior.' },
      { id: 'orientation', name: 'Building orientation', description: 'Front is the entrance (outward bearing 010°), back is the opposite end (190°). Left and right are fixed as seen standing outside facing the entrance: left 100° (east), right 280° (west). They do not change when the camera moves. Orbit left/right instead moves the camera relative to its current position around the building.' },
    ],
    knowledge: [
      { id: 'overview', title: 'Building overview', text: 'The model represents a Valencia office landmark with dark vertical stone ribs, reflective glass facades, a cylindrical corner entrance and a pronounced upper crown.' },
      { id: 'entrance', title: 'Entrance', text: 'The narrow-end entrance has a glazed lobby, canopy, entrance steps and street furniture. The street perspective emphasizes the entrance.' },
      { id: 'roof', title: 'Roof', text: 'The roof includes a recessed plant area, perimeter structures and mechanical elements, best explored from the aerial perspective.' },
      { id: 'context', title: 'Urban context', text: 'Landscaping, roads, trees, street furniture and simplified neighboring urban volumes provide context in the urban perspective.' },
      { id: 'capture', title: 'Save a view', text: 'The current architectural view can be downloaded as a 3840 × 2160 PNG.' },
      { id: 'location', title: 'Location and geographic reference', text: `User-supplied coordinates: ${buildingReference.coordinatesDms} (${buildingReference.latitude.toFixed(6)}, ${buildingReference.longitude.toFixed(6)}). The entrance faces 10° east of north. Compass bearings use this supplied orientation; it is not a surveyed calibration.` },
      { id: 'spatial-state', title: 'Read the current camera orientation', text: 'spatial is calculated from the live camera, including manual orbit, pan and automatic rotation. cameraSide and cameraBearingDegrees describe where the camera is relative to the building center; lookBearingDegrees is the direction the camera looks, usually the opposite bearing. cameraCompass is an eight-point compass label. elevationDegrees is relative to the building center at mid-height. distanceToCenter and focusOffset use approximate model units, not surveyed meters; focusOffset measures how far the orbit target is from the building center. A large focusOffset means the user has panned away. These fields describe position, not guaranteed visibility or occlusion.' },
    ],
    limitations: [
      'The reconstruction is interpretive and derived from photographs, not a measured architectural survey. Unseen dimensions and surfaces are approximated.',
      'Only exterior viewpoints are available; there are no explorable office interiors.',
      'Geographic orientation uses the user-supplied reference. Lighting presets are artistic, not a geographic sun simulation, and surrounding urban volumes are approximate.',
      'Entering fullscreen may require a recent user click. If set_fullscreen returns USER_ACTIVATION_REQUIRED, ask the user to click the fullscreen button; do not claim fullscreen was entered. Exiting fullscreen does not require a click.',
      'Crosstalk receives semantic state, not a live canvas or video feed. Spatial orientation does not prove a feature is visible. Do not infer arbitrary pixels or screen-left feature positions.',
      'perspective is the last selected preset. When viewAdjusted, transitioning, or autoRotate is true, exact visible features are unknown and visibleFeatures is empty.',
    ],
  },
  interaction: { conversationalGuidance: ['Speak in the user’s language.', 'Use semantic tools for exploration. Explain limitations when a requested view is unavailable.', 'Use show_side for the front, back, building sides or compass sides. Use orbit_view for moving left/right relative to the current camera. Use show_perspective street for a close entrance composition. Side and orbit navigation stop auto-rotation and recenter on the building.', 'Read spatial for the current orientation; perspective is only the last selected preset. A view FROM the north looks roughly south. If spatial is null, current orientation is unavailable.', 'For a tour, use a short sequence of perspectives or sides with commentary after each has settled.'] },
  stateSchema: { type: 'object', properties: {
    ready: { type: 'boolean' }, perspective: { enum: ['urban', 'street', 'aerial'] }, lighting: { enum: ['day', 'golden', 'blue'] }, autoRotate: { type: 'boolean' }, fullscreen: { type: 'boolean' },
    zoomLevel: { enum: ['close', 'normal', 'wide'] }, visibleFeatures: { type: 'array', items: { type: 'string' } }, viewAdjusted: { type: 'boolean' }, transitioning: { type: 'boolean' },
    spatial: { anyOf: [{ type: 'null' }, { type: 'object', properties: {
      cameraSide: { enum: [...sideSectors, 'overhead'] }, cameraBearingDegrees: { type: ['number', 'null'], minimum: 0, exclusiveMaximum: 360 },
      cameraCompass: { enum: [...compassPoints, null] }, lookBearingDegrees: { type: ['number', 'null'], minimum: 0, exclusiveMaximum: 360 },
      elevationDegrees: { type: 'number', minimum: -90, maximum: 90 }, distanceToCenter: { type: 'number', minimum: 0 }, focusOffset: { type: 'number', minimum: 0 },
    }, required: ['cameraSide', 'cameraBearingDegrees', 'cameraCompass', 'lookBearingDegrees', 'elevationDegrees', 'distanceToCenter', 'focusOffset'], additionalProperties: false }] },
  }, required: ['ready', 'perspective', 'lighting', 'autoRotate', 'fullscreen', 'zoomLevel', 'visibleFeatures', 'viewAdjusted', 'transitioning', 'spatial'], additionalProperties: false },
};
