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

/* ── Singleton WebSocket manager ─────────────────────────────────────
 *  One shared connection for the entire app. Individual useRealtime
 *  calls subscribe/unsubscribe from this bus instead of opening their
 *  own connections. This eliminates 4-5 redundant WS handshakes and
 *  token-refresh calls per page load. */

let sharedSocket: WebSocket | null = null;
let sharedPoll: ReturnType<typeof setInterval> | null = null;
let sharedConnected = false;
let sharedDisposed = false;
let authRetried = false;
const subscribers = new Map<number, Record<string, RealtimeHandler>>();
let nextId = 1;
let cursorRef: string | null = null;
const connectionListeners = new Set<(connected: boolean) => void>();

function setConnected(v: boolean) {
  sharedConnected = v;
  for (const fn of connectionListeners) fn(v);
}

function dispatch(raw: string) {
  let ev: EventBusEnvelope;
  try {
    ev = JSON.parse(raw) as EventBusEnvelope;
  } catch {
    return;
  }
  cursorRef = ev.request_id;
  for (const [, handlers] of subscribers) {
    handlers[ev.type]?.(ev);
  }
}

function startPolling() {
  if (sharedPoll) return;
  setConnected(false);
  sharedPoll = setInterval(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/events${cursorRef ? `?since=${encodeURIComponent(cursorRef)}` : ""}`,
      );
      if (!res.ok) return;
      const list = (await res.json()) as EventBusEnvelope[];
      for (const ev of list) {
        cursorRef = ev.request_id;
        for (const [, handlers] of subscribers) {
          handlers[ev.type]?.(ev);
        }
      }
    } catch {
      // keep polling on transient failures
    }
  }, 10_000);
}

function openSocket(token: string | null) {
  const url = `${wsEndpoint("/ws/events")}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    startPolling();
    return;
  }
  sharedSocket = socket;
  socket.onopen = () => setConnected(true);
  socket.onmessage = (m) => dispatch(String(m.data));
  socket.onerror = () => socket.close();
  socket.onclose = (e) => {
    if (sharedSocket === socket) sharedSocket = null;
    if (sharedDisposed) return;
    if (e.code === 4401 || e.code === 4403 || e.code === 1008) {
      void refreshAndReconnect();
      return;
    }
    startPolling();
  };
}

const refreshAndReconnect = async () => {
  if (authRetried) {
    startPolling();
    return;
  }
  authRetried = true;
  const token = await ensureFreshAccessToken().catch(() => null);
  if (sharedDisposed) return;
  if (!token) {
    startPolling();
    return;
  }
  openSocket(token);
};

function ensureConnection() {
  if (sharedDisposed) return;
  if (subscribers.size === 0) return; // no subscribers, don't connect
  if (sharedSocket && sharedSocket.readyState < WebSocket.CLOSING) return; // already open/opening
  if (sharedPoll) return; // already polling

  void (async () => {
    const token = await ensureFreshAccessToken().catch(() => null);
    if (sharedDisposed || subscribers.size === 0) return;
    openSocket(token);
  })();
}

function teardownIfIdle() {
  if (subscribers.size > 0) return;
  sharedDisposed = true;
  sharedSocket?.close();
  sharedSocket = null;
  if (sharedPoll) {
    clearInterval(sharedPoll);
    sharedPoll = null;
  }
  setConnected(false);
}

// Heartbeat keeps proxies from dropping an idle socket.
let hbInterval: ReturnType<typeof setInterval> | null = null;
function ensureHeartbeat() {
  if (hbInterval) return;
  hbInterval = setInterval(() => {
    if (sharedSocket?.readyState === WebSocket.OPEN) sharedSocket.send("ping");
  }, 20_000);
}

/* ── useRealtime hook ─────────────────────────────────────────────── */

export function useRealtime(
  handlers: Record<string, RealtimeHandler>,
  options: UseRealtimeOptions = {},
) {
  const { enabled = true } = options;
  const [connected, setLocalConnected] = useState(sharedConnected);

  const handlersRef = useRef(handlers);
  const idRef = useRef<number>(0);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // Mock mode: in-process bus (unchanged).
    if (USE_MOCK) {
      const unsubscribe = subscribeEvents((ev) => {
        cursorRef = ev.request_id;
        handlersRef.current[ev.type]?.(ev);
      });
      const t = setTimeout(() => setLocalConnected(true), 0);
      return () => {
        clearTimeout(t);
        unsubscribe();
      };
    }

    // Register this subscriber
    const id = nextId++;
    idRef.current = id;
    subscribers.set(id, handlersRef.current);

    // Wire up connection state listener
    const onConnect = (v: boolean) => setLocalConnected(v);
    connectionListeners.add(onConnect);

    // Ensure singleton connection is running
    sharedDisposed = false;
    ensureConnection();
    ensureHeartbeat();

    return () => {
      subscribers.delete(id);
      connectionListeners.delete(onConnect);
      teardownIfIdle();
    };
  }, [enabled]);

  // Re-register handlers when they change (no reconnect needed)
  useEffect(() => {
    if (idRef.current) {
      subscribers.set(idRef.current, handlers);
    }
  }, [handlers]);

  return { connected };
}
