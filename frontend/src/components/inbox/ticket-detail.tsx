"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { LabelChip } from "@/components/ui/label-chip";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/lib/auth";
import { api, API_BASE } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-store";
import { useRealtime } from "@/lib/realtime";
import { useUrlState } from "@/lib/use-url-state";
import { fmtDateTime } from "@/lib/time";
import { ConversationPane, type ComposerMode } from "./conversation-pane";
import { ContextRail } from "./context-rail";
import { QuickList } from "./quick-list";
import { ActivityTimeline } from "./activity-timeline";
import { avatarColorFor, channelLabel, cn, isResolved, ticketNumberFor } from "@/lib/utils";
import type {
  AgentUser,
  CannedResponse,
  KnowledgeArticle,
  Label,
  PastTicket,
  Ticket,
  TicketChannel,
  TicketMessage,
  WidgetAttachment,
} from "@/lib/types";

interface TicketDetailProps {
  ticketId: string;
  onBack?: () => void;
  isEmbedded?: boolean;
}

function channelIcon(channel: TicketChannel): string {
  switch (channel) {
    case "chat":    return "send";
    case "email":   return "mail";
    case "portal":  return "inbox";
    case "whatsapp": return "message-circle";
    default:        return "send";
  }
}

function channelColor(channel: TicketChannel): string {
  switch (channel) {
    case "chat":     return "text-primary";
    case "email":    return "text-info";
    case "portal":   return "text-text-3";
    case "whatsapp": return "text-emerald-500";
    default:         return "text-text-3";
  }
}

function presenceDotColor(status?: string): string {
  switch (status) {
    case "online": return "#22c55e";
    case "away":   return "#f59e0b";
    case "busy":   return "#ef4444";
    default:       return "#94a3b8";
  }
}

export function TicketDetail({ ticketId, onBack, isEmbedded = false }: TicketDetailProps) {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const agentName = user?.fullName ?? "Support Agent";

  // Internal active ID — decoupled from URL so quick-list/prev-next
  // swap content without a React route re-render (true SPA).
  const [activeId, setActiveId] = useState(ticketId);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [pastTickets, setPastTickets] = useState<PastTicket[]>([]);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [railOpen, setRailOpen] = useState(true);
  const [queueOpen, setQueueOpen] = useState(true);
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [draft, setDraft] = useState("");
  const [customerTyping, setCustomerTyping] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [viewingAgents, setViewingAgents] = useState<{id: string; name: string}[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Record<string, boolean>>({});
  const [mergeQuery, setMergeQuery] = useState("");
  const [merging, setMerging] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  /** Swap the active ticket without triggering a Next.js route re-render.
   *  Updates internal state + browser URL in one tick, preserving query
   *  params (?panel=activity, ?filter=mine …) across ticket switches. */
  const switchTicket = useCallback((newId: string) => {
    if (newId === activeId) return;
    setActiveId(newId);
    setSwitching(true);
    const qs = window.location.search;
    window.history.replaceState(null, "", `/dashboard/tickets/${newId}${qs}`);
  }, [activeId]);

  const loadTicket = useCallback(async () => {
    if (!activeId) return;
    try {
      const data = await api.get<Ticket>(`/tickets/${encodeURIComponent(activeId)}`);
      setTicket(data);
      setLoading(false);
      setSwitching(false);

      // Load past-tickets separately (non-blocking, secondary panel data).
      if (data.email) {
        api.get<PastTicket[]>(`/customers/past-tickets?email=${encodeURIComponent(data.email)}`)
          .then((past) => setPastTickets(past ?? []))
          .catch(() => {});
      }
    } catch {
      toast("Could not load ticket details", "danger");
      setLoading(false);
      setSwitching(false);
    }
  }, [activeId, toast]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<Ticket[]>("/tickets").catch(() => []),
      api.get<AgentUser[]>("/agents").catch(() => []),
      api.get<CannedResponse[]>("/canned").catch(() => []),
      api.get<Label[]>("/labels").catch(() => []),
      api.get<KnowledgeArticle[]>("/articles").catch(() => []),
    ]).then(([tk, ag, can, lab, art]) => {
      if (!active) return;
      setAllTickets(tk ?? []);
      setAgents(ag ?? []);
      setCanned(can ?? []);
      setLabels(lab ?? []);
      setArticles(art ?? []);
    });
    return () => { active = false; };
  }, []);

  // Close "more" menu on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  // Close activity panel on outside click
  // Activity panel: swaps into the middle pane in place of the chat trail.
  // Persisted via ?panel=activity so it survives navigation/refresh.
  const [panel, setPanel] = useUrlState("panel", "conversation");
  const activityOpen = panel === "activity";
  const toggleActivity = useCallback(() => {
    setPanel(activityOpen ? "conversation" : "activity");
  }, [activityOpen, setPanel]);

  useEffect(() => {
    if (!activityOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel("conversation");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activityOpen, setPanel]);

  // Realtime listeners
  useRealtime(
    {
      ticket_updated: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId)) {
          if (ev.data?.status) {
            setTicket((prev) => (prev ? { ...prev, status: String(ev.data.status) as Ticket["status"] } : null));
          }
        }
      },
      message_created: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId)) {
          const text = String(ev.data?.text ?? "");
          const rawWho = String(ev.data?.who ?? "customer");
          const who: TicketMessage["who"] = rawWho === "agent" ? "human_agent" : rawWho === "ai" ? "ai_bot" : rawWho as TicketMessage["who"];
          const author = ev.data?.author ? String(ev.data.author) : undefined;
          const realMsgId = ev.data?.message_id ? String(ev.data.message_id) : undefined;
          const attachments = Array.isArray(ev.data?.attachments) ? (ev.data.attachments as WidgetAttachment[]) : [];
          const kind = ev.data?.kind === "note" ? "note" as const : undefined;

          if (who === "human_agent" && author === agentName) {
            setTicket((prev) => {
              if (!prev) return null;
              const idx = prev.msgs.findIndex((m) => m.who === "human_agent" && m.text === text && (m.id ?? "").startsWith("agent-"));
              if (idx !== -1) {
                if (realMsgId) {
                  const updated = [...prev.msgs];
                  updated[idx] = { ...updated[idx], id: realMsgId };
                  return { ...prev, msgs: updated };
                }
                return prev;
              }
              const newMsg: TicketMessage = {
                id: realMsgId || `msg-${Date.now()}`,
                who, text, author, kind,
                timestamp: "Just now",
                attachments: attachments.length ? attachments : undefined,
              };
              return { ...prev, msgs: [...prev.msgs, newMsg], preview: text || prev.preview };
            });
            return;
          }

          setTicket((prev) => {
            if (!prev) return null;
            if (prev.msgs.some((m) => m.text === text && m.who === who && (!attachments.length || m.attachments?.length === attachments.length))) {
              return prev;
            }
            const newMsg: TicketMessage = {
              id: realMsgId || `msg-${Date.now()}`,
              who, text, author, kind,
              timestamp: "Just now",
              attachments: attachments.length ? attachments : undefined,
            };
            return { ...prev, msgs: [...prev.msgs, newMsg], preview: text || prev.preview };
          });
        }
      },
      message_updated: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        const mid = String(ev.data?.message_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId) && mid) {
          const newBody = String(ev.data?.body ?? "");
          setTicket((prev) => prev ? {
            ...prev,
            msgs: prev.msgs.map((m) => m.id === mid ? { ...m, text: newBody, edited: true } : m),
          } : null);
        }
      },
      message_deleted: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        const mid = String(ev.data?.message_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId) && mid) {
          setTicket((prev) => prev ? {
            ...prev,
            msgs: prev.msgs.filter((m) => m.id !== mid),
          } : null);
        }
      },
      ticket_escalated: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId)) {
          setTicket((prev) => prev ? { ...prev, status: "escalated" as Ticket["status"] } : null);
          toast("Ticket escalated — awaiting human agent");
        }
      },
      ticket_assigned: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId)) {
          const assignedBy = String(ev.data?.assigned_by_name ?? "Someone");
          toast(`Ticket assigned by ${assignedBy}`);
          void loadTicket();
        }
      },
      agent_approval_pending: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId)) {
          toast("Agent approval requested — review in the conversation", "warning");
        }
      },
      agent_approval_resolved: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId)) {
          const approved = Boolean(ev.data?.approved);
          toast(approved ? "Approval granted — agent resuming" : "Approval denied");
        }
      },
      customer_typing: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (ticket && (tid === ticket.id || tid === activeId)) {
          setCustomerTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setCustomerTyping(false), 3000);
        }
      },
      ticket_presence: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (ticket && tid === ticket.id) {
          const userId = String(ev.data?.user_id ?? "");
          const userName = String(ev.data?.user_name ?? "");
          const action = String(ev.data?.action ?? "");
          if (userId === user?.id) return;
          if (action === "enter") {
            setViewingAgents((prev) => {
              if (prev.some((a) => a.id === userId)) return prev;
              return [...prev, { id: userId, name: userName }];
            });
          } else if (action === "leave") {
            setViewingAgents((prev) => prev.filter((a) => a.id !== userId));
          }
        }
      },
      agent_presence: (ev) => {
        const userId = String(ev.data?.user_id ?? "");
        const online = Boolean(ev.data?.online);
        const presenceStatus = ev.data?.presence_status as string | undefined;
        setAgents((prev) => prev.map((a) => a.id === userId ? { ...a, online, ...(presenceStatus ? { presenceStatus: presenceStatus as AgentUser["presenceStatus"] } : {}) } : a));
      },
    },
    { enabled: Boolean(activeId) },
  );

  const handleSend = async (attachments?: WidgetAttachment[], status?: string) => {
    if (!ticket) return;
    const text = draft.trim();
    if (!text && (!attachments || attachments.length === 0)) return;

    const optimisticMsg: TicketMessage = {
      id: `agent-${Date.now()}`,
      who: composerMode === "note" ? "system" : "human_agent",
      kind: composerMode === "note" ? "note" : undefined,
      author: agentName,
      text,
      timestamp: "Just now",
      attachments: attachments?.length ? attachments : undefined,
    };

    setDraft("");
    setTicket((prev) => (prev ? { ...prev, msgs: [...prev.msgs, optimisticMsg] } : null));

    try {
      if (composerMode === "note") {
        await api.post(`/tickets/${encodeURIComponent(ticket.id)}/messages`, {
          body: text, sender_type: "system", is_read: true, attachments,
        });
        toast("Internal note added");
      } else {
        await api.post(`/tickets/${encodeURIComponent(ticket.id)}/messages`, {
          body: text, sender_type: "human_agent", is_read: true, attachments,
        });
        if (status && status !== ticket.status) {
          await api.patch(`/tickets/${encodeURIComponent(ticket.id)}`, { status });
          setTicket((prev) => (prev ? { ...prev, status: status as Ticket["status"] } : null));
        }
      }
    } catch {
      toast("Failed to send message", "danger");
      setDraft(text);
    }
  };

  const handleResolve = async (id: string) => {
    setTicket((prev) => (prev ? { ...prev, status: "resolved" } : null));
    try {
      await api.patch(`/tickets/${encodeURIComponent(id)}`, { status: "resolved" });
      toast("Ticket marked as resolved");
    } catch {
      toast("Could not update status", "danger");
      void loadTicket();
    }
  };

  const handleReopen = async (id: string) => {
    setTicket((prev) => (prev ? { ...prev, status: "open" } : null));
    try {
      await api.patch(`/tickets/${encodeURIComponent(id)}`, { status: "open" });
      toast("Ticket reopened");
    } catch {
      toast("Could not reopen ticket", "danger");
      void loadTicket();
    }
  };

  const handleAssign = async (id: string, assignee: string | null) => {
    const match = agents.find((a) => a.name === assignee);
    setTicket((prev) => (prev ? { ...prev, assignee: assignee ?? null } : null));
    try {
      await api.patch(`/tickets/${encodeURIComponent(id)}`, { assignee_id: match?.id ?? null });
      toast(assignee ? `Assigned to ${assignee}` : "Unassigned ticket");
    } catch {
      toast("Could not update assignee", "danger");
      void loadTicket();
    }
  };

  const handleEscalate = async (id: string) => {
    setTicket((prev) => (prev ? { ...prev, status: "escalated" } : null));
    try {
      await api.patch(`/tickets/${encodeURIComponent(id)}`, { status: "escalated" });
      toast("Ticket escalated");
    } catch {
      toast("Could not escalate ticket", "danger");
      void loadTicket();
    }
  };

  const handleAssignToMe = async () => {
    if (!ticket || !agentName) return;
    await handleAssign(ticket.id, agentName);
  };

  const handleSnooze = async (id: string, until: string) => {
    setTicket((prev) => (prev ? { ...prev, snoozedUntil: until } : null));
    try {
      await api.post(`/tickets/${encodeURIComponent(id)}/snooze`, { until });
      toast(`Snoozed until ${fmtDateTime(until)}`);
    } catch {
      toast("Could not snooze ticket", "danger");
      void loadTicket();
    }
  };

  const handleUnsnooze = async (id: string) => {
    setTicket((prev) => (prev ? { ...prev, snoozedUntil: undefined } : null));
    try {
      await api.post(`/tickets/${encodeURIComponent(id)}/unsnooze`);
      toast("Ticket unsnoozed");
    } catch {
      toast("Could not unsnooze ticket", "danger");
      void loadTicket();
    }
  };

  // Prev / next navigation
  const currentIndex = useMemo(() => {
    if (!ticket) return -1;
    return allTickets.findIndex((t) => t.id === ticket.id);
  }, [allTickets, ticket]);
  const prevTicket = currentIndex > 0 ? allTickets[currentIndex - 1] : null;
  const nextTicket = currentIndex >= 0 && currentIndex < allTickets.length - 1 ? allTickets[currentIndex + 1] : null;

  // Merge modal: selectable candidates (exclude current + already-merged tickets)
  const mergeCandidates = useMemo(() => {
    const q = mergeQuery.trim().toLowerCase();
    return allTickets
      .filter((t) => t.id !== ticket?.id && !t.mergedIntoId)
      .filter((t) => !q || t.subject.toLowerCase().includes(q) || ticketNumberFor(t).toLowerCase().includes(q));
  }, [allTickets, ticket?.id, mergeQuery]);
  const mergeIds = useMemo(
    () => Object.entries(mergeSelected).filter(([, v]) => v).map(([id]) => id),
    [mergeSelected],
  );

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;
      if (isInput) return;

      switch (e.key.toLowerCase()) {
        case "j": {
          e.preventDefault();
          if (nextTicket) switchTicket(ticketNumberFor(nextTicket));
          break;
        }
        case "k": {
          e.preventDefault();
          if (prevTicket) switchTicket(ticketNumberFor(prevTicket));
          break;
        }
        case "e": {
          e.preventDefault();
          if (ticket && !isResolved(ticket.status)) handleEscalate(ticket.id);
          break;
        }
        case "n": {
          e.preventDefault();
          setComposerMode("note");
          break;
        }
        case "r": {
          e.preventDefault();
          setComposerMode("reply");
          break;
        }
        case "escape": {
          setMoreOpen(false);
          break;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [nextTicket, prevTicket, ticket, activeId]);

  // ── Agent collision / presence ──
  useEffect(() => {
    if (!ticket) return;
    void api.post(`/tickets/${encodeURIComponent(ticket.id)}/presence`, { action: "enter" });
    const handleBeforeUnload = () => {
      // During unload normal fetches are cancelled by the browser ("Failed to
      // fetch"). Use keepalive + fire-and-forget so the leave beacon survives
      // and never produces an unhandled rejection.
      const tok = getAccessToken();
      void fetch(`${API_BASE}/tickets/${encodeURIComponent(ticket.id)}/presence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({ action: "leave" }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      void api.post(`/tickets/${encodeURIComponent(ticket.id)}/presence`, { action: "leave" });
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [ticket?.id]);

  const handleAddNote = async (id: string, text: string, attachments?: WidgetAttachment[]) => {
    try {
      await api.post(`/tickets/${encodeURIComponent(id)}/messages`, {
        body: text, sender_type: "system", attachments,
      });
      const noteMsg: TicketMessage = {
        id: `note-${Date.now()}`, who: "system", kind: "note",
        author: agentName, text, timestamp: "Just now", attachments,
      };
      setTicket((prev) => (prev ? { ...prev, msgs: [...prev.msgs, noteMsg] } : null));
      toast("Note saved");
    } catch {
      toast("Could not save note", "danger");
    }
  };

  const handleEditNote = async (tId: string, nId: string, text: string) => {
    try {
      await api.patch(`/tickets/${encodeURIComponent(tId)}/messages/${encodeURIComponent(nId)}`, { body: text });
      setTicket((prev) => prev ? { ...prev, msgs: prev.msgs.map((m) => (m.id === nId ? { ...m, text } : m)) } : null);
      toast("Note updated");
    } catch {
      toast("Could not edit note", "danger");
    }
  };

  const handleDeleteNote = async (tId: string, nId: string) => {
    try {
      await api.del(`/tickets/${encodeURIComponent(tId)}/messages/${encodeURIComponent(nId)}`);
      setTicket((prev) => prev ? { ...prev, msgs: prev.msgs.filter((m) => m.id !== nId) } : null);
      toast("Note deleted");
    } catch {
      toast("Could not delete note", "danger");
    }
  };

  const handleDeleteMessage = async (tId: string, mId: string) => {
    if (mId.startsWith("agent-") || mId.startsWith("msg-")) {
      setTicket((prev) => prev ? { ...prev, msgs: prev.msgs.filter((m) => m.id !== mId) } : null);
      toast("Message deleted");
      return;
    }
    try {
      await api.del(`/tickets/${encodeURIComponent(tId)}/messages/${encodeURIComponent(mId)}`);
      setTicket((prev) => prev ? { ...prev, msgs: prev.msgs.filter((m) => m.id !== mId) } : null);
      toast("Message deleted");
    } catch {
      toast("Could not delete message", "danger");
    }
  };

  const handleEditMessage = async (tId: string, mId: string, text: string) => {
    try {
      await api.patch(`/tickets/${encodeURIComponent(tId)}/messages/${encodeURIComponent(mId)}`, { body: text });
      setTicket((prev) => prev ? { ...prev, msgs: prev.msgs.map((m) => (m.id === mId ? { ...m, text, edited: true } : m)) } : null);
      toast("Message updated");
    } catch {
      toast("Could not edit message", "danger");
    }
  };

  const handleSetLabels = async (newLabels: string[]) => {
    if (!ticket) return;
    const labelObjs = labels.filter((l) => newLabels.includes(l.name));
    setTicket((prev) => (prev ? { ...prev, labels: newLabels } : null));
    try {
      await api.patch(`/tickets/${encodeURIComponent(ticket.id)}`, { label_ids: labelObjs.map((l) => l.id) });
      toast("Labels updated");
    } catch {
      toast("Could not update labels", "danger");
      void loadTicket();
    }
  };

  const [aiToggling, setAiToggling] = useState(false);
  const handleToggleAi = async () => {
    if (!ticket || aiToggling) return;
    const next = !ticket.aiPaused;
    setAiToggling(true);
    // Optimistic
    setTicket((prev) => (prev ? { ...prev, aiPaused: next } : prev));
    try {
      await api.patch(`/tickets/${encodeURIComponent(ticket.id)}`, { ai_paused: next });
      toast(next ? "AI paused — you own this conversation" : "AI re-enabled");
    } catch {
      setTicket((prev) => (prev ? { ...prev, aiPaused: !next } : prev));
      toast("Could not change AI state", "danger");
    } finally {
      setAiToggling(false);
    }
  };

  const handleMerge = async () => {
    if (!ticket || mergeIds.length === 0) return;
    setMerging(true);
    try {
      await api.post(`/tickets/${encodeURIComponent(ticket.id)}/merge`, { merge_ids: mergeIds });
      toast(`${mergeIds.length} ticket${mergeIds.length > 1 ? "s" : ""} merged`);
      setMergeOpen(false);
      setMergeSelected({});
      setMergeQuery("");
      void loadTicket();
    } catch {
      toast("Could not merge tickets", "danger");
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface p-12">
        <Spinner size={24} />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-text-3">
          <Icon name="ticket" size={24} />
        </div>
        <p className="text-[15px] font-semibold text-text">Ticket not found</p>
        <p className="text-[13px] text-text-3">This ticket may have been deleted or belongs to another workspace.</p>
        <Link
          href="/dashboard/tickets"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark shadow-xs"
        >
          <Icon name="chevron-left" size={14} /> Back to Queue
        </Link>
      </div>
    );
  }

  const resolved = isResolved(ticket.status);
  const slaOverdue = (ticket.sla ?? "").includes("overdue");

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      {/* ── Switching indicator ── */}
      {switching && (
        <div className="absolute inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary/60" />
      )}

      {/* ── Page Header ── */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 bg-surface z-10">
        {/* Back button — larger, distinct from prev/next */}
        <button
          type="button"
          onClick={() => {
            if (onBack) onBack();
            else router.push("/dashboard/tickets");
          }}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-2 transition-colors hover:bg-surface-2 hover:text-text cursor-pointer"
          title="Back to queue"
        >
          <Icon name="chevron-left" size={16} />
        </button>

        {/* Customer avatar */}
        <Avatar
          name={ticket.cust}
          color={avatarColorFor(ticket.cust)}
          size="sm"
          className="shrink-0"
        />

        {/* Ticket info cluster */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Mono ID */}
            <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10.5px] font-bold tabular-nums text-text-3">
              #{ticketNumberFor(ticket)}
            </span>
            {/* Channel icon */}
            <span className={cn("shrink-0", channelColor(ticket.channel))} title={channelLabel(ticket.channel)}>
              <Icon name={channelIcon(ticket.channel)} size={13} />
            </span>
            {/* Subject */}
            <h1 className="min-w-0 truncate text-[14.5px] font-bold text-text">{ticket.subject}</h1>
            {/* Status pill */}
            <Pill
              status={ticket.status}
              tone={
                resolved ? "success" : ticket.status === "escalated" ? "danger" : ticket.status === "in_progress" ? "info" : "warning"
              }
              className="shrink-0"
            />
          </div>
          {/* Meta line + Labels */}
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-3">
            <span className="truncate">{ticket.cust}</span>
            <span>·</span>
            <span className="capitalize">{channelLabel(ticket.channel)}</span>
            <span>·</span>
            <span className="capitalize">{ticket.type}</span>
            <span>·</span>
            <span className={cn("capitalize", ticket.priority === "high" ? "text-danger font-semibold" : "")}>{ticket.priority}</span>
            <span>·</span>
            <span>{ticket.time}</span>
            {ticket.sla && (
              <>
                <span>·</span>
                <span className={cn(slaOverdue ? "text-danger font-semibold" : "text-info")}>{ticket.sla}</span>
              </>
            )}
            {/* Labels */}
            {(ticket.labels ?? []).length > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  {(ticket.labels ?? []).map((l) => (
                    <LabelChip key={l} name={l} labels={labels} />
                  ))}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Prev / Next — smaller than back button */}
          <div className="flex items-center gap-0.5 border-r border-border pr-1.5 mr-0.5">
            <button
              type="button"
              disabled={!prevTicket}
              onClick={() => prevTicket && switchTicket(ticketNumberFor(prevTicket))}
              aria-label="Previous ticket"
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            >
              <Icon name="chevron-right" size={13} className="rotate-180" />
            </button>
            <button
              type="button"
              disabled={!nextTicket}
              onClick={() => nextTicket && switchTicket(ticketNumberFor(nextTicket))}
              aria-label="Next ticket"
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            >
              <Icon name="chevron-right" size={13} />
            </button>
          </div>

          {/* Assign */}
          <Select
            value={ticket.assignee ?? ""}
            onChange={(v) => handleAssign(ticket.id, v || null)}
            placeholder="Assign to…"
            ariaLabel="Assign ticket"
            options={agents.map((a) => ({
              value: a.name,
              label: a.name,
              dotColor: presenceDotColor(a.presenceStatus),
            }))}
            className="w-[130px]"
          />

          {/* Resolve / Reopen */}
          {resolved ? (
            <button
              type="button"
              onClick={() => handleReopen(ticket.id)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-surface-2 hover:text-text cursor-pointer"
            >
              <Icon name="swap" size={13} />
              Reopen
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleResolve(ticket.id)}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-dark cursor-pointer"
            >
              <Icon name="check" size={13} />
              Resolve
            </button>
          )}

          {/* More menu */}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors hover:bg-surface-2 hover:text-text cursor-pointer"
              title="More actions"
            >
              <Icon name="more" size={14} />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
                {!resolved && (
                  <button
                    type="button"
                    onClick={() => { handleEscalate(ticket.id); setMoreOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-text hover:bg-surface-2 cursor-pointer"
                  >
                    <Icon name="alert-triangle" size={13} className="text-danger" />
                    Escalate
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { void handleAssignToMe(); setMoreOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-text hover:bg-surface-2 cursor-pointer"
                >
                  <Icon name="user" size={13} className="text-text-3" />
                  Assign to me
                </button>
                {!resolved && (
                  <button
                    type="button"
                    onClick={() => { setMergeOpen(true); setMoreOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-text hover:bg-surface-2 cursor-pointer"
                  >
                    <Icon name="merge" size={13} className="text-text-3" />
                    Merge ticket
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-border mx-0.5" />

          {/* Activity Timeline toggle — swaps the middle panel */}
          <button
            type="button"
            onClick={toggleActivity}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] font-medium transition-colors cursor-pointer",
              activityOpen ? "border-primary/40 bg-primary/5 text-primary font-semibold" : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text",
            )}
            title={activityOpen ? "Back to conversation" : "Activity timeline"}
          >
            <Icon name="clock" size={13} />
          </button>

          {/* AI on/off — pause the bot once a human takes over */}
          <button
            type="button"
            onClick={handleToggleAi}
            disabled={aiToggling}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] font-medium transition-colors cursor-pointer",
              ticket.aiPaused
                ? "border-border bg-surface text-text-3 hover:bg-surface-2 hover:text-text"
                : "border-primary/40 bg-primary/5 text-primary font-semibold",
            )}
            title={ticket.aiPaused ? "AI is paused — click to re-enable" : "AI is replying — click to pause"}
          >
            <Icon name="bot" size={13} />
            {ticket.aiPaused ? "AI off" : "AI on"}
          </button>

          {/* Toggle Queue */}
          <button
            type="button"
            onClick={() => setQueueOpen((v) => !v)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] font-medium transition-colors cursor-pointer",
              queueOpen ? "border-primary/40 bg-primary/5 text-primary font-semibold" : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text",
            )}
            title="Toggle queue sidebar"
          >
            <Icon name="inbox" size={13} />
          </button>

          {/* Toggle Context Rail */}
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] font-medium transition-colors cursor-pointer",
              railOpen ? "border-primary/40 bg-primary/5 text-primary font-semibold" : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text",
            )}
            title="Toggle context rail"
          >
            <Icon name="grid" size={13} />
          </button>
        </div>
      </header>

      {/* ── Collision Detection Banner ── */}
      {viewingAgents.length > 0 && (
        <div className="flex items-center gap-2 border-b border-info/30 bg-info-soft/30 px-4 py-1.5 text-[11.5px] text-info">
          <Icon name="users" size={12} />
          <span>
            {viewingAgents.map((a) => a.name).join(", ")} {viewingAgents.length === 1 ? "is" : "are"} also viewing this ticket
          </span>
        </div>
      )}

      {/* ── Merge Modal ── */}
      <Modal
        open={mergeOpen}
        onClose={() => { setMergeOpen(false); setMergeSelected({}); setMergeQuery(""); }}
        title="Merge tickets"
        icon="merge"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => { setMergeOpen(false); setMergeSelected({}); }}
              className="rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-surface-2 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMerge}
              disabled={mergeIds.length === 0 || merging}
              className="rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {merging ? "Merging…" : `Merge ${mergeIds.length > 0 ? `${mergeIds.length} ticket${mergeIds.length > 1 ? "s" : ""}` : ""}`}
            </button>
          </>
        }
      >
        <p className="text-[12.5px] text-text-2">
          Select one or more tickets to merge into{" "}
          <span className="font-semibold text-text">#{ticketNumberFor(ticket)}</span>. Their
          messages and labels move here and they are closed as duplicates.
        </p>
        <input
          value={mergeQuery}
          onChange={(e) => setMergeQuery(e.target.value)}
          placeholder="Search tickets by subject or number…"
          aria-label="Search tickets to merge"
          className="mt-3 w-full rounded-sm border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none placeholder:text-text-3 focus:border-primary/50"
        />
        <div className="mt-2 max-h-96 space-y-1 overflow-y-auto pr-1">
          {mergeCandidates.length === 0 && (
            <p className="py-4 text-center text-[12px] text-text-3">No other open tickets found.</p>
          )}
          {mergeCandidates.map((t) => {
            const checked = Boolean(mergeSelected[t.id]);
            return (
              <label
                key={t.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-sm border px-2.5 py-2 transition-colors",
                  checked ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-surface-2",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setMergeSelected((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                  className="h-3.5 w-3.5 shrink-0 accent-primary"
                  aria-label={`Merge ${t.subject}`}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-text">
                  <span className="font-semibold">#{ticketNumberFor(t)}</span>{" "}
                  <span className="text-text-2">{t.subject}</span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-3">{t.status}</span>
              </label>
            );
          })}
        </div>
      </Modal>

      {/* ── Three-Panel Workspace ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Column 1: Queue sidebar */}
        <QuickList
          currentId={ticket.id}
          onSelect={switchTicket}
          open={queueOpen}
          onToggle={() => setQueueOpen((v) => !v)}
        />

        {/* Column 2: Conversation ⇄ Activity (swapped in place) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          {activityOpen ? (
            <>
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
                <div className="flex items-center gap-2">
                  <Icon name="clock" size={14} className="text-primary" />
                  <span className="text-[12px] font-bold text-text">
                    Activity — #{ticketNumberFor(ticket)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleActivity}
                  title="Back to conversation (Esc)"
                  aria-label="Back to conversation"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-surface text-text-3 transition-colors hover:bg-surface-2 hover:text-text cursor-pointer"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                <ActivityTimeline ticketId={ticket.id} />
              </div>
            </>
          ) : (
            <ConversationPane
              ticket={ticket}
              agents={agents}
              canned={canned}
              agentName={agentName}
              mode={composerMode}
              onModeChange={setComposerMode}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
              onResolve={handleResolve}
              onAssign={handleAssign}
              onEditNote={handleEditNote}
              onDeleteNote={handleDeleteNote}
              onDeleteMessage={handleDeleteMessage}
              onEditMessage={handleEditMessage}
              typing={customerTyping}
              labels={labels}
              flat
            />
          )}
        </div>

        {/* Column 3: Context rail */}
        <ContextRail
          ticket={ticket}
          pastTickets={pastTickets}
          articles={articles}
          agents={agents}
          open={railOpen}
          onToggle={() => setRailOpen((v) => !v)}
          onAssign={handleAssign}
          onResolve={handleResolve}
          onEscalate={handleEscalate}
          onReopen={handleReopen}
          onSnooze={handleSnooze}
          onUnsnooze={handleUnsnooze}
          onAddNote={handleAddNote}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
          onUseSuggestion={(text) => {
            setDraft(text);
            setComposerMode("reply");
          }}
          onSetLabels={handleSetLabels}
          labels={labels}
        />
      </div>
    </div>
  );
}
