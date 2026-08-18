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
import type { AcceptInviteResult, InviteSummary } from "@/lib/types";

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <InviteShell>
          <div className="flex flex-col gap-3">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton mt-2 h-9 w-full" />
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-full" />
          </div>
        </InviteShell>
      }
    >
      <AcceptInvite />
    </Suspense>
  );
}

function AcceptInvite() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [invite, setInvite] = useState<InviteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api
      .get<InviteSummary>(`/auth/invites/${encodeURIComponent(token)}`)
      .then((inv) => {
        if (active) {
          setInvite(inv);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setInvalid(true);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

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
      const { token: accessToken, refresh_token, user } = await api.post<AcceptInviteResult>(
        "/auth/accept-invite",
        { invite_token: token, password, full_name: fullName },
      );
      setAccessToken(accessToken);
      if (refresh_token) setRefreshToken(refresh_token);
      setSessionUser(user);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "INVITE_EXPIRED") {
        setInvalid(true);
      } else {
        setError(err instanceof ApiClientError ? err.message : "Could not accept the invite.");
      }
      setBusy(false);
    }
  };

  return (
    <InviteShell>
      {!token || invalid ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
            <Icon name="close" size={20} />
          </span>
          <p className="text-[13.5px] font-semibold text-text">Invite link expired</p>
          <p className="max-w-[300px] text-[12.5px] leading-relaxed text-text-2">
            This invite link is invalid or has already been used. Ask the team owner to send a new
            one.
          </p>
          <Link
            href="/login"
            className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            Go to sign in
          </Link>
        </div>
      ) : loading || !invite ? (
        <div className="flex flex-col gap-3">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton mt-2 h-9 w-full" />
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-9 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col items-center text-center">
            <span className="mb-4 flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-gradient-to-br from-primary to-[#2ecf96] text-white shadow-card">
              <Icon name="sparkles" size={20} />
            </span>
            <h1 className="text-[19px] font-extrabold tracking-tight text-text">You&apos;re invited</h1>
            <p className="mt-1 text-[12.5px] text-text-2">{invite.tenant} added you to their team</p>
          </div>

          <div className="mb-5 flex items-center gap-3 rounded-sm border border-border bg-surface-2 px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-border bg-surface text-text-2">
              <Icon name="users" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-text">{invite.email}</p>
              <p className="text-[11.5px] text-text-3">
                Role: {invite.role === "owner" ? "Team owner" : "Support agent"} · link expires in {invite.expiresAt}
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
              Full name
              <input
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
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
              Create account &amp; join
            </button>
          </form>
        </>
      )}
    </InviteShell>
  );
}

/** Centered card shell shared by loading/error/valid states. */
function InviteShell({ children }: { children?: React.ReactNode }) {
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
