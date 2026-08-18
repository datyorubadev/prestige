"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { datasetIcon } from "@/lib/icons-map";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/lib/types";

interface ActivityFeedProps {
  items: FeedItem[];
  className?: string;
}

/** Parse a relative "Xm ago" / "Xh ago" label from the meta timestamp string. */
function relativeTime(meta: string): string | null {
  const m = meta.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (m[3]?.toLowerCase() === "pm" && hours < 12) hours += 12;
  if (m[3]?.toLowerCase() === "am" && hours === 12) hours = 0;
  const now = new Date();
  const then = new Date(now);
  then.setHours(hours, mins, 0, 0);
  const diff = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60000));
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return null;
}

/** Activity stream (design.md §4.3): slide-in entrance, relative time, hover highlight. */
export function ActivityFeed({ items, className }: ActivityFeedProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <Card title="Activity" icon="clock" pad0 className={cn("h-full", className)}>
      <div className="max-h-[420px] overflow-y-auto">
        {items.map((item, i) => {
          const rel = relativeTime(item.meta);
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 transition-all duration-200 hover:bg-surface-2/50",
                i === 0 && "animate-row-flash",
              )}
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateX(0)" : "translateX(12px)",
                transition: `opacity 300ms ease-out ${i * 50}ms, transform 300ms ease-out ${i * 50}ms`,
              }}
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                style={{ color: item.color, backgroundColor: `${item.color}1a` }}
              >
                <Icon name={datasetIcon(item.ic)} size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-text">{item.title}</p>
                <p className="mt-0.5 flex items-center gap-2 text-meta text-text-3">
                  <span>{item.meta}</span>
                  {rel && (
                    <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-3">
                      {rel}
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <EmptyState
            icon="clock"
            title="Nothing here yet"
            subtitle="New events will land in this feed."
            className="py-10"
          />
        )}
      </div>
    </Card>
  );
}

