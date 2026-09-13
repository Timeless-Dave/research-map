// Client-side Mapbox Directions API helper. NEXT_PUBLIC_MAPBOX_TOKEN is a
// public token — safe to call directly from the browser, no server proxy needed.
import { distance } from '@turf/turf';

export type TravelProfile = "walking" | "driving";

export interface DirectionsStep {
  instruction: string;
  distanceMeters: number;
  location: [number, number];
}

export interface DirectionsResult {
  profile: TravelProfile;
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
  distanceMeters: number;
  durationSeconds: number;
  steps: DirectionsStep[];
  /**
   * Present when the trip is more than one mode — currently drive-to-parking
   * followed by walk-to-entrance. `geometry` and the totals cover the whole
   * trip; these describe each portion.
   */
  segments?: DirectionsSegment[];
  /** What the route actually ends at, e.g. "entrance (unconfirmed)". */
  destinationLabel?: string;
  handoffGapMeters?: number;
}

export interface DirectionsSegment {
  profile: TravelProfile;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  stepCount: number;
}

export class DirectionsError extends Error {}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

interface MapboxDirectionsResponse {
  code: string;
  routes?: {
    geometry: GeoJSON.LineString;
    distance: number;
    duration: number;
    legs: {
      steps: {
        distance: number;
        maneuver: { instruction: string; location: [number, number] };
      }[];
    }[];
  }[];
}

/** Abort/timeout is the caller's concern — a superseded request must not win. */
export const DIRECTIONS_TIMEOUT_MS = 15_000;

function validPosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

export function parseDirectionsResponse(raw: unknown, profile: TravelProfile): DirectionsResult {
  const body = raw as MapboxDirectionsResponse | null;
  const route = Array.isArray(body?.routes) ? body.routes[0] : null;
  if (body?.code !== 'Ok' || !route) throw new DirectionsError('No route could be found between those two points.');
  if (route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates)
    || route.geometry.coordinates.length < 2 || !route.geometry.coordinates.every(validPosition)
    || !Number.isFinite(route.distance) || route.distance < 0
    || !Number.isFinite(route.duration) || route.duration < 0
    || !Array.isArray(route.legs) || route.legs.length === 0
    || !route.legs.every(leg => leg && Array.isArray(leg.steps) && leg.steps.every(s => s
      && Number.isFinite(s.distance) && s.distance >= 0 && s.maneuver
      && typeof s.maneuver.instruction === 'string' && validPosition(s.maneuver.location)))) {
    throw new DirectionsError('The directions service returned invalid route data. Please try again.');
  }
  return { profile, geometry: route.geometry, distanceMeters: route.distance, durationSeconds: route.duration,
    steps: route.legs.flatMap(leg => leg.steps.map(s => ({ instruction: s.maneuver.instruction,
      distanceMeters: s.distance, location: s.maneuver.location }))) };
}

export function routeParts(route: DirectionsResult): GeoJSON.Position[][] {
  return route.geometry.type === 'LineString' ? [route.geometry.coordinates] : route.geometry.coordinates;
}

export async function getRoute(
  from: [number, number],
  to: [number, number],
  profile: TravelProfile,
  signal?: AbortSignal
): Promise<DirectionsResult> {
  if (!MAPBOX_TOKEN) {
    throw new DirectionsError("Directions are unavailable — no Mapbox token configured.");
  }

  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}` +
    `?geometries=geojson&steps=true&overview=full&access_token=${MAPBOX_TOKEN}`;

  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    // A cancelled request is not a failure to report — the caller superseded it.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new DirectionsError("Could not reach the directions service. Check your connection.");
  }

  if (!res.ok) {
    throw new DirectionsError(`Directions request failed (HTTP ${res.status}).`);
  }

  return parseDirectionsResponse(await res.json(), profile);
}

const METERS_PER_MILE = 1609.34;
const METERS_PER_FOOT = 0.3048;

export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.3) {
    const feet = Math.round(meters / METERS_PER_FOOT);
    return `${feet} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "< 1 min";
  return `${minutes} min`;
}

/**
 * Builds a drive-then-walk trip: one driving leg to the parking area, one
 * walking leg from there to the arrival point.
 *
 * Driving straight to a building's centre snaps to whatever segment is nearest,
 * which regularly means an inaccessible service road. Routing to parking and
 * then telling the visitor about the remaining walk is the honest version.
 */
export async function getRouteWithHandoff(
  from: [number, number],
  driveTo: [number, number],
  walkTo: [number, number],
  labels: { drive: string; walk: string },
  signal?: AbortSignal
): Promise<DirectionsResult> {
  const [driveLeg, walkLeg] = await Promise.all([
    getRoute(from, driveTo, "driving", signal),
    getRoute(driveTo, walkTo, "walking", signal),
  ]);

  return combineRouteLegs(driveLeg, walkLeg, labels);
}

export function combineRouteLegs(driveLeg: DirectionsResult, walkLeg: DirectionsResult, labels: { drive: string; walk: string }): DirectionsResult {
  const driving = routeParts(driveLeg);
  const walking = routeParts(walkLeg);
  const driveEnd = driving.at(-1)!.at(-1)!;
  const walkStart = walking[0][0];

  return {
    profile: "driving",
    geometry: {
      type: "MultiLineString",
      coordinates: [...driving, ...walking],
    },
    handoffGapMeters: distance(driveEnd, walkStart, { units: 'meters' }),
    distanceMeters: driveLeg.distanceMeters + walkLeg.distanceMeters,
    durationSeconds: driveLeg.durationSeconds + walkLeg.durationSeconds,
    steps: [...driveLeg.steps, ...walkLeg.steps],
    segments: [
      {
        profile: "driving",
        label: labels.drive,
        distanceMeters: driveLeg.distanceMeters,
        durationSeconds: driveLeg.durationSeconds,
        stepCount: driveLeg.steps.length,
      },
      {
        profile: "walking",
        label: labels.walk,
        distanceMeters: walkLeg.distanceMeters,
        durationSeconds: walkLeg.durationSeconds,
        stepCount: walkLeg.steps.length,
      },
    ],
  };
}
