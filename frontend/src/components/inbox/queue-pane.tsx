"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, channelLabel, ticketNumberFor } from "@/lib/utils";
import type { Ticket } from "@/lib/types";

export type QueueFilter = "All" | "My Team" | "Mine" | "Unassigned" | "Mentions";

export const QUEUE_FILTERS: QueueFilter[] = [
  "All",
  "My Team",
  "Mine",
  "Unassigned",
  "Mentions",
];

/* §4.2 Rebalanced (design.md v4.1): more room for Subject/Preview, tighter
   for ID/channel/time so subjects stop truncating at 3 words. */
const ROW_COLS = "88px 1.6fr 0.9fr 90px 80px 1.4fr 60px";

type SortKey = "id" | "subject" | "customer" | "channel" | "type" | "preview" | "time";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "id", label: "Ticket" },
  { key: "subject", label: "Subject" },
  { key: "customer", label: "Customer" },
  { key: "channel", label: "Channel" },
  { key: "type", label: "Sent/type" },
  { key: "preview", label: "Preview" },
  { key: "time", label: "Time" },
];

interface QueuePaneProps {
  tickets: Ticket[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: QueueFilter;
  onFilterChange: (filter: QueueFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onClearQuery: () => void;
}

/** Pane 1 — queue list: filters, search, 7-column sortable rows (design.md §4.2). */
export function QueuePane({
  tickets,
  loading,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  onClearQuery,
}: QueuePaneProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = (() => {
    if (!sortKey) return tickets;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...tickets].sort((a, b) => {
      switch (sortKey) {
        case "id":
          return dir * a.id.localeCompare(b.id);
        case "subject":
          return dir * a.subject.localeCompare(b.subject);
        case "customer":
          return dir * a.cust.localeCompare(b.cust);
        case "channel":
          return dir * a.channel.localeCompare(b.channel);
        case "type":
          return dir * a.type.localeCompare(b.type);
        case "preview":
          return dir * a.preview.localeCompare(b.preview);
        case "time":
        default:
          return dir * a.time.localeCompare(b.time);
      }
    });
  })();

  return (
    <section
      aria-label="Ticket queue"
      className="flex h-full max-h-[52vh] min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-card xl:max-h-none"
    >
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold text-text">Ticket queue</h2>
            <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-bold tabular-nums text-text-2">
              {tickets.length}
            </span>
          </div>
          {query.trim() && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary-dark">
              <Icon name="filter" size={12} />
              Filtered
              <button
                type="button"
                onClick={onClearQuery}
                aria-label="Clear filter"
                className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-primary-dark transition-colors duration-150 hover:bg-primary-border/60"
              >
                <Icon name="close" size={11} />
              </button>
            </span>
          )}
        </div>

        <div className="relative mt-3">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search ID, subject, customer, email…"
            aria-label="Search tickets"
            className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-2 pl-9 pr-3 text-[12.5px] text-text placeholder:text-text-3"
          />
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto border-b border-border px-1">
          {QUEUE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                onFilterChange(f);
                const params = new URLSearchParams(searchParams.toString());
                params.delete("team");
                params.delete("mine");
                params.delete("unassigned");
                params.delete("mentions");
                if (f === "My Team") params.set("team", "true");
                if (f === "Mine") params.set("mine", "true");
                if (f === "Unassigned") params.set("unassigned", "true");
                if (f === "Mentions") params.set("mentions", "true");
                router.push(`${pathname}?${params.toString()}`);
              }}
              aria-pressed={filter === f}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors duration-150",
                filter === f
                  ? "border-primary text-primary"
                  : "border-transparent text-text-2 hover:text-text",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* §4.3 Sortable column headers — click to sort, chevron shows direction */}
      <div
        className="grid items-center gap-2.5 border-b border-border bg-surface-2 px-3.5 py-2"
        style={{ gridTemplateColumns: ROW_COLS }}
      >
        {COLUMNS.map((col) => {
          const active = sortKey === col.key;
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleSort(col.key)}
              aria-label={
                active
                  ? `${col.label}, sorted ${sortDir === "asc" ? "ascending" : "descending"}`
                  : `Sort by ${col.label.toLowerCase()}`
              }
              className={cn(
                "flex items-center gap-1 text-left text-[10.5px] font-bold uppercase tracking-[0.06em] transition-colors duration-150",
                active ? "text-text-2" : "text-text-3 hover:text-text-2",
              )}
            >
              {col.label}
              {active && (
                <Icon
                  name="chevron-down"
                  size={10}
                  className={cn(
                    "shrink-0 transition-transform duration-150",
                    sortDir === "asc" && "rotate-180",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto flex flex-col">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <QueueRowSkeleton key={i} />)
          : sorted.map((t) => (
              <QueueRow
                key={t.id}
                ticket={t}
                selected={t.id === selectedId}
                onSelect={onSelect}
              />
            ))}
        {/* §4.3 Empty state — icon chip + next step */}
        {!loading && tickets.length === 0 && (
          <EmptyState
            icon="ticket"
            title="No tickets match this view"
            subtitle="New tickets and escalations will land here."
            className="py-12"
            action={
              query.trim() ? (
                <button
                  type="button"
                  onClick={onClearQuery}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                >
                  <Icon name="close" size={13} />
                  Clear search
                </button>
              ) : undefined
            }
          />
        )}
      </div>
    </section>
  );
}

function QueueRow({
  ticket,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const slaOverdue = (ticket.sla ?? "").includes("overdue");

  return (
    <button
      type="button"
      onClick={() => onSelect(ticket.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "grid w-full items-center gap-2.5 border-b border-border border-l-[3px] border-l-transparent px-3.5 py-[11px] text-left transition-colors duration-150 last:border-b-0 hover:bg-surface-2",
        selected && "border-l-primary bg-primary-soft hover:bg-primary-soft",
        /* §3.7 Fresh feed flash — fires on mount for unread rows */
        ticket.unread && !selected && "animate-row-flash",
      )}
      style={{ gridTemplateColumns: ROW_COLS }}
    >
      {/* §3.2 Tabular numerals so IDs align when counts change */}
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-code tabular-nums text-text">
        {ticket.unread && (
          <span
            aria-hidden="true"
            className="h-[7px] w-[7px] shrink-0 rounded-full bg-danger shadow-[0_0_0_2px_var(--surface)]"
          />
        )}
        {ticketNumberFor(ticket)}
      </span>

      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-[13px]",
            ticket.unread ? "font-bold text-text" : "font-semibold text-text",
          )}
        >
          {ticket.subject}
        </span>
        <span className="mt-1 block">
          <Pill status={ticket.status} className="!px-2 !py-[2px] !text-[10px]" />
        </span>
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-medium text-text">{ticket.cust}</span>
        <span className="block truncate text-[11px] text-text-3">{ticket.phone}</span>
      </span>

      <span className="truncate text-[12px] text-text-2">{channelLabel(ticket.channel)}</span>

      <span className="min-w-0">
        <span className="block truncate text-[11.5px] text-text-2">{ticket.type}</span>
        <span
          className={cn(
            "mt-0.5 block text-[10.5px] font-semibold capitalize",
            ticket.priority === "high"
              ? "text-danger"
              : ticket.priority === "medium"
                ? "text-info"
                : "text-text-3",
          )}
        >
          {ticket.priority}
        </span>
      </span>

      <span className="truncate text-[12px] text-text-3">{ticket.preview}</span>

      <span className="min-w-0 text-right">
        <span className="block text-[12px] tabular-nums text-text-2">{ticket.time}</span>
        {ticket.sla && (
          <span
            className={cn(
              "mt-0.5 block text-[10px] font-semibold",
              slaOverdue ? "text-danger" : "text-info",
            )}
          >
            {ticket.sla}
          </span>
        )}
      </span>
    </button>
  );
}

function QueueRowSkeleton() {
  return (
    <div
      className="grid items-center gap-2.5 border-b border-border px-3.5 py-[11px] last:border-b-0"
      style={{ gridTemplateColumns: ROW_COLS }}
    >
      <div className="skeleton h-3 w-[72px]" />
      <div>
        <div className="skeleton h-3 w-3/4" />
        <div className="skeleton mt-2 h-2.5 w-1/3" />
      </div>
      <div>
        <div className="skeleton h-3 w-2/3" />
        <div className="skeleton mt-2 h-2.5 w-1/2" />
      </div>
      <div className="skeleton h-3 w-14" />
      <div>
        <div className="skeleton h-3 w-12" />
        <div className="skeleton mt-2 h-2.5 w-10" />
      </div>
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-8 justify-self-end" />
    </div>
  );
}
