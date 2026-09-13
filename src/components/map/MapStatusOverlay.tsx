"use client";

export type MapStatus = "loading" | "ready" | "error";

export type MapFailure =
  | "webgl-unsupported"
  | "context-lost"
  | "missing-key"
  | "style-failed"
  | "data-failed"
  | "unknown";

const MESSAGES: Record<MapFailure, { title: string; body: string; retryable: boolean }> = {
  "context-lost": {
    title: "Map graphics were interrupted",
    body: "The browser lost its graphics context. Retry the map, or continue using search and directions.",
    retryable: true,
  },
  "webgl-unsupported": {
    title: "This device can't display the campus map",
    body:
      "The map needs WebGL2, which this browser or device doesn't support. " +
      "Try a different browser, or use the building list to explore campus.",
    retryable: false,
  },
  "missing-key": {
    title: "Map isn't configured",
    body:
      "No map tile key is set, so the basemap can't load. " +
      "Set NEXT_PUBLIC_MAPTILER_KEY and reload.",
    retryable: false,
  },
  "style-failed": {
    title: "Map couldn't load",
    body: "The basemap failed to load. This is usually a network problem.",
    retryable: true,
  },
  "data-failed": {
    title: "Campus data couldn't load",
    body: "Building footprints failed to load, so pins are unavailable.",
    retryable: true,
  },
  unknown: {
    title: "Map couldn't load",
    body: "Something went wrong while starting the map.",
    retryable: true,
  },
};

interface MapStatusOverlayProps {
  status: MapStatus;
  failure: MapFailure | null;
  onRetry: () => void;
  inset: { left: number; bottom: number };
}

/**
 * Covers the map canvas whenever it is not usable. Before this, a failed style,
 * missing key, or unsupported device produced a blank surface with controls
 * floating over it and an explanation only in the console.
 */
export default function MapStatusOverlay({ status, failure, onRetry, inset }: MapStatusOverlayProps) {
  if (status === "ready") return null;

  if (status === "loading") {
    return (
      <div
        className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-gray-100 p-4"
        style={{ left: inset.left, bottom: inset.bottom }}
        role="status"
        aria-live="polite"
      >
        <div className="m-auto flex shrink-0 flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-[#EEB310] animate-spin motion-reduce:animate-none" />
          <p className="text-sm text-gray-500">Loading campus map…</p>
        </div>
      </div>
    );
  }

  const detail = MESSAGES[failure ?? "unknown"];

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-gray-100 p-4"
      style={{ left: inset.left, bottom: inset.bottom }}
      role="alert"
    >
      <div className="m-auto w-full max-w-sm shrink-0 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-bold text-gray-800">{detail.title}</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">{detail.body}</p>
        {detail.retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-[#EEB310] px-4 py-2 text-[12px] font-bold text-gray-900 transition-colors hover:bg-amber-500"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
