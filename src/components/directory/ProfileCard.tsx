"use client";

import type { DirectoryResearcher } from "@/lib/research-seed";
import { PROFILE_VIEW } from "@/lib/ui-copy";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

interface ProfileCardProps {
  researcher: DirectoryResearcher;
  onOpen: () => void;
}

export default function ProfileCard({ researcher: r, onOpen }: ProfileCardProps) {
  return (
    <article
      className="group text-left w-full rounded-2xl border border-gray-200 bg-white p-4 hover:border-amber-300 hover:shadow-lg transition-all"
    >
      <button type="button" onClick={(e) => { e.currentTarget.focus(); onOpen(); }} className="flex w-full items-start gap-3 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-amber-500">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-[#EEB310]/15 flex items-center justify-center text-amber-700 font-bold text-sm overflow-hidden">
          {r.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.photo_url} alt={r.name} className="h-full w-full object-cover" />
          ) : (
            initials(r.name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-gray-900 leading-snug truncate">{r.name}</p>
          {r.title && <p className="text-[11px] text-gray-500 truncate">{r.title}</p>}
          {r.department && <p className="text-[10px] text-gray-400 truncate">{r.department}</p>}
        </div>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {r.building_name && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
            {r.building_name}
          </span>
        )}
        {r.email && (
          <a
            href={`mailto:${r.email}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 hover:bg-amber-100 transition-colors truncate max-w-full"
          >
            {r.email}
          </a>
        )}
      </div>

      {/* Hover reveal — bio snippet, collapses to 0 height until hovered/focused */}
      <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out">
        <div className="overflow-hidden">
          {r.bio && <p className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500 leading-relaxed line-clamp-3">{r.bio}</p>}
          <p className="mt-2 text-[10px] font-semibold text-[#EEB310]">{PROFILE_VIEW}</p>
        </div>
      </div>
    </article>
  );
}
