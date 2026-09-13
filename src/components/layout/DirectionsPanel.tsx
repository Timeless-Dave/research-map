"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Building } from "@/types";
import {
  getRoute,
  getRouteWithHandoff,
  DIRECTIONS_TIMEOUT_MS,
  formatDistance,
  formatDuration,
  DirectionsError,
  type DirectionsResult,
  type TravelProfile,
} from "@/lib/directions";
import type { UserLocation } from "@/components/map/CampusMap";
import { getCampusPlace } from "@/lib/campus-places.generated";
import { buildPlaceCatalog } from "@/lib/place-catalog";
import {
  describeTarget,
  hasVerifiedAccessibleEntrance,
  planDrivingHandoff,
  resolveDestination,
  resolveOrigin,
  type RouteMode,
} from "@/lib/place-anchors";

export const MY_LOCATION = "__my_location__";

interface DirectionsPanelProps {
  buildings: Building[];
  route: DirectionsResult | null;
  onRouteChange: (route: DirectionsResult | null) => void;
  userLocation: UserLocation | null;
  onUserLocationChange: (loc: UserLocation | null) => void;
  onStepFocus: (location: [number, number]) => void;
  fromId: string;
  toId: string;
  onFromIdChange: (id: string) => void;
  onToIdChange: (id: string) => void;
}

function buildingCoord(b: Building): [number, number] {
  return [b.lng, b.lat];
}

/**
 * Every addressable campus place is routable, not just the ones the API seeds.
 * Seeded buildings win because their coordinates are curated; the rest fall back
 * to the footprint coordinate generated from buildings.geojson.
 */
function resolveCoord(
  id: string,
  buildings: Building[],
  userLocation: UserLocation | null,
  mode: RouteMode
): [number, number] | null {
  if (id === MY_LOCATION) return userLocation ? [userLocation.lng, userLocation.lat] : null;
  // Leaving a place should start from its departure point, not its centre.
  const origin = resolveOrigin(id, mode);
  if (origin && !origin.approximate) return origin.coord;
  const seeded = buildings.find((b) => b.id === id);
  if (seeded) return buildingCoord(seeded);
  const place = getCampusPlace(id);
  return place ? [place.lng, place.lat] : null;
}

const MAPBOX_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

const MODE_LABEL: Record<RouteMode, string> = {
  walking: "Walk",
  driving: "Drive",
  // Names the destination, not the route. The path is routed on the ordinary
  // walking profile and has no verified accessibility attributes.
  accessible: "Accessible entrance",
};

export default function DirectionsPanel({
  buildings,
  route,
  onRouteChange,
  userLocation,
  onUserLocationChange,
  onStepFocus,
  fromId,
  toId,
  onFromIdChange,
  onToIdChange,
}: DirectionsPanelProps) {
  // Offered only where an accessible entrance has actually been confirmed for
  // the destination. Offering it everywhere and quietly falling back to a
  // guessed door would be guidance someone could get hurt following.
  const availableModes = useMemo<RouteMode[]>(() => {
    const modes: RouteMode[] = ["walking", "driving"];
    if (toId && toId !== MY_LOCATION && hasVerifiedAccessibleEntrance(toId)) {
      modes.push("accessible");
    }
    return modes;
  }, [toId]);

  const [requestedProfile, setProfile] = useState<RouteMode>("walking");
  // Derived, not synced: changing the destination to one with no confirmed
  // accessible entrance must drop accessible mode without an effect round-trip.
  const profile = availableModes.includes(requestedProfile) ? requestedProfile : "walking";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // Only the most recent directions request may install a route. Without this,
  // changing the destination mid-flight let the previous response overwrite it,
  // leaving the drawn line disagreeing with the selects.
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  const cancelPendingRequest = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
  };

  // Endpoints can also change from a map-pin click in the parent, not only
  // through these selects. Invalidate that request path as well.
  useEffect(() => {
    requestRef.current?.abort();
  }, [fromId, toId, profile]);

  // Seeded buildings first (curated names/coords), then every other campus
  // place from the generated catalog so secondary buildings are selectable.
  const routableOptions = useMemo(
    () =>
      buildPlaceCatalog(buildings)
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [buildings]
  );

  // Endpoint assignment from map selection is owned by CampusExplorer
  // (`handleSelectBuilding`); reacting to `selectedId` here as well made a
  // single pin click populate both From and To depending on effect order.

  // Clear stale route when both endpoints are cleared.
  useEffect(() => {
    if (!fromId && !toId && route) {
      onRouteChange(null);
    }
  }, [fromId, toId, route, onRouteChange]);

  const useMyLocation = () => {
    setError(null);
    setLocating(true);
    if (!navigator.geolocation) {
      setError("Geolocation isn't supported on this device.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onUserLocationChange({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        onFromIdChange(MY_LOCATION);
        setLocating(false);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied — enable it in your browser to route from here."
            : "Couldn't determine your location."
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const swapEndpoints = () => {
    cancelPendingRequest();
    const prevFrom = fromId;
    onFromIdChange(toId);
    onToIdChange(prevFrom);
    onRouteChange(null);
    setError(null);
  };

  const handleGetDirections = async () => {
    if (!MAPBOX_CONFIGURED) {
      setError("Directions need a Mapbox token (NEXT_PUBLIC_MAPBOX_TOKEN).");
      return;
    }

    const fromCoord = resolveCoord(fromId, buildings, userLocation, profile);
    const destination =
      toId === MY_LOCATION
        ? userLocation
          ? { coord: [userLocation.lng, userLocation.lat] as [number, number], via: "centroid" as const, approximate: false, unverified: false }
          : null
        : resolveDestination(toId, profile);

    if (!fromCoord || !destination) {
      setError(
        profile === "accessible" && toId
          ? "No confirmed accessible entrance for that destination yet."
          : "Choose both a starting point and a destination."
      );
      return;
    }

    if (fromId === toId) {
      setError("Choose two different places.");
      return;
    }

    // Routed on the ordinary walking network — the only difference is that it
    // terminates at a confirmed accessible entrance. The path itself is not
    // verified as step-free, so nothing in the UI may claim that it is.
    const apiProfile: TravelProfile = profile === "driving" ? "driving" : "walking";
    const handoff =
      profile === "driving" && toId !== MY_LOCATION ? planDrivingHandoff(toId) : null;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DIRECTIONS_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    try {
      const result = handoff
        ? await getRouteWithHandoff(
            fromCoord,
            handoff.drive.coord,
            handoff.walk.coord,
            {
              drive: `Drive to ${describeTarget(handoff.drive)}`,
              walk: `Walk to ${describeTarget(handoff.walk)}`,
            },
            controller.signal
          )
        : await getRoute(fromCoord, destination.coord, apiProfile, controller.signal);
      if (controller.signal.aborted) return;
      onRouteChange({
        ...result,
        destinationLabel: describeTarget(handoff ? handoff.walk : destination),
      });
    } catch (err) {
      // A superseded request must not clear the newer one's state. A timeout is
      // different: it needs an actionable message instead of failing silently.
      if (controller.signal.aborted && !timedOut) return;
      onRouteChange(null);
      setError(
        timedOut
          ? "Directions took too long. Check your connection and try again."
          : err instanceof DirectionsError
            ? err.message
            : "Couldn't get directions. Please try again."
      );
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };

  const clearRoute = () => {
    cancelPendingRequest();
    onRouteChange(null);
    onFromIdChange("");
    onToIdChange("");
    setError(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {!MAPBOX_CONFIGURED && (
        <div className="shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
          Directions are unavailable — set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment.
        </div>
      )}

      <div className="shrink-0 px-4 py-3 border-b border-gray-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Route</span>
          <button
            type="button"
            onClick={swapEndpoints}
            disabled={!fromId || !toId}
            title="Swap start and destination"
            className="p-1 rounded text-gray-400 hover:text-[#EEB310] disabled:opacity-30 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">From</span>
          <div className="mt-1 flex gap-1.5">
            <select
              value={fromId}
              onChange={(e) => {
                cancelPendingRequest();
                onFromIdChange(e.target.value);
                onRouteChange(null);
              }}
              className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-800 outline-none focus:border-[#EEB310] focus:bg-white transition-all"
            >
              <option value="">Select a building…</option>
              {userLocation && <option value={MY_LOCATION}>My current location</option>}
              {routableOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              title="Use my current location"
              className="shrink-0 px-2 rounded-lg border border-gray-200 text-gray-400 hover:text-[#EEB310] hover:border-amber-300 transition-colors disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
                <path strokeLinecap="round" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              </svg>
            </button>
          </div>
        </label>

        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">To</span>
          <select
            value={toId}
            onChange={(e) => {
              cancelPendingRequest();
              onToIdChange(e.target.value);
              onRouteChange(null);
            }}
            className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-800 outline-none focus:border-[#EEB310] focus:bg-white transition-all"
          >
            <option value="">Select a building…</option>
            {userLocation && <option value={MY_LOCATION}>My current location</option>}
            {routableOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1 rounded-lg bg-gray-50 border border-gray-200 p-0.5">
          {availableModes.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                if (p === profile) return;
                cancelPendingRequest();
                setProfile(p);
                // The drawn line is mode-specific; keeping it would show a
                // walking path labelled as a drive.
                onRouteChange(null);
                setError(null);
              }}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold capitalize transition-colors ${
                profile === p ? "bg-white text-amber-700 shadow-sm" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {MODE_LABEL[p]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleGetDirections()}
          disabled={loading || !fromId || !toId || !MAPBOX_CONFIGURED}
          className="w-full py-2 rounded-lg bg-[#EEB310] text-gray-900 text-[12px] font-bold hover:bg-amber-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Getting directions…" : "Get Directions"}
        </button>

        {/* Directions state is announced: the route line and step list are
            visual-only feedback for a screen-reader user. */}
        <p role="status" aria-live="polite" className="sr-only">
          {loading
            ? "Getting directions…"
            : error
              ? error
              : route
                ? `Route found: ${route.steps.length} steps, ending at ${route.destinationLabel ?? "the destination"}.`
                : ""}
        </p>
        {error && (
          <p className="text-[11px] text-red-500">{error}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {route ? (
          <div className="px-4 py-3">
            {route.handoffGapMeters !== undefined && (
              <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                Parking transition unverified. Driving and walking routes are snapped separately
                {route.handoffGapMeters > 1 ? ` (${Math.round(route.handoffGapMeters)} m apart)` : ''}.
                No connecting path is shown or guaranteed.
              </p>
            )}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-gray-900">
                  {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
                </p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                  {route.segments
                    ? "Drive then walk"
                    : `${route.profile === "walking" ? "Walking" : "Driving"} directions`}
                </p>
                {/* Say what the route actually ends at. A centroid destination
                    is "near the building", not "at the door", and an imported
                    anchor nobody has checked says so. */}
                {route.destinationLabel && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Ends at {route.destinationLabel}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clearRoute}
                className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>

            {route.segments && (
              <ul className="mb-3 space-y-1 rounded-lg bg-gray-50 px-3 py-2">
                {route.segments.map((seg) => (
                  <li
                    key={seg.label}
                    className="flex items-center justify-between text-[11px] text-gray-600"
                  >
                    <span>{seg.label}</span>
                    <span className="font-medium text-gray-500">
                      {formatDistance(seg.distanceMeters)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <ol className="space-y-1">
              {route.steps.map((step, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onStepFocus(step.location)}
                    className="w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-amber-50 transition-colors"
                  >
                    <span className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="text-[12px] text-gray-800 leading-snug">{step.instruction}</p>
                      {step.distanceMeters > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDistance(step.distanceMeters)}</p>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2.5 px-4 text-center">
            <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-[12px] text-gray-400">
              Pick a start and destination, or click buildings on the map to fill the route.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
