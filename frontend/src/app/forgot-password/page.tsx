"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ApiClientError } from "@/lib/api";
import { Icon } from "@/components/icons";

interface ForgotPasswordResult {
  ok: boolean;
  token?: string;
  reset_url?: string;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<ForgotPasswordResult>("/auth/forgot-password", { email });
      if (result.token) {
        setResetLink(`/reset-password?token=${encodeURIComponent(result.token)}`);
      } else if (result.reset_url) {
        setResetLink(result.reset_url);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not request a reset link.");
    } finally {
      setBusy(false);
    }
  };

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
        <div className="mb-5 flex flex-col items-center text-center">
          <span className="mb-4 flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-gradient-to-br from-primary to-[#2ecf96] text-white shadow-card">
            <Icon name="lock" size={20} />
          </span>
          <h1 className="text-[19px] font-extrabold tracking-tight text-text">Reset password</h1>
          <p className="mt-1 text-[12.5px] text-text-2">
            Enter the email for your Prestige account
          </p>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon name="check" size={20} />
            </span>
            <p className="text-[13.5px] font-semibold text-text">Reset link sent</p>
            {resetLink ? (
              <>
                <p className="max-w-[300px] text-[12.5px] leading-relaxed text-text-2">
                  This environment is in demo mode, so the reset link is shown here instead of being
                  emailed to <span className="font-semibold text-text">{email}</span>.
                </p>
                <Link
                  href={resetLink}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                >
                  Continue reset
                  <Icon name="arrow-right" size={14} />
                </Link>
              </>
            ) : (
              <p className="max-w-[300px] text-[12.5px] leading-relaxed text-text-2">
                If an account exists for <span className="font-semibold text-text">{email}</span>,
                you&apos;ll receive a reset link within a few minutes. Check your inbox (and spam).
              </p>
            )}
            <Link
              href="/login"
              className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary transition-colors duration-150 hover:text-primary-dark"
            >
              <Icon name="arrow-right" size={14} className="rotate-180" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.ng"
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
            >
              {busy && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              Send reset link
            </button>

            <p className="mt-1 text-center text-[12.5px] text-text-2">
              Remembered it?{" "}
              <Link href="/login" className="font-semibold text-primary hover:text-primary-dark">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
