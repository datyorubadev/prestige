"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TicketEvent } from "@/lib/types";

interface ActivityTimelineProps {
  ticketId: string;
}

const EVENT_ICONS: Record<string, IconName> = {
  status_changed: "swap",
  assignee_changed: "user",
  priority_changed: "alert-triangle",
  snoozed: "clock",
  unsnoozed: "clock",
  ticket_merged: "merge",
  label_changed: "tag",
  note_added: "lock",
};

const EVENT_LABELS: Record<string, string> = {
  status_changed: "Status changed",
  assignee_changed: "Assigned",
  priority_changed: "Priority changed",
  snoozed: "Ticket snoozed",
  unsnoozed: "Ticket unsnoozed",
  ticket_merged: "Ticket merged",
  label_changed: "Labels updated",
  note_added: "Note added",
};

function formatEventTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActivityTimeline({ ticketId }: ActivityTimelineProps) {
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<TicketEvent[]>(`/tickets/${encodeURIComponent(ticketId)}/events`)
      .then((data) => { if (active) setEvents(data ?? []); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ticketId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size={16} />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-6 text-center">
        <Icon name="clock" size={20} className="mx-auto text-text-3" />
        <p className="mt-2 text-[12px] text-text-3">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((ev) => {
        const icon = EVENT_ICONS[ev.eventType] || "info";
        const label = EVENT_LABELS[ev.eventType] || ev.eventType;
        return (
          <div key={ev.id} className="group flex gap-3 py-2.5">
            <div className="flex flex-col items-center">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-text-3">
                <Icon name={icon} size={12} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-text">
                <span className="font-semibold">{ev.actorName}</span>{" "}
                <span className="text-text-2">{label.toLowerCase()}</span>
              </p>
              {ev.field && ev.oldValue && ev.newValue && (
                <p className="mt-0.5 text-[11px] text-text-3">
                  <span className="line-through opacity-60">{ev.oldValue}</span>
                  {" → "}
                  <span className="font-medium text-text-2">{ev.newValue}</span>
                </p>
              )}
              {ev.detail && !ev.field && (
                <p className="mt-0.5 text-[11px] text-text-3">{ev.detail}</p>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-text-3 opacity-0 transition-opacity group-hover:opacity-100">
              {formatEventTime(ev.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
