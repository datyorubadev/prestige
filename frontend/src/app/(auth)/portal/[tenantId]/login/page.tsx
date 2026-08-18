"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { PasswordInput } from "@/components/ui/password-input";

export default function PortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <PortalLogin />
    </Suspense>
  );
}

function PortalLogin() {
  const params = useParams();
  const tenant = params?.tenantId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const raise = searchParams.get("raise") === "1";
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password, tenant);
      router.push(`/portal/${tenant}${raise ? "?raise=1" : ""}`);
    } catch {
      setError("Email or password is incorrect. Try again.");
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
          <h1 className="text-[19px] font-extrabold tracking-tight text-text">Sign in to your support portal</h1>
          <p className="mt-1 text-[12.5px] text-text-2">
            Track your tickets and chat with support in real time
          </p>
        </div>

        <form onSubmit={(e) => void login(e)} className="flex flex-col gap-3">
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

        <div className="mt-4 flex flex-col items-center gap-1.5 text-[12px] text-text-2">
          <div className="flex items-center justify-center gap-1.5">
            <span>New here?</span>
            <button
              type="button"
              onClick={() => router.push(`/portal/${tenant}/register${raise ? "?raise=1" : ""}`)}
              className="font-semibold text-primary transition-colors duration-150 hover:text-primary-dark"
            >
              Create an account
            </button>
          </div>
          <button
            type="button"
            onClick={() => router.push(`/portal/${tenant}`)}
            className="text-text-3 transition-colors duration-150 hover:text-text-2"
          >
            Continue as guest
          </button>
        </div>
      </div>
    </main>
  );
}
