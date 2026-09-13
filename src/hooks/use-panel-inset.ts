"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MapInset } from "@/components/map/CampusMap";

/**
 * Measures how much of the map viewport an overlaying panel actually covers.
 *
 * The panel is a left column on desktop and a bottom sheet on phones, so which
 * edge it occupies — and by how much — is a runtime fact, not a constant. Camera
 * padding derived from a hardcoded 400px left inset framed buildings off-screen
 * on mobile.
 */
export function usePanelInset(): {
  panelRef: (node: HTMLElement | null) => void;
  inset: MapInset;
} {
  const [inset, setInset] = useState<MapInset>({ left: 0, bottom: 0 });
  const nodeRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    const parent = node.offsetParent ?? node.parentElement;
    if (!parent) return;

    const panel = node.getBoundingClientRect();
    const container = parent.getBoundingClientRect();
    if (container.width < 1 || container.height < 1) return;

    // A panel is only a left inset if it does not span the full width;
    // otherwise it is a bottom sheet and occupies the bottom edge.
    const spansWidth = panel.width >= container.width - 1;
    const next: MapInset = spansWidth
      ? { left: 0, bottom: Math.max(0, container.bottom - panel.top) }
      : { left: Math.max(0, panel.right - container.left), bottom: 0 };

    setInset((prev) =>
      Math.abs(prev.left - next.left) < 1 && Math.abs(prev.bottom - next.bottom) < 1
        ? prev
        : next
    );
  }, []);

  // Coalesce to one measurement per frame: the panel animates its width or
  // height, which would otherwise fire a camera update per animation tick.
  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  const panelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      nodeRef.current = node;
      if (!node) return;

      const observer = new ResizeObserver(schedule);
      observer.observe(node);
      const parent = node.offsetParent ?? node.parentElement;
      if (parent) observer.observe(parent);
      observerRef.current = observer;
      schedule();
    },
    [schedule]
  );

  useEffect(() => {
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      observerRef.current?.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [schedule]);

  return { panelRef, inset };
}
