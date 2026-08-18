"use client";

import { useEffect, useRef, useState } from "react";
import { ensureFreshAccessToken } from "@/lib/api";
import { API_BASE, USE_MOCK, wsEndpoint } from "@/lib/api";
import { subscribeEvents } from "@/lib/mock";
import type { EventBusEnvelope } from "@/lib/types";

export type RealtimeHandler = (event: EventBusEnvelope) => void;

interface UseRealtimeOptions {
  /** Skip connecting (e.g. not signed in). Defaults to true. */
  enabled?: boolean;
}

/**
 * Event-bus client (guide §6.6, §5.9). Opens `WS /ws/events` with the access
 * token and dispatches typed events to the subscribed handlers. When the
 * socket cannot connect (corporate proxies, or mock mode with no WS server)
 * it degrades to polling `GET /api/events?since=<cursor>` every 10s.
 *
 * In mock mode the event bus lives in-process (src/lib/mock), so the socket
 * and polling paths are skipped entirely and subscribers receive pushes the
 * moment a mutation calls emitEvent().
 *
 * Usage — dashboards subscribe once and update state on push, no refetch:
 *   const { connected } = useRealtime({
 *     ticket_updated: (ev) => patchTicket(ev.data.ticket_id),
 *     settings_changed: (ev) => refetchSettings(),
 *   });
 */
export function useRealtime(
  handlers: Record<string, RealtimeHandler>,
  options: UseRealtimeOptions = {},
) {
  const { enabled = true } = options;
  const [connected, setConnected] = useState(false);

  // Keep the latest handlers without forcing a reconnect on every render.
  const handlersRef = useRef(handlers);
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // Mock mode: the emitter and subscribers share one in-process bus.
    if (USE_MOCK) {
      const unsubscribe = subscribeEvents((ev) => {
        cursorRef.current = ev.request_id;
        handlersRef.current[ev.type]?.(ev);
      });
      const t = setTimeout(() => setConnected(true), 0);
      return () => {
        clearTimeout(t);
        unsubscribe();
      };
    }

    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const dispatch = (raw: string) => {
      let ev: EventBusEnvelope;
      try {
        ev = JSON.parse(raw) as EventBusEnvelope;
      } catch {
        return;
      }
      cursorRef.current = ev.request_id;
      handlersRef.current[ev.type]?.(ev);
    };

    const startPolling = () => {
      if (poll) return;
      setConnected(false);
      poll = setInterval(async () => {
        try {
          const res = await fetch(
            `${API_BASE}/events${cursorRef.current ? `?since=${encodeURIComponent(cursorRef.current)}` : ""}`,
          );
          if (!res.ok) return;
          const list = (await res.json()) as EventBusEnvelope[];
          for (const ev of list) {
            cursorRef.current = ev.request_id;
            handlersRef.current[ev.type]?.(ev);
          }
        } catch {
          // keep polling on transient failures
        }
      }, 10_000);
    };

    const open = (token: string | null) => {
      const url = `${wsEndpoint("/ws/events")}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        startPolling();
        return;
      }
      ws = socket;
      socket.onopen = () => setConnected(true);
      socket.onmessage = (m) => dispatch(String(m.data));
      socket.onerror = () => socket.close();
      socket.onclose = (e) => {
        if (ws === socket) ws = null;
        if (disposed) return;
        // Auth rejected (e.g. stale token): refresh once and reconnect.
        if (e.code === 4401 || e.code === 4403 || e.code === 1008) {
          void refreshAndReconnect();
          return;
        }
        startPolling();
      };
    };

    let authRetried = false;
    const refreshAndReconnect = async () => {
      if (authRetried) {
        startPolling();
        return;
      }
      authRetried = true;
      const token = await ensureFreshAccessToken().catch(() => null);
      if (disposed) return;
      if (!token) {
        startPolling();
        return;
      }
      open(token);
    };

    const connect = async () => {
      const token = await ensureFreshAccessToken().catch(() => null);
      if (disposed) return;
      open(token);
    };

    void connect();

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && (!ws || ws.readyState >= WebSocket.CLOSING)) {
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
        void connect();
      }
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && (!ws || ws.readyState >= WebSocket.CLOSING)) {
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
        void connect();
      }
    };

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);

    // Heartbeat keeps proxies from dropping an idle socket.
    const hb = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
    }, 20_000);

    return () => {
      disposed = true;
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
      ws?.close();
      clearInterval(hb);
      if (poll) clearInterval(poll);
    };
  }, [enabled]);

  return { connected };
}
