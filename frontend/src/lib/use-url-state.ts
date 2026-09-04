"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * URL search params as app state (Next.js App Router).
 *
 * State survives back/forward, refresh, and link sharing because the URL is
 * the single source of truth. Writes use router.replace (no history spam) and
 * never scroll.
 *
 *   const [filter, setFilter] = useUrlState("filter", "all");
 */
export function useUrlState(
  key: string,
  defaultValue: string,
): readonly [string, (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // router.replace is async and each render's `searchParams` is a frozen
  // snapshot, so two setters called in the same event handler would each
  // rebuild the URL from the same stale snapshot and clobber each other
  // (e.g. a tab click doing setView(v) + setPage(1) reverted view to default).
  // Mirror the latest params in a ref so sequential writes compose instead.
  const paramsRef = useRef(new URLSearchParams(searchParams.toString()));
  useEffect(() => {
    paramsRef.current = new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const params = paramsRef.current;
      if (!next || next === defaultValue) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, key, defaultValue],
  );

  return [value, setValue] as const;
}

/** Read several params at once with a stable object identity per change. */
export function useUrlParams(): {
  get: (key: string, def?: string) => string;
  setMany: (updates: Record<string, string | null>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(
    () => ({
      get: (key: string, def = "") => searchParams.get(key) ?? def,
      setMany: (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [k, v] of Object.entries(updates)) {
          if (v === null || v === "") params.delete(k);
          else params.set(k, v);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      },
    }),
    [router, pathname, searchParams],
  );
}
