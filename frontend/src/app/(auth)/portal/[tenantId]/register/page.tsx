"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setAccessToken, setRefreshToken, setSessionUser } from "@/lib/auth-store";
import { Icon } from "@/components/icons";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { PASSWORD_MIN } from "@/lib/password";
import type { SessionUser } from "@/lib/types";

export default function PortalRegisterPage() {
  return (
    <Suspense fallback={null}>
      <PortalRegister />
    </Suspense>
  );
}

function PortalRegister() {
  const params = useParams();
  const tenant = params?.tenantId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const raise = searchParams.get("raise") === "1";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { token, refresh_token, user } = await api.post<{
        token: string;
        refresh_token?: string;
        user: SessionUser;
      }>("/auth/register", {
        full_name: fullName,
        email,
        password,
        tenant_id: tenant,
      });
      setAccessToken(token);
      if (refresh_token) setRefreshToken(refresh_token);
      setSessionUser(user);
      router.push(`/portal/${tenant}${raise ? "?raise=1" : ""}`);
    } catch {
      setError("Could not create an account for this workspace. The email may already be in use.");
    } finally {
      setSubmitting(false);
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
            <Icon name="user" size={20} />
          </span>
          <h1 className="text-[19px] font-extrabold tracking-tight text-text">Create a customer account</h1>
          <p className="mt-1 text-[12.5px] text-text-2">
            Track tickets & chat with support in real time
          </p>
        </div>

        <form onSubmit={(e) => void register(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
            Full name
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
            Email
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
            disabled={submitting}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-[15px] py-[9px] text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            Create account
          </button>
        </form>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-text-2">
          <span>Already have an account?</span>
          <button
            type="button"
            onClick={() => router.push(`/portal/${tenant}/login${raise ? "?raise=1" : ""}`)}
            className="font-semibold text-primary transition-colors duration-150 hover:text-primary-dark"
          >
            Sign in
          </button>
        </div>
      </div>
    </main>
  );
}
