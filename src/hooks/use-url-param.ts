"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Two-way binding between a single query-string parameter and component state,
 * with the URL as the single source of truth.
 *
 * Reading through `useSearchParams` (rather than a one-shot `window.location`
 * read on mount) means the value stays correct when the URL changes underneath a
 * component that never unmounts — client-side `<Link>` navigations into
 * `/?building=…`, browser Back/Forward, and external query edits all re-render
 * the consumer.
 *
 * `ownsParam` guards writes: the persistent shell keeps the map explorer mounted
 * while the directory route is showing, and a component that is not the active
 * route must not rewrite the URL out from under the one that is.
 */
export function useUrlParam(
  key: string,
  { ownsParam = true }: { ownsParam?: boolean } = {}
): [string | null, (next: string | null) => void] {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const value = ownsParam ? searchParams.get(key) : null;

  const setValue = useCallback(
    (next: string | null) => {
      if (!ownsParam) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set(key, next);
      else params.delete(key);
      if (params.toString() === searchParams.toString()) return;
      const query = params.toString();
      // `replace` keeps selection changes out of the history stack; Back still
      // steps between real navigations, and those are read back correctly.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [key, ownsParam, pathname, router, searchParams]
  );

  return [value, setValue];
}
