import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const snapshot = JSON.parse(readFileSync(new URL('../data/osm-network.json', import.meta.url)));
const features = [
  ...snapshot.highways.filter(w => w.coords.length > 1 && ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street', 'footway', 'path', 'pedestrian', 'steps', 'cycleway'].includes(w.tags.highway)).map(w => ({ type: 'Feature', properties: { ...w.tags, osmId: w.id, kind: ['steps', 'cycleway'].includes(w.tags.highway) ? w.tags.highway : ['footway', 'path', 'pedestrian'].includes(w.tags.highway) ? 'path' : 'road' }, geometry: { type: 'LineString', coordinates: w.coords } })),
  ...snapshot.parking.filter(w => w.coords.length >= 4 && String(w.coords[0]) === String(w.coords.at(-1))).map(w => ({ type: 'Feature', properties: { ...w.tags, osmId: w.id, kind: 'parking' }, geometry: { type: 'Polygon', coordinates: [w.coords] } })),
];
const target = new URL('../public/illustrated/ground.geojson', import.meta.url);
const output = JSON.stringify({ type: 'FeatureCollection', features });
if (process.argv.includes('--check')) assert.equal(readFileSync(target, 'utf8'), output, 'Stale illustrated ground: run pnpm generate:illustrated-ground');
else writeFileSync(target, output);
console.log(`Illustrated ground: ${features.length} mapped features; OSM ${snapshot.fetchedAt}`);
