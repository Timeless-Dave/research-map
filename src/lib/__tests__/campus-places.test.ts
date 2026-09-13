import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILDINGS_SEED } from "@/lib/buildings-seed";
import {
  CAMPUS_PLACES,
  CAMPUS_PLACE_IDS,
  getCampusPlace,
  isKnownPlaceId,
} from "@/lib/campus-places.generated";
import { hasCatalogEntry } from "@/lib/building-catalog";

const geojson = JSON.parse(
  readFileSync(join(process.cwd(), "public/buildings.geojson"), "utf8")
) as GeoJSON.FeatureCollection;

describe("campus places catalog", () => {
  it("is in sync with buildings.geojson", () => {
    const fromSource = new Set(
      geojson.features
        .map((f) => (f.properties as { building_id?: string } | null)?.building_id)
        .filter((id): id is string => Boolean(id) && id !== "building")
    );
    expect(new Set(CAMPUS_PLACE_IDS)).toEqual(fromSource);
  });

  it("gives every place a routable coordinate on campus", () => {
    for (const place of Object.values(CAMPUS_PLACES)) {
      expect(Number.isFinite(place.lng), place.id).toBe(true);
      expect(Number.isFinite(place.lat), place.id).toBe(true);
      // Loose bounding box around Pine Bluff, AR — catches swapped lat/lng.
      expect(place.lng, place.id).toBeGreaterThan(-92.1);
      expect(place.lng, place.id).toBeLessThan(-91.9);
      expect(place.lat, place.id).toBeGreaterThan(34.1);
      expect(place.lat, place.id).toBeLessThan(34.4);
    }
  });

  it("covers every seeded API building, so all of them are routable", () => {
    for (const building of BUILDINGS_SEED) {
      expect(isKnownPlaceId(building.id), `${building.id} missing from places`).toBe(true);
    }
  });

  it("classifies every place explicitly rather than falling back", () => {
    // Without an entry, a place silently inherits the secondary/"Other"
    // defaults, so missing curation looks identical to a real classification.
    const uncatalogued = CAMPUS_PLACE_IDS.filter((id) => !hasCatalogEntry(id));
    expect(uncatalogued).toEqual([]);
  });

  it("rejects unknown ids", () => {
    expect(isKnownPlaceId("does-not-exist")).toBe(false);
    expect(getCampusPlace("does-not-exist")).toBeNull();
  });
});
