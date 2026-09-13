"use client";

import { useState, useEffect } from "react";
import type { Building, ResearchProject, Researcher } from "@/types";
import { getBuildingMedia } from "@/lib/building-media";
import BuildingMediaGallery from "@/components/building/BuildingMediaGallery";
import { IconDirections } from "@/components/building/MediaIcons";

function formatDollars(amount: number | null): string {
  if (amount === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

const STATUS_STYLES: Record<ResearchProject["status"], { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700" },
  completed: { label: "Completed", className: "bg-gray-100 text-gray-500" },
  pending: { label: "Proposed", className: "bg-blue-100 text-blue-700" },
  on_hold: { label: "On Hold", className: "bg-amber-100 text-amber-700" },
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded ${className}`} />;
}

interface BuildingDetailPanelProps {
  buildingId: string;
  displayName: string;
  displayCode?: string;
  building: Building | null;
  onBack: () => void;
  onGetDirections: (buildingId: string) => void;
  onResearcherClick: (researcherId: string) => void;
}

export default function BuildingDetailPanel({
  buildingId,
  displayName,
  displayCode,
  building,
  onBack,
  onGetDirections,
  onResearcherClick,
}: BuildingDetailPanelProps) {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);

  const media = getBuildingMedia(buildingId);
  const gallery = media?.gallery ?? (building?.image_url
    ? [{ src: building.image_url, alt: `${displayName} exterior` }]
    : []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFetchError(null);
      setProjects([]);
      setResearchers([]);

      try {
        const url = `/api/buildings/${encodeURIComponent(buildingId)}/research`;
        const res = await fetch(url);
        if (cancelled) return;

        if (!res.ok) {
          setFetchError(
            res.status === 404
              ? "This building is not in the campus directory."
              : "Could not load research data. Please try again."
          );
          setLoading(false);
          return;
        }

        const body = (await res.json()) as {
          projects: ResearchProject[];
          researchers: Researcher[];
        };

        if (!Array.isArray(body.projects) || !Array.isArray(body.researchers)) {
          setFetchError("Unexpected response from server.");
          setLoading(false);
          return;
        }

        setProjects(body.projects);
        setResearchers(body.researchers);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setFetchError("Could not load research data. Please try again.");
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [buildingId]);

  const name = building?.name ?? displayName;
  const code = building?.code ?? displayCode ?? "—";
  const isEmpty = !loading && !fetchError && projects.length === 0 && researchers.length === 0;
  const hasGallery = gallery.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Back to building list"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[11px] font-semibold text-gray-700 truncate flex-1">{name}</span>
        <button
          type="button"
          onClick={() => onGetDirections(buildingId)}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EEB310] text-[10px] font-bold text-gray-900 hover:bg-amber-500 transition-colors"
        >
          <IconDirections className="h-3 w-3" onGold />
          Directions
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {hasGallery ? (
          <BuildingMediaGallery
            key={buildingId}
            buildingName={name}
            gallery={gallery}
            activeIndex={activePhoto}
            onActiveIndexChange={setActivePhoto}
            lat={building?.lat}
            lng={building?.lng}
          />
        ) : (
          <div className="relative h-28 bg-linear-to-br from-amber-50 via-gray-100 to-gray-200 shrink-0 flex items-center justify-center">
            <div className="h-12 w-12 rounded-2xl bg-[#EEB310] flex items-center justify-center shadow-lg">
              <span className="text-sm font-black text-gray-900">{code}</span>
            </div>
          </div>
        )}

        <div className="px-4 pt-3 pb-2">
          <h2 className="text-base font-bold text-gray-900 leading-tight">{name}</h2>
          {building && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span className="font-mono">{code}</span>
              {building.floors != null && (
                <span>{building.floors} floor{building.floors !== 1 ? "s" : ""}</span>
              )}
              {building.year_built != null && <span>Built {building.year_built}</span>}
            </div>
          )}
          {building?.description && (
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">{building.description}</p>
          )}
        </div>

        <section className="px-4 py-3 border-t border-gray-100">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Research Projects
          </h3>
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          )}
          {fetchError && <p className="text-xs text-red-500">{fetchError}</p>}
          {!loading && !fetchError && projects.length > 0 && (
            <ul className="space-y-2">
              {projects.map((p) => {
                const badge = STATUS_STYLES[p.status];
                return (
                  <li key={p.id} className="rounded-xl bg-gray-50 px-3 py-2 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-gray-800 leading-snug">{p.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    {(p.funding_source || p.grant_amount != null) && (
                      <p className="text-[11px] text-gray-400">
                        {p.funding_source}
                        {p.funding_source && p.grant_amount != null ? " · " : ""}
                        {p.grant_amount != null && (
                          <span className="text-gray-600 font-semibold">{formatDollars(p.grant_amount)}</span>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {isEmpty && (
            <p className="text-xs text-gray-400 py-2">No research data yet for this building.</p>
          )}
        </section>

        <section className="px-4 py-3 border-t border-gray-100">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Researchers
          </h3>
          {loading && (
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-8 w-40 rounded-full" />
            </div>
          )}
          {!loading && !fetchError && researchers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {researchers.map((r) => {
                const photo = r.avatar_url ?? r.photo_url;
                return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onResearcherClick(r.id)}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-3 py-1.5 hover:border-amber-300 hover:bg-amber-50 transition-colors text-left"
                >
                  <div className="h-6 w-6 shrink-0 rounded-full bg-[#EEB310]/20 flex items-center justify-center text-[#EEB310] font-bold text-[9px] overflow-hidden">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={r.name} className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      initials(r.name)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-gray-800 truncate">{r.name}</p>
                    {r.title && <p className="text-[10px] text-gray-400 truncate">{r.title}</p>}
                  </div>
                </button>
              );})}
            </div>
          )}
          {!loading && !fetchError && researchers.length === 0 && !isEmpty && (
            <p className="text-xs text-gray-400">No researchers listed for this building.</p>
          )}
        </section>

        {building && (
          <div className="px-4 pb-4">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${building.lat},${building.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-gray-200 text-xs text-gray-500 hover:border-[#EEB310]/60 hover:text-amber-700 hover:bg-amber-50 transition-all"
            >
              View on Google Maps
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
