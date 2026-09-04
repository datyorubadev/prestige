"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Shared pending search parameters across all hook instances on the page
let sharedPendingParams: URLSearchParams | null = null;
let microtaskScheduled = false;
let activeRouter: ReturnType<typeof useRouter> | null = null;
let activePathname = "";

// Subscribers for real-time key updates across concurrent hook instances
const subscribers = new Map<string, Set<(val: string) => void>>();

function notifySubscribers(key: string, val: string) {
  const set = subscribers.get(key);
  if (set) {
    for (const fn of set) {
      fn(val);
    }
  }
}

function flushUrlUpdates() {
  if (sharedPendingParams && activeRouter) {
    const qs = sharedPendingParams.toString();
    const target = qs ? `${activePathname}?${qs}` : activePathname;
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", target);
    }
    activeRouter.replace(target, { scroll: false });
    sharedPendingParams = null;
  }
}

/**
 * URL search params as app state (Next.js App Router).
 *
 * State survives back/forward, refresh, and link sharing because the URL is
 * the source of truth. Writes use batched router.replace and immediate local
 * state for zero-latency UI responsiveness.
 *
 * Sequential writes (e.g. setView(v) + setPage(1)) compose safely without
 * clobbering each other.
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

  // Local state provides instant UI response without waiting for router.replace cycle
  const [value, setValueState] = useState<string>(() => {
    return searchParams.get(key) ?? defaultValue;
  });

  // Keep router and pathname up to date
  useEffect(() => {
    activeRouter = router;
    activePathname = pathname;
  }, [router, pathname]);

  // Subscribe to external state changes for this key
  useEffect(() => {
    let set = subscribers.get(key);
    if (!set) {
      set = new Set();
      subscribers.set(key, set);
    }
    set.add(setValueState);
    return () => {
      set?.delete(setValueState);
      if (set && set.size === 0) subscribers.delete(key);
    };
  }, [key]);

  // Synchronize when searchParams changes (e.g. browser Back / Forward or external push)
  useEffect(() => {
    const fromUrl = searchParams.get(key) ?? defaultValue;
    setValueState(fromUrl);
  }, [searchParams, key, defaultValue]);

  const setValue = useCallback(
    (next: string) => {
      activeRouter = router;
      activePathname = pathname;

      // Update local state and any peer hooks immediately
      const nextVal = next || defaultValue;
      setValueState(nextVal);
      notifySubscribers(key, nextVal);

      // Initialize sharedPendingParams from current window or searchParams
      if (!sharedPendingParams) {
        sharedPendingParams = new URLSearchParams(
          typeof window !== "undefined" ? window.location.search : searchParams.toString(),
        );
      }

      if (!next || next === defaultValue) {
        sharedPendingParams.delete(key);
      } else {
        sharedPendingParams.set(key, next);
      }

      // If updating view, also clear any legacy ?mine param
      if (key === "view") {
        sharedPendingParams.delete("mine");
      }

      // Schedule a single consolidated URL update in the next microtask
      if (!microtaskScheduled) {
        microtaskScheduled = true;
        queueMicrotask(() => {
          microtaskScheduled = false;
          flushUrlUpdates();
        });
      }
    },
    [router, pathname, searchParams, key, defaultValue],
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
        activeRouter = router;
        activePathname = pathname;

        if (!sharedPendingParams) {
          sharedPendingParams = new URLSearchParams(
            typeof window !== "undefined" ? window.location.search : searchParams.toString(),
          );
        }

        for (const [k, v] of Object.entries(updates)) {
          if (v === null || v === "") {
            sharedPendingParams.delete(k);
            notifySubscribers(k, "");
          } else {
            sharedPendingParams.set(k, v);
            notifySubscribers(k, v);
          }
        }

        if (!microtaskScheduled) {
          microtaskScheduled = true;
          queueMicrotask(() => {
            microtaskScheduled = false;
            flushUrlUpdates();
          });
        }
      },
    }),
    [router, pathname, searchParams],
  );
}
