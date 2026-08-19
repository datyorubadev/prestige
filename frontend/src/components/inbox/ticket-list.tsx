"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { LabelChip } from "@/components/ui/label-chip";
import { avatarColorFor, channelLabel, cn, isResolved, ticketNumberFor } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useRealtime } from "@/lib/realtime";
import type {
  AgentUser,
  Label,
  Ticket,
  TicketChannel,
  TicketPriority,
  TicketType,
} from "@/lib/types";

export type QueueFilter = "All" | "Mine" | "Unassigned" | "Escalated" | "Resolved" | "Mentions";

const VIEWS: QueueFilter[] = ["All", "Mine", "Unassigned", "Escalated", "Resolved", "Mentions"];

const PAGE_SIZES = [10, 25, 50];

const PR_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

const STATUS_OPTS = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTS = [
  { value: "", label: "All priorities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const CHANNEL_OPTS = [
  { value: "", label: "All channels" },
  { value: "chat", label: "Chat" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "portal", label: "Portal" },
  { value: "email", label: "Email" },
];

const SORT_OPTS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "priority", label: "Priority" },
  { value: "sla", label: "SLA first" },
  { value: "subject", label: "Subject A–Z" },
];



function ChannelGlyph({ channel }: { channel: TicketChannel }) {
  const icon: IconName =
    channel === "whatsapp" ? "send" : channel === "email" ? "mail" : channel === "portal" ? "file" : "inbox";
  return <Icon name={icon} size={12} className="text-text-3" />;
}

/** Step 1 — conversation queue (Chatwoot-style list screen).
 *  Search + view tabs with counts, collapsible filters, bulk actions and
 *  pagination. Row clicks navigate to the Step-2 detail workspace. */
export function TicketList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const agentName = user?.fullName ?? "";
  const isAgent = user?.role === "agent";

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [view, setView] = useState<QueueFilter>("All");
  const [query, setQuery] = useState(() => searchParams.get("email") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [channel, setChannel] = useState("");
  const [label, setLabel] = useState("");
  const [sortKey, setSortKey] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const loaded = useRef(false);

  const refreshTickets = useCallback(() => {
    void api
      .get<Ticket[]>("/tickets")
      .then(setTickets)
      .catch(() => {});
  }, []);

  const refreshLabels = useCallback(() => {
    void api
      .get<Label[]>("/labels")
      .then(setLabels)
      .catch(() => {});
  }, []);

  const { connected } = useRealtime({
    ticket_created: refreshTickets,
    ticket_updated: refreshTickets,
    ticket_escalated: refreshTickets,
    ticket_deleted: refreshTickets,
    message_created: refreshTickets,
    agent_approval_pending: refreshTickets,
    agent_approval_resolved: refreshTickets,
    channel_message: refreshTickets,
    labels_changed: refreshLabels,
  });

  useEffect(() => {
    if (loaded.current) return;
    let active = true;
    void Promise.all([
      api.get<Ticket[]>("/tickets").catch(() => []),
      api.get<AgentUser[]>("/agents").catch(() => []),
      api.get<Label[]>("/labels").catch(() => []),
    ]).then(([tk, ag, lb]) => {
      if (!active) return;
      loaded.current = true;
      setTickets(tk);
      setAgents(ag);
      setLabels(lb);
    });
    return () => {
      active = false;
    };
  }, []);

  // Deep link ?email=… (customer "My tickets") prefills the search box via the
  // lazy initializer above — no effect needed.

  const counts = useMemo(() => {
    const list = tickets ?? [];
    const mentions = agentName
      ? list.filter((t) => t.msgs?.some((m) => m.kind === "note" && m.text.includes(`@${agentName}`)))
      : [];
    return {
      All: list.length,
      Mine: (isAgent ? list.filter((t) => t.assignee === agentName) : list.filter((t) => !!t.assignee)).length,
      Unassigned: list.filter((t) => !t.assignee && !isResolved(t.status)).length,
      Escalated: list.filter((t) => t.status === "escalated").length,
      Resolved: list.filter((t) => isResolved(t.status)).length,
      Mentions: mentions.length,
    };
  }, [tickets, agentName, isAgent]);

  const filtered = useMemo(() => {
    let list = tickets ?? [];
    if (view === "Mine") list = list.filter((t) => (isAgent ? t.assignee === agentName : !!t.assignee));
    if (view === "Unassigned") list = list.filter((t) => !t.assignee && !isResolved(t.status));
    if (view === "Escalated") list = list.filter((t) => t.status === "escalated");
    if (view === "Resolved") list = list.filter((t) => isResolved(t.status));
    if (view === "Mentions" && agentName) {
      list = list.filter((t) => t.msgs.some((m) => m.kind === "note" && m.text.includes(`@${agentName}`)));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        [t.id, t.subject, t.cust, t.email, t.preview].join(" ").toLowerCase().includes(q),
      );
    }
    if (status) list = list.filter((t) => t.status === status);
    if (priority) list = list.filter((t) => t.priority === priority);
    if (channel) list = list.filter((t) => t.channel === channel);
    if (label) list = list.filter((t) => (t.labels ?? []).includes(label));
    if (assignee) {
      list = list.filter((t) =>
        assignee === "__unassigned__" ? !t.assignee : t.assignee === assignee,
      );
    }
    if (sortKey === "oldest") list = [...list].reverse();
    if (sortKey === "priority") {
      list = [...list].sort((a, b) => (PR_RANK[b.priority] ?? 0) - (PR_RANK[a.priority] ?? 0));
    }
    if (sortKey === "sla") {
      list = [...list].sort(
        (a, b) =>
          ((b.sla ?? "").includes("overdue") ? 1 : 0) - ((a.sla ?? "").includes("overdue") ? 1 : 0),
      );
    }
    if (sortKey === "subject") list = [...list].sort((a, b) => a.subject.localeCompare(b.subject));
    return list;
  }, [tickets, view, query, status, priority, channel, label, assignee, sortKey, agentName, isAgent]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const loading = !tickets;

  const hasActiveFilters = !!(status || priority || channel || assignee || label || query.trim());

  const activeFilterCount = [status, priority, channel, assignee, label].filter(Boolean).length;

  const clearFilters = () => {
    setStatus("");
    setPriority("");
    setChannel("");
    setAssignee("");
    setLabel("");
    setQuery("");
    setView("All");
    setPage(1);
    setFiltersOpen(false);
    if (searchParams.get("email")) router.replace("/dashboard/tickets");
  };

  const assigneeOpts = [
    { value: "", label: "All assignees" },
    { value: "__unassigned__", label: "Unassigned" },
    ...agents.map((a) => ({ value: a.name, label: a.name })),
  ];

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = pageItems.length > 0 && pageItems.every((t) => selected.has(t.id));

  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set<string>() : new Set(pageItems.map((t) => t.id)));

  const bulkResolve = () => {
    void Promise.all(
      [...selected].map((id) => api.patch(`/tickets/${id}`, { status: "resolved" })),
    )
      .then(() => setSelected(new Set()))
      .catch(() => {});
  };

  const bulkReopen = () => {
    void Promise.all(
      [...selected].map((id) => api.patch(`/tickets/${id}`, { status: "open", unread: true })),
    )
      .then(() => {
        toast(`${selected.size} ticket(s) reopened`);
        setSelected(new Set());
        refreshTickets();
      })
      .catch(() => {});
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete ${selected.size} ticket(s)? This action will be recorded in the audit trail.`)) {
      return;
    }
    setDeleting(true);
    try {
      await Promise.all([...selected].map((id) => api.delete(`/tickets/${id}`)));
      toast(`${selected.size} ticket(s) deleted`);
      setSelected(new Set());
      refreshTickets();
    } catch {
      toast("Could not delete selected tickets", "danger");
    } finally {
      setDeleting(false);
    }
  };

  const [form, setForm] = useState({
    subject: "",
    cust: "",
    email: "",
    text: "",
    channel: "portal",
    priority: "medium",
    type: "inquiry",
  });
  const [creating, setCreating] = useState(false);

  const createTicket = () => {
    if (!form.subject.trim() || !form.cust.trim() || !form.email.trim() || creating) return;
    setCreating(true);
    void api
      .post<Ticket>("/tickets", {
        email: form.email.trim(),
        cust: form.cust.trim(),
        subject: form.subject.trim(),
        text: form.text.trim() || "No details provided.",
        type: form.type as TicketType,
        priority: form.priority as TicketPriority,
        channel: form.channel as TicketChannel,
      })
      .then((t) => {
        setCreating(false);
        setCreateOpen(false);
        setForm({ subject: "", cust: "", email: "", text: "", channel: "portal", priority: "medium", type: "inquiry" });
        router.push(`/dashboard/tickets/${ticketNumberFor(t)}`);
      })
      .catch(() => setCreating(false));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-h1 text-text">Conversations</h1>
          <span className="rounded-full bg-surface-3 px-2 py-px text-[11px] font-bold tabular-nums text-text-2">
            {tickets?.length ?? "…"}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <p className="mr-1 hidden items-center gap-1.5 text-meta font-medium text-text-2 sm:flex">
            <span
              aria-hidden="true"
              className={cn(
                "h-2 w-2 rounded-full animate-pulse-ring",
                connected ? "bg-primary" : "bg-warning",
              )}
            />
            {connected ? "Live" : "Reconnecting"}
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="plus" size={13} />
            New
          </button>
        </div>
      </header>

      <section
        aria-label="Conversation list"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {/* Toolbar — search, filter toggle, sort */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <div className="relative min-w-[180px] flex-1">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by ID, subject, customer or email…"
              aria-label="Search conversations"
              className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-1.5 pl-9 pr-8 text-[12.5px] text-text placeholder:text-text-3"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-pressed={filtersOpen}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[12px] font-semibold transition-colors duration-150",
              filtersOpen
                ? "border-primary bg-primary-soft text-primary-dark"
                : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon name="filter" size={13} />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <Select
            size="sm"
            value={sortKey}
            onChange={(v) => {
              setSortKey(v);
              setPage(1);
            }}
            options={SORT_OPTS}
            ariaLabel="Sort conversations"
            align="right"
            className="w-[130px]"
          />
        </div>

        {/* View tabs (Chatwoot-style) */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
                setPage(1);
              }}
              aria-pressed={view === v}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-[12.5px] font-medium !bg-transparent focus:outline-none transition-colors",
                view === v
                  ? "border-primary font-semibold text-text"
                  : "border-transparent text-text-2 hover:text-text",
              )}
            >
              <span className={view === v ? "text-text font-semibold" : "text-text-2"}>{v}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums !bg-surface-3",
                  view === v ? "!text-text font-semibold" : "!text-text-3",
                )}
              >
                {counts[v]}
              </span>
            </button>
          ))}
        </div>

        {/* Advanced filters (collapsible) */}
        {filtersOpen && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
            <Select
              size="sm"
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={STATUS_OPTS}
              ariaLabel="Filter by status"
              className="w-[140px]"
            />
            <Select
              size="sm"
              value={priority}
              onChange={(v) => {
                setPriority(v);
                setPage(1);
              }}
              options={PRIORITY_OPTS}
              ariaLabel="Filter by priority"
              className="w-[150px]"
            />
            <Select
              size="sm"
              value={assignee}
              onChange={(v) => {
                setAssignee(v);
                setPage(1);
              }}
              options={assigneeOpts}
              ariaLabel="Filter by assignee"
              className="w-[160px]"
            />
            <Select
              size="sm"
              value={channel}
              onChange={(v) => {
                setChannel(v);
                setPage(1);
              }}
              options={CHANNEL_OPTS}
              ariaLabel="Filter by channel"
              className="w-[140px]"
            />
            <Select
              size="sm"
              value={label}
              onChange={(v) => {
                setLabel(v);
                setPage(1);
              }}
              options={[{ value: "", label: "All labels" }, ...labels.map((l) => ({ value: l.name, label: l.name }))]}
              ariaLabel="Filter by label"
              className="w-[130px]"
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11.5px] font-semibold text-danger transition-colors duration-150 hover:bg-danger-soft"
              >
                <Icon name="close" size={12} />
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Rows */}
        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
              >
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="skeleton h-3 w-1/3" />
                  <div className="skeleton mt-2 h-2.5 w-2/3" />
                  <div className="skeleton mt-2 h-2.5 w-1/2" />
                </div>
                <div className="skeleton h-3 w-10" />
              </div>
            ))
          ) : total === 0 ? (
            <QueueEmpty hasFilters={hasActiveFilters} onClear={clearFilters} />
          ) : (
            pageItems.map((t) => (
              <ConversationRow
                key={t.id}
                ticket={t}
                labels={labels}
                checked={selected.has(t.id)}
                onToggle={() => toggleOne(t.id)}
                onOpen={() => router.push(`/dashboard/tickets/${ticketNumberFor(t)}`)}
              />
            ))
          )}
        </div>

        {/* Footer — pagination or bulk actions */}
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-primary-soft px-3.5 py-2">
            <label className="flex items-center gap-2 text-[12px] font-semibold text-text">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAll}
                aria-label="Select all tickets on this page"
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              {selected.size} selected
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={bulkReopen}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text"
              >
                <Icon name="swap" size={13} />
                Reopen
              </button>
              <button
                type="button"
                onClick={bulkResolve}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
              >
                <Icon name="check" size={13} />
                Resolve
              </button>
              <button
                type="button"
                onClick={() => void bulkDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-sm border border-danger/30 bg-danger/10 px-3 py-1.5 text-[12px] font-semibold text-danger transition-colors duration-150 hover:bg-danger hover:text-white disabled:opacity-50"
              >
                <Icon name="close" size={13} />
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-sm px-2 py-1 text-[12px] font-semibold text-text-3 transition-colors duration-150 hover:text-text"
              >
                Deselect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-3.5 py-2">
            <p className="text-[11.5px] text-text-3">
              Showing{" "}
              <b className="font-semibold text-text-2">
                {total === 0 ? "0" : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, total)}`}
              </b>{" "}
              of <b className="font-semibold text-text-2">{total}</b> conversations
            </p>
            <div className="ml-auto flex items-center gap-1.5">
              <Select
                size="sm"
                up
                value={String(pageSize)}
                onChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} / page` }))}
                ariaLabel="Tickets per page"
                className="w-[108px]"
              />
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                aria-label="Previous page"
                className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="chevron-right" size={14} className="rotate-180" />
              </button>
              <Pager current={safePage} pageCount={pageCount} onChange={setPage} />
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
                aria-label="Next page"
                className="flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* New ticket modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New conversation"
        icon="plus"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-sm px-3 py-1.5 text-[12.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createTicket}
              disabled={!form.subject.trim() || !form.cust.trim() || !form.email.trim() || creating}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create conversation"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Subject">
            <input
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder="What is this about?"
              aria-label="Subject"
              autoFocus
              className="input-control"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer name">
              <input
                value={form.cust}
                onChange={(e) => setForm((p) => ({ ...p, cust: e.target.value }))}
                placeholder="Full name"
                aria-label="Customer name"
                className="input-control"
              />
            </Field>
            <Field label="Email">
              <input
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="name@example.com"
                aria-label="Email"
                type="email"
                className="input-control"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Channel">
              <Select
                value={form.channel}
                onChange={(v) => setForm((p) => ({ ...p, channel: v }))}
                options={CHANNEL_OPTS.filter((c) => c.value)}
                ariaLabel="Channel"
                className="w-full"
              />
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority}
                onChange={(v) => setForm((p) => ({ ...p, priority: v }))}
                options={PRIORITY_OPTS.filter((p) => p.value)}
                ariaLabel="Priority"
                className="w-full"
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(v) => setForm((p) => ({ ...p, type: v }))}
                options={[
                  { value: "inquiry", label: "Inquiry" },
                  { value: "request", label: "Request" },
                  { value: "complaint", label: "Complaint" },
                  { value: "unclassified", label: "Unclassified" },
                ]}
                ariaLabel="Type"
                className="w-full"
              />
            </Field>
          </div>
          <Field label="Message">
            <textarea
              value={form.text}
              onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))}
              placeholder="What did the customer say?"
              aria-label="Message"
              rows={3}
              className="input-control resize-y"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Pager({
  current,
  pageCount,
  onChange,
}: {
  current: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const pages = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= pageCount; i++) out.push(i);
    return out;
  }, [pageCount]);
  if (pageCount <= 7) {
    return (
      <>
        {pages.map((p) => (
          <PageBtn key={p} n={p} active={p === current} onClick={() => onChange(p)} />
        ))}
      </>
    );
  }
  const dots = (key: string) => (
    <span key={key} className="px-1 text-[12px] text-text-3">
      …
    </span>
  );
  const items: React.ReactNode[] = [];
  const head = [1, 2].filter((p) => p <= pageCount);
  const tail = [pageCount - 1, pageCount].filter((p) => p >= 1);
  head.forEach((p) => items.push(<PageBtn key={p} n={p} active={p === current} onClick={() => onChange(p)} />));
  if (current > 3) items.push(dots("h"));
  for (let p = Math.max(3, current - 1); p <= Math.min(pageCount - 2, current + 1); p++) {
    if (p < 1 || p > pageCount) continue;
    items.push(<PageBtn key={p} n={p} active={p === current} onClick={() => onChange(p)} />);
  }
  if (current < pageCount - 2) items.push(dots("t"));
  tail.forEach((p) => items.push(<PageBtn key={p} n={p} active={p === current} onClick={() => onChange(p)} />));
  return <>{items}</>;
}

function PageBtn({
  n,
  active,
  onClick,
}: {
  n: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[28px] min-w-[28px] items-center justify-center rounded-sm px-1.5 text-[12px] font-semibold tabular-nums transition-colors duration-150",
        active ? "bg-text text-white" : "border border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text",
      )}
    >
      {n}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">
        {label}
      </span>
      {children}
    </label>
  );
}

function QueueEmpty({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <EmptyState
      icon="ticket"
      title={hasFilters ? "No conversations match this view" : "No conversations yet"}
      subtitle={
        hasFilters
          ? "Try widening your search or clearing the active filters."
          : "New conversations and escalations will land here in realtime."
      }
      action={
        hasFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="close" size={13} />
            Clear filters
          </button>
        ) : undefined
      }
    />
  );
}

function ConversationRow({
  ticket,
  labels,
  checked,
  onToggle,
  onOpen,
}: {
  ticket: Ticket;
  labels: Label[];
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const slaOverdue = (ticket.sla ?? "").includes("overdue");
  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-start gap-3 border-b border-border px-3.5 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-surface-2"
    >
      <div className="relative mt-[2px] shrink-0">
        <Avatar name={ticket.cust} color={avatarColorFor(ticket.cust)} size="sm" />
        {ticket.unread && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "min-w-0 truncate text-[13px]",
              ticket.unread ? "font-bold text-text" : "font-semibold text-text",
            )}
          >
            {ticket.subject}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-text-3">{ticket.time}</span>
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-text-3">
          <span className="font-medium text-text-2">{ticket.cust}</span>
          {" · "}
          {ticket.preview}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-3">
            <ChannelGlyph channel={ticket.channel} />
            {channelLabel(ticket.channel)}
          </span>
          <span className="h-[3px] w-[3px] rounded-full bg-text-3/50" />
          <Pill status={ticket.status} className="!px-2 !py-[2px] !text-[10px]" />
          {ticket.teamName && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-1.5 py-[1px] text-[10px] font-semibold text-text-2">
              <Icon name="team" size={9} />
              {ticket.teamName}
            </span>
          )}
          {ticket.priority !== "medium" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-1.5 py-[1px] text-[10px] font-semibold capitalize",
                ticket.priority === "high"
                  ? "bg-danger-soft text-danger-dark"
                  : "bg-surface-3 text-text-2",
              )}
            >
              <Icon name="zap" size={9} />
              {ticket.priority}
            </span>
          )}
          {ticket.sla && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-1.5 py-[1px] text-[10px] font-semibold",
                slaOverdue ? "bg-danger-soft text-danger-dark" : "bg-info-soft text-info-dark",
              )}
            >
              <Icon name="clock" size={9} />
              {ticket.sla}
            </span>
          )}
          {ticket.labels && ticket.labels.length > 0 && (
            <>
              <span className="h-[3px] w-[3px] rounded-full bg-text-3/50" />
              {ticket.labels.slice(0, 2).map((l) => (
                <LabelChip key={l} name={l} labels={labels} />
              ))}
              {ticket.labels.length > 2 && (
                <span className="text-[10px] font-semibold text-text-3">
                  +{ticket.labels.length - 2}
                </span>
              )}
            </>
          )}
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${ticketNumberFor(ticket)}`}
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 accent-[var(--primary)] transition-opacity duration-150",
              checked ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
            )}
          />
        </div>
      </div>
    </div>
  );
}
