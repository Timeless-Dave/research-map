// Imports candidate navigation anchors from OpenStreetMap into
// src/data/place-anchors.json.
//
// Every imported anchor is written as verification:"unverified". The file is
// hand-editable and is the source of truth: this script MERGES, and never
// modifies or removes an anchor a human has marked "verified" or "rejected".
// Campus-authority verification is therefore a data-only edit — no routing code
// changes, no re-import required.
//
// Coverage note: OSM has very little entrance data for this campus (3 nodes,
// none wheelchair-tagged). Parking is the one category it covers usefully.
//
// Run: pnpm run import:anchors
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPUS_PLACES } from "../src/lib/campus-places.generated.ts";
import { drivableRoads, parkingAccessPoint } from "../src/lib/osm-network-check.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/data/place-anchors.json");
const NETWORK_PATH = join(root, "data/osm-network.json");

function meanVertex(coords) {
  const lng = coords.reduce((t, c) => t + c[0], 0) / coords.length;
  const lat = coords.reduce((t, c) => t + c[1], 0) / coords.length;
  return { lng, lat };
}

const ENTRANCE_MAX_M = 60;
const PARKING_MAX_M = 200;

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function metres(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestPlace(point, maxMetres) {
  let best = null;
  let bestDistance = Infinity;
  for (const place of Object.values(CAMPUS_PLACES)) {
    const d = metres(point, place);
    if (d < bestDistance) {
      bestDistance = d;
      best = place;
    }
  }
  return best && bestDistance <= maxMetres ? { place: best, metres: bestDistance } : null;
}

function classifyEntrance(tags) {
  // Only a wheelchair=yes tag justifies an accessible candidate, and even then
  // it lands as "unverified" and so stays unusable until a human confirms it.
  if (tags.wheelchair === "yes") return "accessible";
  if (tags.entrance === "service" || tags.entrance === "delivery") return null;
  return "walking";
}

function sameSpot(a, b) {
  return metres(a, b) < 5 && a.type === b.type;
}

async function run() {
  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const merged = structuredClone(existing);

  // Reads the committed snapshot rather than calling Overpass, so an import is
  // reproducible and reviewable. Refresh it with `pnpm fetch:network`.
  if (!existsSync(NETWORK_PATH)) {
    throw new Error("no data/osm-network.json — run `pnpm fetch:network` first");
  }
  const network = JSON.parse(readFileSync(NETWORK_PATH, "utf8"));
  const roads = drivableRoads(network);

  const candidates = [];

  for (const node of network.entrances) {
    const type = classifyEntrance(node.tags);
    if (!type) continue;
    const hit = nearestPlace({ lng: node.lng, lat: node.lat }, ENTRANCE_MAX_M);
    if (!hit) continue;
    candidates.push({
      placeId: hit.place.id,
      anchor: {
        type,
        lng: node.lng,
        lat: node.lat,
        source: "osm",
        verification: "unverified",
        note: `OSM entrance=${node.tags.entrance}, ${Math.round(hit.metres)}m from place centre`,
        osmId: node.id,
      },
    });
  }

  for (const area of network.parking) {
    // Anchor the lot at the boundary point facing a drivable road — that is
    // where a driver actually arrives. Falls back to the polygon's mean vertex
    // when no road is near enough to choose a side.
    const access = parkingAccessPoint(area, roads);
    const anchorPoint = access
      ? { lng: access.coord[0], lat: access.coord[1] }
      : meanVertex(area.coords);

    const hit = nearestPlace(anchorPoint, PARKING_MAX_M);
    if (!hit) continue;
    candidates.push({
      placeId: hit.place.id,
      anchor: {
        type: "parking",
        lng: Number(anchorPoint.lng.toFixed(6)),
        lat: Number(anchorPoint.lat.toFixed(6)),
        source: "osm",
        verification: "unverified",
        note:
          `OSM amenity=parking${area.tags.access ? ` access=${area.tags.access}` : ""}, ` +
          `${Math.round(hit.metres)}m from place centre` +
          (access ? `, ${Math.round(access.road.metres)}m from ${access.road.wayId}` : ", no drivable road nearby"),
        osmId: area.id,
      },
    });
  }

  let added = 0;
  let skippedHuman = 0;

  for (const { placeId, anchor } of candidates) {
    const list = (merged[placeId] ??= []);

    // Never touch, duplicate, or resurrect anything a human has ruled on.
    const humanRuling = list.find(
      (a) => a.verification !== "unverified" && sameSpot(a, anchor)
    );
    if (humanRuling) {
      skippedHuman++;
      continue;
    }
    if (list.some((a) => a.osmId === anchor.osmId && a.type === anchor.type)) continue;
    if (list.some((a) => sameSpot(a, anchor))) continue;

    list.push(anchor);
    added++;
  }

  // Keep only one parking candidate per place — the closest — so the picker is
  // not swamped by every lot within 200m.
  for (const [placeId, list] of Object.entries(merged)) {
    const place = CAMPUS_PLACES[placeId];
    if (!place) continue;
    const parking = list.filter((a) => a.type === "parking" && a.verification === "unverified" && a.source === "osm");
    if (parking.length <= 1) continue;
    parking.sort((a, b) => metres(a, place) - metres(b, place));
    for (const extra of parking.slice(1)) {
      merged[placeId] = merged[placeId].filter((a) => a !== extra);
    }
  }

  for (const key of Object.keys(merged)) {
    if (merged[key].length === 0) delete merged[key];
  }

  const sorted = Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");

  const counts = {};
  for (const list of Object.values(sorted)) {
    for (const a of list) counts[`${a.type}/${a.verification}`] = (counts[`${a.type}/${a.verification}`] ?? 0) + 1;
  }
  console.log(
    `import-osm-anchors: +${added} new, ${skippedHuman} left alone (human-ruled)\n` +
      `  places with anchors: ${Object.keys(sorted).length} / ${Object.keys(CAMPUS_PLACES).length}\n` +
      `  ${JSON.stringify(counts)}`
  );
}

run().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
