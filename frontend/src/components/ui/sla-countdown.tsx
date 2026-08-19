"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SlaCountdownProps {
  sla?: string;
  className?: string;
}

/**
 * Live SLA countdown that ticks every second.
 * Parses the static SLA string (e.g. "45m left") and counts down in real-time.
 */
export function SlaCountdown({ sla, className }: SlaCountdownProps) {
  const [remaining, setRemaining] = useState<{ totalSec: number; isOverdue: boolean } | null>(null);

  useEffect(() => {
    if (!sla) { setRemaining(null); return; }
    if (sla.includes("overdue")) {
      setRemaining({ totalSec: 0, isOverdue: true });
      return;
    }
    // Parse "45m left" or "2h 15m left" or "1h left"
    const match = sla.match(/(?:(\d+)h)?\s*(?:(\d+)m)?\s*left/);
    if (!match) { setRemaining(null); return; }
    const hours = parseInt(match[1] || "0", 10);
    const mins = parseInt(match[2] || "0", 10);
    const totalSec = hours * 3600 + mins * 60;
    setRemaining({ totalSec, isOverdue: false });
  }, [sla]);

  useEffect(() => {
    if (!remaining || remaining.isOverdue) return;
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (!prev || prev.isOverdue) return prev;
        const next = prev.totalSec - 1;
        if (next <= 0) return { totalSec: 0, isOverdue: true };
        return { ...prev, totalSec: next };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [remaining?.isOverdue]);

  if (!remaining && !sla) return null;

  if (remaining?.isOverdue) {
    return (
      <span className={cn("font-semibold text-danger", className)}>
        SLA overdue
      </span>
    );
  }

  if (!remaining) return <span className={className}>{sla}</span>;

  const h = Math.floor(remaining.totalSec / 3600);
  const m = Math.floor((remaining.totalSec % 3600) / 60);
  const s = remaining.totalSec % 60;
  const urgent = remaining.totalSec < 600; // < 10 min
  const warning = remaining.totalSec < 1800; // < 30 min

  return (
    <span
      className={cn(
        "tabular-nums font-semibold",
        urgent ? "text-danger" : warning ? "text-warning-dark" : "text-info",
        className,
      )}
    >
      {h > 0 && `${h}h `}{m}m {h === 0 ? `${s}s` : ""}
    </span>
  );
}
