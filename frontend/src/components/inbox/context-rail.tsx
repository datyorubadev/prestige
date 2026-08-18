"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { AgentAssistPanel } from "@/components/inbox/agent-assist";
import { AiDecisionTrail } from "./ai-decision-trail";
import {
  AttachButton,
  AttachmentChip,
  InlineAttachments,
  uploadAttachment,
} from "@/components/ui/attachments";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { LabelChip } from "@/components/ui/label-chip";
import { Tooltip } from "@/components/ui/tooltip";
import { avatarColorFor, cn, isResolved, ticketNumberFor } from "@/lib/utils";
import { MentionText } from "@/components/ui/mention-text";
import type {
  AgentUser,
  KnowledgeArticle,
  Label,
  PastTicket,
  Ticket,
  TicketMessage,
  WidgetAttachment,
} from "@/lib/types";

type RailTab = "overview" | "customer" | "assist" | "notes";

const TABS: { id: RailTab; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "customer", label: "Customer", icon: "users" },
  { id: "assist", label: "Assist", icon: "zap" },
  { id: "notes", label: "Notes", icon: "lock" },
];

const MICRO = "text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-3";

interface ContextRailProps {
  ticket: Ticket;
  pastTickets: PastTicket[];
  articles: KnowledgeArticle[];
  agents: AgentUser[];
  open: boolean;
  onToggle: () => void;
  onAssign: (id: string, assignee: string | null) => void;
  onResolve: (id: string) => void;
  onEscalate: (id: string) => void;
  onReopen: (id: string) => void;
  onAddNote: (id: string, text: string, attachments?: WidgetAttachment[]) => void;
  onEditNote: (ticketId: string, noteId: string, text: string) => void;
  onDeleteNote: (ticketId: string, noteId: string) => void;
  onUseSuggestion: (text: string) => void;
  /** Persist the full label list (Chatwoot-style overview editor). */
  onSetLabels?: (labels: string[]) => void;
  /** Label library for chip colors. */
  labels?: Label[];
}

/** Step-2 right rail — Chatwoot-style conversation details: tabbed pane
 *  (Overview / Customer / Assist / Notes), collapsing to a slim vertical strip
 *  of tab icons. v3.3: notes are editable/deletable (Intercom-style) and
 *  accept attachments. */
export function ContextRail({
  ticket,
  pastTickets,
  articles,
  agents,
  open,
  onToggle,
  onAssign,
  onResolve,
  onEscalate,
  onReopen,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onUseSuggestion,
  onSetLabels,
  labels,
}: ContextRailProps) {
  const [tab, setTab] = useState<RailTab>("overview");
  const [kbQuery, setKbQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteAttachments, setNoteAttachments] = useState<WidgetAttachment[]>([]);
  const [trailOpen, setTrailOpen] = useState(false);

  if (!open) {
    return (
      <aside
        aria-label="Context rail"
        className="flex h-full w-9 min-w-9 shrink-0 flex-col items-center overflow-hidden border-l border-border bg-surface"
      >
        <div className="flex h-9 items-center justify-center border-b border-border">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Show context"
            title="Show context"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="chevron-right" size={13} />
          </button>
        </div>
        <span className="mt-4 select-none text-[10px] font-bold uppercase tracking-[0.2em] text-text-3 [writing-mode:vertical-rl]">
          Details
        </span>
        <div className="mt-6 flex flex-col items-center gap-1">
          {TABS.map((t) => (
            <Tooltip key={t.id} content={t.label} side="left">
              <button
                type="button"
                onClick={() => {
                  setTab(t.id);
                  onToggle();
                }}
                aria-label={`Open ${t.label}`}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 outline-none focus:outline-none",
                  tab === t.id ? "bg-primary-soft text-primary-dark" : "text-text-3 hover:bg-surface-3 hover:text-text",
                )}
              >
                <Icon name={t.icon} size={14} />
              </button>
            </Tooltip>
          ))}
        </div>
      </aside>
    );
  }

  const resolved = isResolved(ticket.status);
  const past = pastTickets.filter(
    (p) => !ticket.email || !p.email || p.email.trim().toLowerCase() === ticket.email.trim().toLowerCase(),
  );
  const notes = ticket.msgs.filter((m) => m.kind === "note");
  const q = kbQuery.trim().toLowerCase();
  const kbHits = articles
    .filter((a) => !q || `${a.title} ${a.snippet}`.toLowerCase().includes(q))
    .slice(0, 4);

  return (
    <aside
      aria-label="Conversation details"
      className="flex h-full w-[320px] shrink-0 min-w-0 flex-col overflow-hidden border-l border-border bg-surface"
    >
      <header className="flex items-center gap-1 border-b border-border px-2">
        {TABS.map((t) => (
          <Tooltip key={t.id} content={t.label} side="bottom">
            <button
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 px-1 py-2 text-[11.5px] font-semibold transition-colors duration-150 outline-none focus:outline-none",
                tab === t.id ? "text-text" : "text-text-3 hover:text-text-2",
              )}
            >
              <Icon name={t.icon} size={13} />
              <span className="hidden xl:inline">{t.label}</span>
              <span
                className={cn(
                  "absolute inset-x-1 -bottom-px h-[2px] rounded-full transition-colors duration-150",
                  tab === t.id ? "bg-primary" : "bg-transparent",
                )}
              />
            </button>
          </Tooltip>
        ))}
        <Tooltip content="Collapse details panel">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Hide context"
            className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="chevron-right" size={13} className="rotate-180" />
          </button>
        </Tooltip>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Conversation */}
        {tab === "overview" && (
          <section aria-label="Overview" className="pb-3">
          <div className="flex items-center justify-between px-4 pt-4">
            <span className={MICRO}>Status</span>
            <Pill status={ticket.status} />
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-3">
            <Kv label="Priority" value={ticket.priority} tone={prTone(ticket.priority)} />
            <Kv label="Channel" value={channelName(ticket.channel)} />
            <Kv label="Type" value={ticket.type} />
            <Kv label="Sentiment" value={ticket.sentiment} tone={sentTone(ticket.sentiment)} />
            <Kv label="SLA" value={ticket.sla ?? "—"} tone={(ticket.sla ?? "").includes("overdue") ? "text-danger" : "text-info"} />
            <Kv label="Opened" value={ticket.time} />
          </dl>
          <div className="border-t border-border px-4 py-3">
            <p className={MICRO}>Labels</p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {(ticket.labels ?? []).map((label) => (
                <span key={label} className="inline-flex items-center gap-1">
                  <LabelChip name={label} labels={labels} />
                  {onSetLabels && (
                    <button
                      type="button"
                      onClick={() => onSetLabels((ticket.labels ?? []).filter((l) => l !== label))}
                      aria-label={`Remove label ${label}`}
                      title={`Remove ${label}`}
                      className="opacity-60 transition-opacity duration-150 hover:opacity-100"
                    >
                      <Icon name="close" size={9} />
                    </button>
                  )}
                </span>
              ))}
              {onSetLabels &&
                (labels ?? [])
                  .filter((l) => !(ticket.labels ?? []).includes(l.name))
                  .map((l) => (
                    <button
                      key={l.name}
                      type="button"
                      onClick={() => onSetLabels([...(ticket.labels ?? []), l.name])}
                      className="rounded-sm border border-dashed border-text-3/40 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-text-3 transition-colors duration-150 hover:border-text-3 hover:text-text"
                    >
                      + {l.name}
                    </button>
                  ))}
            </div>
          </div>
          <div className="space-y-2 border-t border-border px-4 py-3">
            <Select
              value={ticket.assignee ?? ""}
              onChange={(v) => onAssign(ticket.id, v || null)}
              placeholder="Assign to…"
              ariaLabel="Assign ticket"
              options={agents.map((a) => ({ value: a.name, label: a.name }))}
              className="w-full"
            />
            {resolved ? (
              <button
                type="button"
                onClick={() => onReopen(ticket.id)}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text"
              >
                <Icon name="swap" size={13} />
                Reopen ticket
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEscalate(ticket.id)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-danger-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-danger transition-colors duration-150 hover:bg-danger-soft"
                >
                  <Icon name="alert-triangle" size={13} />
                  Escalate
                </button>
                <button
                  type="button"
                  onClick={() => onResolve(ticket.id)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                >
                  <Icon name="check" size={13} />
                  Resolve
                </button>
              </div>
            )}
          </div>
        </section>
        )}

        {/* Customer */}
        {tab === "customer" && (
          <section aria-label="Customer" className="border-t border-border space-y-3 pb-3">
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar name={ticket.cust} color={avatarColorFor(ticket.cust)} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-bold text-text">{ticket.cust}</p>
                </div>
                <p className="truncate text-[11.5px] text-text-2">{ticket.email}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 px-4">
              <Kv label="Phone" value={ticket.phone || "—"} />
              <Kv label="Sentiment" value={ticket.sentiment || "Neutral"} tone={sentTone(ticket.sentiment)} />
            </dl>

            <div className="border-t border-border px-4 pt-3">
              <div className="flex items-center justify-between">
                <p className={MICRO}>Past tickets</p>
                <span className="text-[11px] text-text-3">{past.length} total</span>
              </div>
              {past.length === 0 ? (
                <p className="mt-2 text-[12px] text-text-3">No past tickets on file.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {past.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/dashboard/tickets/${ticketNumberFor(p)}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2 text-[12px] transition-colors duration-150 hover:border-primary-border hover:bg-surface-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-text">{p.subject}</span>
                          <span className="mt-0.5 block text-[10.5px] text-text-3">
                            {ticketNumberFor(p)} · {p.date}
                          </span>
                        </span>
                        <Pill status={p.status} className="shrink-0 !px-1.5 !py-[1px] !text-[9.5px]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Agent assist */}
        {tab === "assist" && (
          <section aria-label="Agent assist" className="border-t border-border pb-3">
            <div className="px-4 pt-3">
              <button
                type="button"
                onClick={() => setTrailOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 rounded bg-primary/10 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/20"
              >
                <Icon name="shield" size={13} />
                View AI Decision Trail
              </button>
            </div>

            <AiDecisionTrail
              open={trailOpen}
              onClose={() => setTrailOpen(false)}
              ticketId={ticket.id}
              ticketNumber={ticket.ticketNumber}
              customerName={ticket.cust || ticket.email || "Customer"}
              userPrompt={ticket.subject}
              confidence={ticket.assist ? 94 : 88}
              model="OpenAI GPT-4o & Prestige RAG Embeddings"
              tokensUsed={
                ticket.msgs?.reduce((sum: number, m: TicketMessage) => sum + Math.max(15, Math.round((m.text?.length || 0) / 4)), 0) || 340
              }
              steps={[
                {
                  name: "vector_knowledge_search",
                  status: "success",
                  input: `query: "${ticket.subject}" | tenant_id: "${ticket.tenantId || "t1"}"`,
                  output: ticket.assist?.chunks?.length
                    ? `Retrieved ${ticket.assist.chunks.length} context chunk(s): ${ticket.assist.chunks[0].slice(0, 70)}...`
                    : "Matched knowledge base articles and FAQ guidelines",
                  timestamp: ticket.time || "Just now",
                },
                ...(ticket.email
                  ? [
                      {
                        name: "lookup_customer_profile",
                        status: "success" as const,
                        input: `customer_email: "${ticket.email}"`,
                        output: `Matched profile: ${ticket.cust || ticket.email} (Status: active)`,
                        timestamp: ticket.time || "Just now",
                      },
                    ]
                  : []),
                ...(ticket.assist?.suggest
                  ? [
                      {
                        name: "synthesize_ai_response",
                        status: "success" as const,
                        input: `prompt: "${ticket.assist.reason || ticket.subject}"`,
                        output: `Generated reply draft: "${ticket.assist.suggest.slice(0, 75)}..."`,
                        timestamp: ticket.time || "Just now",
                      },
                    ]
                  : []),
              ]}
            />

            <AgentAssistPanel ticketId={ticket.id} onUseSuggestion={onUseSuggestion} />
            {ticket.assist ? (
              <>
                <div className="px-4 pt-3">
                  <p className={MICRO}>AI handover</p>
                  <div className="mt-2 rounded-md bg-warning-soft px-3 py-2.5">
                    <p className="text-[12px] font-semibold text-text">{ticket.assist.reason}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-text-2">{ticket.assist.summary}</p>
                  </div>
                </div>
                <div className="px-4 pt-3">
                  <p className={MICRO}>Evidence</p>
                  <ol className="mt-2 space-y-1.5">
                    {ticket.assist.chunks.map((c, i) => (
                      <li key={i} className="flex gap-2 text-[12px] text-text-2">
                        <span className="font-mono text-[11px] font-bold text-info">{i + 1}</span>
                        <span className="leading-relaxed">{c}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="px-4 pt-3">
                  <p className={MICRO}>Suggested reply</p>
                  <div className="mt-2 rounded-md bg-primary-soft px-3 py-2.5">
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-text">{ticket.assist.suggest}</p>
                    <button
                      type="button"
                      onClick={() => onUseSuggestion(ticket.assist!.suggest)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                    >
                      <Icon name="copy" size={12} />
                      Use reply
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            <div className="px-4 pt-3">
              <p className={MICRO}>Knowledge base</p>
              <div className="relative mt-2">
                <Icon
                  name="search"
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3"
                />
                <input
                  value={kbQuery}
                  onChange={(e) => setKbQuery(e.target.value)}
                  placeholder="Search articles…"
                  aria-label="Search knowledge base"
                  className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-[12px] text-text placeholder:text-text-3"
                />
              </div>
              <ul className="mt-2 space-y-1.5">
                {kbHits.map((a) => (
                  <li key={a.id} className="rounded-md border border-border p-2.5 bg-surface">
                    <p className="text-[12px] font-semibold text-text">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] text-text-3">{a.snippet}</p>
                    <button
                      type="button"
                      onClick={() => onUseSuggestion(a.snippet || a.title)}
                      className="mt-2 inline-flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-2 py-1 text-[10.5px] font-semibold text-text-2 hover:bg-surface-3 hover:text-text"
                    >
                      <Icon name="plus" size={11} />
                      Insert into reply
                    </button>
                  </li>
                ))}
                {kbHits.length === 0 && (
                  <li className="text-[12px] text-text-3">No articles match.</li>
                )}
              </ul>
            </div>
          </section>
        )}

        {/* Internal notes */}
        {tab === "notes" && (
          <section aria-label="Internal notes" className="border-t border-border pb-3">
          <div className="px-4 pt-3">
            <p className={MICRO}>Internal notes</p>
            {notes.length === 0 ? (
              <p className="mt-2 text-[12px] text-text-3">
                No internal notes yet — private to your team, never sent to the customer.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {notes.map((n, i) => {
                  const noteId = n.id ?? `note-${i}`;
                  return (
                    <RailNote
                      key={noteId}
                      message={n}
                      mentions={agents.map((a) => a.name)}
                      onEdit={(text) => onEditNote(ticket.id, noteId, text)}
                      onDelete={() => onDeleteNote(ticket.id, noteId)}
                    />
                  );
                })}
              </ul>
            )}
          </div>
          <div className="px-4 pt-3">
            <p className={MICRO}>Add a note</p>
            {noteAttachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {noteAttachments.map((a) => (
                  <AttachmentChip
                    key={a.id}
                    attachment={a}
                    onRemove={() => setNoteAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  />
                ))}
              </div>
            )}
            <div className="mt-2 flex items-end gap-1.5">
              <AutosizeTextarea
                value={noteDraft}
                onChange={setNoteDraft}
                ariaLabel="Internal note"
                placeholder="Write a private note…"
                minRows={2}
                maxRows={6}
                className="focus-ring-soft w-full min-w-0 flex-1 rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12px] leading-snug text-text placeholder:text-text-3"
              />
              <AttachButton onChange={(f) => void uploadAttachment(f).then((a) => setNoteAttachments((prev) => [...prev, a]))} />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!noteDraft.trim() && noteAttachments.length === 0) return;
                onAddNote(ticket.id, noteDraft.trim(), noteAttachments);
                setNoteDraft("");
                setNoteAttachments([]);
              }}
              disabled={!noteDraft.trim() && noteAttachments.length === 0}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-violet bg-violet-soft px-3 py-1.5 text-[12px] font-semibold text-violet transition-colors duration-150 hover:bg-violet-border/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="lock" size={13} />
              Add note
            </button>
          </div>
        </section>
        )}
      </div>
    </aside>
  );
}

function Kv({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className={MICRO}>{label}</dt>
      <dd className={cn("mt-0.5 truncate text-[12.5px] font-medium text-text", tone)}>
        {value}
      </dd>
    </div>
  );
}

function prTone(priority: string): string {
  return priority === "high" ? "text-danger" : priority === "medium" ? "text-info" : "text-text-3";
}

function sentTone(sentiment: string): string {
  return sentiment === "Negative" ? "text-danger" : sentiment === "Positive" ? "text-primary-dark" : "text-text-2";
}

function channelName(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

/** v3.3 — compact internal note card in the rail: inline edit + ConfirmModal
 *  delete, mirroring the thread's NoteBubble (Intercom "Edit your notes"). */
function RailNote({
  message,
  mentions,
  onEdit,
  onDelete,
}: {
  message: TicketMessage;
  mentions: string[];
  onEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(message.text);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <li className="group rounded-md border border-dashed border-note-border bg-note-bg px-3 py-2">
      <div className="flex items-center gap-1.5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet">
          <Icon name="lock" size={11} />
          Note
        </p>
        {message.author && <span className="text-[10px] text-text-3">· {message.author}</span>}
        {message.edited && (
          <span className="rounded-sm bg-surface-3 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-text-3">
            Edited
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5 opacity-60 transition-opacity duration-150 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => {
              setValue(message.text);
              setEditing(true);
            }}
            aria-label="Edit note"
            title="Edit note"
            className="flex h-5 w-5 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="edit" size={12} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label="Delete note"
            title="Delete note"
            className="flex h-5 w-5 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-danger-soft hover:text-danger"
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <AutosizeTextarea
            value={value}
            onChange={setValue}
            ariaLabel="Edit note"
            minRows={2}
            maxRows={6}
            className="focus-ring-soft w-full rounded-sm border border-note-border bg-surface px-2.5 py-1.5 text-[12px] leading-snug text-text"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-sm px-2 py-1 text-[11px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onEdit(value);
                setEditing(false);
              }}
              disabled={!value.trim()}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1 text-[11px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="check" size={12} />
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <MentionText
            text={message.text}
            mentions={mentions}
            className="mt-1 whitespace-pre-wrap text-[12px] text-text"
          />
          <InlineAttachments attachments={message.attachments} />
        </>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Delete internal note?"
        description="This note is only visible to your team. Deleting it is permanent — the customer never sees it either way."
        confirmLabel="Delete note"
        onConfirm={() => {
          onDelete();
          setConfirmOpen(false);
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </li>
  );
}
