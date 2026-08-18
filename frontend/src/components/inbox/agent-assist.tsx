"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import {
  useAgentAssist,
  type AgentAssistPending,
} from "@/hooks/useAgentAssist";
import { useRealtime } from "@/lib/realtime";
import type { ChatStreamFrame } from "@/lib/types";
import { cn } from "@/lib/utils";

const MICRO = "text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-3";

/** Strips a "Here's a draft:" framing (and surrounding quotes) so "Use in
 *  reply" pastes just the message body into the composer. */
function stripDraftPrefix(text: string): string {
  const m = text.match(/^Here's a draft:\s*([\s\S]+)$/);
  if (!m) return text;
  return m[1].replace(/^["“']|["”']$/g, "").trim();
}

interface AssistTurn {
  role: "staff" | "ai";
  text: string;
}

interface AgentAssistPanelProps {
  ticketId: string;
  onUseSuggestion: (text: string) => void;
}

/** Agent assist panel in the rail's Assist tab — staff can talk to the
 *  agent AI, and approve/decline the human-in-the-loop actions it flags. */
export function AgentAssistPanel({ ticketId, onUseSuggestion }: AgentAssistPanelProps) {
  const { send, active, error, fetchPending, approve } = useAgentAssist();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<AssistTurn[]>([]);
  const [pending, setPending] = useState<AgentAssistPending | null>(null);
  const [working, setWorking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const refreshPending = useCallback(async () => {
    const res = await fetchPending(ticketId);
    setPending(res?.pending ? (res.payload ?? null) : null);
  }, [ticketId, fetchPending]);

  useEffect(() => {
    fetchPending(ticketId).then((res) => {
      setPending(res?.pending ? (res.payload ?? null) : null);
    });
  }, [ticketId, fetchPending]);

  // Live HITL loop: refresh when the widget AI flags an approval on this
  // ticket (or another agent resolves it) — no refetch or page reload.
  useRealtime({
    agent_approval_pending: (ev) => {
      if (ev.data?.ticket_id === ticketId) void refreshPending();
    },
    agent_approval_resolved: (ev) => {
      if (ev.data?.ticket_id === ticketId) void refreshPending();
    },
  });

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, active]);

  const submit = useCallback(async () => {
    const q = draft.trim();
    if (!q || active) return;
    setDraft("");
    setTurns((prev) => [...prev, { role: "staff", text: q }]);
    await send({
      ticketId,
      query: q,
      onToken: (token) => {
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "ai") {
            next[next.length - 1] = { role: "ai", text: last.text + token };
          } else {
            next.push({ role: "ai", text: token });
          }
          return next;
        });
      },
      onDone: (frame?: ChatStreamFrame) => {
        if (frame?.needs_approval && frame.approval_payload) {
          setPending(frame.approval_payload as AgentAssistPending);
        } else {
          void refreshPending();
        }
      },
    });
  }, [draft, active, ticketId, send, refreshPending]);

  const decide = useCallback(
    async (approved: boolean) => {
      setWorking(true);
      try {
        const res = await approve(ticketId, approved);
        const reply = res?.reply;
        if (reply) {
          setTurns((prev) => [...prev, { role: "ai", text: reply }]);
        }
        setPending(null);
        void refreshPending();
      } finally {
        setWorking(false);
      }
    },
    [ticketId, approve, refreshPending],
  );

  const hasAiTurn = turns.some((t) => t.role === "ai");

  return (
    <div className="border-b border-border px-4 pt-4">
      <div className="flex items-center justify-between">
        <p className={MICRO}>Agent assist</p>
        {active && (
          <span className="flex items-center gap-1 text-[10.5px] font-semibold text-primary-dark">
            <Icon name="sparkles" size={11} className="animate-pulse" />
            Thinking…
          </span>
        )}
      </div>

      {pending && (
        <div className="mt-2 rounded-md border border-warning-border bg-warning-soft px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-warning">
            Approval needed
          </p>
          <p className="mt-1 text-[12px] font-semibold text-text">
            {pending.prompt ?? "Approve this action?"}
          </p>
          {pending.type && (
            <p className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-warning">
              {pending.type}
            </p>
          )}
          {pending.customer_reply && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-text-2">
              Told the customer: “{pending.customer_reply}”
            </p>
          )}
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => void decide(true)}
              disabled={working}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:opacity-50"
            >
              <Icon name="check" size={12} />
              Approve
            </button>
            <button
              type="button"
              onClick={() => void decide(false)}
              disabled={working}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-sm border border-danger-border px-2.5 py-1.5 text-[11.5px] font-semibold text-danger transition-colors duration-150 hover:bg-danger-soft disabled:opacity-50"
            >
              <Icon name="close" size={12} />
              Decline
            </button>
          </div>
        </div>
      )}

      <div
        ref={logRef}
        className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-0.5"
      >
        {turns.length === 0 && !active ? (
          <p className="text-[12px] leading-relaxed text-text-3">
            Ask the AI agent to draft a reply, check status, or escalate — and
            approve what it can’t do alone.
          </p>
        ) : null}
        {turns.map((t, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[92%] rounded-md px-2.5 py-1.5 text-[12px] leading-snug",
              t.role === "staff"
                ? "ml-auto bg-primary-soft text-text"
                : "bg-surface-2 text-text-2",
            )}
          >
            <p className="whitespace-pre-wrap">{t.text}</p>
            {t.role === "ai" && i === turns.length - 1 && !active && (
              <button
                type="button"
                onClick={() => onUseSuggestion(stripDraftPrefix(t.text))}
                className="mt-1.5 inline-flex items-center gap-1 rounded-sm border border-primary-border px-2 py-0.5 text-[10.5px] font-semibold text-primary-dark transition-colors duration-150 hover:bg-primary-soft"
              >
                <Icon name="copy" size={11} />
                Use in reply
              </button>
            )}
          </div>
        ))}
        {active && !hasAiTurn && (
          <div className="flex items-center gap-1 text-[11px] text-text-3">
            <Icon name="sparkles" size={11} className="animate-pulse" />
            <span>Assistant is replying…</span>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-[11.5px] text-danger">{error}</p>}

      <div className="mt-2 flex items-center gap-1.5 pb-4">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Ask the AI agent"
          placeholder="Ask the AI agent…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          className="input-control flex-1 py-1.5 text-[12.5px]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!draft.trim() || active}
          aria-label="Ask the AI agent"
          title="Ask the AI agent"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-sm bg-primary text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="sparkles" size={14} />
        </button>
      </div>
    </div>
  );
}
