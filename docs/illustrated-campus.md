# Illustrated campus: implementation and acceptance

Experimental implementation, September 12, 2026. This is original UAPB geometry,
not a copy of Baylor's artwork and not a surveyed architectural model. The flag
defaults **off**. No deployment, database changes, or campus-access verification
are part of this work.

## Reference observations

Live reference: https://map.baylor.edu/?id=2087, captured at 1440×1000 and 390×844
by `scripts/capture-reference.mjs`. Files: `artifacts/reference/baylor-*.png`.
Baylor separates a richly illustrated campus from quieter surrounding streets;
roof and facade shading distinguish buildings without free-camera exploration.
Muted green grounds, gray pavement, light roof planes and gold markers establish
hierarchy. Labels and markers remain geographically located. Desktop uses a
left search/category panel; the phone uses a full-width map with a bottom panel.
The captured phone includes a cookie notice, which is not copied into UAPB.

UAPB preserves its own white/gold navigation, research content and place IDs.
The current result is a lower-detail architectural illustration, not Baylor's
finished art quality. The green-tinted illustration extent is a visual field,
not a surveyed lawn or verified campus property boundary.

## Reproduce

```sh
"/Applications/Blender.app/Contents/MacOS/Blender" --background --python scripts/build-illustrated-campus.py
pnpm generate:illustrated-ground
pnpm check:illustrated
NEXT_PUBLIC_ILLUSTRATED_MAP=true pnpm build
pnpm start
# Separate terminal, same feature flag as the build:
NEXT_PUBLIC_ILLUSTRATED_MAP=true pnpm test:e2e
node scripts/capture-illustrated.mjs
CAPTURE_ENGINE=webkit node scripts/capture-illustrated.mjs
node scripts/capture-facades.mjs
```

Blender 5.1.2 was used. `assets/illustrated/campus.blend` contains editable named
meshes, materials, an authoring camera and sunlight. The script is the source of
truth: manual Blender edits are overwritten by regeneration. Update the script
to retain refinements. It refuses courtyard rings rather than silently filling
them; none occur in the current footprint input.

Outputs:

- `public/illustrated/campus.glb`: all 31 footprint-based building shells/roofs.
- `public/illustrated/detail.glb`: facade bands/glazing, requested at zoom 16+.
- `public/illustrated/manifest.json`: place IDs, source OSM IDs, footprint rings,
  georeferencing origin, orientation and estimated dimensions/provenance.
- `public/illustrated/ground.geojson`: committed OSM roads, paths and parking.
- `artifacts/illustrated/`: screenshots, recordings and machine-readable checks.

The OSM-derived geometry retains ODbL provenance. Map attribution stays visible.
No Baylor graphics are shipped in `public/`. Reference screenshots are local
comparison evidence, not application assets.

## Geometry and fidelity

The origin is longitude −92.02184, latitude 34.24382. Exact Mercator offsets are
scaled into local metres using the same Earth radius as MapLibre (6371008.8 m).
Blender uses east/north/up; GLB uses east/up/south. The shared-context renderer
applies the corresponding Mercator translation, scale and axis rotation once.
Positions are not reconstructed from screen coordinates.

STEM, Woodward, Human Sciences and Larrison use exterior-photo-informed color,
horizontal trim and simplified glazing. Heights are estimates (8–9 m), window
spacing is estimated and elevations are not complete architectural reconstructions.
The inspected Parker photographs show interiors; both Parker exteriors remain
simple footprint forms. Other heights default to an explicit 6 m estimate, with
a 15 m bell-tower estimate. Flat roof profiles remain simplifications. The earlier
claim that the Woodward photograph established a pitched roof was too strong:
the eave is visible, but roof pitch cannot be determined confidently from it.
There are no invented doors, accessible entrances, trees or entrance paths.

The second geometry pass distinguishes each photographed building's window
proportions, band thickness and glazing rhythm, adds frames/mullions/transoms
and roof-edge coping, and records those estimates in the manifest. Unseen
elevations repeat the approximate rhythm; they are not independently verified.
Facade bands are now vertical surfaces rather than capped solids through the
interior. Glazing uses winding-aware edge normals instead of a centroid vector,
so concave elevations do not bury panes inside the wall. The asset checker
verifies every exported glazing vertex lies outside its source footprint.

## Renderer and interaction

One MapLibre instance owns `illustrated | satellite | flat`. Satellite is a
raster style variant inside the same map, not a second clipped canvas. Native
pins, labels, selection, route sources and camera position survive view changes.
The public camera is north-up, pitch 35° in illustration and 0° otherwise;
rotation/tilt gestures are disabled, pan and zoom remain enabled at 12–20.
Model meshes are raycast for roof/facade selection; flat/satellite use footprint
hit areas. Pins keep their native interaction. Search provides the keyboard path.

GLB failure or timeout reports a nonblocking flat fallback without clearing the
building URL. Loading is canceled and GPU resources disposed when a layer is
removed. No permanent animation loop runs when the camera is idle.

Phone search and Locations/Directions tabs stay available at every detent.
Collapsed sheet content is hidden rather than remaining tabbable offscreen.
Sheet measurements are debounced; fitBounds padding is not applied a second
time on top of persistent camera padding.

MapLibre 6's external worker needs explicit packaging in Next. Both worker and
shared module are regenerated from the installed package on dev/build by
`scripts/prepare-map-worker.mjs`; do not copy a different version into public.

## Navigation evidence is limited

Parking checks measure polygon edges and intersections, not just vertices.
Explicit lot/road restrictions are filtered, including motor-vehicle permission
precedence. Coordinate-sharing component size highlights isolated roads but is
**not a routing graph**: the snapshot lacks node IDs, gates, turn restrictions
and verified parking-to-road access connections. Bridges/tunnels are excluded
from simple parking proximity candidates. Even 0 m proximity proves no access.
Pedestrian proximity is checked against eligible ways in the committed snapshot;
steps are deliberately not interpreted as accessibility evidence.

“Accessible entrance” still requires a verified destination anchor. No route is
described as step-free. Physical campus confirmation remains necessary.

## Acceptance and remaining work

Verification rerun after facade refinement on September 12:

- `NEXT_PUBLIC_ILLUSTRATED_MAP=true pnpm verify`: passed, including 76 unit tests,
  lint/typecheck, anchor and asset checks, and the default Turbopack production build.
- Browser suite: **43 passed, 8 skipped**. Skips are phone-only tests in the two
  desktop projects, not skipped illustrated checks. Direct elevated-model clicks,
  route preservation, failed loading, zoom limits and history passed in all engines.
- Following facade refinement: 31 places, 70 meshes, 7,334 triangles. All illustrated files total 117,857 bytes
  gzip; the overview GLB is 186,500 bytes uncompressed. Maximum exported ground
  corner error: 0.0000305 m. The geometrical test does not certify source surveying.
  All 1,736 glazing vertices passed the exterior-position regression check.
- Installed Chrome 153 and Playwright WebKit 26.6 captured desktop and phone
  screenshots and recordings without reported browser errors. Initial same-origin
  transfer was about 1.40 MB in Chrome / 1.47 MB in WebKit, including app resources;
  external map tiles and pre-document/worker requests are not included in that counter.
- Three-second alternating-zoom samples are saved in the two browser reports.
  These short local samples are not a physical-device or sustained-load benchmark;
  use the recorded median/p95 values rather than interpreting them as a guaranteed FPS.

Final files are `desktop-overview.png`, `desktop-stem.png`, `phone-overview.png`,
`phone-stem.png` and `desktop-pan-zoom.webm` / `phone-pan-zoom.webm` under
`artifacts/illustrated/`. The WebKit counterparts have a `webkit-` prefix.
`browser-report.json`, `webkit-browser-report.json` and `asset-report.json`
contain the measured values. Earlier debug captures are not acceptance evidence.
The four building-specific review captures are under `artifacts/illustrated/facades/`.

`pnpm check:illustrated` checks every source footprint corner against exported
ground vertices (<1 cm), ID coverage, finite geometry and 5 MiB initial / 15 MiB
campus gzip budgets. `asset-report.json` records actual sizes and triangles.
HTTP compression is a deployment property; gzip measurements are not proof that
the eventual server sends compressed GLBs. Even uncompressed geometry is small.

Browser tests cover URL view changes, one canvas, selection persistence, zoom
limits, routes, model failure, phone detents and back/forward in Chromium and
WebKit. Installed Chrome captures include pan/zoom videos and frame intervals.
SwiftShader numbers are software-renderer diagnostics, not physical-device FPS.

Keep the feature flag off for public release until these are accepted:

- Review the final captures and interaction report, including real model-surface
  clicking and rapid view changes. Numerical alignment is necessary but does not
  replace visible pan/zoom inspection.
- Test touch pinch/pan, context loss, orientation and thermal performance on an
  actual iPhone/Safari and a midrange Android. WebKit desktop is not iOS testing.
- Author and review stronger STEM roof/facade detail before claiming Baylor-like
  visual fidelity; then refine other buildings using exterior evidence. Obtain
  Parker exterior photographs and campus-confirmed heights/entrances.
- Validate route endpoints on campus. Proximity diagnostics must never be
  presented as public-access or accessibility certification.

The database and deliberately deferred research-data accuracy decision remain
outside this phase. Nothing here certifies that deployed RLS changes were applied.
