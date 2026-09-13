"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { DirectoryResearcher } from "@/lib/research-seed";
import { PROFILE_VIEW_ON_MAP } from "@/lib/ui-copy";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

interface ProfileModalProps {
  researcher: DirectoryResearcher;
  onClose: () => void;
}

export default function ProfileModal({ researcher: r, onClose }: ProfileModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Profile for ${r.name}`}
      className="fixed inset-0 m-auto w-full max-w-lg max-h-[85vh] rounded-2xl border-0 p-0 bg-transparent backdrop:bg-black/40"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
        if (!controls.length) return;
        // WebKit can skip links under its default keyboard preference. Own the
        // cycle explicitly so every action remains reachable in every engine.
        e.preventDefault();
        const index = controls.indexOf(document.activeElement as HTMLElement);
        const next = index < 0 ? (e.shiftKey ? controls.length - 1 : 0) : (index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next].focus();
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        <div className="relative bg-linear-to-br from-[#EEB310] via-amber-700 to-gray-900 px-6 pt-8 pb-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="absolute top-3 right-3 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 rounded-2xl bg-white/15 flex items-center justify-center text-white font-black text-lg overflow-hidden">
              {r.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo_url} alt={r.name} className="h-full w-full object-cover" />
              ) : (
                initials(r.name)
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white leading-tight truncate">{r.name}</h2>
              {r.title && <p className="text-white/80 text-sm truncate">{r.title}</p>}
              {r.department && <p className="text-white/60 text-xs truncate">{r.department}</p>}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            {r.email && (
              <a
                href={`mailto:${r.email}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:border-amber-300 hover:bg-amber-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {r.email}
              </a>
            )}
            {r.website_url && (
              <a
                href={r.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:border-amber-300 hover:bg-amber-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Personal site
              </a>
            )}
            {r.google_scholar_url && (
              <a
                href={r.google_scholar_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:border-amber-300 hover:bg-amber-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.42A12.078 12.078 0 0112 21.5a12.078 12.078 0 01-6.16-10.92L12 14zm0 0v7" />
                </svg>
                Google Scholar
              </a>
            )}
            {r.building_name && (
              <Link
                href={`/?building=${encodeURIComponent(r.building_id)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {PROFILE_VIEW_ON_MAP}
              </Link>
            )}
          </div>

          {r.bio && <p className="text-sm text-gray-600 leading-relaxed">{r.bio}</p>}

          {r.specializations.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Specializations
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {r.specializations.map((s) => (
                  <span key={s} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {r.publications.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Publications
              </h3>
              <ul className="space-y-1.5">
                {r.publications.map((p, i) => (
                  <li key={i} className="text-[13px] text-gray-700 leading-snug">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-amber-700 hover:underline">
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                    {p.year && <span className="text-gray-400"> · {p.year}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.awards.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Awards
              </h3>
              <ul className="space-y-1">
                {r.awards.map((a) => (
                  <li key={a} className="text-[13px] text-gray-700 flex items-start gap-1.5">
                    <svg className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#EEB310]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 1l2.39 5.39L18 7.24l-4 3.9.94 5.51L10 13.9l-4.94 2.75L6 11.14l-4-3.9 5.61-.85L10 1z" />
                    </svg>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
