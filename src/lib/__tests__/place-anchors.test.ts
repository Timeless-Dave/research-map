import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isUsableAccessibleAnchor,
  isUsableAnchor,
  type PlaceAnchor,
} from "@/types/place-anchor";

const anchor = (over: Partial<PlaceAnchor> = {}): PlaceAnchor => ({
  type: "walking",
  lng: -92.0237,
  lat: 34.2442,
  source: "osm",
  verification: "unverified",
  ...over,
});

// A fixture rather than the real file: these assertions must hold regardless of
// what the current import happens to contain.
vi.mock("@/data/place-anchors.json", () => ({
  default: {
    "stem-building": [
      { type: "walking", lng: -92.0238, lat: 34.2443, source: "osm", verification: "unverified" },
      { type: "parking", lng: -92.0246, lat: 34.2449, source: "osm", verification: "unverified" },
      { type: "accessible", lng: -92.0239, lat: 34.2444, source: "osm", verification: "unverified" },
    ],
    "woodward-hall": [
      {
        type: "accessible",
        lng: -92.0221,
        lat: 34.244,
        source: "campus-authority",
        verification: "verified",
        verifiedBy: "Facilities",
        verifiedAt: "2026-09-10",
      },
    ],
    "caldwell-hall": [
      { type: "walking", lng: -92.0196, lat: 34.2422, source: "imagery", verification: "rejected" },
    ],
  },
}));

describe("anchor usability rules", () => {
  it("never treats an unverified accessible anchor as usable", () => {
    const a = anchor({ type: "accessible", verification: "unverified" });
    expect(isUsableAccessibleAnchor(a)).toBe(false);
    expect(isUsableAnchor(a)).toBe(false);
  });

  it("accepts a verified accessible anchor", () => {
    const a = anchor({ type: "accessible", verification: "verified", verifiedBy: "X", verifiedAt: "2026-01-01" });
    expect(isUsableAccessibleAnchor(a)).toBe(true);
    expect(isUsableAnchor(a)).toBe(true);
  });

  it("allows unverified non-accessible anchors", () => {
    expect(isUsableAnchor(anchor({ type: "walking" }))).toBe(true);
    expect(isUsableAnchor(anchor({ type: "parking" }))).toBe(true);
  });

  it("never uses a rejected anchor of any type", () => {
    expect(isUsableAnchor(anchor({ verification: "rejected" }))).toBe(false);
    expect(isUsableAnchor(anchor({ type: "parking", verification: "rejected" }))).toBe(false);
  });
});

describe("destination resolution", () => {
  beforeEach(() => vi.resetModules());

  it("refuses accessible routing without a verified entrance", async () => {
    const { resolveDestination } = await import("@/lib/place-anchors");
    // stem-building has an accessible anchor, but it is unverified.
    expect(resolveDestination("stem-building", "accessible")).toBeNull();
  });

  it("never falls back to a centroid for accessible routing", async () => {
    const { resolveDestination } = await import("@/lib/place-anchors");
    // A place with no accessible anchor at all must also return null, not a guess.
    expect(resolveDestination("larrison-hall", "accessible")).toBeNull();
  });

  it("uses a verified accessible entrance where one exists", async () => {
    const { resolveDestination } = await import("@/lib/place-anchors");
    const target = resolveDestination("woodward-hall", "accessible");
    expect(target?.via).toBe("accessible");
    expect(target?.unverified).toBe(false);
    expect(target?.approximate).toBe(false);
  });

  it("prefers parking when driving", async () => {
    const { resolveDestination } = await import("@/lib/place-anchors");
    expect(resolveDestination("stem-building", "driving")?.via).toBe("parking");
  });

  it("prefers a walking anchor on foot", async () => {
    const { resolveDestination } = await import("@/lib/place-anchors");
    const target = resolveDestination("stem-building", "walking");
    expect(target?.via).toBe("walking");
    expect(target?.unverified).toBe(true);
  });

  it("falls back to the centroid, flagged approximate", async () => {
    const { resolveDestination } = await import("@/lib/place-anchors");
    const target = resolveDestination("larrison-hall", "walking");
    expect(target?.via).toBe("centroid");
    expect(target?.approximate).toBe(true);
  });

  it("ignores rejected anchors and falls back", async () => {
    const { resolveDestination } = await import("@/lib/place-anchors");
    expect(resolveDestination("caldwell-hall", "walking")?.via).toBe("centroid");
  });

  it("returns null for an unknown place", async () => {
    const { resolveDestination } = await import("@/lib/place-anchors");
    expect(resolveDestination("no-such-place", "walking")).toBeNull();
  });
});

describe("labels", () => {
  it("says when a destination is approximate or unconfirmed", async () => {
    const { describeTarget } = await import("@/lib/place-anchors");
    expect(describeTarget({ coord: [0, 0], via: "centroid", approximate: true, unverified: false }))
      .toMatch(/approximate/i);
    expect(describeTarget({ coord: [0, 0], via: "walking", approximate: false, unverified: true }))
      .toMatch(/unconfirmed/i);
    expect(describeTarget({ coord: [0, 0], via: "accessible", approximate: false, unverified: false }))
      .toBe("accessible entrance");
  });
});

describe("drive-then-walk handoff", () => {
  beforeEach(() => vi.resetModules());

  it("plans a walking leg from parking to the arrival point", async () => {
    const { planDrivingHandoff, metresBetween, HANDOFF_MIN_METRES } = await import(
      "@/lib/place-anchors"
    );
    const plan = planDrivingHandoff("stem-building");
    expect(plan?.drive.via).toBe("parking");
    expect(plan?.walk.via).toBe("walking");
    expect(metresBetween(plan!.drive.coord, plan!.walk.coord)).toBeGreaterThanOrEqual(
      HANDOFF_MIN_METRES
    );
  });

  it("plans nothing when there is no parking anchor", async () => {
    const { planDrivingHandoff } = await import("@/lib/place-anchors");
    expect(planDrivingHandoff("larrison-hall")).toBeNull();
  });
});
