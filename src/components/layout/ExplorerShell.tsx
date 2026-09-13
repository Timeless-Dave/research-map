"use client";

import { usePathname } from "next/navigation";
import CampusExplorer from "@/components/layout/CampusExplorer";

/**
 * Keeps CampusExplorer (and MapLibre) mounted across `/` ↔ `/directory`
 * so returning to the map does not cold-reload tiles.
 */
export default function ExplorerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onDirectory = pathname.startsWith("/directory");

  return (
    <div className="h-[100dvh] w-full overflow-hidden relative bg-gray-50">
      <div
        className={
          onDirectory
            ? "invisible pointer-events-none absolute inset-0"
            : "absolute inset-0"
        }
        aria-hidden={onDirectory}
        inert={onDirectory}
      >
        <CampusExplorer />
      </div>
      {onDirectory ? (
        <div className="absolute inset-0 z-10 overflow-hidden bg-gray-50">{children}</div>
      ) : null}
    </div>
  );
}
