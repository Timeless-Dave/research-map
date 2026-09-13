"use client";

import { useEffect, useState } from "react";
import BuildingMapEmbed from "@/components/building/BuildingMapEmbed";
import {
  IconFullscreenExpand,
  IconFullscreenExit,
  IconPanorama,
  IconPhoto,
  IconSatellite,
} from "@/components/building/MediaIcons";

type MediaTab = "photos" | "map";
type MapMode = "streetview" | "satellite";

import type { GalleryPhoto } from "@/lib/building-media";
import ResponsiveImage from "@/components/media/ResponsiveImage";

type GalleryItem = GalleryPhoto;

interface BuildingMediaGalleryProps {
  buildingName: string;
  gallery: GalleryItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  lat?: number;
  lng?: number;
}

function ExpandToggle({
  expanded,
  onToggle,
  className = "",
}: {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={expanded ? "Exit fullscreen" : "View fullscreen"}
      title={expanded ? "Exit fullscreen" : "View fullscreen"}
      className={`h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors backdrop-blur-sm ${className}`}
    >
      {expanded ? (
        <IconFullscreenExit className="h-4 w-4" />
      ) : (
        <IconFullscreenExpand className="h-4 w-4" />
      )}
    </button>
  );
}

function PhotoNav({
  count,
  index,
  onPrev,
  onNext,
}: {
  count: number;
  index: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (count <= 1) return null;
  return (
    <>
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous photo"
        className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors backdrop-blur-sm z-10"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next photo"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors backdrop-blur-sm z-10"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-semibold backdrop-blur-sm z-10">
        {index + 1} / {count}
      </span>
    </>
  );
}

function ThumbnailStrip({
  gallery,
  activeIndex,
  onSelect,
}: {
  gallery: GalleryItem[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  if (gallery.length <= 1) return null;
  return (
    <div className="absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto z-10">
      {gallery.map((photo, i) => (
        <button
          key={photo.src}
          type="button"
          onClick={() => onSelect(i)}
          className={`shrink-0 h-10 w-14 rounded overflow-hidden border-2 transition-colors ${
            i === activeIndex ? "border-[#EEB310]" : "border-white/80 opacity-80 hover:opacity-100"
          }`}
        >
          <ResponsiveImage
            dir={photo.dir}
            image={photo.image}
            src={photo.src}
            alt={photo.alt}
            sizes="64px"
            className="h-full w-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}

function MapModeToggle({
  mode,
  onChange,
  dark,
}: {
  mode: MapMode;
  onChange: (m: MapMode) => void;
  dark?: boolean;
}) {
  return (
    <div className={`absolute top-2 left-2 flex gap-1 z-10 ${dark ? "" : ""}`}>
      {(["streetview", "satellite"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold backdrop-blur-sm transition-colors ${
            mode === m
              ? "bg-[#EEB310] text-gray-900"
              : dark
                ? "bg-black/50 text-white/80 hover:bg-black/70"
                : "bg-black/50 text-white/80 hover:bg-black/70"
          }`}
        >
          {m === "streetview" ? (
            <IconPanorama className="h-3 w-3" />
          ) : (
            <IconSatellite className="h-3 w-3" />
          )}
          {m === "streetview" ? "Street View" : "Satellite"}
        </button>
      ))}
    </div>
  );
}

export default function BuildingMediaGallery({
  buildingName,
  gallery,
  activeIndex,
  onActiveIndexChange,
  lat,
  lng,
}: BuildingMediaGalleryProps) {
  const [tab, setTab] = useState<MediaTab>("photos");
  const [mapMode, setMapMode] = useState<MapMode>("streetview");
  const [expanded, setExpanded] = useState(false);

  const current = gallery[activeIndex];
  const hasGallery = gallery.length > 0;
  const hasMap = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
      if (tab === "photos" && gallery.length > 1) {
        if (e.key === "ArrowLeft") onActiveIndexChange((activeIndex - 1 + gallery.length) % gallery.length);
        if (e.key === "ArrowRight") onActiveIndexChange((activeIndex + 1) % gallery.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, tab, gallery.length, activeIndex, onActiveIndexChange]);

  if (!hasGallery || !current) return null;

  const goPrev = () => onActiveIndexChange((activeIndex - 1 + gallery.length) % gallery.length);
  const goNext = () => onActiveIndexChange((activeIndex + 1) % gallery.length);

  const tabBar = (dark = false) => (
    <div className={`flex border-b ${dark ? "border-white/10 bg-black/80" : "border-gray-200/80 bg-white/95"}`}>
      <button
        type="button"
        onClick={() => setTab("photos")}
        className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
          tab === "photos"
            ? dark
              ? "border-[#EEB310] text-[#EEB310]"
              : "border-[#2560a6] text-[#2560a6]"
            : dark
              ? "border-transparent text-white/50 hover:text-white/80"
              : "border-transparent text-gray-400 hover:text-gray-600"
        }`}
      >
        <IconPhoto className="h-3.5 w-3.5" />
        Photos
      </button>
      {hasMap && (
        <button
          type="button"
          onClick={() => setTab("map")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
            tab === "map"
              ? dark
                ? "border-[#EEB310] text-[#EEB310]"
                : "border-[#2560a6] text-[#2560a6]"
              : dark
                ? "border-transparent text-white/50 hover:text-white/80"
                : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <IconPanorama className="h-3.5 w-3.5" />
          360° / Map
        </button>
      )}
    </div>
  );

  const renderMedia = (fullscreen: boolean) => {
    if (tab === "map" && hasMap) {
      return (
        <div className="relative h-full w-full">
          <MapModeToggle mode={mapMode} onChange={setMapMode} dark={fullscreen} />
          <BuildingMapEmbed
            lat={lat!}
            lng={lng!}
            name={buildingName}
            mode={mapMode}
            className="h-full w-full min-h-[176px]"
          />
        </div>
      );
    }

    return (
      <div className="relative h-full w-full bg-gray-100">
        <ResponsiveImage
          dir={current.dir}
          image={current.image}
          src={current.src}
          alt={current.alt}
          // Fullscreen fills the viewport; inline it is the ~420px detail panel.
          sizes={fullscreen ? "100vw" : "(max-width: 768px) 100vw, 420px"}
          priority={!fullscreen && activeIndex === 0}
          className={`h-full w-full ${fullscreen ? "object-contain bg-black" : "object-cover"}`}
        />
        <PhotoNav count={gallery.length} index={activeIndex} onPrev={goPrev} onNext={goNext} />
        <ThumbnailStrip gallery={gallery} activeIndex={activeIndex} onSelect={onActiveIndexChange} />
      </div>
    );
  };

  if (expanded) {
    return (
      <div className="fixed inset-0 z-[70] bg-black flex flex-col">
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-black/90 border-b border-white/10">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{buildingName}</p>
            <p className="text-[10px] text-white/50 uppercase tracking-wider">
              {tab === "photos" ? "Photos" : "360° / Map"}
            </p>
          </div>
          <ExpandToggle expanded onToggle={() => setExpanded(false)} />
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Close"
            className="h-8 w-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {tabBar(true)}
        <div className="relative flex-1 min-h-0">{renderMedia(true)}</div>
      </div>
    );
  }

  return (
    <div className="shrink-0">
      {tabBar(false)}
      <div className="relative h-44 bg-gray-900">
        {renderMedia(false)}
        <ExpandToggle
          expanded={false}
          onToggle={() => setExpanded(true)}
          className="absolute top-2 right-2 z-10"
        />
      </div>
    </div>
  );
}
