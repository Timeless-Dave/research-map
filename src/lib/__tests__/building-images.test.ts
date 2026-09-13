import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILDING_IMAGES, SITE_IMAGES } from "@/lib/building-images.generated";
import { BUILDING_MEDIA } from "@/lib/building-media";

const publicDir = join(process.cwd(), "public");
const exists = (url: string) => existsSync(join(publicDir, url));

describe("generated image derivatives", () => {
  it("has every declared variant on disk", () => {
    const missing: string[] = [];
    for (const [buildingId, images] of Object.entries(BUILDING_IMAGES)) {
      for (const image of images) {
        for (const w of image.widths) {
          for (const ext of ["avif", "webp"]) {
            const url = `/buildings/${buildingId}/${image.name}-${w}.${ext}`;
            if (!exists(url)) missing.push(url);
          }
        }
        const fallback = `/buildings/${buildingId}/${image.name}-${image.fallbackWidth}.jpg`;
        if (!exists(fallback)) missing.push(fallback);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has every site image variant on disk", () => {
    const missing: string[] = [];
    for (const image of Object.values(SITE_IMAGES)) {
      for (const w of image.widths) {
        for (const ext of ["avif", "webp"]) {
          if (!exists(`/site/${image.name}-${w}.${ext}`)) {
            missing.push(`/site/${image.name}-${w}.${ext}`);
          }
        }
      }
      if (!exists(`/site/${image.name}-${image.fallbackWidth}.jpg`)) {
        missing.push(`/site/${image.name}-${image.fallbackWidth}.jpg`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("resolves every gallery photo and hero referenced by building media", () => {
    const missing: string[] = [];
    for (const [buildingId, media] of Object.entries(BUILDING_MEDIA)) {
      if (!exists(media.hero)) missing.push(`${buildingId} hero: ${media.hero}`);
      expect(media.gallery.length, `${buildingId} has no photos`).toBeGreaterThan(0);
      for (const photo of media.gallery) {
        if (!exists(photo.src)) missing.push(`${buildingId}: ${photo.src}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("records real intrinsic dimensions so layout space can be reserved", () => {
    for (const images of Object.values(BUILDING_IMAGES)) {
      for (const image of images) {
        expect(image.width, image.name).toBeGreaterThan(0);
        expect(image.height, image.name).toBeGreaterThan(0);
        expect(image.widths.length, image.name).toBeGreaterThan(0);
        // Never upscale past the source.
        expect(Math.max(...image.widths)).toBeLessThanOrEqual(image.width);
      }
    }
  });
});
