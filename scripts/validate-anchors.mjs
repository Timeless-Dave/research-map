// Validates src/data/place-anchors.json.
//
// Fails on data that would route someone wrongly or that claims a verification
// it cannot support. Does NOT fail merely because a place has no anchors —
// coverage is expected to be partial for a long time, and an absent anchor
// degrades safely to the labelled centroid fallback.
//
// Run: pnpm run validate:anchors
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  booleanPointInPolygon,
  point,
  distance,
  polygonToLine,
  pointToLineDistance,
} from "@turf/turf";
import { CAMPUS_PLACES } from "../src/lib/campus-places.generated.ts";
import { checkDriveAccess, checkPedestrianProximity, drivableRoads } from "../src/lib/osm-network-check.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ANCHORS_PATH = join(root, "src/data/place-anchors.json");
const NETWORK_PATH = join(root, "data/osm-network.json");
/** CI passes this so a missing snapshot is a failure, not a silent skip. */
const REQUIRE_NETWORK = process.argv.includes("--require-network");

const ANCHOR_TYPES = new Set(["walking", "accessible", "parking", "dropoff"]);
const SOURCES = new Set(["osm", "imagery", "campus-authority"]);
const STATUSES = new Set(["unverified", "verified", "rejected"]);

/**
 * An entrance must sit on, or immediately against, its own building footprint.
 * Measured to the footprint BOUNDARY, not the centroid — a centroid-distance
 * test lets a point far outside a large building pass simply because the
 * building is big.
 */
const ENTRANCE_MAX_BOUNDARY_M = 15;
/** Parking and drop-off are legitimately further away. */
const OFFSITE_MAX_M = 0.5;

const errors = [];
const warnings = [];

/** Shortest distance from a point to a polygon's edge, in metres. */
function boundaryDistanceMetres(pt, footprint) {
  const line = polygonToLine(footprint);
  const parts = line.type === "FeatureCollection" ? line.features : [line];
  let best = Infinity;
  for (const part of parts) {
    best = Math.min(best, pointToLineDistance(pt, part, { units: "kilometers" }) * 1000);
  }
  return best;
}

if (!existsSync(ANCHORS_PATH)) {
  console.log("validate-anchors: no anchor file yet — nothing to validate");
  process.exit(0);
}

const anchors = JSON.parse(readFileSync(ANCHORS_PATH, "utf8"));
const geojson = JSON.parse(readFileSync(join(root, "public/buildings.geojson"), "utf8"));

const footprints = new Map();
for (const feature of geojson.features) {
  const id = feature.properties?.building_id;
  if (!id || id === "building" || footprints.has(id)) continue;
  if (feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon") {
    footprints.set(id, feature);
  }
}

// ── Structural road-access check ────────────────────────────────────────────
// STRUCTURAL ONLY: "reachable in OpenStreetMap", never "verified by campus".
// Nothing here changes an anchor's verification status.
let network = null;
let roads = [];
if (existsSync(NETWORK_PATH)) {
  network = JSON.parse(readFileSync(NETWORK_PATH, "utf8"));
  roads = drivableRoads(network);
  if (roads.length === 0) {
    const msg = "network snapshot contains no drivable roads — drive access not checked";
    if (REQUIRE_NETWORK) errors.push(msg);
    else warnings.push(msg);
  }
} else {
  const msg = `no network snapshot at data/osm-network.json — drive access not checked (run pnpm fetch:network)`;
  if (REQUIRE_NETWORK) errors.push(msg);
  else warnings.push(msg);
}
const parkingAreas = new Map((network?.parking ?? []).map((a) => [a.id, a]));

let total = 0;
const byStatus = {};
const byType = {};
const accessCounts = { ok: 0, warn: 0, error: 0, "no-network": 0 };

for (const [placeId, list] of Object.entries(anchors)) {
  const place = CAMPUS_PLACES[placeId];
  if (!place) {
    errors.push(`${placeId}: not a known campus place`);
    continue;
  }
  if (!Array.isArray(list)) {
    errors.push(`${placeId}: anchors must be an array`);
    continue;
  }

  for (const [i, a] of list.entries()) {
    total++;
    const at = `${placeId}[${i}] (${a.type ?? "?"})`;

    if (!ANCHOR_TYPES.has(a.type)) errors.push(`${at}: unknown type`);
    if (!SOURCES.has(a.source)) errors.push(`${at}: unknown source "${a.source}"`);
    if (!STATUSES.has(a.verification)) errors.push(`${at}: unknown verification "${a.verification}"`);

    byStatus[a.verification] = (byStatus[a.verification] ?? 0) + 1;
    byType[a.type] = (byType[a.type] ?? 0) + 1;

    if (!Number.isFinite(a.lng) || !Number.isFinite(a.lat)) {
      errors.push(`${at}: non-finite coordinates`);
      continue;
    }
    if (a.lng < -92.1 || a.lng > -91.95 || a.lat < 34.2 || a.lat > 34.3) {
      errors.push(`${at}: coordinates outside the campus region`);
      continue;
    }

    // A claimed verification must name who and when, or it is not a claim
    // anyone can audit later.
    if (a.verification === "verified") {
      if (!a.verifiedBy) errors.push(`${at}: verified without verifiedBy`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.verifiedAt ?? "")) {
        errors.push(`${at}: verified without a valid verifiedAt (YYYY-MM-DD)`);
      }
      if (a.source === "osm") {
        warnings.push(`${at}: marked verified but still sourced "osm" — set source once a person confirms it`);
      }
    }

    const pt = point([a.lng, a.lat]);
    const centre = point([place.lng, place.lat]);
    const km = distance(pt, centre, { units: "kilometers" });
    const footprint = footprints.get(placeId);

    if (a.type === "walking" || a.type === "accessible") {
      if (network) {
        const proximity = checkPedestrianProximity([a.lng, a.lat], network);
        console.log(`  pedestrian proximity: ${at}: ${proximity.message}`);
        if (proximity.verdict !== "ok") warnings.push(`${at}: ${proximity.message}`);
      }
      if (!footprint) {
        errors.push(`${at}: no footprint for this place, so the entrance cannot be checked`);
        continue;
      }
      const inside = booleanPointInPolygon(pt, footprint);
      if (!inside) {
        const boundaryM = boundaryDistanceMetres(pt, footprint);
        if (boundaryM > ENTRANCE_MAX_BOUNDARY_M) {
          errors.push(
            `${at}: entrance is ${Math.round(boundaryM)}m outside the building footprint ` +
              `(limit ${ENTRANCE_MAX_BOUNDARY_M}m)`
          );
        }
      }
    } else if (km > OFFSITE_MAX_M) {
      errors.push(`${at}: ${a.type} is ${Math.round(km * 1000)}m away — too far to be this place's`);
    }

    // Proximity only: neither adjacency nor a component proves an access connection.
    if ((a.type === "parking" || a.type === "dropoff") && (network || REQUIRE_NETWORK)) {
      const area = a.osmId ? parkingAreas.get(a.osmId) : undefined;
      const access = checkDriveAccess([a.lng, a.lat], roads, area);
      accessCounts[access.verdict] = (accessCounts[access.verdict] ?? 0) + 1;
      if (access.verdict === "error") {
        errors.push(`${at}: ${access.message}`);
      } else if (access.verdict === "warn") {
        warnings.push(`${at}: ${access.message}`);
      }
      // A missing/empty snapshot is reported once at the top level rather than
      // repeated for every anchor.
    }
  }
}

// The safety invariant, stated as a check rather than left to code review.
const unusableAccessible = Object.entries(anchors).flatMap(([placeId, list]) =>
  (list ?? [])
    .filter((a) => a.type === "accessible" && a.verification === "unverified")
    .map((a) => `${placeId} (${a.source})`)
);

console.log(
  `validate-anchors: ${total} anchors across ${Object.keys(anchors).length}/${Object.keys(CAMPUS_PLACES).length} places`
);
console.log(`  by type:   ${JSON.stringify(byType)}`);
console.log(`  by status: ${JSON.stringify(byStatus)}`);
if (network) {
  console.log(
    `  road proximity (OSM ${network.fetchedAt}; NOT reachability or campus verification): ` +
      `${JSON.stringify(accessCounts)} over ${roads.length} drivable ways`
  );
}
if (unusableAccessible.length) {
  console.log(
    `  note: ${unusableAccessible.length} unverified accessible anchor(s) present and correctly NOT offered as guidance`
  );
}
for (const w of warnings) console.log(`  warning: ${w}`);

if (errors.length) {
  console.error(`\nvalidate-anchors FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("validate-anchors OK");
