"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageComposer } from "@/components/ui/message-composer";
import { InlineAttachments } from "@/components/ui/attachments";
import { CreateTicketModal } from "@/components/portal/create-ticket-modal";
import { avatarColorFor, channelLabel, cn, ticketNumberFor } from "@/lib/utils";
import type { Tenant, Ticket, TicketMessage, TicketStatus, WidgetSendResult, MessageSender } from "@/lib/types";

const RESOLVED = ["resolved", "closed"];

/** Customer chat (design.md §4.5): the customer's own conversations with the
 *  tenant's support team. Shown at /chat/[tenantId] for the public page (guest
 *  pre-chat identity via initialEmail) and inside the customer portal. */
export function CustomerChat({ tenantId, initialEmail }: { tenantId: string; initialEmail?: string }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const deepEmail = searchParams.get("email");
  const deepTicket = searchParams.get("ticket");
  const email = user?.email ?? initialEmail ?? deepEmail ?? "";

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);

  const stream = useStreamingChat();

  useRealtime(
    {
      message_created: (ev) => {
        const ticketId = String(ev.data?.ticket_id ?? "");
        if (!ticketId) return;
        const text = String(ev.data?.text ?? "");
        const who = String(ev.data?.who ?? "agent");
        const attachments = Array.isArray(ev.data?.attachments) ? (ev.data.attachments as any[]) : [];
        if (!text && !attachments.length) return;
        setTickets((prev) =>
          prev?.map((t) => {
            if (t.id !== ticketId) return t;
            if (t.msgs.some((m) => m.text === text && m.who === (who as any) && (!attachments.length || m.attachments?.length === attachments.length))) return t;
             const newMsg: TicketMessage = {
               id: String(Date.now()),
               who: who as MessageSender,
               text,
               timestamp: "Just now",
               attachments: attachments.length ? attachments : undefined,
             };
            return { ...t, msgs: [...t.msgs, newMsg], preview: text || "Sent an attachment" };
          }) ?? null,
        );
      },
      ticket_updated: (ev) => {
        const ticketId = String(ev.data?.ticket_id ?? "");
        if (!ticketId) return;
        if (ev.data?.status) {
          setTickets((prev) =>
             prev?.map((t) => (t.id === ticketId ? { ...t, status: String(ev.data.status) as TicketStatus } : t)) ?? null,
          );
        }
      },
    },
    { enabled: Boolean(email) },
  );

  // Truthful presence line (design.md §4.5) — never claim an agent is online
  // when the tenant's queue is empty.
  useEffect(() => {
    let active = true;
    void api
      .get<Tenant | null>(`/tenants/${tenantId}`)
      .then((t) => {
        if (active) setOnline((t?.agentsOnline ?? 0) > 0);
      })
      .catch(() => {
        if (active) setOnline(null);
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  // Load the customer's own tickets once, auto-selecting the deep-linked
  // ticket (from My tickets), else first open, else the most recent — done in
  // the fetch callback so the initial selection lands with the data.
  const primed = useRef(false);
  useEffect(() => {
    if (!email || primed.current) return;
    let active = true;
    void api
      .post<Ticket[]>("/portal/tickets/list", { tenantId, email })
      .then((mine) => {
        if (!active || primed.current) return;
        primed.current = true;
        setTickets(mine);
        const deep =
          deepTicket && mine.some((t) => t.id === deepTicket)
            ? mine.find((t) => t.id === deepTicket)
            : deepEmail
              ? mine.find((t) => t.email.toLowerCase() === deepEmail.toLowerCase())
              : undefined;
        if (mine.length > 0) {
          setSelectedId(
            deep?.id ?? mine.find((t) => !RESOLVED.includes(t.status))?.id ?? mine[0].id,
          );
        }
      })
      .catch(() => {
        if (active) {
          primed.current = true;
          setTickets([]);
          setLoadError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [email, deepEmail, deepTicket]);

  const selected = tickets?.find((t) => t.id === selectedId) ?? null;

  const send = async (attachments?: any[]) => {
    const text = draft.trim();
    if ((!text && !attachments?.length) || !selected || sending) return;
    setDraft("");
    setSending(true);
    const targetId = selected.id;
    const userMsg: TicketMessage = {
      id: `cust-${Date.now()}`,
      who: "customer",
      text,
      timestamp: "Just now",
      attachments: attachments?.length ? attachments : undefined,
    };
    setTickets((prev) =>
      prev?.map((t) => (t.id === targetId ? { ...t, msgs: [...t.msgs, userMsg], preview: text || "Sent an attachment" } : t)) ?? null,
    );
    try {
      const res = await api.post<WidgetSendResult>("/widget/send", {
        tenantId,
        sessionId: targetId,
        text,
        email,
        attachments,
      });
      const updated = res.ticket;
      if (updated) {
        setTickets((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
      }
      if (!res.escalated) {
        let acc = "";
        const aiMsgId = `ai-${Date.now()}`;
        setTickets((prev) =>
          prev?.map((t) => {
            if (t.id !== targetId) return t;
            return {
              ...t,
              msgs: [...t.msgs, { id: aiMsgId, who: "ai_bot", text: "", timestamp: "Just now" }],
            };
          }) ?? null,
        );
        try {
          await stream.send({
            ticketId: targetId,
            query: text,
            tone: "professional",
            onToken: (tok) => {
              acc += tok;
              setTickets((prev) =>
                prev?.map((t) => {
                  if (t.id !== targetId) return t;
                  const nextMsgs = [...t.msgs];
                  nextMsgs[nextMsgs.length - 1] = {
                    ...nextMsgs[nextMsgs.length - 1],
                    text: acc,
                  };
                  return { ...t, msgs: nextMsgs, preview: acc };
                }) ?? null,
              );
            },
            onDone: () => {
              if (acc) {
                void api.post("/widget/persist", { ticketId: targetId, text: acc }).catch(() => {});
              } else {
                // If stream was empty, update with helpful fallback
                setTickets((prev) =>
                  prev?.map((t) => {
                    if (t.id !== targetId) return t;
                    const nextMsgs = [...t.msgs];
                    const last = nextMsgs[nextMsgs.length - 1];
                    if (last && last.id === aiMsgId && !last.text) {
                      nextMsgs[nextMsgs.length - 1] = {
                        ...last,
                        text: "I've received your message and notified our support team.",
                      };
                    }
                    return { ...t, msgs: nextMsgs };
                  }) ?? null,
                );
              }
            },
          });
        } catch {
          // If stream failed, set graceful fallback
          setTickets((prev) =>
            prev?.map((t) => {
              if (t.id !== targetId) return t;
              const nextMsgs = [...t.msgs];
              const last = nextMsgs[nextMsgs.length - 1];
              if (last && last.id === aiMsgId && !last.text) {
                nextMsgs[nextMsgs.length - 1] = {
                  ...last,
                  text: "I've logged your request. A support agent will respond shortly.",
                };
              }
              return { ...t, msgs: nextMsgs };
            }) ?? null,
          );
        }
      }
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const reopen = async (id: string) => {
    const updated = await api.post<Ticket>(`/portal/tickets/${id}/reopen`, { tenantId, email });
    if (updated) {
      setTickets((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
    }
  };

  const handleCreated = (ticket: Ticket) => {
    setCreateOpen(false);
    setTickets((prev) => (prev ? [ticket, ...prev] : [ticket]));
    setSelectedId(ticket.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[15px] font-bold text-text">Chat with support</h1>
          <span className="rounded-full bg-surface-3 px-2 py-px text-[11px] font-bold tabular-nums text-text-2">
            {tickets?.length ?? "…"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {online !== null && (
            <span className="flex items-center gap-1.5 text-meta font-medium text-text-2">
              {online ? (
                <>
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Support online
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-text-3" aria-hidden="true" />
                  Offline — reply by email
                </>
              )}
            </span>
          )}
          <Link
            href={`/portal/${tenantId}/inbox`}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <Icon name="inbox" size={14} />
            My tickets
          </Link>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="plus" size={14} />
            New ticket
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside
          aria-label="Your conversations"
          className="flex max-h-[40vh] min-h-0 flex-col overflow-hidden border-b border-border lg:max-h-none lg:w-[300px] lg:shrink-0 lg:border-b-0 lg:border-r"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-[14px] font-bold text-text">Your conversations</h2>
            <p className="mt-0.5 text-[11.5px] text-text-3">
              {email ? (
                email
              ) : (
                <>
                  Sign in to see tickets for your email
                </>
              )}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto flex flex-col">
            {loadError ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Icon name="inbox" size={28} className="opacity-40 text-text-3" />
                <p className="text-[13px] font-medium text-text-2">Couldn&apos;t load your tickets.</p>
                <button
                  type="button"
                  onClick={() => {
                    primed.current = false;
                    setLoadError(false);
                    setTickets(null);
                  }}
                  className="text-[12px] font-medium text-info hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : !tickets ? (
              <div className="space-y-3 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="skeleton h-3 w-3/4" />
                      <div className="skeleton mt-2 h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <EmptyState
                icon="inbox"
                title="No conversations yet"
                subtitle="Raise your first ticket and we'll meet you right here."
                className="py-10"
                action={
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                  >
                    <Icon name="plus" size={13} />
                    Create a ticket
                  </button>
                }
              />
            ) : (
              <ul className="flex flex-col">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      aria-current={t.id === selectedId ? "true" : undefined}
                      className={cn(
                        "group flex w-full items-start gap-3 border-b border-border border-l-[3px] border-l-transparent px-3.5 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-surface-2",
                        t.id === selectedId && "border-l-primary bg-primary-soft hover:bg-primary-soft",
                      )}
                    >
                      <div className="relative mt-[2px] shrink-0">
                        <Avatar name={t.cust} color={avatarColorFor(t.cust)} size="sm" />
                        {t.unread && (
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
                              t.unread ? "font-bold text-text" : "font-semibold text-text",
                            )}
                          >
                            {t.subject}
                          </p>
                          <span className="shrink-0 text-[11px] tabular-nums text-text-3">
                            {t.time}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11.5px] text-text-3">{t.preview}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-3">
                            <Icon
                              name={
                                t.channel === "whatsapp"
                                  ? "send"
                                  : t.channel === "email"
                                    ? "mail"
                                    : t.channel === "portal"
                                      ? "file"
                                      : "inbox"
                              }
                              size={12}
                              className="text-text-3"
                            />
                            {channelLabel(t.channel)}
                          </span>
                          <span className="h-[3px] w-[3px] rounded-full bg-text-3/50" />
                          <Pill status={t.status} className="!px-2 !py-[2px] !text-[10px]" />
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section
          aria-label="Conversation"
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        >
          {selected ? (
            <TicketThread
              ticket={selected}
              onSend={send}
              draft={draft}
              onDraftChange={setDraft}
              sending={sending}
              onReopen={reopen}
              tenantId={tenantId}
            />
          ) : (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-8 text-center">
              <Icon name="send" size={32} className="opacity-40 text-text-3" />
              <p className="text-[13.5px] font-medium text-text-2">No conversation selected.</p>
              <p className="max-w-[260px] text-[12px] text-text-3">
                Pick a conversation on the left, or create a ticket and an agent will reply here.
              </p>
              {tickets?.length === 0 && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                >
                  <Icon name="plus" size={13} />
                  Create a ticket
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {createOpen && (
        <CreateTicketModal
          open
          tenantId={tenantId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

function TicketThread({
  ticket,
  onSend,
  draft,
  onDraftChange,
  sending,
  onReopen,
  tenantId,
}: {
  ticket: Ticket;
  onSend: (attachments?: any[]) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  sending: boolean;
  onReopen: (id: string) => void;
  tenantId: string;
}) {
  const threadRef = useRef<HTMLDivElement>(null);
  const resolved = RESOLVED.includes(ticket.status);
  const customerName = ticket.cust.split(" ")[0];

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket.id, ticket.msgs.length]);

  const visible = ticket.msgs.filter((m) => m.kind !== "note");

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <Avatar
          name={customerName}
          color={avatarColorFor(customerName)}
          size="md"
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-[14.5px] font-bold text-text">{ticket.subject}</h2>
            <span className="shrink-0 font-mono text-[11px] text-text-3">{ticketNumberFor(ticket)}</span>
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-meta text-text-2">
            <span className="inline-flex items-center gap-1">
              <Icon
                name={
                  ticket.channel === "whatsapp"
                    ? "send"
                    : ticket.channel === "email"
                      ? "mail"
                      : ticket.channel === "portal"
                        ? "file"
                        : "inbox"
                }
                size={12}
                className="text-text-3"
              />
              {channelLabel(ticket.channel)}
            </span>
            <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-text-3/50" />
            <span className="capitalize">{ticket.type}</span>
            <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-text-3/50" />
            <span className="capitalize">{ticket.priority} priority</span>
          </p>
        </div>
        <Pill status={ticket.status} />
      </header>

      {resolved && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
          <p className="text-[12px] text-text-2">This conversation is resolved.</p>
          <button
            type="button"
            onClick={() => onReopen(ticket.id)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-violet-border bg-violet-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-violet transition-colors duration-150 hover:bg-violet-soft/70"
          >
            <Icon name="lock" size={12} />
            Reopen
          </button>
        </div>
      )}

      <div ref={threadRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {visible.map((m, i) => (
          <CustomerBubble
            key={i}
            message={m}
            grouped={!!visible[i - 1] && visible[i - 1].who === m.who}
            customerName={customerName}
          />
        ))}
      </div>

      {resolved ? (
        <div className="flex justify-center border-t border-border p-4">
          <p className="text-[12px] text-text-3">Resolved — reopen above to continue the thread.</p>
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <MessageComposer
            value={draft}
            onChange={onDraftChange}
            onSend={(attachments) => onSend(attachments)}
            sending={sending}
            hideChevron={true}
            ariaLabel="Reply to support"
            placeholder="Type your message…"
            actions={
              <Link
                href={`/portal/${tenantId}`}
                className="ml-2 text-[12px] font-medium text-info hover:underline"
              >
                Search the help center
              </Link>
            }
          />
        </div>
      )}
    </>
  );
}

function CustomerBubble({
  message,
  grouped,
  customerName,
}: {
  message: TicketMessage;
  grouped: boolean;
  customerName: string;
}) {
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
    const textContent = message.text?.trim() || "I'm looking into this for you. An agent has also been notified.";
    return (
      <div className="flex items-end gap-2">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
          <Icon name="bot" size={14} />
        </span>
        <div className="max-w-[80%] rounded-md rounded-bl-[3px] bg-info-soft px-3 py-2">
          <b className="block text-[11px] font-bold text-info">AI assistant</b>
          <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-text">{textContent}</p>
          <InlineAttachments attachments={message.attachments} />
        </div>
      </div>
    );
  }

  if (message.who === "human_agent") {
    return (
      <div className={cn("flex flex-col items-end", grouped && "mt-[-8px]")}>
        {!grouped && <b className="mb-0.5 block text-[11px] font-bold text-white/90">Support team</b>}
        <div className="max-w-[80%] rounded-md rounded-br-[3px] bg-primary px-3 py-2">
          <p className="whitespace-pre-wrap text-[12.5px] text-white">{message.text}</p>
          <InlineAttachments attachments={message.attachments} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-2", grouped && "mt-[-8px]")}>
      {!grouped && <Avatar name={customerName} color={avatarColorFor(customerName)} size="sm" />}
      <div className="max-w-[80%]">
        {!grouped && <b className="mb-0.5 block px-1 text-[11px] font-bold text-text-2">You</b>}
        <div className="rounded-md rounded-bl-[3px] border border-border bg-surface px-3 py-2">
          <p className="whitespace-pre-wrap text-[12.5px] text-text">{message.text}</p>
          <InlineAttachments attachments={message.attachments} />
        </div>
      </div>
    </div>
  );
}
