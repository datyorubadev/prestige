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
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sharedConnected = false;
let sharedDisposed = false;
let lastAuthRetry = 0;
let reconnectDelay = 1_000;
const subscribers = new Map<number, Record<string, RealtimeHandler>>();
let nextId = 1;
let cursorRef: string | null = null;
const connectionListeners = new Set<(connected: boolean) => void>();

const AUTH_RETRY_COOLDOWN = 2_000;

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
      const token = await ensureFreshAccessToken().catch(() => null);
      const res = await fetch(
        `${API_BASE}/events${cursorRef ? `?since=${encodeURIComponent(cursorRef)}` : ""}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
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
  }, 3_000);
}

function stopPolling() {
  if (sharedPoll) {
    clearInterval(sharedPoll);
    sharedPoll = null;
  }
}

function openSocket(token: string | null) {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (cursorRef) params.set("since", cursorRef);
  const qs = params.toString();
  const url = `${wsEndpoint("/ws/events")}${qs ? `?${qs}` : ""}`;
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    startPolling();
    scheduleReconnect();
    return;
  }
  sharedSocket = socket;
  socket.onopen = () => {
    reconnectDelay = 1_000; // healthy again
    stopPolling(); // live socket wins; polling was only a bridge
    setConnected(true);
  };
  socket.onmessage = (m) => dispatch(String(m.data));
  socket.onerror = () => socket.close();
  socket.onclose = (e) => {
    if (sharedSocket === socket) sharedSocket = null;
    if (sharedDisposed) return;
    setConnected(false);
    // Poll as a bridge while we work to restore the socket.
    startPolling();
    const authFailure = e.code === 4401 || e.code === 4403 || e.code === 1008;
    if (authFailure && Date.now() - lastAuthRetry > AUTH_RETRY_COOLDOWN) {
      lastAuthRetry = Date.now();
      void (async () => {
        const fresh = await ensureFreshAccessToken().catch(() => null);
        if (!sharedDisposed) reopen(fresh);
      })();
      return;
    }
    scheduleReconnect();
  };
}

/** Re-open the WebSocket after `reconnectDelay` ms with capped backoff. */
function scheduleReconnect() {
  if (sharedDisposed || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (sharedDisposed || subscribers.size === 0) return;
    void (async () => {
      const token = await ensureFreshAccessToken().catch(() => null);
      if (!sharedDisposed) reopen(token);
    })();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
}

function reopen(token: string | null) {
  if (sharedSocket && sharedSocket.readyState <= WebSocket.OPEN) return;
  openSocket(token);
}

function ensureConnection() {
  if (sharedDisposed) return;
  if (subscribers.size === 0) return; // no subscribers, don't connect
  if (sharedSocket && sharedSocket.readyState <= WebSocket.OPEN) return; // open/opening
  if (reconnectTimer) return; // reconnect already scheduled

  void (async () => {
    const token = await ensureFreshAccessToken().catch(() => null);
    if (sharedDisposed || subscribers.size === 0) return;
    if (sharedSocket && sharedSocket.readyState <= WebSocket.OPEN) return;
    openSocket(token); // polling starts automatically if it fails
  })();
}

function teardownIfIdle() {
  if (subscribers.size > 0) return;
  sharedDisposed = true;
  sharedSocket?.close();
  sharedSocket = null;
  stopPolling();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
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
