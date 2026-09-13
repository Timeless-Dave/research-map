"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useUrlParam } from "@/hooks/use-url-param";
import { isKnownPlaceId } from "@/lib/campus-places.generated";
import { placeDisplayName } from "@/lib/place-catalog";
import { usePanelInset } from "@/hooks/use-panel-inset";
import AppHeader from "@/components/layout/AppHeader";
import LeftPanel, { type SheetState, type SidebarTab } from "@/components/layout/LeftPanel";
import ProfileModal from "@/components/directory/ProfileModal";
import AIAssistant from "@/components/ai/AIAssistant";
import type { Building } from "@/types";
import type { FetchStatus } from "@/types/fetch-status";
import type { GeoJsonBuildingMeta } from "@/types/building-selection";
import type { DirectionsResult } from "@/lib/directions";
import type { DirectoryResearcher } from "@/lib/research-seed";
import type { UserLocation } from "@/components/map/CampusMap";

const CampusMap = dynamic(() => import("@/components/map/CampusMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
      <span className="text-sm text-gray-400">Loading map…</span>
    </div>
  ),
});

export default function CampusExplorer() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [researchers, setResearchers] = useState<DirectoryResearcher[]>([]);
  const pathname = usePathname();
  const router = useRouter();
  const isMapRoute = pathname === "/";

  // Selection lives in the URL so deep links, `<Link>` navigations from the
  // directory, and Back/Forward all drive it — this component stays mounted
  // across routes, so a mount-time read of the URL would go stale.
  const [buildingParam, setSelectedId] = useUrlParam("building", { ownsParam: isMapRoute });
  // An unknown `?building=` id is not a place: ignore it rather than opening a
  // blank detail card for an id that does not exist on campus.
  const selectedId = buildingParam && isKnownPlaceId(buildingParam) ? buildingParam : null;
  const [selectedMetaState, setSelectedMetaState] = useState<GeoJsonBuildingMeta | null>(null);
  // Metadata is only valid for the id it was captured with: `selectedId` can
  // change from the URL without a pin click supplying fresh metadata.
  const selectedMeta = selectedMetaState?.id === selectedId ? selectedMetaState : null;
  const [searchQuery, setSearchQuery] = useState("");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("locations");
  const [route, setRoute] = useState<DirectionsResult | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [openResearcherId, setOpenResearcherId] = useState<string | null>(null);
  const [viewResetNonce, setViewResetNonce] = useState(0);
  const [showAllCampusBuildings, setShowAllCampusBuildings] = useState(false);
  // An empty array is not the same as "still loading": a failed fetch used to
  // leave the list showing skeleton placeholders indefinitely.
  const [buildingsStatus, setBuildingsStatus] = useState<FetchStatus>("loading");
  const [buildingsNonce, setBuildingsNonce] = useState(0);
  // Phone sheet detent. Starts at "half" so the map is visible immediately —
  // the panel used to open at 100vw and hide the map entirely.
  const [sheetState, setSheetState] = useState<SheetState>("half");

  const { panelRef, inset: mapInset } = usePanelInset();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/buildings", { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { buildings: data } = (await res.json()) as { buildings: Building[] };
        if (controller.signal.aborted) return;
        setBuildings(data);
        setBuildingsStatus("success");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("[buildings]", err instanceof Error ? err.message : err);
        setBuildingsStatus("error");
      }
    })();
    return () => controller.abort();
  }, [buildingsNonce]);

  const retryBuildings = useCallback(() => {
    setBuildingsStatus("loading");
    setBuildingsNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/researchers");
        if (!res.ok) return;
        const { researchers: data } = (await res.json()) as { researchers: DirectoryResearcher[] };
        setResearchers(data);
      } catch {
        /* directory optional on map page */
      }
    })();
  }, []);

  const selectedBuilding = buildings.find((b) => b.id === selectedId) ?? null;
  const openResearcher = researchers.find((r) => r.id === openResearcherId) ?? null;

  // Sole owner of route-endpoint assignment from map selection. DirectionsPanel
  // deliberately does not react to `selectedId` — two owners produced
  // order-dependent From/To assignment for a single click.
  const handleSelectBuilding = useCallback(
    (id: string, meta?: GeoJsonBuildingMeta) => {
      setSelectedId(id);
      setSelectedMetaState(meta ?? null);
      setFocusPoint(null);
      // On phones the sheet may be collapsed to a handle; a selection has
      // content to show, so raise it far enough to read without burying the map.
      setSheetState((current) => (current === "collapsed" ? "half" : current));
      if (sidebarTab === "directions") {
        if (!fromId) setFromId(id);
        else if (!toId && id !== fromId) setToId(id);
      } else {
        setSidebarTab("locations");
      }
      if (panelCollapsed) setPanelCollapsed(false);
    },
    [panelCollapsed, sidebarTab, fromId, toId, setSelectedId]
  );

  const handleClose = useCallback(() => {
    setSelectedId(null);
    setSelectedMetaState(null);
    setFocusPoint(null);
  }, [setSelectedId]);

  const handleGetDirections = useCallback((buildingId: string) => {
    setToId(buildingId);
    setSidebarTab("directions");
    setFocusPoint(null);
    if (panelCollapsed) setPanelCollapsed(false);
  }, [panelCollapsed]);

  // A focused route step outranks route/selection in the map camera, so it must
  // be dropped whenever the thing it was focusing can change out from under it.
  const handleRouteChange = useCallback((next: DirectionsResult | null) => {
    setRoute(next);
    setFocusPoint(null);
  }, []);

  const handleTabChange = useCallback((next: SidebarTab) => {
    setSidebarTab(next);
    setFocusPoint(null);
  }, []);

  const handleFromIdChange = useCallback((next: string) => {
    setFromId(next);
    setFocusPoint(null);
  }, []);

  const handleToIdChange = useCallback((next: string) => {
    setToId(next);
    setFocusPoint(null);
  }, []);

  const handleResearcherClick = useCallback((researcherId: string) => {
    setOpenResearcherId(researcherId);
  }, []);

  const resetToHome = useCallback(() => {
    setSelectedId(null);
    setSelectedMetaState(null);
    setSearchQuery("");
    setRoute(null);
    setFromId("");
    setToId("");
    setSidebarTab("locations");
    setOpenResearcherId(null);
    setFocusPoint(null);
    setPanelCollapsed(false);
    setSheetState("half");
    setViewResetNonce((n) => n + 1);
    router.replace("/", { scroll: false });
  }, [router, setSelectedId]);

  // Falls back to the catalog rather than the raw slug: a deep link arrives
  // without the metadata a pin click would have supplied.
  const displayName = selectedId
    ? placeDisplayName(selectedId, selectedBuilding?.name ?? selectedMeta?.name ?? null)
    : "Building";

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-gray-50">
      <AppHeader
        active="map"
        onHomeClick={resetToHome}
        rightSlot={
          <div
            className={`hidden md:flex items-center gap-2 text-[11px] transition-opacity duration-200 motion-reduce:transition-none ${
              selectedId ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={!selectedId}
          >
            <span className="text-gray-400">Selected:</span>
            <span className="text-[#EEB310] font-semibold">{displayName}</span>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-700 transition-colors"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        }
      />

      <div className="relative flex-1 min-h-0 overflow-hidden bg-gray-100">
        <div className="absolute inset-0">
          <CampusMap
            buildings={buildings}
            selectedId={selectedId}
            onSelectBuilding={handleSelectBuilding}
            mapInset={mapInset}
            route={route}
            userLocation={userLocation}
            onUserLocationChange={setUserLocation}
            focusPoint={focusPoint}
            viewResetNonce={viewResetNonce}
            onCampusHomeClick={resetToHome}
            showAllCampusBuildings={showAllCampusBuildings}
          />
        </div>

        <LeftPanel
          sheetState={sheetState}
          onSheetStateChange={setSheetState}
          panelRef={panelRef}
          buildings={buildings}
          buildingsStatus={buildingsStatus}
          onRetryBuildings={retryBuildings}
          selectedId={selectedId}
          selectedMeta={selectedMeta}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectBuilding={(id) => {
            const b = buildings.find((x) => x.id === id);
            handleSelectBuilding(
              id,
              b ? { id: b.id, name: b.name, code: b.code } : undefined
            );
          }}
          onClearSelection={handleClose}
          collapsed={panelCollapsed}
          onToggleCollapse={() => setPanelCollapsed((c) => !c)}
          route={route}
          onRouteChange={handleRouteChange}
          userLocation={userLocation}
          onUserLocationChange={setUserLocation}
          onStepFocus={(loc) => setFocusPoint([...loc])}
          tab={sidebarTab}
          onTabChange={handleTabChange}
          fromId={fromId}
          toId={toId}
          onFromIdChange={handleFromIdChange}
          onToIdChange={handleToIdChange}
          onGetDirections={handleGetDirections}
          onResearcherClick={handleResearcherClick}
          showAllCampusBuildings={showAllCampusBuildings}
          onShowAllCampusBuildingsChange={setShowAllCampusBuildings}
        />

      </div>

      {openResearcher && (
        <ProfileModal
          researcher={openResearcher}
          onClose={() => setOpenResearcherId(null)}
        />
      )}

      <AIAssistant />
    </div>
  );
}
