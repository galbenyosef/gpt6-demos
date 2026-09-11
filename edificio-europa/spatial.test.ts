import { expect, test } from 'bun:test';
import { bearingPosition, buildingCenter, buildingReference, destinationBearing, orbitPosition, shortestTurn, spatialState, worldBearing } from './spatial';

test('user geographic reference maps the modeled entrance and fixed sides without reversing east and west', () => {
  expect(buildingReference.latitude).toBeCloseTo(39.471777778, 8);
  expect(buildingReference.longitude).toBeCloseTo(-.357083333, 8);
  for (const [x, z, side, bearing, compass] of [
    [-100, 0, 'front', 10, 'N'], [100, 0, 'back', 190, 'S'],
    [0, -100, 'left', 100, 'E'], [0, 100, 'right', 280, 'W'],
  ] as const) {
    const state = spatialState({ x, y: 24, z }, buildingCenter);
    expect(state).toMatchObject({ cameraSide: side, cameraBearingDegrees: bearing, cameraCompass: compass, lookBearingDegrees: (bearing + 180) % 360, focusOffset: 0 });
    expect(destinationBearing(side)).toBe(bearing);
  }
});

test('geographic positions, camera heading and offset focus are separate', () => {
  const north = bearingPosition(destinationBearing('north'), 100, 74);
  expect(worldBearing(north.x, north.z)).toBeCloseTo(0, 7);
  expect(spatialState(north, buildingCenter)).toMatchObject({ cameraBearingDegrees: 0, lookBearingDegrees: 180, cameraSide: 'front', cameraCompass: 'N' });
  const panned = spatialState(north, { x: 40, y: 24, z: 50 });
  expect(panned.cameraBearingDegrees).toBe(0);
  expect(panned.lookBearingDegrees).not.toBe(180);
  expect(panned.focusOffset).toBeGreaterThan(60);
  expect(panned.elevationDegrees).toBeCloseTo(26.6, 1);
  expect(spatialState({ x: 0, y: 100, z: 0 }, buildingCenter)).toMatchObject({ cameraSide: 'overhead', cameraBearingDegrees: null, cameraCompass: null, lookBearingDegrees: null, elevationDegrees: 90 });
});

test('relative orbit follows an exterior arc and handles north wraparound', () => {
  const start = { x: -40, y: 40, z: 0 };
  for (let step = 0; step <= 100; step++) {
    const progress = step / 100;
    const point = orbitPosition(start, 180, progress);
    expect(point.y).toBe(40);
    expect(Math.hypot(point.x, point.z)).toBeGreaterThanOrEqual(40 - 1e-8);
    if (progress >= .25) expect(Math.hypot(point.x, point.z)).toBeCloseTo(75, 7);
    else expect(worldBearing(point.x, point.z)).toBeCloseTo(10, 7);
  }
  expect(spatialState(orbitPosition(start, 180, 1), buildingCenter).cameraSide).toBe('back');
  expect(spatialState(orbitPosition(start, 90, 1), buildingCenter).cameraSide).toBe('left');
  expect(spatialState(orbitPosition(start, -90, 1), buildingCenter).cameraSide).toBe('right');
  expect(shortestTurn(350, 10)).toBe(20);
  expect(shortestTurn(10, 350)).toBe(-20);
});
