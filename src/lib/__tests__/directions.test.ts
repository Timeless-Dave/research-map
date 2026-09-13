import { expect, it } from 'vitest';
import { combineRouteLegs, parseDirectionsResponse } from '../directions';
const response = () => ({ code: 'Ok', routes: [{ geometry: { type: 'LineString', coordinates: [[-92.02,34.24],[-92.021,34.241]] }, distance: 100, duration: 80, legs: [{ steps: [] }] }] });
it('validates route geometry and totals before exposing them to the map', () => {
  const raw = response();
  expect(parseDirectionsResponse(raw,'walking').distanceMeters).toBe(100);
  raw.routes[0].geometry.coordinates[0][0] = NaN;
  expect(() => parseDirectionsResponse(raw,'walking')).toThrow(/invalid route/);
  const negative = response(); negative.routes[0].distance = -1;
  expect(() => parseDirectionsResponse(negative,'walking')).toThrow(/invalid route/);
  expect(() => parseDirectionsResponse(null,'walking')).toThrow();
});
it('does not invent a connector between differently snapped route legs', () => {
  const drive = parseDirectionsResponse(response(),'driving');
  const raw = response(); raw.routes[0].geometry.coordinates = [[-92.022,34.242],[-92.023,34.243]];
  const walk = parseDirectionsResponse(raw,'walking');
  const route = combineRouteLegs(drive,walk,{drive:'Parking',walk:'Entrance'});
  expect(route.geometry.type).toBe('MultiLineString');
  expect(route.geometry.coordinates).toEqual([drive.geometry.coordinates,walk.geometry.coordinates]);
  expect(route.handoffGapMeters).toBeGreaterThan(100);
  expect(route.distanceMeters).toBe(200);
});
