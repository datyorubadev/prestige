"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  trend: "up" | "down";
  delta: string;
  /** "up" = higher is better; "down" = lower is better (inverted good/bad). */
  goodWhen: "up" | "down";
  context?: string;
}

/** Generate a deterministic mini sparkline from a label + value seed. */
function generateSparkline(label: string, points = 7): number[] {
  let seed = 0;
  for (let i = 0; i < label.length; i++) seed = ((seed << 5) - seed + label.charCodeAt(i)) | 0;
  const vals: number[] = [];
  for (let i = 0; i < points; i++) {
    seed = (seed * 16807 + 0) % 2147483647;
    vals.push((seed % 100) / 100);
  }
  return vals;
}

/** Tiny inline SVG sparkline. */
function Sparkline({ data, color, className }: { data: number[]; color: string; className?: string }) {
  const w = 80;
  const h = 24;
  const max = Math.max(...data, 0.01);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      className={cn("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={`spark-fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill={`url(#spark-fill-${color.replace("#", "")})`}
      />
      <polyline
        points={points}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * KPI card (design.md §4.3). Direction semantics are a hard rule:
 * green = good-for-the-business, red = bad — not the raw delta sign.
 * Now with sparkline, animated counter, and sparkline accent.
 */
export function KpiCard({ label, value, trend, delta, goodWhen, context }: KpiCardProps) {
  const good = trend === goodWhen;
  const down = trend === "down";
  const sparkColor = good ? "#00a86b" : "#d93636";
  const sparkData = generateSparkline(label);

  /* Animated counter for numeric values */
  const [displayValue, setDisplayValue] = useState(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const numericMatch = value.match(/^([\d,.]+)/);
    if (!numericMatch) {
      const id = requestAnimationFrame(() => setDisplayValue(value));
      return () => cancelAnimationFrame(id);
    }
    const target = parseFloat(numericMatch[1].replace(/,/g, ""));
    if (isNaN(target)) {
      const id = requestAnimationFrame(() => setDisplayValue(value));
      return () => cancelAnimationFrame(id);
    }
    const suffix = value.slice(numericMatch[1].length);
    const isFloat = numericMatch[1].includes(".");
    const decimals = isFloat ? (numericMatch[1].split(".")[1]?.length ?? 0) : 0;
    const duration = 600;
    const start = performance.now();

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = target * eased;
      const formatted = isFloat
        ? current.toFixed(decimals)
        : Math.round(current).toLocaleString("en");
      setDisplayValue(formatted + suffix);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return (
    <div className="relative rounded-xl border border-border bg-surface p-4 shadow-xs">
      <p className="flex items-center justify-between text-[12px] font-semibold text-text-2">
        {label}
        <Icon
          name="trend"
          size={14}
          className={cn(down && "-scale-y-100", good ? "text-primary" : "text-danger")}
        />
      </p>
      <p className="mt-2 text-kpi tabular-nums text-text">{displayValue}</p>
      <p className="mt-1 text-meta text-text-2">
        <span className={cn("font-semibold tabular-nums", good ? "text-primary" : "text-danger")}>
          {delta}
        </span>{" "}
        vs last week
      </p>
      {context && <p className="mt-0.5 text-[11.5px] text-text-3">{context}</p>}

      {/* Sparkline */}
      <div className="mt-2.5">
        <Sparkline data={sparkData} color={sparkColor} />
      </div>
    </div>
  );
}

