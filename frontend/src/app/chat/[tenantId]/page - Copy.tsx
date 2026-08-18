"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api, USE_MOCK } from "@/lib/api";
import { mockApi } from "@/lib/mock";
import { useAuth } from "@/lib/auth";
import { CustomerChat } from "@/components/portal/customer-chat";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn, DEMO_TENANT_SLUG } from "@/lib/utils";
import type { Tenant } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface GuestProfile {
  sessionId: string;
  email: string;
  name: string;
  tenantId: string;
}

const profileKey = (tenantId: string) => `prestige_customer_${tenantId}`;

/** Public support page (guide §6.2, §6.3): /chat/[tenantId] needs no sign-in.
 *  A pre-chat identity form captures the guest's email (Intercom/Chatwoot
 *  model) so history follows them — then signing up later binds it to the
 *  account. Signed-in customers jump straight into their conversations. */
export default function PublicChatPage() {
  return (
    <Suspense fallback={<ChatShellLoading />}>
      <PublicChat />
    </Suspense>
  );
}

function PublicChat() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? DEMO_TENANT_SLUG;
  const searchParams = useSearchParams();
  const deepEmail = searchParams.get("email");
  const { user } = useAuth();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    const loadTenant = async () => {
      try {
        const t = await api.get<Tenant | null>(`/tenants/${tenantId}`);
        if (active && t) {
          setTenant(t);
          return;
        }
      } catch {
        // fallback
      }
      if (active) {
        const mockTenant = await mockApi.tenant(tenantId);
        setTenant(mockTenant as Tenant | null);
      }
    };
    void loadTenant();
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(profileKey(tenantId));
        if (active && raw) setProfile(JSON.parse(raw) as GuestProfile);
      } catch {
        // ignore corrupt profile
      }
      if (active) setHydrated(true);
    }, 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [tenantId]);

  const name = tenant?.name ?? "Support";
  const color = tenant?.color ?? "#00a86b";

  // Signed-in customers get the full app frame (topbar + customer sidebar) so
  // the support chat renders in-shell again, as it did before it was moved out
  // of the (auth) group. Guests/staff still land on the public page below.
  if (user?.role === "customer") {
    return (
      <AppShell>
        <CustomerChat tenantId={tenantId} initialEmail={profile?.email} />
      </AppShell>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-bg"
      style={{
        backgroundImage:
          "radial-gradient(circle at 12% 18%, rgba(0,168,107,.08), transparent 42%), radial-gradient(circle at 88% 75%, rgba(37,99,235,.08), transparent 42%)",
      }}
    >
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-[60px] w-full max-w-3xl items-center gap-3 px-4">
          <Link href={`/portal/${tenantId}`} className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-85 transition-opacity">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-[9px] text-white shrink-0"
              style={{ backgroundColor: color }}
            >
              <Icon name="building" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-extrabold tracking-tight text-text">{name}</p>
              <p className="text-[11px] text-text-2">Customer support</p>
            </div>
          </Link>
          <span
            className={cn(
              "flex items-center gap-1.5 text-[11.5px] font-medium",
              (tenant?.agentsOnline ?? 0) > 0 ? "text-text-2" : "text-text-3",
            )}
          >
            <span className="relative flex h-2 w-2">
              {(tenant?.agentsOnline ?? 0) > 0 ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </>
              ) : (
                <span className="relative inline-flex h-2 w-2 rounded-full bg-text-3" />
              )}
            </span>
            {(tenant?.agentsOnline ?? 0) > 0 ? "Support online" : "Offline — reply by email"}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
        {!hydrated ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : profile ? (
          <CustomerChat tenantId={tenantId} initialEmail={profile?.email} />
        ) : (
          <PreChatForm
            tenantId={tenantId}
            tenantName={name}
            color={color}
            initialEmail={deepEmail}
            onStart={(p) => {
              setProfile(p);
              window.localStorage.setItem(profileKey(tenantId), JSON.stringify(p));
            }}
          />
        )}
      </main>

      <footer className="border-t border-border py-4">
        <p className="text-center text-[11.5px] text-text-3">
          Powered by Prestige AI ·{" "}
          <Link href="/" className="font-semibold text-text-2 hover:text-primary">
            About Prestige
          </Link>
        </p>
      </footer>
    </div>
  );
}

/** Pre-chat identity form — captures name + email before the conversation
 *  starts so guest history is recoverable (and bindable on registration). */
function PreChatForm({
  tenantId,
  tenantName,
  color,
  initialEmail,
  onStart,
}: {
  tenantId: string;
  tenantName: string;
  color: string;
  initialEmail: string | null;
  onStart: (profile: GuestProfile) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!EMAIL_RE.test(email)) {
      setError("Enter a valid email address so we can pull up your past chats.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let profile: GuestProfile;
      if (USE_MOCK) {
        profile = await mockApi.initializeSession({
          tenantId,
          name: name || "Guest",
          email,
        });
      } else {
        // Real mode has no session endpoint — the guest profile is just the
        // captured identity; history is recovered from tickets by email.
        profile = {
          sessionId: "",
          email: email.trim().toLowerCase(),
          name: name.trim() || "Guest",
          tenantId,
        };
      }
      onStart(profile);
    } catch {
      setError("Could not start a session. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col">
      <div className="rounded-xl border border-border bg-surface p-[30px] shadow-overlay">
        <div className="mb-5 flex flex-col items-center text-center">
          <span
            className="mb-4 flex h-[44px] w-[44px] items-center justify-center rounded-[12px] text-white"
            style={{ backgroundColor: color }}
          >
            <Icon name="bot" size={20} />
          </span>
          <h1 className="text-[19px] font-extrabold tracking-tight text-text">
            Chat with {tenantName} support
          </h1>
          <p className="mt-1 max-w-[320px] text-[12.5px] leading-relaxed text-text-2">
            Tell us who you are and we&apos;ll pick up right where you left off — even across
            devices.
          </p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
            Your name
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional — e.g. Tunde Bakare"
              className="input-control"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-control"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-meta text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-[15px] py-[9px] text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: color }}
          >
            {busy ? <Spinner size={14} /> : <Icon name="send" size={14} />}
            Start chatting
          </button>
        </form>
      </div>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-text-3">
        Have an account?{" "}
        <Link href="/login" className="font-semibold text-text-2 hover:text-primary">
          Sign in
        </Link>{" "}
        to track every ticket in one place.
      </p>
    </div>
  );
}

function ChatShellLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex h-[60px] items-center gap-3 border-b border-border px-4">
        <div className="skeleton h-8 w-8 rounded-[9px]" />
        <div className="skeleton h-3 w-40" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    </div>
  );
}
