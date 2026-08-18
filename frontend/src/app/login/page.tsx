"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { PasswordInput } from "@/components/ui/password-input";
import { DEMO_TENANT_SLUG } from "@/lib/utils";
import type { Role, SessionUser } from "@/lib/types";

const roleHome = (role: Role, tenantId: string | null): string => {
  switch (role) {
    case "super_admin":
      return "/admin";
    case "customer":
      return `/portal/${tenantId ?? "t1"}`;
    default:
      return "/dashboard";
  }
};

/** Production sign-in page with real credentials and session management. */
export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirect = (user: SessionUser) => {
    router.push(roleHome(user.role, user.tenantId));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(email.trim(), password);
      redirect(user);
    } catch {
      setError("Email or password is incorrect. Try again or reset it.");
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
            <Icon name="sparkles" size={20} />
          </span>
          <h1 className="text-[19px] font-extrabold tracking-tight text-text">Sign in to Prestige</h1>
          <p className="mt-1 text-[12.5px] text-text-2">
            Customer support that works while your team sleeps
          </p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
            Email
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
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
            <span className="flex items-center justify-between">
              Password
              <Link
                href="/forgot-password"
                className="text-[11.5px] font-semibold text-primary transition-colors duration-150 hover:text-primary-dark"
              >
                Forgot password?
              </Link>
            </span>
            <PasswordInput
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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
            Sign in
          </button>
        </form>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-text-2">
          <span>New to Prestige?</span>
          <Link href={`/register?tenant=${DEMO_TENANT_SLUG}`} className="font-semibold text-primary transition-colors duration-150 hover:text-primary-dark">
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}
