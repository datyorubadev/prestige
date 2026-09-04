"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { avatarColorFor, channelLabel, cn, ticketNumberFor } from "@/lib/utils";
import type { KnowledgeArticle, PastTicket, Ticket } from "@/lib/types";

interface ContextPaneProps {
  ticket: Ticket | null;
  pastTickets: PastTicket[];
  articles: KnowledgeArticle[];
  tenantId: string;
  onUseSuggestion: (text: string) => void;
  onResolve: (id: string) => void;
  onEscalate: (id: string) => void;
  onAddNote: (id: string, text: string) => void;
}

/* §3.2 Micro-label style shared by every context rail section header */
const SECTION_LABEL =
  "flex w-full items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-3";

/** Pane 3 — context rail: customer, past tickets, KB, assist, notes (design.md §4.2). */
export function ContextPane({
  ticket,
  pastTickets,
  articles,
  tenantId,
  onUseSuggestion,
  onResolve,
  onEscalate,
  onAddNote,
}: ContextPaneProps) {
  const [kbQuery, setKbQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setCollapsed((p) => ({ ...p, [key]: !p[key] }));

  if (!ticket) {
    return (
      <section
        aria-label="Customer context"
        className="flex h-full min-h-0 flex-col items-center justify-center gap-3 rounded-md border border-border bg-surface p-6 text-center shadow-card"
      >
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-surface-2">
          <Icon name="users" size={24} className="text-text-3" />
        </div>
        <p className="max-w-[200px] text-[12.5px] text-text-3">
          Customer history, knowledge base and agent assist appear here once a ticket is open.
        </p>
      </section>
    );
  }

  const past = pastTickets.filter((p) => p.email === ticket.email);
  const segment =
    ticket.sentiment === "Positive"
      ? "VIP · high-value"
      : ticket.priority === "high"
        ? "Priority segment"
        : "Standard";

  const q = kbQuery.trim().toLowerCase();
  const kbHits = articles
    .filter((a) => !q || `${a.title} ${a.snippet}`.toLowerCase().includes(q))
    .slice(0, 5);

  const addNote = () => {
    if (!noteDraft.trim()) return;
    onAddNote(ticket.id, noteDraft.trim());
    setNoteDraft("");
  };

  return (
    <section
      aria-label="Customer context"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-card"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-3">
            <Avatar name={ticket.cust} color={avatarColorFor(ticket.cust)} />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-bold text-text">{ticket.cust}</p>
              <p className="truncate text-[12px] text-text-2">{ticket.email}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Kv label="Segment" value={segment} />
            <Kv label="Language" value="en-NG" />
            <Kv label="Sentiment" value={ticket.sentiment} />
            <Kv label="Opened" value={ticket.createdAt || ticket.time} />
          </div>
          <p className="mt-2.5 text-[11.5px] text-text-2">
            {ticket.phone} · {channelLabel(ticket.channel)}
          </p>
        </div>

        {/* §4.2 Collapsible blocks (hairline separated) */}
        <div className="border-b border-border p-4">
          <button type="button" onClick={() => toggle("past")} aria-expanded={!collapsed.past} className={SECTION_LABEL}>
            <Icon
              name="chevron-down"
              size={12}
              className={cn("shrink-0 text-text-3 transition-transform duration-180", collapsed.past && "-rotate-90")}
            />
            Past tickets
            {past.length > 0 && (
              <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-text-2">
                {past.length}
              </span>
            )}
          </button>
          {!collapsed.past && (
            <div className="mt-2">
              {past.slice(0, 4).map((p) => (
                /* §3.6 Dashed separators — past-ticket rows are events, not structure */
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 border-b border-dashed border-border py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[11.5px] font-semibold text-text">{ticketNumberFor(p)}</p>
                    <p className="truncate text-[12px] text-text-2">{p.subject}</p>
                  </div>
                  <Pill status={p.status} className="!px-2 !py-[2px] !text-[10px]" />
                </div>
              ))}
              {past.length === 0 && <p className="py-2 text-[12px] text-text-3">No past tickets.</p>}
            </div>
          )}
        </div>

        <div className="border-b border-border p-4">
          <button type="button" onClick={() => toggle("kb")} aria-expanded={!collapsed.kb} className={SECTION_LABEL}>
            <Icon
              name="chevron-down"
              size={12}
              className={cn("shrink-0 text-text-3 transition-transform duration-180", collapsed.kb && "-rotate-90")}
            />
            Knowledge base
          </button>
          {!collapsed.kb && (
            <>
              <div className="relative mt-2">
                <Icon
                  name="search"
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
                />
                <input
                  value={kbQuery}
                  onChange={(e) => setKbQuery(e.target.value)}
                  placeholder="Search articles…"
                  aria-label="Search knowledge base"
                  className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-2 pl-8 pr-3 text-[12px] text-text placeholder:text-text-3"
                />
              </div>
              <ul className="mt-3 space-y-2">
                {kbHits.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/portal/${tenantId}`}
                      className="flex items-start gap-2.5 rounded-[9px] bg-surface-2 px-2.5 py-2 transition-colors duration-150 hover:border hover:border-primary-border hover:bg-primary-soft"
                    >
                      <span className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-info-soft text-info">
                        <Icon name="file" size={13} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold leading-snug text-text">
                          {a.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-text-2">
                          {a.snippet}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {kbHits.length === 0 && (
                  <li className="py-2 text-[12px] text-text-3">No articles found.</li>
                )}
              </ul>
            </>
          )}
        </div>

        {ticket.assist && ticket.status !== "resolved" && (
          <div className="border-b border-border p-4">
            <button type="button" onClick={() => toggle("assist")} aria-expanded={!collapsed.assist} className={SECTION_LABEL}>
              <Icon
                name="chevron-down"
                size={12}
                className={cn("shrink-0 text-text-3 transition-transform duration-180", collapsed.assist && "-rotate-90")}
              />
              <Icon name="sparkles" size={13} className="text-info" />
              Agent assist
              <span className="ml-auto rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-info">
                AI working with you
              </span>
            </button>
            {!collapsed.assist && (
              <div className="mt-3 space-y-3">
                <div className="rounded-sm bg-surface-2 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">
                    Escalation reason
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] text-text">{ticket.assist.reason}</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">Summary</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-text-2">
                    {ticket.assist.summary}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">
                    Relevant knowledge
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {ticket.assist.chunks.map((c) => (
                      <div
                        key={c}
                        className="flex items-center gap-2 rounded-[8px] bg-surface-2 px-2.5 py-2"
                      >
                        <Icon name="file" size={13} className="shrink-0 text-text-3" />
                        <span className="truncate text-[12px] font-medium text-text">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">
                    Suggested reply
                  </p>
                  <div className="mt-2 rounded-md bg-primary-soft p-2.5">
                    <p className="text-[12px] leading-relaxed text-text">{ticket.assist.suggest}</p>
                    <button
                      type="button"
                      onClick={() => onUseSuggestion(ticket.assist!.suggest)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-primary px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                    >
                      <Icon name="copy" size={13} />
                      Use reply
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onResolve(ticket.id)}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                  >
                    <Icon name="check" size={13} />
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => onEscalate(ticket.id)}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                  >
                    Escalate ticket
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-b border-border p-4">
          <button type="button" onClick={() => toggle("note")} aria-expanded={!collapsed.note} className={SECTION_LABEL}>
            <Icon
              name="chevron-down"
              size={12}
              className={cn("shrink-0 text-text-3 transition-transform duration-180", collapsed.note && "-rotate-90")}
            />
            Private note
            <span className="ml-auto rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-3">
              Team only
            </span>
          </button>
          {!collapsed.note && (
            <>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                placeholder="Add an internal note… (use @name to mention)"
                aria-label="Internal note"
                className="focus-ring-soft mt-3 min-h-[54px] w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text placeholder:text-text-3"
              />
              <button
                type="button"
                onClick={addNote}
                disabled={!noteDraft.trim()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-violet-border bg-violet-soft px-3 py-1.5 text-[12px] font-semibold text-violet transition-colors duration-150 hover:bg-violet-soft/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="lock" size={13} />
                Add note
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-sm bg-surface-2 px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-3">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[12px] text-text">{value}</p>
    </div>
  );
}
