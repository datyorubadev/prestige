"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import { setAccessToken, setRefreshToken, setSessionUser } from "@/lib/auth-store";
import { Icon } from "@/components/icons";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { PASSWORD_MIN } from "@/lib/password";
import type { AcceptInviteResult, Tenant } from "@/lib/types";

/** Customer sign-up (guide §6.2 /register). Registering binds any chats sent
 *  as a guest under the same email — tickets are keyed by email, so history
 *  surfaces in My tickets immediately after sign-in. */
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <RegisterShell>
          <div className="flex flex-col gap-3">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton mt-2 h-9 w-full" />
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-full" />
          </div>
        </RegisterShell>
      }
    >
      <Register />
    </Suspense>
  );
}

function Register() {
  const router = useRouter();
  const params = useSearchParams();
  const rawTenant = params.get("tenant");
  const isPortalSignup = Boolean(rawTenant && rawTenant.trim());
  const tenantId = rawTenant ?? "";

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPortalSignup) return;
    let active = true;
    api
      .get<Tenant | null>(`/tenants/${tenantId}`)
      .then((t) => {
        if (active && t) setTenant(t);
      })
      .catch(() => {
        // unknown tenant — fall back to generic copy
      });
    return () => {
      active = false;
    };
  }, [isPortalSignup, tenantId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token: accessToken, refresh_token, user } = await api.post<AcceptInviteResult>("/auth/register", {
        company_name: isPortalSignup ? undefined : companyName,
        full_name: fullName,
        email,
        password,
        tenant_id: isPortalSignup ? tenantId : undefined,
      });
      setAccessToken(accessToken);
      if (refresh_token) setRefreshToken(refresh_token);
      setSessionUser(user);
      if (isPortalSignup) {
        router.push(`/portal/${tenantId}`);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create your account.");
      setBusy(false);
    }
  };

  return (
    <RegisterShell>
      <div className="mb-5 flex flex-col items-center text-center">
        <span className="mb-4 flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-gradient-to-br from-primary to-[#2ecf96] text-white shadow-card">
          <Icon name="sparkles" size={20} />
        </span>
        <h1 className="text-[19px] font-extrabold tracking-tight text-text">
          {isPortalSignup
            ? tenant
              ? `Join ${tenant.name} Support`
              : "Create your support account"
            : "Start with Prestige"}
        </h1>
        <p className="mt-1 text-[12.5px] text-text-2">
          {isPortalSignup
            ? "Track tickets & chat with support in real time."
            : "Set up multi-tenant AI support and your shared inbox."}
        </p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        {!isPortalSignup && (
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
            Company / Workspace name
            <input
              required
              autoFocus
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="input-control"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
          Your full name
          <input
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="input-control"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
          Work email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            className="input-control"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
          Password
          <PasswordInput
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${PASSWORD_MIN} characters`}
          />
          <PasswordStrength password={password} className="mt-0.5" />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
          Confirm password
          <PasswordInput
            required
            autoComplete="new-password"
            value={confirm}
            invalid={Boolean(confirm) && password !== confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat your password"
          />
          {confirm && password !== confirm && (
            <span className="text-meta text-danger">Passwords do not match</span>
          )}
        </label>

        <div className="flex items-start gap-2 rounded-sm bg-primary-soft px-3 py-2.5">
          <Icon name="sparkles" size={14} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-[11.5px] leading-relaxed text-text-2">
            Chatted with us as a guest before? Signing up with the same email pulls your past
            conversations into My tickets automatically.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-meta text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-[15px] py-[9px] text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          Create account
        </button>
      </form>

      <div className="mt-4 flex items-center justify-center gap-4 text-[12px] text-text-2">
        <span>Already have an account?</span>
        <Link href="/login" className="font-semibold transition-colors duration-150 hover:text-primary">
          Sign in
        </Link>
      </div>
    </RegisterShell>
  );
}

/** Centered card shell — matches the login/accept-invite public pages. */
function RegisterShell({ children }: { children?: React.ReactNode }) {
  return (
    <main id="main" className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-bg px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-[440px] w-[440px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,168,107,.16), transparent 70%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-36 -right-36 h-[460px] w-[460px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(37,99,235,.12), transparent 70%)" }}
      />
      <div className="relative w-full max-w-[340px]">
        {children}
      </div>
    </main>
  );
}
