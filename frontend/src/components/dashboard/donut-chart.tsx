"use client";

import { useEffect, useState } from "react";
import type { ChannelSlice } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DonutChartProps {
  title: string;
  data: ChannelSlice[];
  className?: string;
}

/** Donut = part-to-whole (design.md §4.3): animated draw-in, larger size,
 *  no background ring, left-aligned structured legend with percentages. */
export function DonutChart({ title, data, className }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 88;
  const circumference = 2 * Math.PI * r;
  const gap = 28;

  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const segments = data.reduce<{ label: string; value: number; color: string; length: number; offset: number }[]>(
    (acc, d) => {
      const length = (d.value / Math.max(total, 1)) * circumference;
      const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].length : 0;
      acc.push({ ...d, length, offset });
      return acc;
    },
    [],
  );

  return (
    <section className={cn("flex min-h-[360px] flex-col rounded-xl border border-border bg-surface p-5 shadow-xs", className)}>
      <h3 className="text-card-title text-text">{title}</h3>
      {total === 0 ? (
        <div className="mt-5 flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-3">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
              <path d="M22 12A10 10 0 0 0 12 2v10z" />
            </svg>
          </div>
          <p className="mt-3 text-[13.5px] font-semibold text-text">No channel distribution yet</p>
          <p className="mt-1 max-w-[240px] text-[12px] text-text-3">Breakdown by chat, email, whatsapp, and portal will show here.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-1 items-center justify-around gap-6">
          <div
            role="img"
            aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
            className="relative h-[210px] w-[210px] shrink-0"
          >
            <svg width="210" height="210" viewBox="0 0 210 210" className="-rotate-90">
              {segments.map((s) => {
                const isHovered = hovered === s.label;
                const isDimmed = hovered !== null && !isHovered;
                return (
                  <circle
                    key={s.label}
                    cx="105"
                    cy="105"
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={isHovered ? "26" : "22"}
                    strokeLinecap="round"
                    strokeDasharray={mounted ? `${Math.max(s.length - gap, 0)} ${circumference - Math.max(s.length - gap, 0)}` : `0 ${circumference}`}
                    strokeDashoffset={-s.offset}
                    className="transition-all duration-300 ease-out"
                    style={{
                      opacity: isDimmed ? 0.3 : 1,
                    }}
                    onMouseEnter={() => setHovered(s.label)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <b
                className={cn(
                  "text-[28px] tabular-nums text-text transition-all duration-300",
                  mounted ? "opacity-100 scale-100" : "opacity-0 scale-90",
                )}
              >
                {total}
              </b>
              <span className="text-[12px] text-text-3">tickets</span>
            </div>
          </div>

        {/* Organized left-aligned legend with tight dot spacing and equal column gaps */}
        <div className="flex flex-col gap-3">
          {data.map((d) => {
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0";
            const isActive = hovered === d.label;
            const isDimmed = hovered !== null && !isActive;
            return (
              <div
                key={d.label}
                className={cn(
                  "flex items-center cursor-pointer transition-opacity duration-150",
                  isDimmed && "opacity-30",
                )}
                onMouseEnter={() => setHovered(d.label)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Col 1 (Color dot) + Col 2 (Platform name) with tight gap-2.5 & 20px (mr-5) to Col 3 */}
                <div className="flex items-center gap-2.5 w-24 shrink-0 mr-5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-[10px] w-[10px] rounded-[3px] shrink-0 transition-transform duration-150",
                      isActive && "scale-125",
                    )}
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-left text-[13px] text-text-2 truncate">{d.label}</span>
                </div>

                {/* Col 3: Count / Figure (Left-aligned, bold) with 12px (mr-3) to Col 4 */}
                <span className="w-10 shrink-0 text-left text-[13px] font-semibold tabular-nums text-text mr-3">
                  {d.value}
                </span>

                {/* Col 4: Percentage (Left-aligned) */}
                <span className="w-12 shrink-0 text-left text-[11.5px] tabular-nums text-text-3">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </section>
  );
}

