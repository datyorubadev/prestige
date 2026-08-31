"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/time";
import type { TicketEvent } from "@/lib/types";

interface ActivityTimelineProps {
  ticketId: string;
}

const EVENT_ICONS: Record<string, IconName> = {
  ticket_created: "ticket",
  status_changed: "swap",
  assignee_changed: "user",
  priority_changed: "alert-triangle" as IconName,
  snoozed: "clock",
  unsnoozed: "clock",
  ticket_merged: "merge",
  ticket_merged_away: "merge",
  label_changed: "tag",
  team_changed: "team",
  note_added: "lock",
  reply_added: "send",
  customer_replied: "user",
  ai_replied: "bot",
  escalated: "info",
  csat_rated: "smile",
  message_edited: "edit",
  message_deleted: "trash",
  ai_control: "bot",
};

const EVENT_LABELS: Record<string, string> = {
  ticket_created: "Ticket created",
  status_changed: "Status changed",
  assignee_changed: "Assignee changed",
  priority_changed: "Priority changed",
  snoozed: "Snoozed",
  unsnoozed: "Snooze removed",
  ticket_merged: "Merged into this ticket",
  ticket_merged_away: "Merged away",
  label_changed: "Labels updated",
  team_changed: "Team updated",
  note_added: "Internal note added",
  reply_added: "Agent replied",
  customer_replied: "Customer messaged",
  ai_replied: "AI assistant replied",
  escalated: "Escalated",
  csat_rated: "CSAT rating submitted",
  message_edited: "Message edited",
  message_deleted: "Message deleted",
  ai_control: "AI control changed",
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
                <span className="ml-2 text-[10px] text-text-3">{formatEventTime(ev.createdAt)}</span>
              </p>
              {ev.field && ev.oldValue && ev.newValue && (
                <p className="mt-0.5 text-[11px] text-text-3">
                  <span className="line-through opacity-60">{ev.oldValue}</span>
                  {" → "}
                  <span className="font-medium text-text-2">{ev.newValue}</span>
                </p>
              )}
              {ev.detail && (
                <p className="mt-0.5 break-words text-[11px] text-text-3">{ev.detail}</p>
              )}
            </div>
            <span
              title={ev.createdAt ? fmtDateTime(ev.createdAt) : undefined}
              className="shrink-0 text-[10px] text-text-3"
            >
              {formatEventTime(ev.createdAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
