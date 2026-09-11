/** Geographic reference supplied by the user; geometry remains interpretive. */
export const buildingReference = {
  latitude: 39 + 28 / 60 + 18.4 / 3600,
  longitude: -(21 / 60 + 25.5 / 3600),
  frontBearingDegrees: 10,
  coordinatesDms: '39°28′18.4″N 0°21′25.5″W',
} as const;

// Entrance is -X in the model; +Y is up. Left/right are as seen facing
// the entrance from outside: left = -Z, right = +Z.
export const sideBearings = { front: 10, left: 100, back: 190, right: 280 } as const;
export type BuildingSide = keyof typeof sideBearings;
export const compassBearings = { north: 0, northeast: 45, east: 90, southeast: 135, south: 180, southwest: 225, west: 270, northwest: 315 } as const;
export type SpatialDestination = BuildingSide | keyof typeof compassBearings;
export const sideSectors = ['front', 'front-left', 'left', 'back-left', 'back', 'back-right', 'right', 'front-right'] as const;
export const compassPoints = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export interface Point3 { x: number; y: number; z: number }
export interface SpatialState {
  cameraSide: typeof sideSectors[number] | 'overhead';
  cameraBearingDegrees: number | null;
  cameraCompass: typeof compassPoints[number] | null;
  lookBearingDegrees: number | null;
  elevationDegrees: number;
  distanceToCenter: number;
  focusOffset: number;
}
export const buildingCenter: Point3 = { x: 0, y: 24, z: 0 };
export const normalizeBearing = (degrees: number) => ((degrees % 360) + 360) % 360;
const round = (value: number) => Math.round(value * 10) / 10;
export function worldBearing(x: number, z: number) {
  return normalizeBearing(buildingReference.frontBearingDegrees + Math.atan2(-z, -x) * 180 / Math.PI);
}
export function bearingPosition(bearing: number, radius: number, y: number): Point3 {
  const angle = (bearing - buildingReference.frontBearingDegrees) * Math.PI / 180;
  return { x: -Math.cos(angle) * radius, y, z: -Math.sin(angle) * radius };
}
export function spatialState(camera: Point3, target: Point3): SpatialState {
  const horizontal = Math.hypot(camera.x, camera.z);
  const bearing = horizontal < .01 ? null : worldBearing(camera.x, camera.z);
  const dx = target.x - camera.x, dz = target.z - camera.z;
  return {
    cameraSide: bearing === null ? 'overhead' : sideSectors[Math.floor((normalizeBearing(bearing - buildingReference.frontBearingDegrees) + 22.5) / 45) % 8]!,
    cameraBearingDegrees: bearing === null ? null : normalizeBearing(round(bearing)),
    cameraCompass: bearing === null ? null : compassPoints[Math.floor((bearing + 22.5) / 45) % 8]!,
    lookBearingDegrees: Math.hypot(dx, dz) < .01 ? null : normalizeBearing(round(worldBearing(dx, dz))),
    elevationDegrees: round(Math.atan2(camera.y - buildingCenter.y, horizontal) * 180 / Math.PI),
    distanceToCenter: round(Math.hypot(horizontal, camera.y - buildingCenter.y)),
    focusOffset: round(Math.hypot(target.x, target.y - buildingCenter.y, target.z)),
  };
}
export function destinationBearing(destination: SpatialDestination) {
  return destination in sideBearings ? sideBearings[destination as BuildingSide] : compassBearings[destination as keyof typeof compassBearings];
}
export const shortestTurn = (from: number, to: number) => normalizeBearing(to - from + 180) - 180;
/** Pull away before orbiting, then follow an arc outside the building footprint. */
export function orbitPosition(start: Point3, turnDegrees: number, progress: number): Point3 {
  const radius = Math.hypot(start.x, start.z);
  const safeRadius = Math.max(75, radius);
  const pull = Math.min(1, progress / .25);
  const orbit = Math.max(0, (progress - .25) / .75);
  return bearingPosition(worldBearing(start.x, start.z) + turnDegrees * orbit,
    radius + (safeRadius - radius) * pull, start.y);
}
