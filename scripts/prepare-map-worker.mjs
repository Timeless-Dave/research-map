// MapLibre 6 workers import a sibling shared module. Keep the pair together,
// version-matched to the installed library, for both Next bundlers.
import { copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const out = new URL('../public/map-worker/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  const source = require.resolve(`maplibre-gl/dist/${name}`);
  if (process.argv.includes('--check')) assert.deepEqual(readFileSync(new URL(name, out)), readFileSync(source), `Stale MapLibre worker: ${name}`);
  else copyFileSync(source, new URL(name, out));
}
const version = JSON.stringify({ version: require('maplibre-gl/package.json').version })+'\n';
if (process.argv.includes('--check')) assert.equal(readFileSync(new URL('version.json', out), 'utf8'), version);
else writeFileSync(new URL('version.json', out), version);
