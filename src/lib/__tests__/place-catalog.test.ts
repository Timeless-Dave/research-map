import { describe, expect, it } from "vitest";
import { BUILDINGS_SEED } from "@/lib/buildings-seed";
import { CAMPUS_PLACE_IDS } from "@/lib/campus-places.generated";
import { buildPlaceCatalog, matchesQuery, placeDisplayName } from "@/lib/place-catalog";
import type { Building } from "@/types";

const catalog = buildPlaceCatalog(BUILDINGS_SEED);

describe("place catalog", () => {
  it("exposes every map-visible place, not just API-seeded buildings", () => {
    const ids = new Set(catalog.map((p) => p.id));
    for (const id of CAMPUS_PLACE_IDS) {
      expect(ids.has(id), `${id} missing from catalog`).toBe(true);
    }
    // Regression guard: the sidebar used to show only the seeded subset.
    expect(catalog.length).toBeGreaterThan(BUILDINGS_SEED.length);
  });

  it("keeps API records that have no generated geometry", () => {
    const orphan: Building = {
      ...BUILDINGS_SEED[0],
      id: "not-in-geojson",
      name: "Orphan Hall",
    };
    const withOrphan = buildPlaceCatalog([...BUILDINGS_SEED, orphan]);
    expect(withOrphan.find((p) => p.id === "not-in-geojson")?.name).toBe("Orphan Hall");
  });

  it("marks which places have research detail", () => {
    const seeded = catalog.find((p) => p.id === BUILDINGS_SEED[0].id);
    expect(seeded?.hasDetail).toBe(true);
    const unseeded = catalog.find((p) => p.id === "alumni-house");
    expect(unseeded?.hasDetail).toBe(false);
  });

  it("gives every entry a display name that is not the raw slug", () => {
    for (const entry of catalog) {
      expect(entry.name.length, entry.id).toBeGreaterThan(0);
      expect(entry.name, entry.id).not.toBe(entry.id);
    }
  });

  it("resolves a deep-linked id to a real name without click metadata", () => {
    expect(placeDisplayName("alumni-house")).toBe("Alumni House");
    expect(placeDisplayName("unknown-id")).toBe("unknown-id");
    expect(placeDisplayName("alumni-house", "From API")).toBe("From API");
  });

  it("searches name, code, category, and description", () => {
    const entry = catalog.find((p) => p.id === "alumni-house")!;
    expect(matchesQuery(entry, "alumni")).toBe(true);
    expect(matchesQuery(entry, "ALUMNI")).toBe(true);
    expect(matchesQuery(entry, "")).toBe(true);
    expect(matchesQuery(entry, "zzzz")).toBe(false);
    const research = catalog.find((p) => p.category === "Research")!;
    expect(matchesQuery(research, "research")).toBe(true);
  });
});
