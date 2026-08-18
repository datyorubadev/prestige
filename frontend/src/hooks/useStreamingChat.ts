"use client";

import { useCallback, useRef, useState } from "react";
import { API_BASE, USE_MOCK } from "@/lib/api";
import { streamWidgetReply, widgetApprovalFor } from "@/lib/mock";
import type { ChatStreamFrame } from "@/lib/types";

export interface StreamingChatArgs {
  ticketId: string;
  query: string;
  /** Brand tone for the mock reply engine (professional/casual/pidgin/formal). */
  tone?: string;
  onToken: (token: string) => void;
  onDone?: (frame?: ChatStreamFrame) => void;
  onError?: (message: string) => void;
}

/**
 * AI answers stream over SSE (guide §2.4 + §6.3). Frame contract:
 *   data: {"token": "..."}  → streamed chunks
 *   data: {"done": true}    → terminal frame
 *   data: {"error":{"code","message"}} → error frame
 * In mock mode the transport is the in-process token generator so the widget
 * still demonstrates streaming without a backend.
 */
export function useStreamingChat() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    setActive(false);
  }, []);

  const send = useCallback(async (args: StreamingChatArgs) => {
    setActive(true);
    setError(null);
    ctrlRef.current = new AbortController();

    try {
      if (USE_MOCK) {
        for await (const chunk of streamWidgetReply(args.query, args.tone ?? "professional")) {
          args.onToken(chunk);
        }
        // Mirror the backend interrupt: refund intents register an approval so
        // the widget shows its pending state and staff can act on it live.
        const approval = widgetApprovalFor(args.ticketId, args.query);
        const frame: ChatStreamFrame = approval
          ? { done: true, response_by: "ai", needs_approval: true, approval_payload: approval }
          : { done: true, response_by: "ai" };
        args.onDone?.(frame);
        return frame;
      }

      // Real path — POST /chat (API_BASE already carries /api) over the SSE contract.
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrlRef.current.signal,
        body: JSON.stringify({ ticket_id: args.ticketId, query: args.query }),
      });
      if (!res.ok || !res.body) {
        const env = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(env?.error?.message ?? "Chat stream failed");
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
      return frame ?? { done: true };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { error: { code: "aborted", message: "Stream cancelled" } };
      }
      const message = e instanceof Error ? e.message : "Stream failed";
      setError(message);
      args.onError?.(message);
      return { error: { message } } as ChatStreamFrame;
    } finally {
      setActive(false);
    }
  }, []);

  return { send, active, error, cancel };
}
