"use client";

import { useEffect, useState } from "react";
import type { VolumePoint } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BarsChartProps {
  title: string;
  data: VolumePoint[];
  color?: string;
  className?: string;
}

/** Darken a hex color by a fraction (0–1). */
function darken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(h.substring(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(h.substring(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(h.substring(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Bars = comparison (design.md §4.3): animated entrance, gradient fill,
 *  horizontal grid lines, glassmorphism tooltip, hover glow. */
export function BarsChart({ title, data, color = "#00a86b", className }: BarsChartProps) {
  const hasData = data && data.length > 0 && data.some((d) => d.value > 0);
  const max = Math.max(...(data ?? []).map((d) => d.value), 1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const darkerColor = darken(color, 0.25);

  return (
    <section className={cn("flex min-h-[360px] flex-col rounded-xl border border-border bg-surface p-5 shadow-xs", className)}>
      <h3 className="text-card-title text-text">{title}</h3>
      {!hasData ? (
        <div className="mt-5 flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-3">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <p className="mt-3 text-[13.5px] font-semibold text-text">No ticket volume yet</p>
          <p className="mt-1 max-w-[240px] text-[12px] text-text-3">Daily activity will plot here as conversations are received.</p>
        </div>
      ) : (
        <div
          role="img"
          aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
          className="relative mt-5 flex h-[280px] items-end justify-between gap-1.5"
        >
          {/* Horizontal grid lines */}
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-border/50"
              style={{ bottom: `${pct}%` }}
            >
              <span className="absolute -top-2.5 -left-0.5 text-[9px] tabular-nums text-text-3/60">
                {Math.round((pct / 100) * max)}
              </span>
            </div>
          ))}

          {data.map((d, i) => {
            const heightPct = Math.max((d.value / max) * 100, 2);
            return (
              <div
                key={d.label}
                className="group relative flex h-full flex-1 flex-col items-center justify-end"
              >
                {/* Tooltip */}
                <div className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg border border-border/30 bg-surface/80 px-2.5 py-1.5 text-[11px] font-semibold text-text opacity-0 shadow-overlay backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100">
                  <span className="tabular-nums">{d.value}</span>
                  <span className="ml-1 font-normal text-text-3">{d.label}</span>
                </div>

                {/* Bar */}
                <div
                  className="w-full max-w-[44px] rounded-none transition-all duration-500 ease-out group-hover:scale-x-105 group-hover:brightness-110"
                  style={{
                    height: mounted ? `${heightPct}%` : "0%",
                    background: `linear-gradient(to bottom, ${color}, ${darkerColor})`,
                    transitionDelay: `${i * 60}ms`,
                  }}
                />
                <span className="mt-2 text-[11px] tabular-nums text-text-3">{d.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
