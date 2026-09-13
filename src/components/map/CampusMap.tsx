"use client";

import { useRef, useEffect, useCallback, useState } from "react";
// MapLibre 6 is ESM-only and no longer ships a default export.
import * as maplibregl from "maplibre-gl";
import type {
  ExpressionSpecification,
  MapLayerMouseEvent,
  PaddingOptions,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { bbox, featureCollection } from "@turf/turf";
import type { Building } from "@/types";
import type { GeoJsonBuildingMeta } from "@/types/building-selection";
import type { DirectionsResult } from "@/lib/directions";
import { routeParts } from "@/lib/directions";
import {
  BUILDING_FOCUS_ZOOM,
  CAMPUS_MAX_ZOOM,
  CAMPUS_MIN_ZOOM,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  LABEL_MIN_ZOOM,
  MAP_MAX_BOUNDS,
  PIN_GOLD,
  PIN_GOLD_SELECTED,
  PIN_SECONDARY,
  ROUTE_STEP_ZOOM,
  SECONDARY_PIN_MIN_ZOOM,
  cameraDuration,
  prefersReducedMotion,
} from "@/lib/map-config";
import {
  centroidFromFeature,
  getMainCampusFitBounds,
  getMaskZones,
  type Zone,
} from "@/lib/campus-mask";
import {
  displayBuildingName,
  pinPriority,
  resolveCategory,
  resolvePinTier,
} from "@/lib/building-catalog";
import MapStatusOverlay, {
  type MapFailure,
  type MapStatus,
} from "@/components/map/MapStatusOverlay";
import { ILLUSTRATED_ENABLED, resolveMapView } from "@/lib/map-view";
import { setIllustratedGround } from "@/lib/illustrated-ground";
import { useUrlParam } from "@/hooks/use-url-param";
import { usePathname } from "next/navigation";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

// MapTiler minimal light basemap. If dataviz-light ever becomes unavailable
// on the plan, swap for: /maps/positron/style.json
const MAP_STYLE = `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`;

const SOURCE_ID        = "campus-buildings";
const ZONES_SOURCE     = "satellite-zones";
const PINS_SOURCE      = "building-pins";
const ROUTE_SOURCE        = "route-line";
const ROUTE_ENDPOINTS_SOURCE = "route-endpoints";

const LAYER_ZONE_OUTLINE  = "satellite-zones-outline";
const LAYER_LABELS        = "buildings-labels";
const LAYER_PINS          = "pins-layer";
const LAYER_PINS_SECONDARY = "pins-layer-secondary";
const LAYER_PINS_SELECTED = "pins-layer-selected";
const LAYER_ROUTE_CASING  = "route-casing-layer";
const LAYER_ROUTE_LINE    = "route-line-layer";
const LAYER_ROUTE_ENDPOINTS = "route-endpoints-layer";

// Route color intentionally distinct from the gold building pins — blue is
// the universal "this is a navigation path" convention (Google/Apple/Baylor).
const ROUTE_BLUE        = "#2563eb";
const ROUTE_BLUE_CASING = "#ffffff";

const PIN_IMAGE          = "uapb-pin";
const PIN_IMAGE_SECONDARY = "uapb-pin-secondary";
const PIN_IMAGE_SELECTED = "uapb-pin-selected";

// ── Pin SVG geometry (28 × 34) ─────────────────────────────────────────────────
// Circle head: r=11 centered at (14,13).  Tip at (14,33) → anchor: "bottom" puts
// the tip exactly on the building centroid.
const PIN_W    = 28;
const PIN_H    = 34;
const PIN_PATH = "M14 33C8 24 3 20 3 13A11 11 0 1 1 25 13C25 20 20 24 14 33Z";
// Columned-building icon inside circle (pediment + 3 columns + base)
const ICON_PATH = "M7 13L14 7L21 13M7 13h14M9 13v7M14 13v7M19 13v7M7 20h14";

export interface UserLocation {
  lng: number;
  lat: number;
}

interface CampusMapProps {
  buildings: Building[];
  selectedId: string | null;
  onSelectBuilding: (id: string, meta?: GeoJsonBuildingMeta) => void;
  /** Screen-space occupied by overlaying UI, measured from the real elements.
   *  Used as camera padding so fitted content lands in the visible area. */
  mapInset?: MapInset;
  route?: DirectionsResult | null;
  userLocation?: UserLocation | null;
  onUserLocationChange?: (loc: UserLocation | null) => void;
  /** New array reference on every click — pans to a turn-by-turn step. */
  focusPoint?: [number, number] | null;
  /** Increment to force a full campus overview refit (logo / home reset). */
  viewResetNonce?: number;
  onCampusHomeClick?: () => void;
  /** When true, secondary campus pins appear at all zoom levels. */
  showAllCampusBuildings?: boolean;
}

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function routeLineFeatureCollection(route: DirectionsResult | null): GeoJSON.FeatureCollection {
  if (!route) return EMPTY_FEATURE_COLLECTION;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: route.geometry, properties: {} }],
  };
}

function routeEndpointsFeatureCollection(route: DirectionsResult | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  if (!route) return { type: "FeatureCollection", features: [] };
  const parts = routeParts(route);
  const start = parts[0]?.[0];
  const end = parts.at(-1)?.at(-1);
  if (!start || !end) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: start as [number, number] }, properties: { label: "A" } },
      { type: "Feature", geometry: { type: "Point", coordinates: end as [number, number] }, properties: { label: "B" } },
    ],
  };
}

// ── Layout / camera helpers ────────────────────────────────────────────────────

export interface MapInset {
  left: number;
  bottom: number;
}

export const NO_MAP_INSET: MapInset = { left: 0, bottom: 0 };

/**
 * Camera padding from measured overlay geometry rather than layout constants.
 * The sidebar is a fixed column on desktop but a bottom sheet on phones, so a
 * hardcoded 400px left inset framed content off-screen on mobile.
 */
function buildMapPadding(inset: MapInset): PaddingOptions {
  return {
    left:   inset.left + 16,
    top:    16,
    right:  48,
    bottom: inset.bottom + 48,
  };
}

/** Keep fitBounds padding inside the canvas so MapLibre doesn't warn/fail. */
function clampPadding(map: maplibregl.Map, padding: PaddingOptions): PaddingOptions {
  const el = map.getContainer();
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w < 64 || h < 64) return { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    left:   Math.min(Number(padding.left ?? 0), Math.floor(w * 0.45)),
    right:  Math.min(Number(padding.right ?? 0), Math.floor(w * 0.25)),
    top:    Math.min(Number(padding.top ?? 0), Math.floor(h * 0.2)),
    bottom: Math.min(Number(padding.bottom ?? 0), Math.max(0, h - 160)),
  };
}

function fitCampusView(map: maplibregl.Map, padding: PaddingOptions, animate = true) {
  try {
    if (map.getContainer().clientWidth < 64 || map.getContainer().clientHeight < 64) return;
    const reduced = prefersReducedMotion();
    const token = Symbol("fitCampus");
    (map as maplibregl.Map & { __fitToken?: symbol }).__fitToken = token;
    // MapLibre adds fitBounds padding to persistent camera padding. Apply it
    // once here; double-padding pushed the phone campus above the viewport.
    map.setPadding(clampPadding(map, padding));
    map.fitBounds(getMainCampusFitBounds(), {
      padding: 0,
      pitch: map.getPitch(),
      bearing: 0,
      duration: cameraDuration(animate ? 600 : 0, reduced),
      maxZoom:  BUILDING_FOCUS_ZOOM,
    });
    const enforceMinZoom = () => {
      if ((map as maplibregl.Map & { __fitToken?: symbol }).__fitToken !== token) return;
      if (!isMapReady(map)) return;
      if (map.getZoom() < CAMPUS_MIN_ZOOM) {
        map.easeTo({
          zoom: CAMPUS_MIN_ZOOM,
          duration: cameraDuration(animate ? 300 : 0, reduced),
        });
      }
    };
    if (animate && !reduced) map.once("moveend", enforceMinZoom);
    else enforceMinZoom();
  } catch { /* ignore during teardown */ }
}

function isMapReady(map: maplibregl.Map | null): map is maplibregl.Map {
  if (!map) return false;
  // isStyleLoaded() becomes false while any source is loading, even after
  // style.load. Using it here silently abandons asynchronous layer setup.
  try { return Boolean(map.getContainer()?.isConnected) && Boolean(map.getStyle()?.layers); }
  catch { return false; }
}

// ── GeoJSON helpers ────────────────────────────────────────────────────────────

/** Generic OSM placeholders — not real campus buildings in our dataset. */
function isValidBuildingId(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "building";
}

function buildingMetaFromFeature(f: GeoJSON.Feature): GeoJsonBuildingMeta | null {
  const p = f.properties;
  if (!p) return null;
  const id = p.building_id as string | undefined;
  if (!id || !isValidBuildingId(id)) return null;
  const name = String(p.name ?? id).trim();
  if (name.toLowerCase() === "building" && id.toLowerCase() === "building") return null;
  return { id, name: displayBuildingName(id, name), code: String(p.code ?? "") };
}

// ── Map layer builders ─────────────────────────────────────────────────────────

function satelliteTileURL(): string | null {
  if (!MAPTILER_KEY) return null;
  return `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`;
}

// Illustration extent inherited from the campus geometry.
function addZoneOutlines(map: maplibregl.Map, zones: Zone[]) {
  if (map.getSource(ZONES_SOURCE)) return;
  map.addSource(ZONES_SOURCE, { type: "geojson", data: featureCollection(zones) });
  map.addLayer({ id: LAYER_ZONE_OUTLINE, type: "line", source: ZONES_SOURCE,
    paint: { "line-color": "#C8960A", "line-width": 2, "line-opacity": 0.5 } });
}

function addBuildingSource(map: maplibregl.Map, geojson: GeoJSON.FeatureCollection) {
  if (map.getSource(SOURCE_ID)) return;
  map.addSource(SOURCE_ID, { type: "geojson", data: geojson, promoteId: "building_id" });
  // One label per catalog place, not one per disconnected footprint polygon.
  map.addSource('campus-label-points', { type: 'geojson', data: buildPinFeatureCollection(geojson) });
  map.addLayer({ id: 'building-hit-area', type: 'fill', source: SOURCE_ID,
    filter: ['all', ['has', 'building_id'], ['!=', ['get', 'building_id'], 'building']],
    paint: { 'fill-color': '#c89932', 'fill-opacity': 0.01 } });
  map.addLayer({
    id: LAYER_LABELS, type: "symbol", source: 'campus-label-points', minzoom: LABEL_MIN_ZOOM,
    filter: ["all", ["has", "building_id"], ["!=", ["get", "building_id"], "building"]],
    layout: {
      "text-field":            ["get", "name"],
      // Size interpolates 10px → 14px as you zoom from 15.5 → 18
      "text-size":             ["interpolate", ["linear"], ["zoom"], 15.5, 10, 18, 14] as ExpressionSpecification,
      "text-font":             ["Open Sans SemiBold", "Arial Unicode MS Regular"],
      // Variable anchor lets GL reposition labels to avoid collisions
      "text-variable-anchor":  ["top", "bottom", "left", "right"],
      "text-radial-offset":    1.2,
      "text-allow-overlap":    false,
      "text-ignore-placement": false,
      "symbol-avoid-edges":    true,
    },
    paint: { "text-color": "#ffffff", "text-halo-color": "#1a1a1a", "text-halo-width": 1.5 },
  });
}

function focusBuilding(
  map:       maplibregl.Map,
  id:        string,
  centroids: Map<string, [number, number]>,
  padding:   PaddingOptions,
  animate    = true,
) {
  const coord = centroids.get(id);
  if (!coord || !Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) return;
  try {
    map.flyTo({
      center:  coord,
      zoom:    BUILDING_FOCUS_ZOOM,
      pitch: map.getPitch(),
      bearing: 0,
      padding: clampPadding(map, padding),
      duration: cameraDuration(animate ? 900 : 0, prefersReducedMotion()),
    });
  } catch { /* teardown */ }
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderTooltipBody(meta: GeoJsonBuildingMeta, building: Building | null): string {
  const header = building?.image_url
    ? `<div style="margin:-12px -12px 10px;height:90px;overflow:hidden;border-radius:10px 10px 0 0;">
         <img src="${esc(building.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/>
       </div>`
    : `<div style="margin:-12px -12px 10px;height:52px;background:#f8f6f0;border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:center;">
         <svg width="20" height="20" viewBox="0 0 28 34" fill="none" stroke="${PIN_GOLD_SELECTED}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
           <path d="${ICON_PATH}"/>
         </svg>
       </div>`;

  const desc = building?.description
    ? `<p style="margin:4px 0 0;font-size:11px;color:#555;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(building.description)}</p>`
    : "";

  const details: string[] = [];
  if (building?.floors)     details.push(`${building.floors} floors`);
  if (building?.year_built) details.push(`Est. ${building.year_built}`);
  const detailLine = details.length
    ? `<p style="margin:3px 0 0;font-size:10px;color:#aaa;">${details.join(" · ")}</p>` : "";

  const cta =
    resolvePinTier(meta.id) === "primary" ? "View research →" : "View place →";

  return `<div data-building-hover-card role="button" tabindex="0" style="padding:12px;width:210px;font-family:system-ui,-apple-system,sans-serif;cursor:pointer;">
    ${header}
    <p style="margin:0;font-weight:700;font-size:13px;color:#111;line-height:1.3;">${esc(meta.name)}</p>
    ${meta.code ? `<p style="margin:2px 0 0;font-size:10px;color:#999;font-family:monospace;letter-spacing:.04em;">${esc(meta.code)}</p>` : ""}
    ${desc}${detailLine}
    <p style="margin:8px 0 0;font-size:10px;color:${PIN_GOLD};font-weight:600;">${cta}</p>
  </div>`;
}

// ── Native pin symbol layers ───────────────────────────────────────────────────
//
// Pins are native symbol layers, not HTML markers: symbols are glued to their
// coordinate at every zoom (displacement is impossible) and the collision
// engine hides crowded pins at low zoom, bringing them back as you zoom in.

// Rasterize the teardrop pin SVG for map.addImage (drawn at 2x for pixelRatio: 2)
function makePinImage(fill: string, scale = 1): Promise<HTMLImageElement> {
  const w = Math.round(PIN_W * 2 * scale);
  const h = Math.round(PIN_H * 2 * scale);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${PIN_W} ${PIN_H}">` +
    `<path d="${PIN_PATH}" fill="${fill}" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="${ICON_PATH}" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  return new Promise((resolve, reject) => {
    const img = new Image(w, h);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function buildPinFeatureCollection(
  geojson: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const seen = new Set<string>();
  for (const f of geojson.features) {
    const meta  = buildingMetaFromFeature(f);
    const coord = meta ? centroidFromFeature(f) : null;
    if (!meta || !coord || seen.has(meta.id)) continue;
    seen.add(meta.id);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: {
        building_id: meta.id,
        name:        displayBuildingName(meta.id, meta.name),
        code:        meta.code,
        pin_tier:    resolvePinTier(meta.id),
        category:    resolveCategory(meta.id),
        priority:    pinPriority(meta.id),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

const PIN_ICON_SIZE: ExpressionSpecification =
  ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 0.8, 16.5, 1.0];
const PIN_ICON_SIZE_SECONDARY: ExpressionSpecification =
  ["interpolate", ["linear"], ["zoom"], 16.5, 0.45, 18, 0.7];
const PIN_ICON_SIZE_SELECTED: ExpressionSpecification =
  ["interpolate", ["linear"], ["zoom"], 13, 0.7, 15, 1.05, 16.5, 1.35];
const PIN_SORT_KEY: ExpressionSpecification = ["coalesce", ["get", "priority"], 999];

function addPinLayers(map: maplibregl.Map, geojson: GeoJSON.FeatureCollection) {
  if (map.getSource(PINS_SOURCE)) return;
  map.addSource(PINS_SOURCE, { type: "geojson", data: buildPinFeatureCollection(geojson) });

  map.addLayer({
    id: LAYER_PINS, type: "symbol", source: PINS_SOURCE,
    filter: ["==", ["get", "pin_tier"], "primary"],
    layout: {
      "icon-image":         PIN_IMAGE,
      "icon-anchor":        "bottom",
      "icon-size":          PIN_ICON_SIZE,
      "icon-allow-overlap": false,
      "symbol-sort-key":    PIN_SORT_KEY,
    },
  });

  map.addLayer({
    id: LAYER_PINS_SECONDARY, type: "symbol", source: PINS_SOURCE,
    minzoom: SECONDARY_PIN_MIN_ZOOM,
    filter: ["==", ["get", "pin_tier"], "secondary"],
    layout: {
      "icon-image":         PIN_IMAGE_SECONDARY,
      "icon-anchor":        "bottom",
      "icon-size":          PIN_ICON_SIZE_SECONDARY,
      "icon-allow-overlap": false,
      "symbol-sort-key":    PIN_SORT_KEY,
    },
  });

  map.addLayer({
    id: LAYER_PINS_SELECTED, type: "symbol", source: PINS_SOURCE,
    filter: ["==", ["get", "building_id"], ""],
    layout: {
      "icon-image":            PIN_IMAGE_SELECTED,
      "icon-anchor":           "bottom",
      "icon-size":             PIN_ICON_SIZE_SELECTED,
      "icon-allow-overlap":    true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-translate":        [0, -8],
      "icon-translate-anchor": "viewport",
    },
  });
}

function syncSecondaryPinZoom(map: maplibregl.Map, showAll: boolean) {
  if (!map.getLayer(LAYER_PINS_SECONDARY)) return;
  try {
    map.setLayerZoomRange(
      LAYER_PINS_SECONDARY,
      showAll ? 0 : SECONDARY_PIN_MIN_ZOOM,
      24,
    );
  } catch { /* teardown */ }
}

function syncPinSelection(map: maplibregl.Map, selectedId: string | null) {
  if (!map.getLayer(LAYER_PINS)) return;
  const id = selectedId ?? "";
  try {
    map.setFilter(LAYER_PINS, [
      "all",
      ["==", ["get", "pin_tier"], "primary"],
      ["!=", ["get", "building_id"], id],
    ]);
    if (map.getLayer(LAYER_PINS_SECONDARY)) {
      map.setFilter(LAYER_PINS_SECONDARY, [
        "all",
        ["==", ["get", "pin_tier"], "secondary"],
        ["!=", ["get", "building_id"], id],
      ]);
    }
    map.setFilter(LAYER_PINS_SELECTED, ["==", ["get", "building_id"], id]);
  } catch { /* teardown */ }
}

// Route line + A/B endpoint markers, drawn above imagery/models and below
// the building pins so pins stay clickable over the route.
function addRouteLayers(map: maplibregl.Map) {
  if (map.getSource(ROUTE_SOURCE)) return;

  map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
  map.addLayer({
    id: LAYER_ROUTE_CASING, type: "line", source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE_BLUE_CASING, "line-width": 7, "line-opacity": 0.9 },
  }, LAYER_LABELS);
  map.addLayer({
    id: LAYER_ROUTE_LINE, type: "line", source: ROUTE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE_BLUE, "line-width": 4 },
  }, LAYER_LABELS);

  map.addSource(ROUTE_ENDPOINTS_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: LAYER_ROUTE_ENDPOINTS, type: "circle", source: ROUTE_ENDPOINTS_SOURCE,
    paint: {
      "circle-radius": 9,
      "circle-color": ["match", ["get", "label"], "A", "#16a34a", "B", "#dc2626", ROUTE_BLUE],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
}

function syncRoute(map: maplibregl.Map, route: DirectionsResult | null) {
  const lineSource = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const endpointsSource = map.getSource(ROUTE_ENDPOINTS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  lineSource?.setData(routeLineFeatureCollection(route));
  endpointsSource?.setData(routeEndpointsFeatureCollection(route));
}

function fitRouteBounds(map: maplibregl.Map, route: DirectionsResult, padding: PaddingOptions) {
  try {
    const [w, s, e, n] = bbox({ type: "Feature", geometry: route.geometry, properties: {} });
    map.setPadding(clampPadding(map, padding));
    map.fitBounds([[w, s], [e, n]], {
      padding: 0,
      pitch: map.getPitch(),
      bearing: 0,
      duration: cameraDuration(600, prefersReducedMotion()),
      maxZoom:  BUILDING_FOCUS_ZOOM,
    });
  } catch { /* teardown */ }
}

// ── "You are here" marker ──────────────────────────────────────────────────────

function makeUserLocationEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "50%";
  el.style.background = ROUTE_BLUE;
  el.style.border = "3px solid #ffffff";
  el.style.boxShadow = "0 0 0 2px rgba(37,99,235,0.35), 0 2px 6px rgba(0,0,0,0.35)";
  return el;
}

function syncUserLocationMarker(
  map: maplibregl.Map,
  markerRef: { current: maplibregl.Marker | null },
  location: UserLocation | null,
) {
  if (!location) {
    markerRef.current?.remove();
    markerRef.current = null;
    return;
  }
  if (!markerRef.current) {
    markerRef.current = new maplibregl.Marker({ element: makeUserLocationEl() });
  }
  markerRef.current.setLngLat([location.lng, location.lat]).addTo(map);
}

function attachPinInteractions(
  map:         maplibregl.Map,
  onSelect:    (id: string, meta: GeoJsonBuildingMeta) => void,
  getBuilding: (id: string) => Building | null,
) {
  const popup = new maplibregl.Popup({
    closeButton: false, closeOnClick: false,
    anchor: "bottom", offset: [0, -(PIN_H + 4)],
    maxWidth: "230px", className: "building-pin-popup",
  });

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let hoveredMeta: GeoJsonBuildingMeta | null = null;
  map.on('click', 'building-hit-area', (e: MapLayerMouseEvent) => {
    if (map.getContainer().dataset.models === 'ready') return; // raycast once models are actually usable
    if (map.queryRenderedFeatures(e.point, { layers: [LAYER_PINS, LAYER_PINS_SECONDARY, LAYER_PINS_SELECTED] }).length) return;
    const meta = e.features?.[0] ? buildingMetaFromFeature(e.features[0]) : null;
    if (meta) onSelect(meta.id, meta);
  });
  map.on('mouseenter', 'building-hit-area', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'building-hit-area', () => { map.getCanvas().style.cursor = ''; });

  function cancelHide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(() => {
      popup.remove();
      hoveredMeta = null;
    }, 280);
  }

  function wirePopupElement() {
    const el = popup.getElement();
    if (!el || el.dataset.wired === "1") return;
    el.dataset.wired = "1";
    el.addEventListener("mouseenter", cancelHide);
    el.addEventListener("mouseleave", scheduleHide);
    el.addEventListener("click", () => {
      if (!hoveredMeta) return;
      onSelect(hoveredMeta.id, hoveredMeta);
      cancelHide();
      popup.remove();
      hoveredMeta = null;
    });
  }

  for (const layerId of [LAYER_PINS, LAYER_PINS_SECONDARY, LAYER_PINS_SELECTED]) {
    map.on("click", layerId, (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const meta = f ? buildingMetaFromFeature(f) : null;
      if (meta) onSelect(meta.id, meta);
    });

    map.on("mouseenter", layerId, (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      const meta = f ? buildingMetaFromFeature(f) : null;
      if (!f || !meta) return;
      cancelHide();
      hoveredMeta = meta;
      const coord = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      popup
        .setLngLat(coord)
        .setHTML(renderTooltipBody(meta, getBuilding(meta.id)))
        .addTo(map);
      requestAnimationFrame(wirePopupElement);
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
      scheduleHide();
    });
  }
}

/** MapLibre 6 requires WebGL2; older devices fail at construction. */
function supportsWebGl2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

// ── GeoJSON cache ──────────────────────────────────────────────────────────────

let cachedGeojson: GeoJSON.FeatureCollection | null = null;

async function loadCampusGeojson() {
  if (!cachedGeojson) {
    const res = await fetch("/buildings.geojson");
    // A 404/500 previously fell through to res.json() and rejected with an
    // opaque parse error inside async map setup.
    if (!res.ok) throw new Error(`buildings.geojson: HTTP ${res.status}`);
    cachedGeojson = (await res.json()) as GeoJSON.FeatureCollection;
  }
  const centroids = new Map<string, [number, number]>();
  for (const f of cachedGeojson.features) {
    const meta = buildingMetaFromFeature(f);
    if (!meta || centroids.has(meta.id)) continue;
    const c = centroidFromFeature(f);
    if (c) centroids.set(meta.id, c);
  }
  return { geojson: cachedGeojson, centroids };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CampusMap({
  buildings,
  selectedId,
  onSelectBuilding,
  mapInset           = NO_MAP_INSET,
  route              = null,
  userLocation       = null,
  onUserLocationChange,
  focusPoint         = null,
  viewResetNonce     = 0,
  onCampusHomeClick,
  showAllCampusBuildings = false,
}: CampusMapProps) {
  const pathname = usePathname();
  const [viewParam, setViewParam] = useUrlParam("view", { ownsParam: pathname === "/" });
  const view = resolveMapView(viewParam);
  const setViewRef = useRef(setViewParam);
  useEffect(() => { setViewRef.current = setViewParam; }, [setViewParam]);
  const [modelError, setModelError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  const containerRef      = useRef<HTMLDivElement>(null);
  const mapRef            = useRef<maplibregl.Map | null>(null);
  const layersReadyRef    = useRef(false);
  const prevSelectedIdRef = useRef<string | null>(null);
  const centroidsRef      = useRef<Map<string, [number, number]>>(new Map());
  const paddingRef        = useRef(buildMapPadding(mapInset));
  const buildingsMapRef   = useRef<Map<string, Building>>(new Map());
  const routeRef          = useRef<DirectionsResult | null>(route);
  const userLocationRef   = useRef<UserLocation | null>(userLocation);
  const userMarkerRef     = useRef<maplibregl.Marker | null>(null);
  const cameraTokenRef    = useRef(0);
  const lastViewResetRef  = useRef(0);
  const showAllRef = useRef(showAllCampusBuildings);
  useEffect(() => { showAllRef.current = showAllCampusBuildings; }, [showAllCampusBuildings]);

  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapFailure, setMapFailure] = useState<MapFailure | null>(null);
  // Bumping this tears down and rebuilds the map — the retry path.
  const [initNonce, setInitNonce] = useState(0);
  // The map's own "My location" control used to fail silently while the
  // identical control in the directions panel reported errors.
  const [locationError, setLocationError] = useState<string | null>(null);

  const onSelectRef = useRef(onSelectBuilding);
  const onUserLocationChangeRef = useRef(onUserLocationChange);

  // Mirror render-scoped props into refs so map event handlers (which outlive a
  // render) always read current values. Declared before the camera effects below
  // so those observe the fresh values on the same commit.
  useEffect(() => {
    paddingRef.current = buildMapPadding(mapInset);
    routeRef.current = route;
    userLocationRef.current = userLocation;
    onSelectRef.current = onSelectBuilding;
    onUserLocationChangeRef.current = onUserLocationChange;
    buildingsMapRef.current = new Map(buildings.map((b) => [b.id, b]));
  }, [
    mapInset,
    route,
    userLocation,
    onSelectBuilding,
    onUserLocationChange,
    buildings,
  ]);

  const resizeMap = useCallback(() => {
    const map = mapRef.current;
    if (!isMapReady(map)) return;
    try {
      map.resize();

    } catch { /* mid-teardown */ }
  }, []);

  // ── Initialize map once ────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    if (!supportsWebGl2()) {
      setMapStatus("error");
      setMapFailure("webgl-unsupported");
      return;
    }
    if (!MAPTILER_KEY) {
      setMapStatus("error");
      setMapFailure("missing-key");
      return;
    }

    let cancelled = false;
    setStyleReady(false);

    // v6 no longer embeds its worker. Its runtime relative-URL inference breaks
    // after bundling into Next chunks: emit the standalone worker as an asset.
    maplibregl.setWorkerUrl('/map-worker/maplibre-gl-worker.mjs');

    let map: maplibregl.Map;
    try { map = new maplibregl.Map({
      container,
      style:   MAP_STYLE,
      center:  INITIAL_CENTER,
      zoom:    INITIAL_ZOOM,
      pitch: resolveMapView(new URLSearchParams(window.location.search).get('view')) === 'illustrated' ? 35 : 0,
      bearing: 0,
      minZoom: CAMPUS_MIN_ZOOM,
      maxZoom: CAMPUS_MAX_ZOOM,
      maxBounds: MAP_MAX_BOUNDS,
      // Controlled north-up view. Only the view switch changes pitch.
      maxPitch: 35,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
    }); } catch {
      setMapStatus("error");
      setMapFailure("unknown");
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    const exposeCameraState = () => {
      const host = map.getContainer();
      host.dataset.mapZoom = map.getZoom().toFixed(2);
      host.dataset.mapBearing = map.getBearing().toFixed(2);
      host.dataset.mapPitch = map.getPitch().toFixed(2);
      host.dataset.mapCenter = JSON.stringify(map.getCenter().toArray());
      const selectedCoord = centroidsRef.current.get(prevSelectedIdRef.current ?? '');
      if (selectedCoord) {
        const screen = map.project(selectedCoord);
        host.dataset.selectedScreen = JSON.stringify([screen.x, screen.y]);
      }
      if (layersReadyRef.current) {
        host.dataset.mapFeatures = String(map.queryRenderedFeatures().length);
        host.dataset.mapSourcesLoaded = String(map.areTilesLoaded());
        host.dataset.routeFeatures = String(map.queryRenderedFeatures({ layers: [LAYER_ROUTE_LINE] }).length);
      }
    };
    map.on("moveend", exposeCameraState);
    map.on("idle", exposeCameraState);
    exposeCameraState();

    mapRef.current       = map;
    layersReadyRef.current = false;

    const setupLayers = async () => {
      if (cancelled || !isMapReady(map)) return;
      const [{ geojson, centroids }, [pinImg, pinSecondaryImg, pinSelectedImg]] = await Promise.all([
        loadCampusGeojson(),
        Promise.all([
          makePinImage(PIN_GOLD),
          makePinImage(PIN_SECONDARY, 0.9),
          makePinImage(PIN_GOLD_SELECTED, 1.35),
        ]),
      ]);
      if (cancelled || !isMapReady(map)) return;

      if (!map.hasImage(PIN_IMAGE))
        map.addImage(PIN_IMAGE, pinImg, { pixelRatio: 2 });
      if (!map.hasImage(PIN_IMAGE_SECONDARY))
        map.addImage(PIN_IMAGE_SECONDARY, pinSecondaryImg, { pixelRatio: 2 });
      if (!map.hasImage(PIN_IMAGE_SELECTED))
        map.addImage(PIN_IMAGE_SELECTED, pinSelectedImg, { pixelRatio: 2 });

      const { zones } = getMaskZones(geojson);

      addZoneOutlines(map, zones);
      addBuildingSource(map, geojson);
      addRouteLayers(map);
      addPinLayers(map, geojson);
      syncSecondaryPinZoom(map, showAllRef.current);
      attachPinInteractions(
        map,
        (id, meta) => onSelectRef.current(id, meta),
        (id) => buildingsMapRef.current.get(id) ?? null,
      );

      centroidsRef.current = centroids;
      layersReadyRef.current = true;
      setStyleReady(true);
      markReady();

      map.resize();
      syncPinSelection(map, prevSelectedIdRef.current);
      syncRoute(map, routeRef.current);
      syncUserLocationMarker(map, userMarkerRef, userLocationRef.current);

      if (routeRef.current) {
        fitRouteBounds(map, routeRef.current, paddingRef.current);
      } else if (prevSelectedIdRef.current) {
        focusBuilding(map, prevSelectedIdRef.current, centroidsRef.current, paddingRef.current, false);
      } else {
        fitCampusView(map, paddingRef.current, false);
      }
    };

    const onLoad = () => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled || !isMapReady(map)) return;
        map.resize();
        void setupLayers().catch((err) => {
          if (cancelled) return;
          console.error("[map layers]", err);
          setMapStatus("error");
          setMapFailure("data-failed");
        });
      });
    };

    // MapLibre 6 events are class instances; its error payload is an ErrorLike,
    // which is not structurally an Error.
    const onMapError = (e: maplibregl.ErrorEvent) => {
      const message = e.error?.message ?? "unknown";
      console.error("[map error]", message.replace(/([?&](?:key|access_token)=)[^&\s]+/g, '$1[redacted]'));
      // Individual tile errors are transient and self-healing; only a style
      // that never loads leaves the user with an unusable surface.
      // The readiness deadline below handles a style that never becomes usable.
    };
    map.on("error", onMapError);
    const onContextLost = () => {
      if (cancelled) return;
      setMapStatus("error");
      setMapFailure("context-lost");
    };
    map.on("webglcontextlost", onContextLost);

    let readyTimer: ReturnType<typeof setTimeout> | undefined;

    const markReady = () => {
      if (cancelled) return;
      clearTimeout(readyTimer);
      setMapStatus("ready");
      setMapFailure(null);
    };

    // Reveal on `style.load`, not `load`. `load` additionally waits for the
    // first full render of every source; a single slow or stalled source then
    // traps the user behind the loading overlay even though the basemap is
    // interactive. Observed in headless WebGL, where `style.load` fires and
    // `load` never does.
    if (map.isStyleLoaded()) {
      onLoad();
    } else {
      map.once("style.load", () => {
        onLoad();
      });
      // Last-resort unveil: never leave a spinner up indefinitely when the map
      // may in fact be usable.
      readyTimer = setTimeout(() => {
        if (!cancelled && !layersReadyRef.current) {
          setMapStatus("error");
          setMapFailure("style-failed");
        }
      }, 15_000);
    }

    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      layersReadyRef.current = false;
      map.off("error", onMapError);
      map.off("webglcontextlost", onContextLost);
      map.off("moveend", exposeCameraState);
      map.remove(); // also detaches pin layer handlers and the hover popup
      mapRef.current = null;
    };
  // `initNonce` re-runs the whole lifecycle so "Try again" rebuilds the map.
  }, [initNonce]);

  // ── Resize observers ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => resizeMap());
    observer.observe(el);
    return () => observer.disconnect();
  }, [resizeMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    syncSecondaryPinZoom(map, showAllCampusBuildings);
  }, [showAllCampusBuildings]);

  // ── Unified camera sync (single owner — avoids competing flyTo/fitBounds) ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) {
      prevSelectedIdRef.current = selectedId;
      return;
    }

    syncPinSelection(map, selectedId);
    prevSelectedIdRef.current = selectedId;

    const token = ++cameraTokenRef.current;
    const padding = paddingRef.current;
    const isHomeReset = viewResetNonce > 0 && viewResetNonce !== lastViewResetRef.current;

    const applyCamera = (animate: boolean) => {
      if (token !== cameraTokenRef.current || !isMapReady(map)) return;
      try { map.resize(); } catch { return; }

      if (focusPoint) {
        map.flyTo({
          center:   focusPoint,
          zoom:     ROUTE_STEP_ZOOM,
          pitch: map.getPitch(),
          bearing:  0,
          padding:  clampPadding(map, padding),
          duration: cameraDuration(animate ? 600 : 0, prefersReducedMotion()),
        });
        return;
      }
      if (route) {
        fitRouteBounds(map, route, padding);
        return;
      }
      if (selectedId) {
        focusBuilding(map, selectedId, centroidsRef.current, padding, animate);
        return;
      }
      fitCampusView(map, padding, animate);
    };

    if (isHomeReset) {
      lastViewResetRef.current = viewResetNonce;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => applyCamera(true));
      });
    } else {
      applyCamera(true);
    }
  }, [
    selectedId,
    route,
    focusPoint,
    viewResetNonce,
  ]);

  // Overlay measurement changes padding without restarting flyTo on every resize.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const timer = setTimeout(() => {
      if (!isMapReady(map)) return;
      if (!routeRef.current && !prevSelectedIdRef.current) fitCampusView(map, buildMapPadding(mapInset), false);
      else map.easeTo({ padding: clampPadding(map, buildMapPadding(mapInset)), pitch: map.getContainer().dataset.mapView === 'illustrated' ? 35 : 0, duration: cameraDuration(200, prefersReducedMotion()) });
    }, 100);
    return () => clearTimeout(timer);
  }, [mapInset, styleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !isMapReady(map)) return;
    let cancelled = false;
    map.getContainer().dataset.mapView = view;
    if (map.getLayer("illustrated-buildings")) map.removeLayer("illustrated-buildings");
    if (!map.getSource("campus-satellite")) {
      const tiles = satelliteTileURL();
      if (tiles) {
        map.addSource("campus-satellite", { type: "raster", tiles: [tiles], tileSize: 512, maxzoom: 20 });
        map.addLayer({ id: "campus-satellite", type: "raster", source: "campus-satellite", layout: { visibility: "none" } }, LAYER_ZONE_OUTLINE);
      }
    }
    if (map.getLayer("campus-satellite")) map.setLayoutProperty("campus-satellite", "visibility", view === "satellite" ? "visible" : "none");
    setIllustratedGround(map, view === 'illustrated', 'building-hit-area');
    map.setPaintProperty(LAYER_LABELS, "text-color", view === "satellite" ? "#ffffff" : "#293831");
    map.setPaintProperty(LAYER_LABELS, "text-halo-color", view === "satellite" ? "#263128" : "#ffffff");
    // Make the controlled angle a constraint, not an interruptible animation:
    // wheel/pinch during a view change must not strand the map at 12° or 24°.
    const pitch = view === 'illustrated' ? 35 : 0;
    map.setMinPitch(0);
    map.setMaxPitch(pitch);
    map.setMinPitch(pitch);
    map.jumpTo({ pitch, bearing: 0 });
    if (view === "illustrated") {
      void import("@/lib/illustrated-layer").then(({ createIllustratedLayer }) => {
        if (cancelled || !isMapReady(map)) return;
        map.addLayer(createIllustratedLayer(
          () => { setModelError(false); setDetailError(false); },
          () => { if (!cancelled) { setModelError(true); setViewRef.current("flat"); } },
          (id) => {
            const building = buildingsMapRef.current.get(id);
            onSelectRef.current(id, { id, name: displayBuildingName(id, building?.name ?? id), code: building?.code ?? '' });
          },
          () => { if (!cancelled) setDetailError(true); },
        ), LAYER_ROUTE_CASING);
      }).catch(() => { if (!cancelled) { setModelError(true); setViewRef.current("flat"); } });
    }
    return () => { cancelled = true; };
  }, [view, styleReady]);

  // ── Orientation-aware refit on window resize (debounced 300 ms) ────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const map = mapRef.current;
        if (!isMapReady(map)) return;
        try { map.resize(); } catch { return; }
        if (!routeRef.current && !prevSelectedIdRef.current) {
          fitCampusView(map, paddingRef.current, false);
        }
      }, 300);
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); clearTimeout(timer); };
  }, []);

  // ── Route polyline sync ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    syncRoute(map, route);
  }, [route]);

  // ── User location marker sync ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    syncUserLocationMarker(map, userMarkerRef, userLocation);
  }, [userLocation]);

  const retryMap = useCallback(() => {
    setMapStatus("loading");
    setMapFailure(null);
    setInitNonce((n) => n + 1);
  }, []);

  return (
    <div className="campus-map-container absolute inset-0">
      <div ref={containerRef} data-testid="map-host" className="h-full w-full" />

      {modelError && view === 'flat' && <p role="status" className="absolute top-20 right-4 z-10 max-w-[calc(100%-2rem)] rounded-lg bg-white p-3 text-sm shadow">Illustrated view unavailable. Showing the flat map.</p>}
      {detailError && view === 'illustrated' && <p role="status" className="absolute top-20 right-4 z-10 max-w-[calc(100%-2rem)] rounded-lg bg-white p-3 text-sm shadow">Facade details unavailable. Base buildings remain usable. Switch views to retry.</p>}
      <div aria-label="Map appearance" className="absolute top-4 right-20 z-10 flex rounded-lg bg-white p-1 shadow">
        {(["flat", "satellite", ...(ILLUSTRATED_ENABLED ? ["illustrated"] : [])] as const).map(option => (
          <button key={option} type="button" aria-pressed={view === option} aria-label={option[0].toUpperCase() + option.slice(1)}
            onClick={() => setViewParam(option)}
            className={`min-h-11 rounded-md px-3 text-xs capitalize ${view === option ? "bg-amber-100 text-amber-950" : "text-gray-700"}`}>{option}</button>
        ))}
      </div>
      <MapStatusOverlay status={mapStatus} failure={mapFailure} onRetry={retryMap} inset={mapInset} />

      {/* Map controls — top right */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (onCampusHomeClick) {
              onCampusHomeClick();
              return;
            }
            const map = mapRef.current;
            if (!isMapReady(map)) return;
            fitCampusView(map, paddingRef.current);
          }}
          title="Campus home"
          aria-label="Campus home"
          className="map-control-btn"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>

        <div className="map-control-group">
          <button type="button" onClick={() => mapRef.current?.zoomIn({ duration: cameraDuration(250, prefersReducedMotion()) })}
            title="Zoom in"
          aria-label="Zoom in" className="map-control-btn map-control-btn--grouped">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button type="button" onClick={() => mapRef.current?.zoomOut({ duration: cameraDuration(250, prefersReducedMotion()) })}
            title="Zoom out"
          aria-label="Zoom out" className="map-control-btn map-control-btn--grouped border-t border-gray-200">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M5 12h14" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!navigator.geolocation) {
              setLocationError("Geolocation isn't supported on this device.");
              return;
            }
            setLocationError(null);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const loc = { lng: pos.coords.longitude, lat: pos.coords.latitude };
                setLocationError(null);
                onUserLocationChangeRef.current?.(loc);
                const map = mapRef.current;
                if (isMapReady(map) && !routeRef.current) {
                  map.flyTo({
                    center: [loc.lng, loc.lat],
                    zoom: 17,
                    duration: cameraDuration(900, prefersReducedMotion()),
                  });
                }
              },
              (err) => {
                console.error("[geolocation]", err.message);
                setLocationError(
                  err.code === err.PERMISSION_DENIED
                    ? "Location access was denied — enable it in your browser to use this."
                    : "Couldn't determine your location."
                );
              },
              { enableHighAccuracy: true, timeout: 8000 },
            );
          }}
          title="My location"
          aria-label="My location"
          className="map-control-btn"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
            <path strokeLinecap="round" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
        </button>

        {locationError && (
          <div
            role="alert"
            className="max-w-[220px] rounded-lg bg-white/95 px-3 py-2 text-[11px] leading-snug text-gray-700 shadow-lg ring-1 ring-black/5"
          >
            {locationError}
            <button
              type="button"
              onClick={() => setLocationError(null)}
              className="mt-1 block text-[10px] font-semibold text-gray-400 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
