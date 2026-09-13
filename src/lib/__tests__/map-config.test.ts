import { describe, expect, it } from "vitest";
import {
  MASK_OPACITY,
  MAIN_CAMPUS_CENTER,
  MAP_MAX_BOUNDS,
  CAMPUS_MIN_ZOOM,
  CAMPUS_MAX_ZOOM,
  cameraDuration,
} from "@/lib/map-config";

describe("map-config", () => {
  it("uses fully opaque satellite mask", () => {
    expect(MASK_OPACITY).toBe(1);
  });

  it("spans regional context to door-level detail", () => {
    // Zoom out far enough to see the approach to campus, in far enough to
    // pick out an entrance; 20 is the deepest real satellite imagery.
    expect(CAMPUS_MIN_ZOOM).toBeLessThanOrEqual(12);
    expect(CAMPUS_MAX_ZOOM).toBeGreaterThanOrEqual(20);
  });

  it("cameraDuration respects reduced motion", () => {
    expect(cameraDuration(600, true)).toBe(0);
    expect(cameraDuration(600, false)).toBe(600);
  });
});

describe("pan bounds vs zoom range", () => {
  it("keeps maxBounds wider than the viewport at CAMPUS_MIN_ZOOM", () => {
    // MapLibre cannot satisfy a maxBounds narrower than the viewport; when it
    // can't, the map never settles. Checked against a wide desktop canvas.
    const WIDEST_CANVAS_PX = 2560;
    const lat = MAIN_CAMPUS_CENTER[1];
    const metersPerPx =
      (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** CAMPUS_MIN_ZOOM;
    const degreesWide =
      (WIDEST_CANVAS_PX * metersPerPx) / (111320 * Math.cos((lat * Math.PI) / 180));

    const [[west], [east]] = [MAP_MAX_BOUNDS[0], MAP_MAX_BOUNDS[1]];
    expect(east - west).toBeGreaterThan(degreesWide);
  });
});
