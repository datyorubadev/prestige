"use client";

import { useSyncExternalStore } from "react";
import { redirect } from "next/navigation";
import { useAuth } from "@/lib/auth";

const subscribeEmpty = () => () => {};

/** Owner/super_admin gate for tenant-admin surfaces (agents, canned replies,
 *  escalation rules, settings, billing, knowledge upload). Agents are bounced
 *  to the dashboard instead of hitting owner-only endpoints. Gating runs after
 *  hydration so SSR renders the shell without bouncing deep links. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const hydrated = useSyncExternalStore(subscribeEmpty, () => true, () => false);
  if (role === "owner" || role === "super_admin") return <>{children}</>;
  if (!hydrated) return null;
  redirect("/dashboard");
}
