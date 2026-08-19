"use client";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui/toast";
import { Topbar } from "@/components/layout/topbar";
import { Sidebar } from "@/components/layout/sidebar";

import { useState, useEffect, useRef } from "react";
import { useRealtime } from "@/lib/realtime";
import { api } from "@/lib/api";

interface BroadcastPayload {
  message: string;
  level: "info" | "warning" | "danger";
  createdAt?: string;
  createdBy?: string;
}

function GlobalBroadcastBanner() {
  const [broadcast, setBroadcast] = useState<BroadcastPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<{ broadcast: BroadcastPayload | null }>("/platform/broadcast")
      .then((res) => {
        if (active && res?.broadcast) {
          setBroadcast(res.broadcast);
          setDismissed(false);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useRealtime({
    platform_broadcast: (envelope) => {
      const payload = envelope?.data as { broadcast?: BroadcastPayload | null } | undefined;
      setBroadcast(payload?.broadcast ?? null);
      setDismissed(false);
    },
  });

  if (!broadcast || dismissed) return null;

  const bgClasses =
    broadcast.level === "danger"
      ? "bg-danger text-white"
      : broadcast.level === "warning"
      ? "bg-amber-600 text-white"
      : "bg-primary text-white";

  return (
    <div
      role="alert"
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-2 text-[12.5px] font-semibold transition-all animate-in slide-in-from-top duration-200",
        bgClasses,
      )}
    >
      <div className="flex items-center gap-2 mx-auto">
        <Icon name="zap" size={14} className="shrink-0" />
        <span>{broadcast.message}</span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss system announcement"
        className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-white/20 transition-all"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

function ImpersonationBanner() {
  const { impersonating, endImpersonation } = useAuth();
  const router = useRouter();
  if (!impersonating) return null;

  const leave = () => {
    endImpersonation();
    router.replace("/admin");
  };

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex h-[32px] items-center justify-center gap-2 bg-danger px-4 text-[12.5px] font-semibold text-white"
    >
      <Icon name="eye" size={14} />
      <span>
        Viewing as <span className="font-bold underline decoration-white/50">{impersonating.label}</span>
      </span>
      <button
        type="button"
        onClick={leave}
        className="ml-2 rounded-sm bg-white/15 px-2 py-0.5 text-[12px] font-bold transition-colors duration-150 hover:bg-white/25"
      >
        Leave
      </button>
    </div>
  );
}

/** Persistent frame: topbar + sidebar + main (design.md §4.2 App shell).
 *  Inbox routes (/dashboard/tickets) render full-bleed — no page padding,
 *  full remaining height, white background — so the conversation panels sit
 *  flush against the sidebar like Chatwoot. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { impersonating, user } = useAuth();
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const bannerActive = !!impersonating;
  const inbox = pathname.startsWith("/dashboard/tickets") || pathname.startsWith("/chat/");

  // ── Presence heartbeat: ping every 30s while the app is open ──
  useEffect(() => {
    if (!user || user.role === "customer" || user.role === "super_admin") return;
    const ping = () => {
      void api.post("/agents/me/heartbeat").catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 30_000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <a
        href="#main"
        className="sr-only rounded-sm bg-primary px-3 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100]"
      >
        Skip to content
      </a>
      <Sidebar bannerActive={bannerActive} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ImpersonationBanner />
        <GlobalBroadcastBanner />
        <Topbar bannerActive={bannerActive} />
        <ToastProvider>
          <main
            id="main"
            ref={mainRef}
            className={cn(
              "min-w-0 flex-1 overflow-y-auto custom-scrollbar",
              inbox
                ? "flex overflow-hidden bg-surface"
                : "px-6 pb-[60px] pt-7",
            )}
          >
            {inbox ? (
              <div className="h-full min-h-0 min-w-0 flex-1">{children}</div>
            ) : (
              <div className="w-full flex-1 max-w-full transition-all duration-200">{children}</div>
            )}
          </main>
        </ToastProvider>
      </div>
    </div>
  );
}
