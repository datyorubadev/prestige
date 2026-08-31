import type { SessionUser } from "@/lib/types";
import { setTenantTimezone } from "@/lib/time";

/**
 * Module-level session store shared by the auth provider (src/lib/auth.tsx)
 * and the API client (src/lib/api.ts). Mock mode keeps the "token" in memory;
 * real mode will store the JWT here too.
 */

const TOKEN_KEY = "prestige_token";
const REFRESH_KEY = "prestige_refresh_token";
const USER_KEY = "prestige_session_user";
const REAL_TOKEN_KEY = "prestige_real_token";
const REAL_REFRESH_KEY = "prestige_real_refresh_token";
const REAL_USER_KEY = "prestige_real_user";
const IMPERSONATION_KEY = "prestige_impersonating";

/** Cookie mirrors the token so src/middleware.ts can bounce unauthenticated
 *  requests server-side. Mock mode stores the real session in localStorage;
 *  the cookie is a lightweight presence signal for route guards. */
const TOKEN_COOKIE = "prestige_token";

type Listener = () => void;
const listeners = new Set<Listener>();

let accessToken: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
let refreshToken: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem(REFRESH_KEY) : null;
let sessionUser: SessionUser | null =
  typeof window !== "undefined" ? readUserFromStorage() : null;

// Sync the tenant timezone formatter with whatever session is restored.
if (typeof window !== "undefined" && sessionUser) {
  setTenantTimezone(sessionUser.timezone);
}

function readUserFromStorage(): SessionUser | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string, days = 7): void {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;
}

function removeCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribe for useSyncExternalStore. Returns an unsubscribe function. */
export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setRefreshToken(token: string | null): void {
  refreshToken = token;
  if (typeof window !== "undefined") {
    if (token) window.localStorage.setItem(REFRESH_KEY, token);
    else window.localStorage.removeItem(REFRESH_KEY);
  }
}

export function getSessionUser(): SessionUser | null {
  return sessionUser;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
      setCookie(TOKEN_COOKIE, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
      removeCookie(TOKEN_COOKIE);
    }
  }
}

export function setSessionUser(user: SessionUser | null): void {
  sessionUser = user;
  setTenantTimezone(user?.timezone);
  if (typeof window !== "undefined") {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  }
  emit();
}

export function saveImpersonation(data: { tenantId: string; label: string } | null): void {
  if (typeof window === "undefined") return;
  if (data) window.localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(data));
  else window.localStorage.removeItem(IMPERSONATION_KEY);
}

export function getImpersonationFromStorage(): { tenantId: string; label: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IMPERSONATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  setAccessToken(null);
  setRefreshToken(null);
  setSessionUser(null);
  saveImpersonation(null);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(REAL_TOKEN_KEY);
    window.localStorage.removeItem(REAL_REFRESH_KEY);
    window.localStorage.removeItem(REAL_USER_KEY);
  }
}

/** Impersonation support: stash the real (super-admin) session so it can be
 *  restored when the tenant-scoped impersonation token expires or is left. */
export function saveRealSession(): void {
  if (typeof window === "undefined") return;
  if (accessToken) window.localStorage.setItem(REAL_TOKEN_KEY, accessToken);
  if (refreshToken) window.localStorage.setItem(REAL_REFRESH_KEY, refreshToken);
  if (sessionUser) window.localStorage.setItem(REAL_USER_KEY, JSON.stringify(sessionUser));
}

export function restoreRealSession(): boolean {
  if (typeof window === "undefined") return false;
  const token = window.localStorage.getItem(REAL_TOKEN_KEY);
  const refresh = window.localStorage.getItem(REAL_REFRESH_KEY);
  const rawUser = window.localStorage.getItem(REAL_USER_KEY);
  if (!token || !rawUser) return false;
  setAccessToken(token);
  if (refresh) setRefreshToken(refresh);
  setSessionUser(JSON.parse(rawUser) as SessionUser);
  window.localStorage.removeItem(REAL_TOKEN_KEY);
  window.localStorage.removeItem(REAL_REFRESH_KEY);
  window.localStorage.removeItem(REAL_USER_KEY);
  saveImpersonation(null);
  emit();
  return true;
}

export function hasRealSession(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(REAL_TOKEN_KEY));
}
