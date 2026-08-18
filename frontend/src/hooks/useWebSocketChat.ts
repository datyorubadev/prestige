"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { USE_MOCK, ensureFreshAccessToken, wsEndpoint } from "@/lib/api";
import type { WidgetAttachment } from "@/lib/types";

export interface WsChatMessage {
  who: "customer" | "agent" | "system";
  text: string;
  attachments?: WidgetAttachment[];
}

export interface WebSocketChatApi {
  connected: boolean;
  transcript: WsChatMessage[];
  send: (text: string, attachments?: WidgetAttachment[]) => void;
  disconnect: () => void;
  /** True once the human hands the conversation back (resolved) — widget shows CSAT. */
  resolved: boolean;
}

const MOCK_AGENT = "Amaka Okafor";

function agentReply(turn: number): string {
  const replies = [
    "Thanks for waiting — I can see your ticket and I'm on it.",
    "I've checked the account and this was an escalation on our side. Let me sort it.",
    "Done — I've fixed this for you. Your money shows as settled now.",
  ];
  return replies[Math.min(turn, replies.length - 1)];
}

/**
 * Human conversations run over the chat WebSocket (guide §2.4 / §6.4). The
 * real transport is ws://{host}/ws/chat/{ticketId}; in mock mode a simulated
 * agent joins, replies with canned turns, and resolves the ticket so the
 * widget's CSAT prompt appears.
 */
export function useWebSocketChat(ticketId: string): WebSocketChatApi {
  const [connected, setConnected] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [transcript, setTranscript] = useState<WsChatMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const turnRef = useRef(0);

  const push = useCallback((m: WsChatMessage) => {
    setTranscript((prev) => [...prev, m]);
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const send = useCallback(
    (text: string, attachments?: WidgetAttachment[]) => {
      if (!connected || (!text.trim() && !attachments?.length)) return;
      push({ who: "customer", text, attachments });
      if (USE_MOCK) {
        const turn = turnRef.current++;
        const delay = 800 + turn * 450;
        setTimeout(() => {
          if (turn >= 2) {
            push({ who: "agent", text: "All sorted — I've marked this resolved." });
            setResolved(true);
            setConnected(false);
            return;
          }
          push({ who: "agent", text: agentReply(turn) });
        }, delay);
        return;
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "message", text, attachments }),
        );
      }
    },
    [connected, push],
  );

  useEffect(() => {
    turnRef.current = 0;
    let cancelled = false;
    let authRetried = false;

    const open = (token: string | null) => {
      try {
        const base = wsEndpoint(`/ws/chat/${ticketId}`);
        const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
        const socket = new WebSocket(url);
        wsRef.current = socket;
        socket.onopen = () => setConnected(true);
        socket.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data)) as {
              type?: string;
              who?: string;
              text?: string;
              attachments?: WidgetAttachment[];
            };
            if (data.type === "resolved") {
              setResolved(true);
              disconnect();
              return;
            }
            push({
              who: (data.who as WsChatMessage["who"]) ?? "agent",
              text: data.text ?? String(ev.data),
              attachments: data.attachments,
            });
          } catch {
            push({ who: "agent", text: String(ev.data) });
          }
        };
        socket.onclose = (e) => {
          if (cancelled || wsRef.current !== socket) return;
          wsRef.current = null;
          setConnected(false);
          // Auth rejected (stale token): refresh once and reconnect.
          if (e.code === 4401 || e.code === 4403 || e.code === 1008) {
            void retryOnce();
          }
        };
      } catch {
        setConnected(false);
      }
    };

    const retryOnce = async () => {
      if (authRetried || cancelled) return;
      authRetried = true;
      const token = await ensureFreshAccessToken().catch(() => null);
      if (!cancelled) open(token);
    };

    const timer = setTimeout(() => {
      if (!ticketId || !ticketId.trim()) {
        setConnected(false);
        setResolved(false);
        return;
      }
      setResolved(false);
      if (USE_MOCK) {
        push({ who: "system", text: `${MOCK_AGENT} joined the conversation` });
        setConnected(true);
        return;
      }
      void ensureFreshAccessToken()
        .catch(() => null)
        .then((token) => {
          if (cancelled) return;
          open(token);
        });
    }, USE_MOCK ? 600 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  return { connected, transcript, send, disconnect, resolved };
}
