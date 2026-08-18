"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import { Icon } from "@/components/icons";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { PASSWORD_MIN } from "@/lib/password";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <ResetShell>
          <div className="flex flex-col gap-3">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton mt-2 h-9 w-full" />
            <div className="skeleton h-9 w-full" />
          </div>
        </ResetShell>
      }
    >
      <ResetPassword />
    </Suspense>
  );
}

function ResetPassword() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api
      .get<{ email: string }>(`/auth/reset-info/${encodeURIComponent(token)}`)
      .then((info) => {
        if (active) {
          setEmail(info.email);
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
      const result = await api.post<{ ok: boolean }>("/auth/reset-password", {
        token,
        new_password: password,
      });
      if (result.ok) {
        router.push("/login?reset=1");
      } else {
        setError("Could not reset your password. Please try again.");
        setBusy(false);
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "RESET_TOKEN_EXPIRED") {
        setInvalid(true);
      } else {
        setError(err instanceof ApiClientError ? err.message : "Could not reset your password.");
      }
      setBusy(false);
    }
  };

  return (
    <ResetShell>
      {!token || invalid ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
            <Icon name="close" size={20} />
          </span>
          <p className="text-[13.5px] font-semibold text-text">Reset link expired</p>
          <p className="max-w-[300px] text-[12.5px] leading-relaxed text-text-2">
            This reset link is invalid or has already been used. Request a new one to continue.
          </p>
          <Link
            href="/forgot-password"
            className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            Request a new link
          </Link>
        </div>
      ) : loading || email === null ? (
        <div className="flex flex-col gap-3">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton mt-2 h-9 w-full" />
          <div className="skeleton h-9 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col items-center text-center">
            <span className="mb-4 flex h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-gradient-to-br from-primary to-[#2ecf96] text-white shadow-card">
              <Icon name="lock" size={20} />
            </span>
            <h1 className="text-[19px] font-extrabold tracking-tight text-text">Set a new password</h1>
            <p className="mt-1 text-[12.5px] text-text-2">for {email}</p>
          </div>

          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
              New password
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
              Reset password
            </button>

            <p className="mt-1 text-center text-[12.5px] text-text-2">
              Remembered it?{" "}
              <Link href="/login" className="font-semibold text-primary hover:text-primary-dark">
                Sign in
              </Link>
            </p>
          </form>
        </>
      )}
    </ResetShell>
  );
}

/** Centered card shell shared by loading/error/valid states. */
function ResetShell({ children }: { children?: React.ReactNode }) {
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
