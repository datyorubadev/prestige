"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { avatarColorFor, cn, ticketNumberFor } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Ticket } from "@/lib/types";

interface QuickListProps {
  currentId: string;
  onSelect: (ticketId: string) => void;
  open: boolean;
  onToggle: () => void;
}

const FILTER_OPTIONS = [
  { value: "all", label: "All conversations" },
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
  { value: "mentions", label: "Mentions" },
];

export function QuickList({ currentId, onSelect, open, onToggle }: QuickListProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const loaded = useRef(false);

  const loadTickets = useCallback(() => {
    void api
      .get<Ticket[]>("/tickets")
      .then((t) => setTickets(t ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadTickets();
  }, [loadTickets]);

  const filteredTickets = (() => {
    if (filter === "mine") return tickets.filter((t) => !!t.assignee);
    if (filter === "unassigned") return tickets.filter((t) => !t.assignee && t.status !== "resolved" && t.status !== "closed");
    if (filter === "escalated") return tickets.filter((t) => t.status === "escalated");
    if (filter === "resolved") return tickets.filter((t) => t.status === "resolved" || t.status === "closed");
    return tickets;
  })();

  if (!open) {
    return (
      <aside
        aria-label="Quick queue"
        className="flex h-full w-9 min-w-9 shrink-0 flex-col items-center overflow-hidden border-r border-border bg-surface"
      >
        <div className="flex h-12 w-full items-center justify-center border-b border-border">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Show conversations"
            title="Show conversations"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text cursor-pointer"
          >
            <Icon name="chevron-right" size={14} className="rotate-180" />
          </button>
        </div>
        <span className="mt-4 select-none text-[10px] font-bold uppercase tracking-[0.2em] text-text-3 [writing-mode:vertical-rl]">
          Conversations
        </span>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Conversations queue"
      className="flex h-full w-[230px] shrink-0 min-w-0 flex-col overflow-hidden border-r border-border bg-surface"
    >
      {/* Header: Title + Count + Filter */}
      <div className="flex flex-col border-b border-border bg-surface shrink-0">
        <div className="flex h-12 items-center justify-between px-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold text-text">Conversations</h2>
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-bold tabular-nums text-text-2">
              {tickets.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse conversations"
            title="Collapse conversations"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text cursor-pointer"
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </div>

        {/* Filter Dropdown */}
        <div className="px-3 pb-2.5">
          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full appearance-none rounded-md border border-border bg-surface-2 py-1.5 pl-3 pr-8 text-[12px] font-semibold text-text shadow-2xs focus:outline-hidden focus:border-primary cursor-pointer"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Icon
              name="chevron-down"
              size={12}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3"
            />
          </div>
        </div>
      </div>

      {/* Ticket Cards List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size={18} />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-6 text-center text-text-3 text-[12px]">
            No conversations in this view
          </div>
        ) : (
          filteredTickets.map((t) => {
            const active = t.id === currentId || ticketNumberFor(t) === currentId;
            const unread = t.unread;
            const customerName = t.cust || "Guest";
            const previewText = t.preview || (t.status === "escalated" ? "Escalated · High-frustration phrases" : t.subject);

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(ticketNumberFor(t) || t.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b border-border border-l-[3px] border-l-transparent p-3 text-left transition-all duration-150 last:border-b-0 cursor-pointer",
                  active
                    ? "border-l-primary bg-primary/[0.07] dark:bg-primary/[0.12]"
                    : "hover:bg-surface-2",
                )}
              >
                <div className="relative mt-0.5 shrink-0">
                  <Avatar name={customerName} color={avatarColorFor(customerName)} size="sm" />
                  {unread && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1.5">
                    <p
                      className={cn(
                        "truncate text-[12.5px]",
                        active ? "font-bold text-primary" : unread ? "font-bold text-text" : "font-semibold text-text",
                      )}
                    >
                      {t.subject}
                    </p>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-text-3">
                      {t.time}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-text-3">
                    {previewText}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
