import type { CrosstalkApplicationManifest } from '../../cross-talk/src/protocol';
export type ViewMode = 'urban' | 'street' | 'aerial';
export type LightMode = 'day' | 'golden' | 'blue';
export interface EuropaState {
  ready: boolean; perspective: ViewMode; lighting: LightMode; autoRotate: boolean;
  zoomLevel: 'close' | 'normal' | 'wide'; visibleFeatures: string[];
  viewAdjusted: boolean; transitioning: boolean;
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
    ],
    knowledge: [
      { id: 'overview', title: 'Building overview', text: 'The model represents a Valencia office landmark with dark vertical stone ribs, reflective glass facades, a cylindrical corner entrance and a pronounced upper crown.' },
      { id: 'entrance', title: 'Entrance', text: 'The narrow-end entrance has a glazed lobby, canopy, entrance steps and street furniture. The street perspective emphasizes the entrance.' },
      { id: 'roof', title: 'Roof', text: 'The roof includes a recessed plant area, perimeter structures and mechanical elements, best explored from the aerial perspective.' },
      { id: 'context', title: 'Urban context', text: 'Landscaping, roads, trees, street furniture and simplified neighboring urban volumes provide context in the urban perspective.' },
      { id: 'capture', title: 'Save a view', text: 'The current architectural view can be downloaded as a 3840 × 2160 PNG.' },
    ],
    limitations: [
      'The reconstruction is interpretive and derived from photographs, not a measured architectural survey. Unseen dimensions and surfaces are approximated.',
      'Only exterior viewpoints are available; there are no explorable office interiors.',
      'Crosstalk receives semantic state, not a live canvas or video feed. Do not infer arbitrary pixels or what is on the left.',
      'perspective is the last selected preset. When viewAdjusted, transitioning, or autoRotate is true, exact visible features are unknown and visibleFeatures is empty.',
    ],
  },
  interaction: { conversationalGuidance: ['Speak in the user’s language.', 'Use semantic tools for exploration. Explain limitations when a requested view is unavailable.', 'For a tour, use a short sequence of perspectives with commentary after each has settled.'] },
  stateSchema: { type: 'object', properties: {
    ready: { type: 'boolean' }, perspective: { enum: ['urban', 'street', 'aerial'] }, lighting: { enum: ['day', 'golden', 'blue'] }, autoRotate: { type: 'boolean' },
    zoomLevel: { enum: ['close', 'normal', 'wide'] }, visibleFeatures: { type: 'array', items: { type: 'string' } }, viewAdjusted: { type: 'boolean' }, transitioning: { type: 'boolean' },
  }, required: ['ready', 'perspective', 'lighting', 'autoRotate', 'zoomLevel', 'visibleFeatures', 'viewAdjusted', 'transitioning'], additionalProperties: false },
};
