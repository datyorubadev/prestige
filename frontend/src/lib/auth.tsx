"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import {
  clearSession,
  getImpersonationFromStorage,
  getSessionUser,
  hasRealSession,
  restoreRealSession,
  saveImpersonation,
  saveRealSession,
  setAccessToken,
  setRefreshToken,
  setSessionUser,
  subscribeAuth,
} from "@/lib/auth-store";
import type { Role, SessionUser } from "@/lib/types";

interface AuthContextValue {
  user: SessionUser | null;
  role: Role | null;
  impersonating: { tenantId: string; label: string } | null;
  signIn: (email: string, password: string, tenantId?: string) => Promise<SessionUser>;
  signOut: () => void;
  impersonate: (tenantId: string, label: string) => Promise<void>;
  endImpersonation: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // External session store — localStorage-backed, shared with api.ts.
  // Server snapshot is always null (no session on SSR); hydration re-syncs.
  const user = useSyncExternalStore(subscribeAuth, getSessionUser, () => null);
  const [impersonating, setImpersonating] = useState<{
    tenantId: string;
    label: string;
  } | null>(() => getImpersonationFromStorage());

  const signIn = useCallback(async (email: string, password: string, tenantId?: string) => {
    const { token, refresh_token, user } = await api.post<{
      token: string;
      refresh_token?: string;
      user: SessionUser;
    }>("/auth/login", { email, password, tenant_id: tenantId });
    setAccessToken(token);
    if (refresh_token) setRefreshToken(refresh_token);
    setSessionUser(user);
    return user;
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setImpersonating(null);
  }, []);

  const impersonate = useCallback(async (tenantId: string, label: string) => {
    // Stash the real session so "Leave" can drop back into the platform console.
    saveRealSession();
    setImpersonating(null);
    try {
      const { token, user } = await api.post<{ token: string; user: SessionUser }>(
        `/impersonate/${tenantId}`,
      );
      setAccessToken(token);
      setRefreshToken(null);
      setSessionUser(user);
      saveImpersonation({ tenantId, label });
      setImpersonating({ tenantId, label });
    } catch (error) {
      restoreRealSession();
      throw error;
    }
  }, []);

  const endImpersonation = useCallback(() => {
    saveImpersonation(null);
    if (hasRealSession()) {
      restoreRealSession();
      setImpersonating(null);
      return;
    }
    clearSession();
    setImpersonating(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      impersonating,
      signIn,
      signOut,
      impersonate,
      endImpersonation,
    }),
    [user, impersonating, signIn, signOut, impersonate, endImpersonation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
