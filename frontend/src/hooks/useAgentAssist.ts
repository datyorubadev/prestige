"use client";

import { useCallback, useRef, useState } from "react";
import { API_BASE, USE_MOCK } from "@/lib/api";
import { getAccessToken } from "@/lib/auth-store";
import {
  mockAgentAssistApprove,
  mockAgentAssistPending,
  streamAgentAssist,
  type AgentAssistPending,
} from "@/lib/mock";
import type { ChatStreamFrame } from "@/lib/types";

export type { AgentAssistPending };

export interface AgentAssistArgs {
  ticketId: string;
  query: string;
  onToken: (token: string) => void;
  onDone?: (frame: ChatStreamFrame) => void;
}

export interface PendingResponse {
  pending: boolean;
  payload: AgentAssistPending | null;
}

export interface ApproveResponse {
  ok: boolean;
  reply?: string;
  error?: string;
}

/** Staff-side agent assist: streams POST /agent/assist, reads pending
 *  approvals and resolves them via /agent/assist/:ticketId/{pending,approve}.
 *  Frames follow the same SSE contract as the widget (§6.3):
 *    data: {"token": "..."} → streamed chunks
 *    data: {"done": true}   → terminal frame (may carry needs_approval) */
export function useAgentAssist() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    setActive(false);
  }, []);

  const send = useCallback(async (args: AgentAssistArgs): Promise<void> => {
    setActive(true);
    setError(null);
    ctrlRef.current = new AbortController();

    try {
      if (USE_MOCK) {
        for await (const chunk of streamAgentAssist(args.ticketId, args.query)) {
          args.onToken(chunk);
        }
        const frame: ChatStreamFrame = { done: true, response_by: "ai" };
        args.onDone?.(frame);
        return;
      }

      const signal = ctrlRef.current?.signal;
      const res = await fetch(`${API_BASE}/agent/assist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        signal,
        body: JSON.stringify({ ticket_id: args.ticketId, query: args.query }),
      });
      if (!res.ok || !res.body) {
        const env = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(env?.error?.message ?? `Agent assist failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let frame: ChatStreamFrame | undefined;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const raw of frames) {
          if (!raw.startsWith("data: ")) continue;
          const data = JSON.parse(raw.slice(6)) as ChatStreamFrame;
          if (data.token) args.onToken(data.token);
          if (data.done || data.error) frame = data;
        }
      }
      args.onDone?.(frame ?? { done: true });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Agent assist failed");
    } finally {
      setActive(false);
    }
  }, []);

  const fetchPending = useCallback(
    async (ticketId: string): Promise<PendingResponse | null> => {
      if (USE_MOCK) return mockAgentAssistPending(ticketId);
      try {
        const res = await fetch(`${API_BASE}/agent/assist/${ticketId}/pending`, {
          headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
        });
        if (!res.ok) return null;
        return (await res.json()) as PendingResponse;
      } catch {
        return null;
      }
    },
    [],
  );

  const approve = useCallback(
    async (ticketId: string, approved: boolean): Promise<ApproveResponse> => {
      if (USE_MOCK) return mockAgentAssistApprove(ticketId, approved);
      const res = await fetch(`${API_BASE}/agent/assist/${ticketId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        body: JSON.stringify({ payload: { approved } }),
      });
      if (!res.ok) {
        const env = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(env?.error?.message ?? "Approval request failed");
      }
      const body = (await res.json()) as ApproveResponse;
      if (body.ok === false) throw new Error(body.error ?? "Approval request failed");
      return body;
    },
    [],
  );

  return { send, cancel, active, error, fetchPending, approve };
}
