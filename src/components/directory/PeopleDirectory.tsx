"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/layout/AppHeader";
import ProfileCard from "@/components/directory/ProfileCard";
import { useUrlParam } from "@/hooks/use-url-param";
import ProfileModal from "@/components/directory/ProfileModal";
import type { DirectoryResearcher } from "@/lib/research-seed";
import {
  DIRECTORY_EMPTY,
  DIRECTORY_RESULT_COUNT,
  DIRECTORY_SEARCH_PLACEHOLDER,
  DIRECTORY_SUBTITLE,
  DIRECTORY_TITLE,
} from "@/lib/ui-copy";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

export default function PeopleDirectory({ embedded = false }: { embedded?: boolean }) {
  const [researchers, setResearchers] = useState<DirectoryResearcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  // `?person=` is URL-owned so profile deep links, Back/Forward, and returning
  // to the directory all resolve to the same open profile.
  const [openId, setOpenId] = useUrlParam("person");
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/researchers", { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { researchers: data } = (await res.json()) as { researchers: DirectoryResearcher[] };
        if (!controller.signal.aborted) setResearchers(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("[researchers]", err instanceof Error ? err.message : err);
        setError("Could not load the directory. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  const departments = useMemo(
    () =>
      Array.from(
        new Set(researchers.map((r) => r.department).filter((d): d is string => Boolean(d))),
      ).sort(),
    [researchers],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return researchers.filter((r) => {
      if (department && r.department !== department) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.specializations.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [researchers, query, department]);

  const openResearcher = researchers.find((r) => r.id === openId) ?? null;
  const hasFilters = Boolean(query || department);

  return (
    <div
      className={`${embedded ? "h-full" : "h-screen"} w-full flex flex-col overflow-hidden bg-gray-50`}
    >
      <AppHeader active="directory" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-6">
            <h1 className="text-xl font-black text-gray-900">{DIRECTORY_TITLE}</h1>
            <p className="text-sm text-gray-500 mt-1">{DIRECTORY_SUBTITLE}</p>
          </div>

          <div className="flex flex-col lg:flex-row gap-2.5 mb-3">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={DIRECTORY_SEARCH_PLACEHOLDER}
                className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-[13px] text-gray-800 placeholder-gray-400 outline-none focus:border-[#EEB310] transition-all"
              />
            </div>
            {departments.length > 0 && (
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-[#EEB310] transition-all"
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${
                  view === "grid" ? "bg-amber-50 text-amber-700" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${
                  view === "list" ? "bg-amber-50 text-amber-700" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                List
              </button>
            </div>
          </div>

          {!loading && !error && (
            <p className="text-[12px] text-gray-400 mb-4">{DIRECTORY_RESULT_COUNT(filtered.length)}</p>
          )}

          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          )}

          {error && <div role="alert" className="text-sm text-red-500"><p>{error}</p><button type="button" onClick={() => setAttempt(n => n + 1)} className="mt-2 min-h-11 rounded-lg border px-4 font-semibold">Retry directory</button></div>}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <p className="text-sm text-gray-400">{DIRECTORY_EMPTY}</p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setDepartment("");
                  }}
                  className="text-[12px] font-semibold text-[#EEB310] hover:text-amber-600"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {!loading && !error && filtered.length > 0 && view === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r) => (
                <ProfileCard key={r.id} researcher={r} onOpen={() => setOpenId(r.id)} />
              ))}
            </div>
          )}

          {!loading && !error && filtered.length > 0 && view === "list" && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-50/60 transition-colors"
                >
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-[#EEB310]/15 flex items-center justify-center text-amber-700 font-bold text-xs overflow-hidden">
                    {r.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials(r.name)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{r.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {[r.title, r.department].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {r.email && (
                    <span className="hidden sm:inline text-[11px] text-gray-400 truncate max-w-50">
                      {r.email}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {openResearcher && (
        <ProfileModal researcher={openResearcher} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
