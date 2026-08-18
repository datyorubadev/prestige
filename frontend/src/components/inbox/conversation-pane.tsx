"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { MessageComposer } from "@/components/ui/message-composer";
import { Markdown } from "@/components/ui/markdown";
import { MentionText } from "@/components/ui/mention-text";
import { InlineAttachments } from "@/components/ui/attachments";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { avatarColorFor, cn, isResolved, ticketNumberFor } from "@/lib/utils";
import type {
  AgentUser,
  CannedResponse,
  Label,
  Ticket,
  TicketMessage,
  WidgetAttachment,
} from "@/lib/types";

export type ComposerMode = "reply" | "note";

interface MentionOption {
  name: string;
  color: string;
}

interface ConversationPaneProps {
  ticket: Ticket | null;
  agents: AgentUser[];
  canned: CannedResponse[];
  mentions?: MentionOption[];
  agentName: string;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: (attachments?: WidgetAttachment[], status?: string) => void;
  onResolve: (id: string) => void;
  onAssign: (id: string, assignee: string | null) => void;
  onEditNote: (ticketId: string, noteId: string, text: string) => void;
  onDeleteNote: (ticketId: string, noteId: string) => void;
  onDeleteMessage: (ticketId: string, messageId: string) => void;
  typing?: boolean;
  labels?: Label[];
  /** When true, strip card chrome + header — the parent page header owns
   *  title/status/actions (design.md §4.2 Step-2 workspace). */
  flat?: boolean;
}

function dayKey(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toDateString();
}

function dayLabel(ts?: string): string {
  if (!ts) return "Today";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Today";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((todayStart - dayStart) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeOfDay(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function receiptLabel(status?: TicketMessage["status"]): string {
  if (status === "read") return "Read";
  if (status === "delivered") return "Delivered";
  return "Sent";
}

function receiptClass(status?: TicketMessage["status"]): string {
  if (status === "read") return "text-[#8fe0ff]";
  if (status === "delivered") return "text-white/85";
  return "text-white/60";
}

/** Conversation thread + composer. In `flat` mode (Step-2 workspace) all card
 *  chrome and the subject header are stripped — the parent page header owns
 *  title, status, and actions. */
export function ConversationPane({
  ticket,
  agents,
  canned,
  mentions = [],
  agentName,
  mode,
  onModeChange,
  draft,
  onDraftChange,
  onSend,
  onResolve: _onResolve,
  onAssign: _onAssign,
  onEditNote,
  onDeleteNote,
  onDeleteMessage,
  typing = false,
  labels,
  flat = false,
}: ConversationPaneProps) {
  const [quote, setQuote] = useState<TicketMessage["replyTo"] | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket?.id, ticket?.msgs.length, typing]);

  const uniqueMsgs = useMemo(() => {
    const raw = ticket?.msgs ?? [];
    const filtered: TicketMessage[] = [];
    const seen = new Set<string>();
    for (const m of raw) {
      const key = m.id ? m.id : `${m.who}-${m.text}`;
      if (seen.has(key)) continue;
      const prev = filtered[filtered.length - 1];
      if (
        prev &&
        ((prev.who as string) === "ai" || prev.who === "ai_bot") &&
        ((m.who as string) === "ai" || m.who === "ai_bot") &&
        prev.text.trim() === m.text.trim()
      ) {
        continue;
      }
      seen.add(key);
      filtered.push(m);
    }
    return filtered;
  }, [ticket?.msgs]);

  if (!ticket) {
    return (
      <section
        aria-label="Conversation"
        className={cn(
          "flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center",
          flat ? "" : "rounded-md border border-border bg-surface shadow-card",
        )}
      >
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-surface-2">
          <Icon name="inbox" size={24} className="text-text-3" />
        </div>
        <div>
          <p className="text-[13.5px] font-medium text-text-2">No conversation selected.</p>
          <p className="mt-1 max-w-[240px] text-[12px] text-text-3">
            Select a ticket from the queue to open its thread and context.
          </p>
        </div>
      </section>
    );
  }

  const resolved = isResolved(ticket.status);
  const slaOverdue = (ticket.sla ?? "").includes("overdue");

  const send = (atts?: WidgetAttachment[], st?: string) => {
    onSend(atts, st);
    setQuote(null);
  };

  const changeMode = (next: ComposerMode) => {
    onModeChange(next);
    if (next === "note") setQuote(null);
  };

  const copyText = (text: string) => {
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(text);
  };

  const quoteFor = (m: TicketMessage): TicketMessage["replyTo"] => ({
    author: m.who === "customer" ? ticket.cust : m.who === "ai_bot" ? "AI assistant" : ticket.assignee ?? agentName,
    text: m.text,
  });

  return (
    <section
      aria-label="Conversation"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      {/* AI handover banner */}
      {ticket.assist && !resolved && (
        <div
          className={cn(
            "mx-4 mt-3 flex gap-2.5 rounded-[10px] px-3.5 py-3",
            slaOverdue ? "bg-danger-soft" : "bg-warning-soft",
          )}
        >
          <Icon
            name="zap"
            size={15}
            className={cn("mt-0.5 shrink-0", slaOverdue ? "text-danger" : "text-warning-dark")}
          />
          <div className="min-w-0">
            <p
              className={cn(
                "text-[11px] font-bold uppercase tracking-wide",
                slaOverdue ? "text-danger" : "text-warning-dark",
              )}
            >
              AI handover summary
            </p>
            <p className="mt-1 text-[12px] font-semibold text-text">{ticket.assist.reason}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-text-2">{ticket.assist.summary}</p>
          </div>
        </div>
      )}

      {/* Thread */}
      <div ref={threadRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {uniqueMsgs.map((m: TicketMessage, i: number) => {
          const prev = uniqueMsgs[i - 1];
          const showDivider = !prev || dayKey(prev.timestamp) !== dayKey(m.timestamp);
          const grouped =
            !!prev &&
            !showDivider &&
            prev.who === m.who &&
            m.kind !== "note" &&
            prev.kind !== "note";
          return (
            <div key={m.id ?? `m-${i}`} className="space-y-2">
              {showDivider && <DayDivider label={dayLabel(m.timestamp)} />}
              <MessageBubble
                message={m}
                grouped={grouped}
                ticket={ticket}
                agentName={agentName}
                agents={agents}
                onEditNote={onEditNote}
                onDeleteNote={onDeleteNote}
                onDeleteMessage={onDeleteMessage}
                onCopy={() => copyText(m.text)}
                onQuote={() => setQuote(quoteFor(m))}
              />
            </div>
          );
        })}

        {typing && (
          <div className="flex items-end gap-2">
            <Avatar name={ticket.cust} color={avatarColorFor(ticket.cust)} size="sm" />
            <div
              role="status"
              aria-label={`${ticket.cust} is typing`}
              className="flex items-center gap-1 rounded-md rounded-bl-[3px] border border-border bg-surface px-3 py-2.5 shadow-card"
            >
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      {resolved ? (
        <div className="flex justify-center border-t border-border p-4">
          <Pill status="resolved" tone="success" />
        </div>
      ) : (
        <div className="relative border-t border-border p-3">
          <div className="flex w-fit gap-1 rounded-sm bg-surface-3 p-0.5">
            <button
              type="button"
              onClick={() => changeMode("reply")}
              aria-pressed={mode === "reply"}
              className={cn(
                "rounded-sm px-3 py-1 text-[11.5px] font-semibold transition-colors duration-150 cursor-pointer",
                mode === "reply" ? "bg-surface text-text shadow-card" : "text-text-2 hover:text-text",
              )}
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => changeMode("note")}
              aria-pressed={mode === "note"}
              className={cn(
                "rounded-sm px-3 py-1 text-[11.5px] font-semibold transition-colors duration-150 cursor-pointer",
                mode === "note" ? "bg-surface text-violet shadow-card" : "text-text-2 hover:text-text",
              )}
            >
              Note
            </button>
          </div>

          {quote && mode === "reply" && (
            <div className="mt-2 flex items-start gap-2 rounded-sm border border-border bg-surface-3 px-3 py-2">
              <Icon name="quote" size={13} className="mt-0.5 shrink-0 text-text-3" />
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-bold text-text-2">{quote.author} said:</p>
                <p className="truncate text-[11.5px] italic text-text-2">{quote.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuote(null)}
                aria-label="Remove quoted message"
                title="Remove quote"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-2 hover:text-text cursor-pointer"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )}

          <div className="mt-2">
            <MessageComposer
              value={draft}
              onChange={onDraftChange}
              onSend={send}
              ariaLabel={mode === "note" ? "Internal note" : "Reply"}
              placeholder={
                mode === "note"
                  ? "Write an internal note — not customer-visible…"
                  : "Type your reply… (/ for canned)"
              }
              sendLabel={mode === "note" ? "Add note" : "Send"}
              minRows={2}
              maxRows={6}
              canned={canned}
              note={mode === "note"}
              mentions={mentions}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-1" aria-hidden="true">
      <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
        {label}
      </span>
    </div>
  );
}

function MessageBubble({
  message,
  grouped,
  ticket,
  agentName,
  agents,
  onEditNote,
  onDeleteNote,
  onDeleteMessage,
  onCopy,
  onQuote,
}: {
  message: TicketMessage;
  grouped: boolean;
  ticket: Ticket;
  agentName: string;
  agents: AgentUser[];
  onEditNote: (ticketId: string, noteId: string, text: string) => void;
  onDeleteNote: (ticketId: string, noteId: string) => void;
  onDeleteMessage: (ticketId: string, messageId: string) => void;
  onCopy: () => void;
  onQuote: () => void;
}) {
  if (message.kind === "note") {
    const noteId = message.id ?? "note";
    return (
      <NoteBubble
        message={message}
        mentions={agents.map((a) => a.name)}
        onEdit={(text) => onEditNote(ticket.id, noteId, text)}
        onDelete={() => onDeleteNote(ticket.id, noteId)}
      />
    );
  }

  if (message.who === "system") {
    return (
      <div className="flex justify-center">
        <span className="max-w-[85%] rounded-full bg-warning-soft px-3 py-1 text-center text-[11.5px] text-text-2">
          {message.text}
        </span>
      </div>
    );
  }

  if (message.who === "ai_bot") {
    return (
      <div className="group relative flex items-end gap-2">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
          <Icon name="bot" size={14} />
        </span>
        <div className="max-w-[80%] rounded-md rounded-bl-[3px] bg-info-soft px-3 py-2">
          <b className="block text-[11px] font-bold text-info">AI assistant</b>
          <Markdown text={message.text} className="mt-0.5 text-[12.5px] leading-snug text-text" />
          <InlineAttachments attachments={message.attachments} />
        </div>
        <HoverActions
          message={message}
          canDelete={false}
          onCopy={onCopy}
          onQuote={onQuote}
          onDelete={() => {}}
        />
      </div>
    );
  }

  if (message.who === "human_agent" || message.who === "agent") {
    const who = ticket.assignee ?? agentName;
    const agent = agents.find((a) => a.name === who);
    const color = agent?.color ?? avatarColorFor(who);
    return (
      <div className={cn("group relative flex items-start justify-end gap-2.5", grouped && "mt-1")}>
        <div className="flex max-w-[80%] flex-col items-end text-left">
          {!grouped && <b className="mb-0.5 block text-[11px] font-bold text-text-2">{who}</b>}
          <div className="relative rounded-md bg-primary px-3.5 py-2 text-left">
            <Markdown text={message.text} className="text-[12.5px] leading-snug text-white text-left" />
            <InlineAttachments attachments={message.attachments} />
          </div>
          <span
            title={receiptLabel(message.status)}
            className="mt-0.5 flex items-center gap-1 text-[10px] text-text-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          >
            {timeOfDay(message.timestamp)}
            <Icon
              name="check-double"
              size={11}
              className={cn("rounded-sm", receiptClass(message.status))}
            />
          </span>
        </div>
        {!grouped ? (
          <Avatar name={who} color={color} size="sm" className="mt-0.5 shrink-0" />
        ) : (
          <div className="w-7 shrink-0" />
        )}
        <HoverActions
          message={message}
          canDelete={!!message.id}
          onCopy={onCopy}
          onQuote={onQuote}
          onDelete={() => message.id && onDeleteMessage(ticket.id, message.id)}
        />
      </div>
    );
  }

  return (
    <div className={cn("group relative flex items-start gap-2.5", grouped && "mt-1")}>
      {!grouped ? (
        <Avatar name={ticket.cust} color={avatarColorFor(ticket.cust)} size="sm" className="mt-0.5 shrink-0" />
      ) : (
        <div className="w-7 shrink-0" />
      )}
      <div className="max-w-[80%] text-left">
        {!grouped && (
          <b className="mb-0.5 block px-1 text-[11px] font-bold text-text-2">{ticket.cust}</b>
        )}
        <div className="relative rounded-md border border-border bg-surface px-3.5 py-2 text-left shadow-card">
          <Markdown text={message.text} className="text-[12.5px] leading-snug text-text text-left" />
          <InlineAttachments attachments={message.attachments} />
        </div>
        <span className="mt-0.5 block pl-1 text-[10px] text-text-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {timeOfDay(message.timestamp)}
        </span>
      </div>
      <HoverActions
        message={message}
        canDelete={false}
        onCopy={onCopy}
        onQuote={onQuote}
        onDelete={() => {}}
      />
    </div>
  );
}

function HoverActions({
  message,
  canDelete,
  onCopy,
  onQuote,
  onDelete,
}: {
  message: TicketMessage;
  canDelete: boolean;
  onCopy: () => void;
  onQuote: () => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="absolute -top-5 right-0 z-10 flex items-center gap-0.5 rounded-sm border border-border bg-surface p-0.5 opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100">
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy message"}
          aria-label={copied ? "Copied" : "Copy message"}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-sm transition-colors duration-150 cursor-pointer",
            copied ? "text-emerald-500 bg-emerald-500/10" : "text-text-3 hover:bg-surface-3 hover:text-text",
          )}
        >
          <Icon name={copied ? "check" : "copy"} size={12} />
        </button>
        <button
          type="button"
          onClick={onQuote}
          title="Quote & reply"
          aria-label="Quote and reply"
          className="flex h-5 w-5 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text cursor-pointer"
        >
          <Icon name="quote" size={12} />
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            title="Delete message"
            aria-label="Delete message"
            className="flex h-5 w-5 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-danger-soft hover:text-danger cursor-pointer"
          >
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>
      {message.who === "human_agent" && message.id && (
        <ConfirmModal
          open={confirmOpen}
          title="Delete this message?"
          description="The message will be removed from the conversation for everyone — including the customer. This cannot be undone."
          confirmLabel="Delete message"
          onConfirm={() => {
            onDelete();
            setConfirmOpen(false);
          }}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

function NoteBubble({
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
    <div className="group rounded-md border border-dashed border-note-border bg-note-bg px-3 py-2">
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
            className="flex h-5 w-5 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text cursor-pointer"
          >
            <Icon name="edit" size={12} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label="Delete note"
            title="Delete note"
            className="flex h-5 w-5 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-danger-soft hover:text-danger cursor-pointer"
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Edit note"
          rows={Math.min(Math.max(value.split("\n").length, 2), 6)}
          className="focus-ring-soft mt-1.5 w-full resize-y rounded-sm border border-note-border bg-surface px-2.5 py-1.5 text-[12.5px] leading-snug text-text"
        />
      ) : (
        <>
          <MentionText
            text={message.text}
            mentions={mentions}
            className="mt-1 whitespace-pre-wrap text-[12.5px] text-text"
          />
          <InlineAttachments attachments={message.attachments} />
        </>
      )}

      {editing && (
        <div className="mt-1.5 flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-sm px-2 py-1 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text cursor-pointer"
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
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <Icon name="check" size={12} />
            Save
          </button>
        </div>
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
    </div>
  );
}
