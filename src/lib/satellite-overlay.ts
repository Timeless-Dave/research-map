// MapLibre 6 is ESM-only and no longer ships a default export.
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { Zone } from "@/lib/campus-mask";

/** Minimal satellite style — transparent outside tiles; clipped by CSS path. */
export function buildSatelliteStyle(tileURL: string, apiKey: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${apiKey}`,
    sources: {
      satellite: {
        type: "raster",
        tiles: [tileURL],
        tileSize: 512,
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: "sat-background",
        type: "background",
        paint: { "background-opacity": 0 },
      },
      {
        id: "satellite-layer",
        type: "raster",
        source: "satellite",
      },
    ],
  };
}

/** CSS clip-path from zone rings projected into the base map’s CSS pixel space. */
export function clipPathFromZones(map: maplibregl.Map, zones: Zone[]): string {
  const parts: string[] = [];
  for (const zone of zones) {
    const polys =
      zone.geometry.type === "Polygon"
        ? [zone.geometry.coordinates]
        : zone.geometry.coordinates;
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring?.length) continue;
      const cmds: string[] = [];
      for (let i = 0; i < ring.length; i++) {
        const c = ring[i];
        const p = map.project([c[0], c[1]]);
        cmds.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
      }
      parts.push(`${cmds.join(" ")} Z`);
    }
  }
  return parts.length > 0 ? `path('${parts.join(" ")}')` : "none";
}

export function syncOverlayCamera(base: maplibregl.Map, overlay: maplibregl.Map) {
  const center = base.getCenter();
  overlay.jumpTo({
    center: { lng: center.lng, lat: center.lat },
    zoom: base.getZoom(),
    bearing: base.getBearing(),
    pitch: base.getPitch(),
  });
}
