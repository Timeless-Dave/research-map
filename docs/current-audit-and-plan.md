# Current-state audit and ordered remediation

September 12, 2026. This audits the working tree, including uncommitted work;
earlier pass counts are not evidence that uncovered behavior is correct.
Database deployment and the standing decision to defer research-data verification
remain outside implementation scope. No commit or deployment is authorized here.

## Verdict

This is a working experimental campus explorer, not a finished Baylor-equivalent
map or a verified navigation product. Single-map rendering, footprint alignment,
small assets, shared place IDs, and basic interaction coverage are real progress.
But architectural fidelity is low, operational failure paths are incomplete,
and the test suite has given more confidence than its actual assertions justify.

## Coverage and limits

This pass inspected the map lifecycle/layers/camera/selection, Three renderer,
Blender generation and asset gates, OSM ground generation, route parsing/handoff,
phone panel, directory/profile interactions, chat request contract, URL state and
CI/browser configuration. It ran the local verification gate and exercised the
application in Chromium, phone-emulated Chrome and WebKit. Findings below
distinguish code evidence, browser reproductions and acceptance gaps.

It is not a penetration test, campus survey, screen-reader certification or a
line-by-line review of every generated dataset/binary. Paid routing is mocked in
browser tests; live provider path correctness is not established. Production
dependency advisory checking was initially blocked because it discloses package
metadata to npm. After explicit user approval, `pnpm audit --prod` completed on
September 12, 2026 (23:27 CDT), reporting no known vulnerabilities. This checks
known production dependency advisories, not application security or dev dependencies.

## Findings at audit start

### P1 — misleading route geometry

`src/lib/directions.ts:getRouteWithHandoff` concatenates two independently snapped
LineStrings. If the driving endpoint differs from the pedestrian start, MapLibre
draws a straight segment between them. That segment was never routed and could
cross a fence, building or restricted ground. Totals omit it. Use separate line
parts and explicitly report the unverified transition. The response parser also
casts external JSON without validating finite coordinates, distances or steps.

### P1 — CI does not verify the shipped feature

`.github/workflows/ci.yml` installs Chromium only while `playwright.config.ts`
defines WebKit. It omits `NEXT_PUBLIC_ILLUSTRATED_MAP=true`, so illustration tests
skip, and omits a Mapbox test token needed by mocked directions tests. The verify
job omits the illustrated geometry/budget gate. This is a release-process defect,
not an artwork issue. Local green tests do not repair hosted CI configuration.

### P1 — failure handling discards useful state

`src/lib/illustrated-layer.ts:loadDetail` sends optional facade failures through
the same callback as complete model failure, replacing a working illustration
with flat view. The only readiness state is base GLB loaded, not details rendered.
Render exceptions and post-start WebGL context loss have no explicit UI recovery.
`CampusMap` also stops footprint selection whenever a custom layer exists, even
while it has not loaded. Status text can persist after changing to satellite and
claim the user is looking at a flat map. These paths need independent states.

### P1 — georeferencing has two sources of truth

The Blender script and renderer separately hard-code the same origin. The
manifest is checked by the asset script but ignored by the renderer. Moving the
authoring origin can pass the offline corner check while moving every building
in the browser. Share a checked configuration and gate manifest consistency.

### P2 — expensive details and ground load without useful visibility

Detail loads at zoom 16 but never hides when zooming out again. Flat/satellite
also create the illustrated ground source immediately. The renderer has no DPR
budget, and repeated view switches parse/reupload assets; there is no measured
long-running GPU/memory acceptance test. Keep detail visibility zoom-dependent;
avoid creating illustrated ground when illustration has never been requested.
Do not assert physical 60 FPS from short SwiftShader samples.

### P2 — labels and ground treatment are weaker than the presentation claims

Labels are attached to building polygons rather than the deduplicated place-point
catalog; multipart/tile placement and provider POIs can duplicate labels (visible
in the Human Sciences capture). Ground uses essentially one road width, treats
unrecognized highway types as roads, and styles steps like ordinary footpaths.
Restrictions are carried as tags but visually indistinguishable. The green field
is a generated extent, not surveyed lawns. Label ownership and ground semantics
need explicit rules; no cosmetic shape should imply a verified path.

### P2 — evidence and asset gates have blind spots

`check-illustrated-assets.mjs` checks source corners against mesh vertices, not
survey alignment, roof topology, every face, or actual runtime projection. Its
5 MiB and 15 MiB assertions check the same aggregate rather than initial versus
progressive payloads. Worker and ground snapshot freshness are not checked.
Browser model-click coverage clicks an already selected building; frame samples
are brief, not a sustained thermal benchmark. Existing evidence is useful but
must not be advertised as a complete acceptance test.

### P2 — accessibility is partly markup rather than behavior

`ProfileModal.tsx` declares `aria-modal` but does not trap/restore focus or move
focus into the modal. `LeftPanel` declares tabs but lacks the expected arrow-key
behavior and tab/panel association. Phone controls exist at every detent, but
short-height screens, safe-area padding, physical keyboard and touch pinch still
need stronger coverage. Native dialog behavior and real tab interactions are
preferable to claiming accessibility from role attributes alone.

Browser work in this pass additionally reproduced a graphics-error retry button
hidden behind the phone sheet. The error overlay used full-canvas centering,
ignoring the measured inset already used by camera framing. This is fixed by
laying the scrollable error surface out in the unobscured map area. Profile cards
also nested email links inside an opening button; those controls are now siblings.

### P2 — chat conversation eventually breaks; client can hang

`AIAssistant.tsx` sends the entire displayed history. `chat-guard.ts` rejects more
than 40 messages, 12,000 total characters, or any assistant message over 2,000
characters. A normal long answer or conversation can therefore make all later
turns fail. There is no client timeout/abort. Bound the transmitted context, not
the user's displayed conversation, and guarantee a recoverable pending state.

### P2 — directory errors are a dead end

`PeopleDirectory.tsx` says to try again but has no request retry and no cancellation
on unmount. A transient failure requires navigation/reload. Add an actual retry,
cancel stale work, and test the error path.

### P2/P3 — maintainability and unfinished product scope

`CampusMap.tsx` is over 1,100 lines and mixes lifecycle, styles, camera ownership,
tooltips, diagnostics and UI. Renderer configuration needs extraction first;
a wholesale rewrite while stabilizing would raise regression risk. Legacy
`satellite-overlay.ts`, mask-oriented names and old comments remain after the
second map was removed. Generated diagnostic artifacts include superseded files.
Preserve existing staged work; remove only proven-unused code within scope.

Visual reality: four facades use approximate repeated rhythms, all roofs are
simple slabs, and 27 buildings are generic extrusions. There are no authored
roof volumes or verified elevation-by-elevation reconstructions. Adding more
window lines is not equivalent to architectural fidelity. Parker photos reviewed
so far show interiors. Further trustworthy work needs exterior/roof evidence.

### Known external/product constraints, not silently "fixed"

- `supabase-server.ts` latches off after transient failures for process lifetime;
  observed in code, but database integration is excluded from this pass.
- The chat limiter is per-process and trusts forwarded headers. Shared enforcement
  and trusted proxy configuration require a deployment decision. A local counter
  cannot become distributed protection through documentation.
- Research/AI rosters and floor counts disagree with modeled approximations.
  Seed-data verification is deliberately deferred, not a newly discovered oversight.
- Parking component size is coordinate sharing, not a connected route graph.
  Neither proximity nor a verified destination proves step-free travel.
- Real iPhone/Android, sustained GPU/memory/thermal behavior and campus navigation
  verification cannot be completed through desktop emulation.

## Ordered implementation plan

Each step must gain a regression check before being marked complete. This is the
executable code-remediation plan, not a promise to invent missing campus facts.

1. [x] Routing integrity: separate handoff line parts; validate responses; expose
   the unverified gap without drawing a fictional connector.
2. [x] Renderer contract/recovery: share georeferencing config, preserve base on
   detail failure, expose detail state, hide distant details, recover context loss.
3. [x] Labels/ground and artifact gates: deduplicate campus label points, classify
   mapped ground honestly, load it lazily, check generated freshness/config/budgets.
4. [x] UI reliability: modal focus, keyboard tabs, directory retry/cancellation,
   bounded chat context and client timeout. No research-data rewriting.
5. [x] CI and regression coverage: install both engines, enable illustration and
   mocked directions, wire asset checks, test the newly found failure modes.
6. [x] Run verification and browsers, capture evidence, update this ledger with
   actual results and list the remaining externally blocked acceptance work.

Release remains feature-flagged until visual and physical-device acceptance.

## What changed in this pass

- Handoffs are `MultiLineString` parts, with a measured gap and explicit warning;
  no synthetic parking connector is drawn. External route geometry/steps/totals
  receive runtime validation before reaching MapLibre.
- `data/illustrated-config.json` is consumed by Blender and the renderer and
  checked against the manifest. Supported units, axes, asset paths and threshold
  are asserted by the asset gate.
- Base and optional-detail failure paths are distinct. Render exceptions trigger
  flat fallback; graphics-context interruption has a retry UI. That UI now stays
  outside the measured phone sheet/desktop drawer and is scrollable in tight space.
- Detail visibility follows zoom after loading; invisible detail is excluded from
  ray selection. Flat view does not request illustration files. Initial secondary
  pin visibility now uses the actual checkbox state, not a hard-coded false value.
- Campus labels use one point per place. Steps and cycleways have distinct styles;
  unknown/non-supported highway classes are no longer silently painted as roads.
  Ground freshness, worker byte/version freshness and separate initial/campus
  gzip budgets run in the verification gate.
- Profile dialogs move/contain/restore focus, including an explicit WebKit tab
  cycle; card email links no longer nest inside buttons. Navigation tabs support
  arrows/Home/End, a roving tab stop and associated panels. Hidden explorer content
  is inert on the directory route.
- Directory requests cancel on unmount and expose a working retry. Chat sends
  bounded trailing context without deleting displayed history, caps input length,
  checks UTF-8 payload size and aborts stalled requests after 30 seconds.
- CI now installs WebKit and Chromium, enables illustration explicitly, supplies
  a mock-only directions token and runs illustration gates. Hosted CI itself has
  not been run here; it still requires the configured MapTiler secret.

## Remaining work, in execution order

### Baylor reference versus the current UAPB capture

Compared directly against the saved `artifacts/reference/baylor-desktop.png`, not
an assertion that Baylor's current live behavior was re-tested in this pass:

| Dimension | Saved Baylor reference | Current UAPB |
| --- | --- | --- |
| Campus illustration | Strong landscape/road/roof differentiation makes the campus read as an authored place | Muted extent, generic roads and slab roofs; four repeated facade treatments |
| Overview discovery | Visible category layer controls for parking, dining, recreation and other services | Research-first place list and an all-buildings toggle; no equivalent category layer browser |
| Visual hierarchy | Campus-specific detail is distinct from the surrounding street map | Pins remain legible, but roof masses dominate and background/campus ground have weak differentiation |
| Navigation shell | Search, locations/tours tabs, service shortcuts and map controls | Search, locations/directions, research directory and three map views; tours/service datasets are outside this phase |
| Confidence | Screenshot demonstrates presentation, not route/access correctness | Local tests demonstrate specific behaviors, not surveyed navigation or production readiness |

The missing category/tour/service breadth is a product-scope gap, not a broken
button to patch. The art gap cannot be closed just by adding more polygons or
installing another rendering library.

These are not concealed behind the checked code-remediation items above.

1. **Visual/art direction acceptance.** Review the new desktop and phone captures
   at overview and building focus. At the specified 35-degree pitch, roofs dominate
   and facade detail contributes little at overview. Four photo-informed window
   rhythms do not make 31 recognizable buildings. Obtain exterior/roof references,
   author distinct volumes for STEM first, approve that block, then repeat. Keep
   estimates labeled and do not substitute interior photos for exterior evidence.
   Missing source imagery/architecture knowledge prevents factual reconstruction.
2. **Label and ground ownership.** Point labels fix catalog multiparts, not every
   provider-POI duplicate. Establish which provider symbol layers are retained
   inside campus; snapshot representative zooms and assert label counts. Road
   widths remain generic, private/restricted access lacks a visual legend, and
   landscape tint is an extent rather than mapped lawns. Improve that styling
   without implying access or manufacturing paths.
3. **Interaction/performance hardening.** Run on physical iOS Safari and Android:
   pinch/wheel sequences, device rotation, keyboard opening, short landscape,
   safe-area inset, background/foreground and actual context loss. Measure sustained
   frame times and memory over repeated view switches before choosing DPR caps or
   caching. Current tests use desktop/emulated engines; a synthetic context-loss
   event verifies application handling, not driver/device recovery. Short rAF
   samples are not GPU frame timing or a thermal benchmark.
4. **Reduce lifecycle and test coupling.** Extract style/source installation,
   camera orchestration and selection from the >1,100-line map component into
   independently tested modules. Strengthen model selection to open a previously
   unselected place via its mesh, not only ray-hit an already focused model.
   Add offline basemap fixtures so provider availability does not control CI;
   test same-tick URL writers, slow worker/source readiness, failed render callbacks
   and rapid abort/retry/clear-chat sequences. API record shapes outside directions
   still rely heavily on TypeScript casts rather than runtime schemas.
5. **Consolidate and remove obsolete material.** Map and directory still fetch
   researcher data independently. Consolidate fetch/cache ownership with explicit
   stale/error states. Legacy satellite helper and mask-era names remain; the
   helper had user-staged edits at audit start, so this pass did not delete them.
   Separate superseded diagnostic artifacts from current acceptance evidence before
   committing; do not deploy the Blender scene or browser recordings as public assets.
6. **Production authority/data decisions.** The approved production dependency
   advisory check is complete. Configure trusted proxy/shared chat rate limits;
   then resume database resilience/RLS deployment separately when back in scope.
   Confirm actual campus entrances and transitions before navigation/accessibility
   claims. All 19 current anchors are unverified; none authorizes step-free guidance.

Do not enable illustration publicly merely because compilation and mocked browser
checks pass. The code stabilization can finish while product acceptance remains open.

## Verification results — final audit build

- Follow-up `pnpm audit --prod`: exit 0, **No known vulnerabilities found**
  (September 12, 2026, 23:27 CDT). No dependency changes were necessary. This does
  not clear the application-level and deployment risks listed above.
- `NEXT_PUBLIC_ILLUSTRATED_MAP=true pnpm verify`: passed typecheck, lint, 79 unit
  tests in 11 files, anchor checks, public-asset budget, illustrated gates and
  production build. Final extra contract assertions were separately rerun successfully.
- Browser suite: **64 passed, 8 intentionally skipped, 0 failed, 0 flaky** across
  desktop WebKit, desktop Chromium and Pixel 7 Chrome emulation. The skips are
  phone-only tests in desktop projects, not disabled illustrated coverage.
  Machine-readable result: `artifacts/audit/playwright-results.json`.
- `git diff --check`: clean. Regenerating the place catalog produced no drift.
  Existing 955 staged file entries remain staged; no commit/deploy or index rewrite.
- `public/`: 41.4 MB under the current 60 MB gate. This is no longer the old
  543 MB public directory described in earlier discussions.
- Illustration: 31 place records, 70 meshes, 7,334 triangles. Initial public
  illustrated files total **59,234 bytes gzip**; all illustrated files total
  **117,640 bytes gzip**. These are file-budget estimates, excluding application JS,
  Three/MapLibre chunks and external basemap tile traffic, not whole-page transfer.
- Largest source-corner/mesh-vertex error: **0.00003047 m**. This validates the
  pipeline's internal coordinate consistency, not the accuracy of OSM or a survey.
- Anchors: 19 across 17 of 31 places; 16 parking and 3 walking, **all unverified**.
  Three pedestrian proximity reports and 16 road proximity checks passed; neither
  proves connectivity, public access or accessibility.
- Installed Chrome 153 / SwiftShader: fresh desktop and phone captures contained
  no captured page/console errors. Same-origin initial transfer was approximately
  **1.40 MB**, excluding cross-origin tile transfer. Three-second alternating-zoom
  rAF samples: desktop median **16.7 ms**, p95 **33.4 ms**; phone emulation median/p95
  **16.7 ms**. These brief software-renderer samples do not establish sustained
  real-device 60 FPS. See `artifacts/illustrated/browser-report.json`.
- WebKit 26.6 captures also contained no captured page/console errors. Desktop
  rAF median/p95: **17/23 ms**; phone viewport: **17/20 ms**, over the same short
  sample. See `artifacts/illustrated/webkit-browser-report.json`. This is not
  verification on a physical iPhone or a substitute for sustained testing.
- New regression development caught and corrected two actual browser defects:
  the phone-hidden retry control and WebKit profile focus escape. Test fixtures
  were also corrected to account for two researcher consumers and to use a
  parking destination above the existing 40 m handoff threshold. Final counts
  above are from the corrected complete suite, not a partial retry tally.

Current visual evidence lives in `artifacts/illustrated/`: desktop/phone overview
and STEM screenshots, `*-pan-zoom.webm` recordings, and browser/asset JSON reports.
Those are review artifacts, not public assets or evidence of surveyed correctness.
