import {
  lineString,
  lineIntersect,
  nearestPointOnLine,
  point,
  pointToLineDistance,
} from "@turf/turf";

/** Snapshot proximity diagnostics, NOT connected, public, or accessible routing.
 * Even a zero distance can hide a fence, grade separation, or missing driveway.
 * No result upgrades anchor verification. */

export interface OsmWay {
  id: string;
  tags: Record<string, string>;
  /** [lng, lat] pairs. */
  coords: [number, number][];
}

export interface OsmNetwork {
  fetchedAt: string;
  bbox: number[];
  entrances: { id: string; tags: Record<string, string>; lng: number; lat: number }[];
  parking: OsmWay[];
  highways: OsmWay[];
}

/** Highway values a car can normally drive on to reach a parking area. */
const DRIVABLE_HIGHWAY = new Set([
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
]);

/** Values that mean "not available to a visitor driving in". */
const CLOSED_ACCESS = new Set(["private", "no", "customers", "permit", "military", "delivery"]);

/**
 * Whether a way is usable for driving to parking.
 *
 * Deliberately stricter than "has a highway tag": footpaths, steps and tracks
 * are not car access, and a segment tagged private or access=no is not a route
 * a visitor may take even though it is geometrically adjacent.
 */
export function isDrivableRoad(tags: Record<string, string>): boolean {
  const highway = tags.highway;
  if (!highway || !DRIVABLE_HIGHWAY.has(highway)) return false;

  const permission = tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access;
  if (permission && CLOSED_ACCESS.has(permission)) return false;
  if (tags.service === "driveway" && !permission) return false;
  if (tags.bridge && tags.bridge !== "no") return false;
  if (tags.tunnel && tags.tunnel !== "no") return false;

  return true;
}

export function drivableRoads(network: OsmNetwork): OsmWay[] {
  return network.highways.filter((w) => isDrivableRoad(w.tags));
}

export interface NearestRoad {
  wayId: string;
  metres: number;
  /** Point on the road nearest the queried location. */
  at: [number, number];
}

/** Nearest drivable road to a point, or null when none are in range. */
export function nearestDrivableRoad(
  coord: [number, number],
  roads: OsmWay[]
): NearestRoad | null {
  const pt = point(coord);
  let best: NearestRoad | null = null;

  for (const road of roads) {
    if (road.coords.length < 2) continue;
    const line = lineString(road.coords);
    const metres = pointToLineDistance(pt, line, { units: "kilometers" }) * 1000;
    if (!best || metres < best.metres) {
      const snapped = nearestPointOnLine(line, pt);
      best = {
        wayId: road.id,
        metres,
        at: snapped.geometry.coordinates as [number, number],
      };
    }
  }
  return best;
}

/** Closest boundary point, NOT a parking entrance. Both sets of endpoints and
 * segment intersections are tested, so a long edge is not reduced to vertices. */
export function parkingAccessPoint(area: OsmWay, roads: OsmWay[]): { coord: [number, number]; road: NearestRoad } | null {
  if (area.coords.length < 2) return null;
  const boundary = lineString(area.coords);
  let best: { coord: [number, number]; road: NearestRoad } | null = null;
  const consider = (coord: [number, number], candidates: OsmWay[]) => {
    const road = nearestDrivableRoad(coord, candidates);
    if (road && (!best || road.metres < best.road.metres)) best = { coord, road };
  };
  for (const vertex of area.coords) consider(vertex, roads);
  for (const road of roads) {
    if (road.coords.length < 2) continue;
    for (const vertex of road.coords) consider(nearestPointOnLine(boundary, point(vertex)).geometry.coordinates as [number, number], [road]);
    for (const hit of lineIntersect(boundary, lineString(road.coords)).features) consider(hit.geometry.coordinates as [number, number], [road]);
  }
  return best;
}

/** Pedestrian ways only; steps are included because this is NOT accessibility validation. */
export function pedestrianWays(network: OsmNetwork): OsmWay[] {
  return network.highways.filter(w => {
    const permission = w.tags.foot ?? w.tags.access;
    return ['footway', 'path', 'pedestrian', 'steps', 'living_street'].includes(w.tags.highway)
      && (!permission || !CLOSED_ACCESS.has(permission));
  });
}

export function checkPedestrianProximity(coord: [number, number], network: OsmNetwork): AccessResult {
  const hit = nearestDrivableRoad(coord, pedestrianWays(network));
  return { verdict: !hit ? 'no-network' : hit.metres > 25 ? 'warn' : 'ok',
    metres: hit ? Math.round(hit.metres) : null, wayId: hit?.wayId ?? null,
    message: hit ? `${Math.round(hit.metres)}m from mapped pedestrian way ${hit.wayId} — proximity only; connection and accessibility unverified`
      : 'no eligible pedestrian ways in snapshot — proximity not checked' };
}

/** Coordinate-sharing diagnostic, not a routing graph: the snapshot lacks node
 * IDs, turn restrictions, gates and explicit parking-to-road connections. */
export function roadComponentSize(id: string, roads: OsmWay[]): number {
  const byNode = new Map<string, string[]>();
  for (const road of roads) for (const coord of road.coords) {
    const key = `${coord.join(',')}:${road.tags.layer ?? '0'}`;
    byNode.set(key, [...(byNode.get(key) ?? []), road.id]);
  }
  const visited = new Set<string>();
  const queue = [id];
  const index = new Map(roads.map(r => [r.id, r]));
  while (queue.length) {
    const next = queue.pop()!;
    if (visited.has(next) || !index.has(next)) continue;
    visited.add(next);
    const road = index.get(next)!;
    for (const coord of road.coords) queue.push(...(byNode.get(`${coord.join(',')}:${road.tags.layer ?? '0'}`) ?? []).filter(n => !visited.has(n)));
  }
  return visited.size;
}

export type AccessVerdict = "ok" | "warn" | "error" | "no-network";

export interface AccessResult {
  verdict: AccessVerdict;
  metres: number | null;
  wayId: string | null;
  message: string;
}

/** Proximity thresholds only. Distance cannot establish physical reachability. */
export const ACCESS_OK_M = 25;
export const ACCESS_WARN_M = 60;

/** Parking proximity; missing driveways and disconnected roads remain unverified. */
export function checkDriveAccess(
  anchor: [number, number],
  roads: OsmWay[],
  area?: OsmWay
): AccessResult {
  if (area) {
    const permission = area.tags.motorcar ?? area.tags.motor_vehicle ?? area.tags.vehicle ?? area.tags.access;
    if (permission && CLOSED_ACCESS.has(permission)) return { verdict: "error", metres: null, wayId: null, message: "parking area has restricted visitor access in OSM" };
  }
  if (roads.length === 0) {
    return {
      verdict: "no-network",
      metres: null,
      wayId: null,
      message: "no drivable roads in the network snapshot — access not checked",
    };
  }

  const viaArea = area ? parkingAccessPoint(area, roads) : null;
  const road = viaArea?.road ?? nearestDrivableRoad(anchor, roads);
  const from = viaArea ? "parking boundary" : "anchor point";

  if (!road) {
    return {
      verdict: "error",
      metres: null,
      wayId: null,
      message: `no drivable road found near the ${from}`,
    };
  }

  const metres = Math.round(road.metres);
  const caveat = `proximity only; access connection unverified; ${roadComponentSize(road.wayId, roads)} ways in coordinate-sharing component`;
  if (road.metres <= ACCESS_OK_M) {
    return { verdict: "ok", metres, wayId: road.wayId, message: `${metres}m from ${road.wayId} (${from}) — ${caveat}` };
  }
  if (road.metres <= ACCESS_WARN_M) {
    return {
      verdict: "warn",
      metres,
      wayId: road.wayId,
      message: `${metres}m from the nearest drivable road (${road.wayId}, measured from ${from}) — ${caveat}`,
    };
  }
  return {
    verdict: "error",
    metres,
    wayId: road.wayId,
    message: `${metres}m from the nearest drivable road (${road.wayId}, measured from ${from}) — outside proximity threshold; ${caveat}`,
  };
}
