// Generates the responsive image derivatives the app actually ships.
//
// Source originals live in assets/ (tracked, not deployed — Next only serves
// public/). Camera originals are ~5712x4284 and 5-7 MB each; before this the
// gallery thumbnails downloaded the full-resolution file.
//
// Emits, per source image, AVIF + WebP at each width plus a JPEG fallback at the
// largest width, and writes public/buildings/manifest.json with real intrinsic
// dimensions so the UI can reserve layout space.
//
// Run: pnpm run optimize:images
import { readdir, mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [400, 800, 1600];
const AVIF = { quality: 55, effort: 4 };
const WEBP = { quality: 72 };
const JPEG = { quality: 78, mozjpeg: true };

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(jpe?g|png)$/i.test(entry.name)) yield p;
  }
}

async function optimize(srcPath, outDir) {
  const image = sharp(srcPath);
  const { width: srcWidth, height: srcHeight } = await image.metadata();
  const name = basename(srcPath, extname(srcPath));
  await mkdir(outDir, { recursive: true });

  // Never upscale: a source narrower than a target width would only inflate bytes.
  const widths = WIDTHS.filter((w) => w <= srcWidth);
  if (widths.length === 0) widths.push(srcWidth);
  const largest = Math.max(...widths);

  const variants = [];
  for (const w of widths) {
    const resized = () => sharp(srcPath).resize({ width: w, withoutEnlargement: true });
    await resized().avif(AVIF).toFile(join(outDir, `${name}-${w}.avif`));
    await resized().webp(WEBP).toFile(join(outDir, `${name}-${w}.webp`));
    variants.push(w);
  }
  // One raster fallback for browsers without AVIF/WebP.
  await sharp(srcPath)
    .resize({ width: largest, withoutEnlargement: true })
    .jpeg(JPEG)
    .toFile(join(outDir, `${name}-${largest}.jpg`));

  return {
    name,
    widths: variants,
    fallbackWidth: largest,
    aspectRatio: Number((srcWidth / srcHeight).toFixed(4)),
    width: srcWidth,
    height: srcHeight,
  };
}

async function run() {
  const buildingsRoot = join(root, "assets/buildings");
  if (!existsSync(buildingsRoot)) throw new Error(`missing source dir: ${buildingsRoot}`);

  const manifest = {};
  const site = [];
  let count = 0;
  let srcBytes = 0;

  const tick = async (srcPath) => {
    srcBytes += (await stat(srcPath)).size;
    count++;
    process.stdout.write(`\r  optimized ${count}…`);
  };

  for await (const srcPath of walk(buildingsRoot)) {
    const buildingId = relative(buildingsRoot, srcPath).split("/")[0];
    const entry = await optimize(srcPath, join(root, "public/buildings", buildingId));
    (manifest[buildingId] ??= []).push(entry);
    await tick(srcPath);
  }

  // Flat site chrome (campus hero and similar) — no per-building grouping.
  const siteRoot = join(root, "assets/site");
  if (existsSync(siteRoot)) {
    for await (const srcPath of walk(siteRoot)) {
      site.push(await optimize(srcPath, join(root, "public/site")));
      await tick(srcPath);
    }
  }

  for (const list of Object.values(manifest)) list.sort((a, b) => a.name.localeCompare(b.name));
  site.sort((a, b) => a.name.localeCompare(b.name));
  await writeGeneratedModule(manifest, site);

  process.stdout.write("\r");
  console.log(
    `optimize-images: ${count} sources (${(srcBytes / 1e6).toFixed(0)} MB) -> public/{buildings,site}`
  );
}

/**
 * Emitted as a typed module rather than a public JSON file so the UI gets
 * intrinsic dimensions at build time — no runtime fetch, and no layout shift
 * while the manifest is in flight.
 */
async function writeGeneratedModule(manifest, site) {
  const entries = Object.entries(manifest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([buildingId, photos]) => {
      const items = photos
        .map(
          (p) =>
            `    { name: ${JSON.stringify(p.name)}, widths: [${p.widths.join(", ")}], ` +
            `fallbackWidth: ${p.fallbackWidth}, width: ${p.width}, height: ${p.height}, ` +
            `aspectRatio: ${p.aspectRatio} },`
        )
        .join("\n");
      return `  ${JSON.stringify(buildingId)}: [\n${items}\n  ],`;
    })
    .join("\n");

  const out = `// GENERATED FILE — do not edit by hand.
// Source: assets/buildings/** via scripts/optimize-images.mjs
// Regenerate: pnpm run optimize:images

export interface BuildingImage {
  /** Basename shared by every derivative, e.g. "woodward-hall-01". */
  name: string;
  /** Widths available as .avif and .webp. */
  widths: number[];
  /** Width of the single .jpg fallback. */
  fallbackWidth: number;
  width: number;
  height: number;
  aspectRatio: number;
}

export const BUILDING_IMAGES: Record<string, BuildingImage[]> = {
${entries}
};

export function getBuildingImages(buildingId: string): BuildingImage[] {
  return BUILDING_IMAGES[buildingId] ?? [];
}

/** Flat site chrome served from /site. */
export const SITE_IMAGES: Record<string, BuildingImage> = {
${site.map((p) => `  ${JSON.stringify(p.name)}: { name: ${JSON.stringify(p.name)}, widths: [${p.widths.join(", ")}], fallbackWidth: ${p.fallbackWidth}, width: ${p.width}, height: ${p.height}, aspectRatio: ${p.aspectRatio} },`).join("\n")}
};
`;
  await writeFile(join(root, "src/lib/building-images.generated.ts"), out);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
