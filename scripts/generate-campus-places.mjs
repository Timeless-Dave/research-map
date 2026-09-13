// Generates src/lib/campus-places.generated.ts from public/buildings.geojson.
//
// A "place" is any GeoJSON feature carrying a real building_id. The generated
// module is the single source of truth for which ids are addressable and where
// a route should start/end for each — previously only the 16 seeded API
// buildings had coordinates, so directions to any other campus building failed.
//
// Run: node scripts/generate-campus-places.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pointOnFeature } from "@turf/turf";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GENERIC_ID = "building";

const geojson = JSON.parse(readFileSync(join(root, "public/buildings.geojson"), "utf8"));

const places = new Map();
let skipped = 0;

for (const feature of geojson.features) {
  const id = feature.properties?.building_id;
  if (!id || id === GENERIC_ID) {
    skipped++;
    continue;
  }
  if (places.has(id)) continue;

  // point-on-feature guarantees a coordinate inside the footprint, unlike a
  // mean of ring vertices which drifts outside concave/L-shaped buildings.
  const [lng, lat] = pointOnFeature(feature).geometry.coordinates;
  places.set(id, {
    id,
    name: feature.properties?.name ?? id,
    // Codes are typed as strings; a few features carry a numeric literal.
    code: feature.properties?.code ? String(feature.properties.code) : null,
    lng: Number(lng.toFixed(6)),
    lat: Number(lat.toFixed(6)),
  });
}

const sorted = [...places.values()].sort((a, b) => a.id.localeCompare(b.id));

const body = sorted
  .map(
    (p) =>
      `  "${p.id}": { id: "${p.id}", name: ${JSON.stringify(p.name)}, code: ${
        p.code ? JSON.stringify(p.code) : "null"
      }, lng: ${p.lng}, lat: ${p.lat} },`
  )
  .join("\n");

const out = `// GENERATED FILE — do not edit by hand.
// Source: public/buildings.geojson
// Regenerate: node scripts/generate-campus-places.mjs

export interface CampusPlace {
  id: string;
  name: string;
  code: string | null;
  /** Routable coordinate guaranteed to fall inside the building footprint. */
  lng: number;
  lat: number;
}

export const CAMPUS_PLACES: Record<string, CampusPlace> = {
${body}
};

export const CAMPUS_PLACE_IDS: readonly string[] = Object.keys(CAMPUS_PLACES);

export function getCampusPlace(id: string): CampusPlace | null {
  return CAMPUS_PLACES[id] ?? null;
}

export function isKnownPlaceId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CAMPUS_PLACES, id);
}
`;

writeFileSync(join(root, "src/lib/campus-places.generated.ts"), out);
console.log(
  `campus-places: ${sorted.length} places written, ${skipped} features skipped (missing or generic building_id)`
);
