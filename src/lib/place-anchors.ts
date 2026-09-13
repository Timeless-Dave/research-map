import anchorData from "@/data/place-anchors.json";
import { getCampusPlace } from "@/lib/campus-places.generated";
import {
  isUsableAccessibleAnchor,
  isUsableAnchor,
  type AnchorType,
  type PlaceAnchor,
  type PlaceAnchors,
} from "@/types/place-anchor";

const ANCHORS = anchorData as PlaceAnchors;

/** How the user wants to travel. Distinct from the anchor type it resolves to. */
export type RouteMode = "walking" | "driving" | "accessible";

export interface ResolvedTarget {
  coord: [number, number];
  /** Which anchor kind was used, or "centroid" when none applied. */
  via: AnchorType | "centroid";
  /**
   * True when the point is the building's centre rather than a real arrival
   * point. The UI must say so — the route ends "near" the place, not at a door.
   */
  approximate: boolean;
  /** True when the anchor exists but nobody with campus knowledge confirmed it. */
  unverified: boolean;
  note?: string;
}

export function getAnchors(placeId: string): PlaceAnchor[] {
  return ANCHORS[placeId] ?? [];
}

function pick(placeId: string, type: AnchorType): PlaceAnchor | null {
  const matches = getAnchors(placeId).filter((a) => a.type === type && isUsableAnchor(a));
  if (matches.length === 0) return null;
  // Human-confirmed points win over imported candidates.
  return matches.find((a) => a.verification === "verified") ?? matches[0];
}

/**
 * Whether this place has a confirmed accessible entrance to route *to*.
 *
 * This says nothing about the path: the route is built on Mapbox's ordinary
 * walking profile, which carries no accessibility attributes and may include
 * stairs, curbs, or steep grades. Only the destination is vouched for, so the
 * UI must never describe the resulting route as step-free.
 */
export function hasVerifiedAccessibleEntrance(placeId: string): boolean {
  return getAnchors(placeId).some(isUsableAccessibleAnchor);
}

function centroidTarget(placeId: string): ResolvedTarget | null {
  const place = getCampusPlace(placeId);
  if (!place) return null;
  return {
    coord: [place.lng, place.lat],
    via: "centroid",
    approximate: true,
    unverified: false,
  };
}

function fromAnchor(anchor: PlaceAnchor): ResolvedTarget {
  return {
    coord: [anchor.lng, anchor.lat],
    via: anchor.type,
    approximate: false,
    unverified: anchor.verification === "unverified",
    note: anchor.note,
  };
}

/**
 * The point a route should end at for this place and travel mode.
 *
 * Accessible mode returns null rather than falling back: a route that silently
 * ends at an unverified door, or at the building centre, is guidance someone
 * could act on and get hurt by. Callers must not offer the mode when this
 * returns null.
 */
export function resolveDestination(placeId: string, mode: RouteMode): ResolvedTarget | null {
  if (mode === "accessible") {
    const accessible = pick(placeId, "accessible");
    return accessible ? fromAnchor(accessible) : null;
  }

  if (mode === "driving") {
    const drive = pick(placeId, "parking") ?? pick(placeId, "dropoff");
    return drive ? fromAnchor(drive) : centroidTarget(placeId);
  }

  const walk = pick(placeId, "walking");
  return walk ? fromAnchor(walk) : centroidTarget(placeId);
}

/** Where a route should start from when leaving this place. */
export function resolveOrigin(placeId: string, mode: RouteMode): ResolvedTarget | null {
  return resolveDestination(placeId, mode === "accessible" ? "walking" : mode);
}

/**
 * Driving to a parking area leaves the visitor with a walk they were never
 * told about. When a place has both a parking anchor and a distinct on-foot
 * arrival point, the route is built as drive-then-walk.
 */
export interface HandoffPlan {
  drive: ResolvedTarget;
  walk: ResolvedTarget;
}

/** Below this the parking area effectively is the destination. */
export const HANDOFF_MIN_METRES = 40;

export function planDrivingHandoff(placeId: string): HandoffPlan | null {
  const parking = pick(placeId, "parking") ?? pick(placeId, "dropoff");
  if (!parking) return null;

  const onFoot = pick(placeId, "walking");
  const finalTarget = onFoot ? fromAnchor(onFoot) : centroidTarget(placeId);
  if (!finalTarget) return null;

  const drive = fromAnchor(parking);
  if (metresBetween(drive.coord, finalTarget.coord) < HANDOFF_MIN_METRES) return null;

  return { drive, walk: finalTarget };
}

export function metresBetween(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Short phrase for what the route actually ends at. */
export function describeTarget(target: ResolvedTarget): string {
  switch (target.via) {
    case "accessible":
      return "accessible entrance";
    case "walking":
      return target.unverified ? "entrance (unconfirmed)" : "entrance";
    case "parking":
      return target.unverified ? "nearby parking (unconfirmed)" : "visitor parking";
    case "dropoff":
      return target.unverified ? "drop-off point (unconfirmed)" : "drop-off point";
    case "centroid":
      return "building centre (approximate)";
  }
}
