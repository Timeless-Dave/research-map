// Snapshots the OSM data the anchor tooling needs into data/osm-network.json.
//
// Fetching happens here and only here, so `import:anchors` and
// `validate:anchors` are deterministic and run offline — CI never depends on
// Overpass being reachable, and a network outage cannot change a validation
// result.
//
// Run: pnpm run fetch:network
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "data/osm-network.json");
const BBOX = [34.235, -92.035, 34.255, -92.005];

const QUERY = `[out:json][timeout:120];
(
  node["entrance"](${BBOX.join(",")});
  way["amenity"="parking"](${BBOX.join(",")});
  way["highway"](${BBOX.join(",")});
);
out geom;`;

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  body: "data=" + encodeURIComponent(QUERY),
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "uapb-research-map/1.0 (campus navigation anchors)",
  },
});
if (!res.ok) {
  console.error(`Overpass HTTP ${res.status}`);
  process.exit(1);
}
const text = await res.text();
if (!text.trimStart().startsWith("{")) {
  console.error(`Overpass returned non-JSON: ${text.slice(0, 160)}`);
  process.exit(1);
}

const { elements = [] } = JSON.parse(text);
const round = (n) => Number(n.toFixed(6));
const ring = (geometry) => (geometry ?? []).map((p) => [round(p.lon), round(p.lat)]);

const entrances = [];
const parking = [];
const highways = [];

for (const el of elements) {
  const tags = el.tags ?? {};
  if (el.type === "node" && tags.entrance) {
    entrances.push({ id: `node/${el.id}`, tags, lng: round(el.lon), lat: round(el.lat) });
  } else if (el.type === "way" && tags.amenity === "parking") {
    const coords = ring(el.geometry);
    if (coords.length >= 3) parking.push({ id: `way/${el.id}`, tags, coords });
  } else if (el.type === "way" && tags.highway) {
    const coords = ring(el.geometry);
    if (coords.length >= 2) highways.push({ id: `way/${el.id}`, tags, coords });
  }
}

const snapshot = {
  fetchedAt: new Date().toISOString().slice(0, 10),
  source: "OpenStreetMap via Overpass API (ODbL)",
  bbox: BBOX,
  entrances,
  parking,
  highways,
};

writeFileSync(OUT, JSON.stringify(snapshot, null, 1) + "\n");
console.log(
  `fetch-osm-network: ${entrances.length} entrances, ${parking.length} parking areas, ${highways.length} highways -> data/osm-network.json`
);
