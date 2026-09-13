import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3 } from 'three';
import assert from 'node:assert/strict';
import { booleanPointInPolygon, point } from '@turf/turf';
const root = new URL('../public/illustrated/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
const config = JSON.parse(readFileSync(new URL('../data/illustrated-config.json', import.meta.url)));
assert.equal(config.version, 1, 'Unsupported illustrated contract version');
assert.equal(config.units, 'metres');
assert.equal(config.axes, 'glTF X east, Y up, Z south');
assert.equal(config.asset, '/illustrated/campus.glb');
assert.equal(config.detailAsset, '/illustrated/detail.glb');
assert(Number.isFinite(config.detailMinZoom) && config.detailMinZoom >= 12 && config.detailMinZoom <= 20);
for (const [key, value] of Object.entries(config)) assert.deepEqual(manifest[key], value, `Manifest/runtime mismatch: ${key}`);
const source = JSON.parse(readFileSync(new URL('../public/buildings.geojson', import.meta.url)));
const bytes = readFileSync(new URL('campus.glb', root));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), '');
const detail = readFileSync(new URL('detail.glb', root));
gltf.scene.add((await new GLTFLoader().parseAsync(detail.buffer.slice(detail.byteOffset, detail.byteOffset+detail.byteLength), '')).scene);
gltf.scene.updateMatrixWorld(true);
let triangles = 0, meshes = 0, worst = 0;
const ground = new Map();
const glazing = [];
gltf.scene.traverse(o => {
  if (!o.isMesh) return;
  meshes++;
  const positions = o.geometry.attributes.position;
  triangles += (o.geometry.index?.count ?? positions.count)/3;
  assert(o.userData.placeId, `Missing place ID: ${o.name}`);
  const points = ground.get(o.userData.placeId) ?? [];
  for (let i=0;i<positions.count;i++) {
    const v = new Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);
    assert([v.x,v.y,v.z].every(Number.isFinite));
    if (Math.abs(v.y)<.001) points.push(v);
    if (o.material.name === 'Muted blue glazing') glazing.push({ id: o.userData.placeId, v });
  }
  ground.set(o.userData.placeId,points);
});
const R=6371008.8, rad=Math.PI/180, [lng,lat]=manifest.origin, scale=Math.cos(lat*rad);
for (const building of manifest.buildings.filter(b => b.facadeEstimates)) {
  assert(glazing.some(g => g.id === building.id), `${building.id}: missing facade glazing`);
}
// Regression: centroid-directed offsets hid glazing inside concave walls.
for (const {id,v} of glazing) {
  const x = lng+v.x/(R*scale*rad);
  const y = (2*Math.atan(Math.exp(Math.log(Math.tan(Math.PI/4+lat*rad/2))-v.z/(R*scale)))-Math.PI/2)/rad;
  const footprint = source.features.find(f => f.properties?.building_id === id);
  assert(!booleanPointInPolygon(point([x,y]), footprint), `${id}: glazing vertex hidden inside footprint`);
}
for (const feature of source.features) {
  const id=feature.properties?.building_id;
  if (!id || id==='building') continue;
  const record=manifest.buildings.find(b=>b.id===id);
  assert(record, `Missing manifest place ${id}`);
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  assert.deepEqual(record.footprints,polygons,`Stale footprint ${id}`);
  for (const polygon of polygons) for (const [x,y] of polygon[0]) {
    const east=R*scale*(x-lng)*rad;
    const north=R*scale*(Math.log(Math.tan(Math.PI/4+y*rad/2))-Math.log(Math.tan(Math.PI/4+lat*rad/2)));
    const nearest=Math.min(...(ground.get(id)??[]).map(v=>Math.hypot(v.x-east,v.z+north)));
    assert(nearest<.01, `${id}: corner error ${nearest}m`);
    worst=Math.max(worst,nearest);
  }
}
const compressedBytes=readdirSync(root).reduce((n,f)=>n+gzipSync(readFileSync(new URL(f,root))).length,0);
const initialCompressedBytes = ['campus.glb', 'ground.geojson', 'manifest.json'].reduce((n,f)=>n+gzipSync(readFileSync(new URL(f,root))).length,0);
assert(initialCompressedBytes<=5*1024*1024,'Initial illustrated assets exceed 5 MiB gzip budget');
assert(compressedBytes<=15*1024*1024,'Campus assets exceed 15 MiB gzip budget');
const report={places:manifest.buildings.length,meshes,triangles,exteriorGlazingVerticesChecked:glazing.length,maxGroundCornerErrorMetres:worst,initialCompressedBytes,compressedBytes,modelBytes:bytes.length};
mkdirSync(new URL('../artifacts/illustrated/',import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/illustrated/asset-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(report);
