// Fails if the deployed asset directory grows past its budget.
//
// public/ was 543 MB before the asset cleanup — full-resolution camera
// originals plus a duplicate copy of nearly every photo. This gate exists so
// that cannot silently come back.
//
// Run: pnpm run check:assets
import { readdir, stat } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BUDGET_MB = 60;
const MAX_SINGLE_FILE_MB = 2;
// Source originals belong in assets/, which is not deployed.
const DISALLOWED_IN_PUBLIC = new Set([".jpeg"]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const publicDir = join(root, "public");
let total = 0;
const oversized = [];
const disallowed = [];

for await (const file of walk(publicDir)) {
  const { size } = await stat(file);
  total += size;
  const rel = file.slice(publicDir.length);
  if (size > MAX_SINGLE_FILE_MB * 1e6) oversized.push(`${rel} (${(size / 1e6).toFixed(1)} MB)`);
  if (DISALLOWED_IN_PUBLIC.has(extname(file).toLowerCase())) disallowed.push(rel);
}

const totalMb = total / 1e6;
const problems = [];
if (totalMb > BUDGET_MB) problems.push(`public/ is ${totalMb.toFixed(1)} MB, over the ${BUDGET_MB} MB budget`);
if (oversized.length) problems.push(`files over ${MAX_SINGLE_FILE_MB} MB:\n    ${oversized.join("\n    ")}`);
if (disallowed.length) {
  problems.push(
    `unoptimized source images in public/ (move them to assets/ and run pnpm run optimize:images):\n    ${disallowed.join("\n    ")}`
  );
}

if (problems.length) {
  console.error("asset budget FAILED:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`asset budget OK: public/ is ${totalMb.toFixed(1)} MB (budget ${BUDGET_MB} MB)`);
