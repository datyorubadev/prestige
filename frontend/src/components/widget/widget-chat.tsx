"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { useWebSocketChat } from "@/hooks/useWebSocketChat";
import { useRealtime } from "@/lib/realtime";
import { Icon } from "@/components/icons";
import { MessageComposer } from "@/components/ui/message-composer";
import { InlineAttachments } from "@/components/ui/attachments";
import type { ChatStreamFrame, Tenant, Ticket, WidgetAttachment, WidgetSendResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WidgetMsg {
  who: "customer" | "ai" | "ai_bot" | "system" | "agent" | "human_agent";
  text: string;
  attachments?: WidgetAttachment[];
}

type PendingApproval = NonNullable<ChatStreamFrame["approval_payload"]>;

type StreamSendResult = WidgetSendResult & { reply?: string; tone?: string };

interface GuestProfile {
  sessionId: string;
  email: string;
  name: string;
  tenantId: string;
}

const QUICK_CHIPS = ["Track my ticket", "Transfer status", "Refund help", "Talk to a human"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEASER_KEY = (id: string) => `prestige_teaser_${id}`;
/** v4.0 trigger rules (§4.5): intent-page teaser needs a scroll, ≥20s, then
 *  4s idle — never on arrival, never before the visitor has scrolled. */
const TEASER_ARM_MS = 20000;
const TEASER_IDLE_MS = 4000;

type Presence = "online" | "away" | "offline";

/** Embedded customer-facing chat widget (design.md §4.5, guide §6.4 v3.2).
 *  AI answers stream over SSE (mock transport in dev); escalations hand off to
 *  the chat WebSocket; resolved conversations offer a 1–5 face CSAT; under
 *  700px the window fills the screen. Presence is truthful: with no agent
 *  online the launcher opens an email-capture form, there is no teaser, and
 *  the header says exactly what's happening (Online / Away / Offline). */
export function WidgetChat({
  tenant,
  email,
  cust,
  presenceOverride,
  positionOverride,
  onToggleOpen,
  isMobileFrame,
  isEmbed,
}: {
  tenant: Tenant;
  email?: string;
  cust?: string;
  presenceOverride?: Presence;
  positionOverride?: "bottom-right" | "bottom-left";
  onToggleOpen?: (open: boolean) => void;
  isMobileFrame?: boolean;
  isEmbed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<WidgetMsg[]>([]);
  const [typing, setTyping] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [humanAssistPending, setHumanAssistPending] = useState(false);
  const [csat, setCsat] = useState<"hidden" | "prompt" | "comment" | "done">("hidden");
  const [mobile, setMobile] = useState(false);
  const isMobileView = !isEmbed && (mobile || isMobileFrame);
  const [offlineEmail, setOfflineEmail] = useState("");
  const [agentName, setAgentName] = useState("Support team");
  const [muted, setMuted] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  /** Reactive agentsOnline count — seeded from the tenant prop, updated via realtime agent_presence events. */
  const [agentsOnline, setAgentsOnline] = useState(tenant.agentsOnline ?? 0);
  // Keep in sync if the parent re-fetches tenant data
  useEffect(() => { setAgentsOnline(tenant.agentsOnline ?? 0); }, [tenant.agentsOnline]);
  const teaserShownRef = useRef(false);
  const aiRepliesRef = useRef(0);
  /** True while an AI turn is in flight (ref — avoids stale-closure gating). */
  const busyRef = useRef(false);
  /** Customer messages that landed while the AI was composing; drained into a
   *  single batched turn once the current reply finishes (rapid-reply batching). */
  const pendingRef = useRef<{ text: string; attachments?: WidgetAttachment[] }[]>([]);
  /** Latest send() for external triggers (quick-action cards) without re-subscribing. */
  const sendRef = useRef<(raw: string, attachments?: WidgetAttachment[]) => Promise<void>>(
    () => Promise.resolve(),
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const stream = useStreamingChat();
  const ws = useWebSocketChat(sessionId ?? "");

  const playChime = useCallback(() => {
    if (muted) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Audio autoplay policy blocked
    }
  }, [muted]);

  useRealtime(
    {
      message_created: (ev) => {
        const text = String(ev.data?.text ?? "");
        let rawWho = String(ev.data?.who ?? "agent");
        if (rawWho === "ai_bot") rawWho = "ai";
        if (rawWho === "human_agent") rawWho = "agent";
        const who = rawWho as WidgetMsg["who"];
        const attachments = Array.isArray(ev.data?.attachments) ? (ev.data.attachments as WidgetAttachment[]) : [];
        if ((!text && !attachments.length) || who === "customer") return;
        setMsgs((prev) => {
          if (prev.some((m) => m.text === text && m.who === who && (!attachments.length || m.attachments?.length === attachments.length))) return prev;
          return [...prev, { who, text, attachments: attachments.length ? attachments : undefined }];
        });
        playChime();
      },
      agent_approval_resolved: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (!sessionId || tid !== sessionId) return;
        setPendingApproval(null);
        if (ev.data?.reply) {
          const reply = String(ev.data.reply);
          setMsgs((prev) => {
            if (prev.some((m) => m.text === reply && m.who === "ai")) return prev;
            return [...prev, { who: "ai", text: reply }];
          });
          playChime();
        }
      },
      human_assist_resolved: (ev) => {
        // A human agent answered a KB-gap question — surface it here as the
        // bot's reply and drop the "waiting on an agent" indicator.
        const tid = String(ev.data?.ticket_id ?? "");
        if (!sessionId || tid !== sessionId) return;
        setHumanAssistPending(false);
        setPendingApproval(null);
        if (ev.data?.reply) {
          const reply = String(ev.data.reply);
          setMsgs((prev) => {
            if (prev.some((m) => m.text === reply && m.who === "ai")) return prev;
            return [...prev, { who: "ai", text: reply }];
          });
          playChime();
        }
      },
      ticket_escalated: (ev) => {
        const tid = String(ev.data?.ticket_id ?? "");
        if (!sessionId || tid !== sessionId) return;
        setHandoff(true);
      },
    },
    { enabled: Boolean(sessionId) },
  );

  // Track agent presence globally — widget needs this even before a chat starts
  useRealtime(
    {
      agent_presence: (ev) => {
        // Backend broadcasts agents_online count; use it directly for accuracy
        const reported = ev.data?.agents_online;
        if (typeof reported === "number") {
          setAgentsOnline(reported);
        } else {
          // Fallback: adjust by ±1
          const online = Boolean(ev.data?.online);
          setAgentsOnline((prev) => Math.max(0, prev + (online ? 1 : -1)));
        }
      },
    },
    { enabled: true },
  );

  // Support external trigger event (e.g. from demo page quick action cards)
  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvt = e as CustomEvent<{ query?: string }>;
      setOpen(true);
      if (customEvt.detail?.query) {
        setTimeout(() => {
          void sendRef.current(customEvt.detail.query!);
        }, 150);
      }
    };
    window.addEventListener("prestige_trigger_widget", handleTrigger);
    return () => window.removeEventListener("prestige_trigger_widget", handleTrigger);
  }, []);

  const resetSession = () => {
    setSessionId(null);
    setMsgs([]);
    setHandoff(false);
    setPendingApproval(null);
    setHumanAssistPending(false);
    setCsat("hidden");
    setOfflineEmail("");
  };

  const msgsRef = useRef(msgs);
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  // HITL resolution poll: while an approval is pending, watch the session's
  // persisted message log for the post-decision AI reply, then append it and
  // drop the pending state (real + mock both serve GET /widget/messages).
  useEffect(() => {
    if (!pendingApproval || !sessionId || handoff) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const res = await api.get<{ messages: { who: string; text: string }[] }>(
            `/widget/messages?ticketId=${encodeURIComponent(sessionId)}`,
          );
          const seen = new Set(
            msgsRef.current.filter((m) => m.who === "ai" || m.who === "ai_bot").map((m) => m.text),
          );
          const unseen = (res.messages ?? [])
            .filter((m) => m.who === "ai" || m.who === "ai_bot")
            .map((m) => m.text)
            .filter((t) => t && !seen.has(t));
          if (unseen.length > 0) {
            setPendingApproval(null);
            setMsgs((prev) => [
              ...prev,
              ...unseen.map((text) => ({ who: "ai" as const, text })),
            ]);
            playChime();
          }
        } catch {
          // transient — keep polling
        }
      })();
    }, 4000);
    return () => clearInterval(timer);
  }, [pendingApproval, sessionId, handoff, playChime]);

  const color = tenant.color;
  const tone = tenant.tone ?? "professional";
  const welcome = tenant.welcomeMessage ?? `Hello! I'm the ${tenant.name} assistant. How can I help you today?`;

  // Throttled "customer is typing" signal (Chatwoot parity) — fires at most
  // every 2.5s once a session/ticket exists, so the agent inbox can render
  // live typing dots without spamming the event bus.
  const lastTypingAt = useRef(0);
  const emitTyping = useCallback(() => {
    if (!sessionId) return;
    const now = Date.now();
    if (now - lastTypingAt.current < 2500) return;
    lastTypingAt.current = now;
    void api.post("/widget/typing", { ticketId: sessionId }).catch(() => {});
  }, [sessionId]);

  // Truthful presence (§4.5): Online when agents are on shift, Away when the
  // tenant has agents but none right now, Offline when the queue is empty.
  const presence: Presence =
    presenceOverride ??
    (agentsOnline > 0 ? "online" : (tenant.agents ?? 0) > 0 ? "away" : "offline");
  const needsEmail = presence !== "online" && !offlineEmail;

  // Guest identity — props win, otherwise the pre-chat profile from /chat or
  // the email captured in offline mode.
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(`prestige_customer_${tenant.id}`);
        if (active && raw) setProfile(JSON.parse(raw) as GuestProfile);
      } catch {
        // corrupt profile — ignore
      }
    }, 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [tenant.id]);
  const identity = {
    email: email ?? offlineEmail ?? profile?.email ?? "guest@example.com",
    cust: cust ?? profile?.name ?? profile?.email?.split("@")[0] ?? "Guest",
  };

  // v4.0 teaser gating: intent pages only — scroll once, ≥20s after that, then
  // 4s idle. Once per session; Dismiss stays dismissed (sessionStorage).
  useEffect(() => {
    if (presence !== "online" || !tenant.proactiveTeaser) return;
    let suppressed = false;
    try {
      suppressed = window.sessionStorage.getItem(TEASER_KEY(tenant.id)) === "1";
    } catch {
      // storage unavailable — still allow one teaser per mount
    }
    if (suppressed) return;

    let scrolled = false;
    let armed = false;
    let idleTimer: number | undefined;
    let armTimer: number | undefined;

    const show = () => {
      if (!armed || teaserShownRef.current) return;
      teaserShownRef.current = true;
      setTeaser(true);
      try {
        window.sessionStorage.setItem(TEASER_KEY(tenant.id), "1");
      } catch {
        // best-effort
      }
    };
    const resetIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(show, TEASER_IDLE_MS);
    };
    const onActivity = () => {
      if (armed) resetIdle();
    };
    const onScroll = () => {
      if (!scrolled) {
        scrolled = true;
        armTimer = window.setTimeout(() => {
          armed = true;
          resetIdle();
        }, TEASER_ARM_MS);
      }
      onActivity();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onScroll, { passive: true });
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onScroll);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.clearTimeout(idleTimer);
      window.clearTimeout(armTimer);
    };
  }, [presence, tenant.id, tenant.proactiveTeaser]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing, ws.transcript, open, csat]);

  // Focus management (§4.5): trap focus inside the open dialog, restore it to
  // the launcher on close.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => closeRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    launcherRef.current?.focus();
  }, [open]);

  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !panel.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  /** Last CSAT rating — reused when the follow-up comment is submitted so the
   *  comment attaches to the same rating via /widget/rating. */
  const ratingRef = useRef(0);

  const rate = useCallback(
    async (n: number) => {
      ratingRef.current = n;
      setCsat("comment");
      if (!sessionId) return;
      try {
        await api.post("/widget/rating", { ticketId: sessionId, rating: n });
      } catch {
        // rating is best-effort
      }
    },
    [sessionId],
  );

  const submitComment = useCallback(
    async (comment: string) => {
      setCsat("done");
      if (!sessionId) return;
      try {
        await api.post("/widget/rating", {
          ticketId: sessionId,
          rating: ratingRef.current,
          comment,
        });
      } catch {
        // comment is best-effort
      }
    },
    [sessionId],
  );

  const ticketMsgs = (ticket: Ticket): WidgetMsg[] =>
    ticket.msgs.map((m) => ({
      who:
        m.who === "customer" ? ("customer" as const) : m.who === "system" ? ("system" as const) : m.who === "human_agent" || m.who === "agent" ? ("agent" as const) : ("ai" as const),
      text: m.text,
      attachments: m.attachments,
    }));

  const send = useCallback(
    async (raw: string, attachments?: WidgetAttachment[]) => {
      const text = raw.trim();
      if ((!text && !attachments?.length) || (handoff && ws.connected)) return;
      if (handoff && ws.connected) {
        ws.send(text, attachments);
        return;
      }

      // The customer's message always appears immediately. If the AI is still
      // composing, the message is queued and answered together with any other
      // rapid follow-ups in one batched turn — nothing gets dropped.
      setMsgs((m) => [...m, { who: "customer", text, attachments }]);
      if (busyRef.current) {
        pendingRef.current.push({ text, attachments });
        return;
      }
      busyRef.current = true;
      setTyping(true);
      try {
        const res = await api.post<StreamSendResult>("/widget/send", {
          tenantId: tenant.id,
          sessionId,
          text,
          email: identity.email,
          cust: identity.cust,
          attachments,
          stream: true,
        });
        setSessionId(res.sessionId);
        aiRepliesRef.current = 0;
        setCsat("hidden");

        if (res.escalated && presence === "online") {
          setAgentName(res.ticket.assignee ?? "Support team");
          setMsgs(ticketMsgs(res.ticket));
          setHandoff(true);
          setTyping(false);
          return;
        }

        if (res.escalated) {
          // Offline/away: never hand a customer to a "connecting" fake — tell
          // the truth and route the request to email instead.
          setMsgs((m) => [
            ...m,
            {
              who: "ai",
              text: `The ${tenant.name} team is offline right now. I've saved your message — we'll reply to ${identity.email} by email as soon as someone's back.`,
            },
          ]);
          setTyping(false);
          return;
        }

        // Stream the AI reply token-by-token (SSE contract, guide §6.3).
        let acc = "";
        let pushedAi = false;
        await stream.send({
          ticketId: res.sessionId,
          sessionId: res.sessionId,
          query: text,
          tone: res.tone ?? tone,
          onToken: (tok) => {
            if (!pushedAi) {
              pushedAi = true;
              setTyping(false);
              acc = tok;
              setMsgs((m) => [...m, { who: "ai", text: acc }]);
              return;
            }
            acc += tok;
            setMsgs((m) => {
              const next = [...m];
              next[next.length - 1] = { who: "ai", text: acc };
              return next;
            });
          },
          onDone: (frame?: ChatStreamFrame) => {
            setTyping(false);
            if (!acc && frame?.ai_paused) {
              // A human agent has taken over this conversation.
              setHandoff(true);
              setHumanAssistPending(false);
              setMsgs((m) => [...m, { who: "system", text: "You're chatting with our support team now." }]);
            }
            if (!acc && frame?.error) {
              // Stream failed (e.g. session rejected) — never leave the
              // customer staring at a vanished typing indicator.
              setMsgs((m) => [
                ...m,
                { who: "ai", text: "Sorry — I couldn't generate a reply just now. Please try again in a moment." },
              ]);
            }
            if (acc) void api.post("/widget/persist", { ticketId: res.sessionId, sessionId: res.sessionId, text: acc }).catch(() => {});
            setPendingApproval(
              frame?.needs_approval && frame.approval_payload
                ? frame.approval_payload
                : null,
            );
            setHumanAssistPending(
              !!frame?.human_assist_pending && !frame?.needs_approval,
            );
            aiRepliesRef.current += 1;
            if (aiRepliesRef.current >= 2 && sessionId) setCsat("prompt");
          },
        });
      } catch {
        setMsgs((m) => [
          ...m,
          { who: "ai", text: "Sorry — something went wrong. Please try again in a moment." },
        ]);
      } finally {
        setTyping(false);
        busyRef.current = false;
        // Drain any rapid follow-ups that arrived while the AI was composing —
        // answer them together as one turn instead of echoing each message.
        const burst = pendingRef.current.splice(0);
        if (burst.length > 0) {
          const batched = burst
            .map((b) => b.text)
            .filter(Boolean)
            .join("\n\n");
          const batchedAttachments = burst.flatMap((b) => b.attachments ?? []);
          void send(batched || "…", batchedAttachments.length ? batchedAttachments : undefined);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenant.id, sessionId, typing, handoff, ws.connected, identity.email, identity.cust, tone, presence],
  );

  // Keep sendRef pointing at the latest send() so external trigger events
  // (quick-action cards) never call a stale closure.
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Once a human hands the conversation back resolved, offer CSAT (guide §6.4
  // step 8) — derived at render so no effect is needed.
  const csatPrompt = csat === "prompt" || csat === "comment" || (csat === "hidden" && ws.resolved);

  const dismissTeaser = () => {
    setTeaser(false);
    teaserShownRef.current = true;
    try {
      window.sessionStorage.setItem(TEASER_KEY(tenant.id), "1");
    } catch {
      // best-effort
    }
  };

  const toggle = () => {
    setTeaser(false);
    setOpen((v) => {
      const next = !v;
      onToggleOpen?.(next);
      return next;
    });
  };

  const chatMsgs = useMemo(() => {
    if (!handoff) return msgs;
    const combined = [...msgs];
    for (const m of ws.transcript) {
      if (!combined.some((c) => c.text === m.text && c.who === m.who)) {
        combined.push(m);
      }
    }
    return combined;
  }, [msgs, ws.transcript, handoff]);

  // Handoff lifecycle: escalated (AI), connecting (waiting for the WS join),
  // then connected (human). Drives the header status + composer affordances.
  const connecting = handoff && !ws.connected && !ws.resolved;

  const stateLine =
    presence === "online" ? (
      <>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-400" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Online · Replies in ~2 mins
      </>
    ) : presence === "away" ? (
      <>
        <span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" />
        Away — replies when back
      </>
    ) : (
      <>
        <span className="h-2 w-2 rounded-full bg-white/50" aria-hidden="true" />
        Offline — reply by email
      </>
    );

  const isLeft = (positionOverride ?? tenant.widgetPosition) === "bottom-left";
  const secColor = tenant.secondaryColor ?? color;

  return (
    <div className={cn("flex flex-col gap-2.5", isLeft ? "items-start" : "items-end", isMobileFrame && "h-full w-full")}>
      {/* Lightbox Modal for Image Attachments */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-label="Image preview"
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-fadeIn"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImage}
              alt="Attachment preview"
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-text shadow-lg hover:bg-surface-2"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      )}

      {teaser && !open && (
        <div
          role="region"
          aria-label="Chat prompt"
          className="relative w-[300px] animate-pop rounded-[16px] border border-border bg-white p-3.5 shadow-2xl"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="sparkles" size={15} />
            </span>
            <p className="text-[12.5px] font-medium leading-snug text-text">
              {tenant.proactiveTeaser ??
                `Need help with transfers or your PIN? Chat with ${tenant.name} — usually replies instantly.`}
            </p>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={dismissTeaser}
              className="rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-sm"
            >
              <Icon name="inbox" size={13} />
              Chat now
            </button>
          </div>
          <span
            aria-hidden="true"
            className={cn(
              "absolute -bottom-[4px] h-2.5 w-2.5 rotate-45 border-b border-r border-border bg-white",
              isLeft ? "left-[26px]" : "right-[26px]",
            )}
          />
        </div>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Chat with ${tenant.name}`}
          onKeyDown={onDialogKeyDown}
          className={cn(
            "flex flex-col overflow-hidden bg-white shadow-2xl transition-all duration-200 border border-border/30",
            isMobileView
              ? isMobileFrame
                ? "absolute inset-0 z-50 h-full w-full rounded-[24px]"
                : "fixed inset-0 z-50 h-[100dvh] w-full rounded-none"
              : "w-[390px] max-w-[calc(100vw-24px)] h-[700px] max-h-[calc(100dvh-80px)] animate-pop rounded-[20px] mb-2",
          )}
        >
          {/* Cover / display image banner (optional, tenant-managed) */}
          {tenant.displayImage && (
            <div className="relative h-24 w-full shrink-0 overflow-hidden bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tenant.displayImage}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {/* Multi-color Gradient Header */}
          <div
            className="flex items-center gap-3 px-4 py-3.5 text-white shadow-xs"
            style={{ background: `linear-gradient(135deg, ${color}, ${secColor})` }}
          >
            <div className="relative shrink-0">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/20 text-[14px] font-bold shadow-inner backdrop-blur-xs">
                {tenant.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tenant.logoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  tenant.botName?.charAt(0) ?? tenant.name.charAt(0)
                )}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold leading-tight tracking-tight">
                {tenant.botName ?? `${tenant.name} Assistant`}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/90 font-medium">
                {connecting ? "connecting to human agent…" : stateLine}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {msgs.length > 0 && (
                <button
                  type="button"
                  onClick={resetSession}
                  title="New conversation"
                  aria-label="New conversation"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/85 transition-colors duration-150 hover:bg-white/20"
                >
                  <Icon name="refresh" size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setMuted((v) => !v)}
                title={muted ? "Unmute sound" : "Mute sound"}
                aria-label={muted ? "Unmute sound" : "Mute sound"}
                className={cn(
                  "flex h-7 w-7 items-center justify-center transition-colors duration-150 rounded-md",
                  muted ? "text-red-200 hover:text-white hover:bg-white/15" : "text-white/80 hover:text-white hover:bg-white/15",
                )}
              >
                <Icon name={muted ? "volume-x" : "volume-2"} size={16} />
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={toggle}
                aria-label="Close chat"
                className="flex h-7 w-7 items-center justify-center rounded-md text-white/85 transition-colors duration-150 hover:bg-white/20"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
          </div>

          <div
            ref={bodyRef}
            className={cn(
              "flex flex-col gap-2.5 overflow-y-auto bg-slate-50/60 p-4",
              mobile ? "min-h-0 flex-1" : "max-h-[600px] min-h-[340px] flex-1",
            )}
          >
            {connecting && (
              <div className="flex items-center gap-1.5 self-center rounded-full bg-primary-soft px-3 py-1 text-[11px] font-semibold text-primary-dark">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Connecting you to {tenant.name}&apos;s team…
              </div>
            )}
            {needsEmail ? (
              <OfflineCapture
                color={color}
                tenantName={tenant.name}
                onSubmit={(addr) => setOfflineEmail(addr)}
              />
            ) : chatMsgs.length === 0 ? (
              <>
                <BotBubble text={welcome} />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => void send(c)}
                      className="rounded-full border border-primary/30 bg-primary-soft/60 px-3 py-1.5 text-[12px] font-medium text-primary-dark transition-all duration-150 hover:border-primary hover:bg-primary-soft"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              chatMsgs
                .filter((m) => !!m.text || (m.attachments && m.attachments.length > 0))
                .map((m, i, arr) => {
                  const prev = arr[i - 1];
                  const grouped = !!prev && prev.who === m.who && m.who !== "system";
                  return <Bubble key={i} m={m} agentName={agentName} grouped={grouped} />;
                })
            )}
            {typing && (
              <div className="flex h-7 items-center gap-1.5 self-start rounded-[14px] rounded-tl-xs border border-border/60 bg-white px-3 py-1.5 shadow-xs animate-fadeIn">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            )}
            {pendingApproval && !handoff && (
              <div className="flex items-center gap-1.5 self-start rounded-md rounded-bl-[3px] border border-warning-border bg-warning-soft px-3 py-2 text-[12px] text-text-2">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-warning" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
                </span>
                <span>One of our team is confirming this — we&apos;ll update you here.</span>
              </div>
            )}
            {humanAssistPending && !handoff && !pendingApproval && (
              <div className="flex items-center gap-1.5 self-start rounded-md rounded-bl-[3px] border border-primary-border bg-primary-soft px-3 py-2 text-[12px] text-text-2">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <span>Checking with my team — I&apos;ll be right back with an answer.</span>
              </div>
            )}
            {csatPrompt && (
              <CsatRating
                rated={false}
                onRate={(n) => void rate(n)}
                commentMode={csat === "comment"}
                onComment={(c) => void submitComment(c)}
                onSkipComment={() => setCsat("done")}
              />
            )}
            {csat === "done" && <CsatRating rated onRate={() => {}} />}
          </div>

          <div className="border-t border-border bg-white p-3">
            {needsEmail ? (
              <p className="text-center text-[10px] text-text-3">
                Powered by Prestige AI — {tenant.name}
              </p>
            ) : (
              <>
                <WidgetInput
                  onSend={(t, atts) => void send(t, atts)}
                  onTyping={emitTyping}
                  disabled={connecting}
                  placeholder={
                    presence === "online"
                      ? connecting
                        ? "Connecting you to a human…"
                        : handoff && ws.connected
                          ? `Reply to ${agentName}…`
                          : "Type a message…"
                      : "We'll reply to your email — leave a message…"
                  }
                />
                <p className="mt-1.5 text-center text-[10px] text-text-3">
                  Powered by Prestige AI — {tenant.name}
                </p>
              </>
            )}
          </div>

          {/* Live region: announces only the newest message (§4.5 a11y). */}
          <span className="sr-only" aria-live="polite">
            {chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1].text : ""}
          </span>
        </div>
      )}

      {/* Floating Launcher Button — always visible at bottom, switches to 'close' icon when open */}
      <button
        ref={launcherRef}
        type="button"
        onClick={toggle}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        className={cn(
          "flex h-13 w-13 items-center justify-center rounded-full text-white transition-transform duration-150 hover:scale-[1.07] shadow-2xl shrink-0 cursor-pointer",
          presence === "online" && !open && "animate-launcher-ring",
        )}
        style={{ backgroundColor: color }}
      >
        <Icon name={open ? "close" : "inbox"} size={22} />
      </button>
    </div>
  );
}

function RichTextContent({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bulletGroup: string[] = [];

  const flushBullets = () => {
    if (bulletGroup.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-1 flex flex-col gap-1 pl-4 list-disc text-left">
          {bulletGroup.map((item, idx) => (
            <li key={idx} className="leading-snug">
              {formatInlineText(item)}
            </li>
          ))}
        </ul>,
      );
      bulletGroup = [];
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      bulletGroup.push(trimmed.slice(2));
    } else {
      flushBullets();
      if (trimmed) {
        blocks.push(
          <p key={i} className="my-0.5 leading-snug">
            {formatInlineText(line)}
          </p>,
        );
      }
    }
  });
  flushBullets();

  return <div className="space-y-1 text-left">{blocks}</div>;
}

function formatInlineText(text: string): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-primary-dark"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:text-primary-dark"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

function Bubble({
  m,
  agentName,
  grouped,
  onImageClick,
}: {
  m: WidgetMsg;
  agentName: string;
  grouped: boolean;
  onImageClick?: (url: string) => void;
}) {
  if (m.who === "system") {
    return (
      <div className="flex items-center gap-1.5 self-center rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-semibold text-text-2 shadow-2xs">
        <Icon name="zap" size={12} className="text-warning-dark" />
        {m.text}
      </div>
    );
  }
  if (m.who === "agent" || m.who === "human_agent") {
    return (
      <div className={cn("flex max-w-[88%] flex-col gap-1 self-start", grouped && "mt-[-6px]")}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-3 pl-1">{agentName}</p>
        <div className="flex flex-col rounded-[18px] rounded-tl-xs bg-info-soft px-3.5 py-2.5 text-[12.5px] leading-snug text-text shadow-xs">
          <span className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold text-info">
            <Icon name="info" size={13} />
            Human agent
          </span>
          {m.text && <RichTextContent text={m.text} />}
          <InlineAttachments attachments={m.attachments} onImageClick={onImageClick} />
        </div>
      </div>
    );
  }
  if (m.who === "ai" || m.who === "ai_bot") {
    return <BotBubble text={m.text} attachments={m.attachments} onImageClick={onImageClick} />;
  }
  return (
    <div
      className={cn(
        "flex max-w-[88%] flex-col self-end rounded-[18px] rounded-tr-xs bg-primary px-3.5 py-2.5 text-[12.5px] leading-snug text-white shadow-xs",
        grouped && "mt-[-6px]",
      )}
    >
      {m.text && <span>{m.text}</span>}
      <InlineAttachments attachments={m.attachments} onImageClick={onImageClick} />
    </div>
  );
}

function BotBubble({
  text,
  attachments,
  onImageClick,
}: {
  text: string;
  attachments?: WidgetAttachment[];
  onImageClick?: (url: string) => void;
}) {
  return (
    <div className="flex max-w-[88%] flex-col self-start rounded-[18px] rounded-tl-xs bg-white px-3.5 py-2.5 text-[12.5px] leading-relaxed text-text shadow-xs transition-all duration-200 animate-fadeIn">
      {text && <RichTextContent text={text} />}
      <InlineAttachments attachments={attachments} onImageClick={onImageClick} />
    </div>
  );
}

function OfflineCapture({
  color,
  tenantName,
  onSubmit,
}: {
  color: string;
  tenantName: string;
  onSubmit: (email: string) => void;
}) {
  const [value, setValue] = useState("");
  const valid = EMAIL_RE.test(value.trim());
  return (
    <div className="flex flex-col h-full justify-between gap-3 min-h-[220px]">
      <BotBubble text="We're offline right now — leave your email and we'll reply by email." />
      <form
        className="mt-auto flex flex-col gap-2 rounded-[18px] border border-border bg-white p-3.5 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(value.trim());
        }}
      >
        <div className="relative flex items-center h-10 rounded-full border border-border bg-surface px-3 focus-within:border-primary-border">
          <Icon name="mail" size={15} className="mr-2 text-text-3 shrink-0" />
          <input
            type="email"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email for the reply"
            className="w-full bg-transparent text-[12.5px] text-text placeholder:text-text-3 outline-none focus:outline-none focus:ring-0 border-0 shadow-none p-0"
            style={{ outline: "none", boxShadow: "none" }}
          />
        </div>
        <button
          type="submit"
          disabled={!valid}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
          style={{ backgroundColor: color }}
        >
          <Icon name="send" size={14} />
          Send {tenantName} my email
        </button>
      </form>
    </div>
  );
}

/** v4.0 CSAT — 5-face scale on resolution (§4.5). Faces rest muted and pop to
 *  full colour on hover; after rating, an optional comment collects qualitative
 *  feedback (persisted on the ticket). */
function CsatRating({
  rated,
  onRate,
  commentMode,
  onComment,
  onSkipComment,
}: {
  rated: boolean;
  onRate: (n: number) => void;
  commentMode?: boolean;
  onComment?: (comment: string) => void;
  onSkipComment?: () => void;
}) {
  const [hover, setHover] = useState(0);
  const [value, setValue] = useState("");
  const FACES = ["😞", "😕", "😐", "🙂", "😍"];
  const LABELS = [
    "Very dissatisfied",
    "Dissatisfied",
    "Neutral",
    "Satisfied",
    "Very satisfied",
  ];
  return (
    <div
      className={cn(
        "self-center rounded-[11px] px-3.5 py-2.5 text-[12px]",
        rated
          ? "flex items-center gap-1.5 border border-border bg-surface-2 text-text-2"
          : "bg-primary-soft",
        commentMode && "w-full max-w-[280px]",
      )}
      aria-live="polite"
    >
      {commentMode ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onComment?.(value.trim());
            else onSkipComment?.();
          }}
        >
          <b className="text-text">Anything we could improve?</b>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Optional — tell us more…"
            className="mt-1.5 w-full resize-none rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] text-text placeholder:text-text-3 focus:border-primary focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onSkipComment}
              className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-text-3 transition-colors duration-150 hover:text-text"
            >
              Skip
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-[11.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-sm"
            >
              Send
            </button>
          </div>
        </form>
      ) : rated ? (
        <>
          <Icon name="check" size={14} className="text-primary" />
          Thanks for your feedback.
        </>
      ) : (
        <>
          <b className="text-text">How did we do?</b>
          <div className="mt-1.5 flex items-center justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
            {FACES.map((face, i) => {
              const n = i + 1;
              return (
                <button
                  key={face}
                  type="button"
                  aria-label={LABELS[i]}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => onRate(n)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center text-[20px] leading-none transition-all duration-100 rounded-full",
                    n <= hover
                      ? "scale-110 opacity-100 grayscale-0 bg-white shadow-xs"
                      : "opacity-60 grayscale hover:opacity-100 hover:grayscale-0 hover:bg-white/50",
                  )}
                >
                  {face}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** v3.3 composer — auto-growing pill textarea, paperclip attachments with
 *  preview chips, emoji popover, and a 32px circular send button. */
function WidgetInput({
  onSend,
  onTyping,
  disabled,
  placeholder,
}: {
  onSend: (text: string, attachments?: WidgetAttachment[]) => void;
  onTyping?: () => void;
  disabled: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<WidgetAttachment[]>([]);

  const submit = (text = value, atts?: WidgetAttachment[]) => {
    if ((!text.trim() && (atts ?? attachments).length === 0) || disabled) return;
    onSend(text, atts);
    setValue("");
    setAttachments([]);
  };

  return (
    <MessageComposer
      variant="pill"
      value={value}
      onChange={(v) => {
        setValue(v);
        onTyping?.();
      }}
      onSend={(atts) => submit(value, atts)}
      placeholder={placeholder}
      disabled={disabled}
      ariaLabel="Message"
    />
  );
}
