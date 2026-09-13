import { describe, expect, it } from "vitest";
import {
  ACCESS_OK_M,
  ACCESS_WARN_M,
  checkDriveAccess,
  drivableRoads,
  isDrivableRoad,
  nearestDrivableRoad,
  parkingAccessPoint,
  checkPedestrianProximity,
  roadComponentSize,
  type OsmNetwork,
  type OsmWay,
} from "@/lib/osm-network-check";

// Fixtures use a small patch of campus so distances are easy to reason about.
// At this latitude 0.0001 deg lng is ~9.2m and 0.0001 deg lat is ~11.1m.
const BASE_LNG = -92.022;
const BASE_LAT = 34.244;

const road = (id: string, tags: Record<string, string>, coords: [number, number][]): OsmWay => ({
  id,
  tags,
  coords,
});

/** A north-south road at a given longitude offset from base. */
const northSouthRoad = (id: string, lngOffset: number, tags: Record<string, string> = { highway: "residential" }) =>
  road(id, tags, [
    [BASE_LNG + lngOffset, BASE_LAT - 0.001],
    [BASE_LNG + lngOffset, BASE_LAT + 0.001],
  ]);

/** A square parking polygon with its west edge at the given offset. */
const parkingArea = (id: string, westOffset: number, widthDeg = 0.0004): OsmWay =>
  road(id, { amenity: "parking" }, [
    [BASE_LNG + westOffset, BASE_LAT],
    [BASE_LNG + westOffset + widthDeg, BASE_LAT],
    [BASE_LNG + westOffset + widthDeg, BASE_LAT + 0.0003],
    [BASE_LNG + westOffset, BASE_LAT + 0.0003],
    [BASE_LNG + westOffset, BASE_LAT],
  ]);

describe("isDrivableRoad", () => {
  it("accepts ordinary road classes", () => {
    for (const highway of ["residential", "service", "tertiary", "primary", "unclassified", "living_street"]) {
      expect(isDrivableRoad({ highway }), highway).toBe(true);
    }
  });

  it("rejects non-vehicle ways rather than treating any highway=* as a road", () => {
    for (const highway of ["footway", "path", "steps", "cycleway", "track", "pedestrian"]) {
      expect(isDrivableRoad({ highway }), highway).toBe(false);
    }
  });

  it("rejects access-restricted segments", () => {
    expect(isDrivableRoad({ highway: "service", access: "private" })).toBe(false);
    expect(isDrivableRoad({ highway: "residential", access: "no" })).toBe(false);
    expect(isDrivableRoad({ highway: "service", motor_vehicle: "no" })).toBe(false);
    expect(isDrivableRoad({ highway: "service", vehicle: "private" })).toBe(false);
    expect(isDrivableRoad({ highway: "service", access: "customers" })).toBe(false);
  });

  it("honours an explicit motor-vehicle permission over a general restriction", () => {
    expect(isDrivableRoad({ highway: "service", access: "private", motor_vehicle: "yes" })).toBe(true);
  });

  it("treats an untagged driveway as private but keeps parking aisles", () => {
    expect(isDrivableRoad({ highway: "service", service: "driveway" })).toBe(false);
    expect(isDrivableRoad({ highway: "service", service: "driveway", access: "yes" })).toBe(true);
    expect(isDrivableRoad({ highway: "service", service: "parking_aisle" })).toBe(true);
  });

  it("filters a whole network", () => {
    const network = {
      highways: [
        northSouthRoad("way/1", 0),
        northSouthRoad("way/2", 0.001, { highway: "footway" }),
        northSouthRoad("way/3", 0.002, { highway: "service", access: "private" }),
      ],
    } as OsmNetwork;
    expect(drivableRoads(network).map((w) => w.id)).toEqual(["way/1"]);
  });
});

describe("nearestDrivableRoad", () => {
  it("returns null when there are no roads", () => {
    expect(nearestDrivableRoad([BASE_LNG, BASE_LAT], [])).toBeNull();
  });

  it("finds the closest road and snaps to it", () => {
    const roads = [northSouthRoad("way/far", 0.002), northSouthRoad("way/near", 0.0002)];
    const hit = nearestDrivableRoad([BASE_LNG, BASE_LAT], roads);
    expect(hit?.wayId).toBe("way/near");
    expect(hit?.metres).toBeGreaterThan(0);
    expect(hit?.metres).toBeLessThan(30);
  });
});

describe("parkingAccessPoint", () => {
  it("finds a road touching the middle of a long edge", () => {
    const area = parkingArea('lot', 0, 0.002);
    const spur = road('spur', { highway: 'service' }, [[BASE_LNG+0.001, BASE_LAT-0.001], [BASE_LNG+0.001, BASE_LAT]]);
    expect(parkingAccessPoint(area, [spur])!.road.metres).toBeLessThan(0.01);
  });
  it("finds intersections even when neither segment endpoint touches", () => {
    const area = parkingArea('lot', 0, 0.002);
    expect(parkingAccessPoint(area, [northSouthRoad('crossing', 0.001)])!.road.metres).toBeLessThan(0.01);
  });
  it("measures from the polygon edge facing the road, not the centroid", () => {
    // Lot sits east of the road; its west edge is much closer than its centre.
    const roads = [northSouthRoad("way/road", 0)];
    const area = parkingArea("way/lot", 0.0002);

    const access = parkingAccessPoint(area, roads);
    expect(access).not.toBeNull();
    expect(access!.coord[0]).toBeCloseTo(BASE_LNG + 0.0002, 6);

    const centroidLng = BASE_LNG + 0.0002 + 0.0002;
    const fromCentroid = nearestDrivableRoad([centroidLng, BASE_LAT + 0.00015], roads)!;
    expect(access!.road.metres).toBeLessThan(fromCentroid.metres);
  });

  it("returns null when no drivable road exists", () => {
    expect(parkingAccessPoint(parkingArea("way/lot", 0.0002), [])).toBeNull();
  });
});

describe("checkDriveAccess", () => {
  it("rejects a private parking polygon next to a public road", () => {
    const area = parkingArea('private', 0);
    area.tags.access = 'private';
    expect(checkDriveAccess([BASE_LNG, BASE_LAT], [northSouthRoad('road', 0)], area).verdict).toBe('error');
  });
  it("reports isolated roads without turning adjacency into reachability", () => {
    const roads = [northSouthRoad('one', 0), northSouthRoad('two', .001)];
    expect(roadComponentSize('one', roads)).toBe(1);
    expect(checkDriveAccess([BASE_LNG, BASE_LAT], roads).message).toContain('connection unverified');
  });
  it("includes steps in pedestrian proximity without claiming accessibility", () => {
    const network = { highways: [northSouthRoad('steps', 0, { highway: 'steps' })] } as OsmNetwork;
    expect(checkPedestrianProximity([BASE_LNG, BASE_LAT], network).message).toContain('accessibility unverified');
  });
  it("passes a lot immediately beside a road", () => {
    const result = checkDriveAccess(
      [BASE_LNG + 0.0004, BASE_LAT],
      [northSouthRoad("way/road", 0)],
      parkingArea("way/lot", 0.0002)
    );
    expect(result.verdict).toBe("ok");
    expect(result.metres).toBeLessThanOrEqual(ACCESS_OK_M);
    expect(result.message).toContain("parking boundary");
  });

  it("warns on a borderline distance instead of failing the build", () => {
    // ~37m from the road: plausible, but worth a human look.
    const result = checkDriveAccess(
      [BASE_LNG + 0.0004, BASE_LAT],
      [northSouthRoad("way/road", 0)],
      parkingArea("way/lot", 0.0004)
    );
    expect(result.verdict).toBe("warn");
    expect(result.metres).toBeGreaterThan(ACCESS_OK_M);
    expect(result.metres).toBeLessThanOrEqual(ACCESS_WARN_M);
  });

  it("fails the proximity threshold without claiming a lot is unreachable", () => {
    const result = checkDriveAccess(
      [BASE_LNG + 0.003, BASE_LAT],
      [northSouthRoad("way/road", 0)],
      parkingArea("way/stranded", 0.003)
    );
    expect(result.verdict).toBe("error");
    expect(result.metres).toBeGreaterThan(ACCESS_WARN_M);
    expect(result.message).toMatch(/outside proximity threshold/);
    expect(result.message).toMatch(/connection unverified/);
  });

  it("fails when the only nearby ways are footpaths", () => {
    const footOnly = [northSouthRoad("way/foot", 0, { highway: "footway" })];
    const result = checkDriveAccess([BASE_LNG + 0.0002, BASE_LAT], drivableRoads({ highways: footOnly } as OsmNetwork));
    expect(result.verdict).toBe("no-network");
  });

  it("fails when a private service road is the only thing adjacent", () => {
    const privateOnly = [northSouthRoad("way/priv", 0, { highway: "service", access: "private" })];
    const roads = drivableRoads({ highways: privateOnly } as OsmNetwork);
    expect(roads).toHaveLength(0);
    expect(checkDriveAccess([BASE_LNG, BASE_LAT], roads).verdict).toBe("no-network");
  });

  it("reports missing network data honestly rather than silently passing", () => {
    const result = checkDriveAccess([BASE_LNG, BASE_LAT], []);
    expect(result.verdict).toBe("no-network");
    expect(result.metres).toBeNull();
    expect(result.message).toMatch(/not checked/);
  });

  it("falls back to the anchor point and says so when no polygon is known", () => {
    const result = checkDriveAccess([BASE_LNG + 0.0002, BASE_LAT], [northSouthRoad("way/road", 0)]);
    expect(result.message).toContain("anchor point");
    expect(result.verdict).toBe("ok");
  });
});
