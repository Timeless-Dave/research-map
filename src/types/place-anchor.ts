/**
 * Navigation anchors: the specific points a route should actually start from or
 * end at for a campus place.
 *
 * Routing to a building's geometric centre is wrong in ways that matter — a
 * driver gets snapped to whatever road segment happens to be nearest, which may
 * be a service road or the wrong side of the building. These anchors let each
 * place declare real arrival points, and let the UI say which one it used.
 */

export type AnchorType =
  /** Public pedestrian entrance. */
  | "walking"
  /** Accessible entrance. Only ever used when verification is "verified". */
  | "accessible"
  /** Visitor parking area to drive to. */
  | "parking"
  /** Passenger drop-off / loading point. */
  | "dropoff";

export type AnchorSource =
  /** Imported from OpenStreetMap by scripts/import-osm-anchors.mjs. */
  | "osm"
  /** Placed by inspecting satellite imagery. */
  | "imagery"
  /** Supplied by UAPB facilities/campus authority. */
  | "campus-authority";

export type VerificationStatus =
  /** Nobody with campus knowledge has confirmed this point. */
  | "unverified"
  /** Confirmed by a named person on a known date. */
  | "verified"
  /** Checked and found wrong; retained so an importer cannot re-add it. */
  | "rejected";

export interface PlaceAnchor {
  type: AnchorType;
  lng: number;
  lat: number;
  source: AnchorSource;
  verification: VerificationStatus;
  /** Who confirmed it. Required once verification is "verified". */
  verifiedBy?: string;
  /** ISO date (YYYY-MM-DD) of that confirmation. */
  verifiedAt?: string;
  /** Free-text context: which door, which lot, why it was rejected. */
  note?: string;
  /** Provenance for re-imports, e.g. "node/1234567". */
  osmId?: string;
}

export type PlaceAnchors = Record<string, PlaceAnchor[]>;

/**
 * Whether an anchor may be presented as accessibility guidance.
 *
 * Deliberately strict: an unverified "accessible" entrance that turns out to
 * have steps is worse than offering nothing, because someone will rely on it.
 */
export function isUsableAccessibleAnchor(anchor: PlaceAnchor): boolean {
  return anchor.type === "accessible" && anchor.verification === "verified";
}

/** Anchors that may be used for non-accessibility routing. */
export function isUsableAnchor(anchor: PlaceAnchor): boolean {
  if (anchor.verification === "rejected") return false;
  if (anchor.type === "accessible") return isUsableAccessibleAnchor(anchor);
  return true;
}
