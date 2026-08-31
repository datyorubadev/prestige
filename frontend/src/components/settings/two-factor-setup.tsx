"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";

interface TotpStatus {
  enabled: boolean;
  configured: boolean;
}

interface TotpSetup {
  secret: string;
  qrDataUrl: string;
  otpauthUrl: string;
}

export function TwoFactorSetup() {
  const toast = useToast();
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "scan" | "verify" | "done">("idle");

  useEffect(() => {
    api.get<TotpStatus>("/auth/2fa/status").then(setStatus).catch(() => {});
  }, []);

  const startSetup = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.post<TotpSetup>("/auth/2fa/setup");
      setSetup(data);
      setStep("scan");
    } catch {
      toast("Could not generate 2FA setup", "danger");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const confirmEnable = useCallback(async () => {
    if (!code || code.length !== 6) {
      toast("Enter the 6-digit code from your authenticator", "danger");
      return;
    }
    setLoading(true);
    try {
      await api.post<{ enabled: boolean }>("/auth/2fa/enable", { code });
      setStatus({ enabled: true, configured: true });
      setStep("done");
      toast("2FA enabled successfully");
    } catch {
      toast("Invalid code — try again", "danger");
    } finally {
      setLoading(false);
    }
  }, [code, toast]);

  const disable2fa = useCallback(async () => {
    if (!code || code.length !== 6) {
      toast("Enter your current 6-digit code to disable 2FA", "danger");
      return;
    }
    setLoading(true);
    try {
      await api.post<{ enabled: boolean }>("/auth/2fa/disable", { code });
      setStatus({ enabled: false, configured: false });
      setSetup(null);
      setStep("idle");
      setCode("");
      toast("2FA disabled");
    } catch {
      toast("Invalid code — could not disable 2FA", "danger");
    } finally {
      setLoading(false);
    }
  }, [code, toast]);

  if (status === null) {
    return <div className="flex items-center gap-2 py-4 text-[12px] text-text-3"><Spinner size={14} /> Loading 2FA status…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-text">Two-Factor Authentication (TOTP)</p>
          <p className="text-[12px] text-text-3">
            {status.enabled
              ? "2FA is enabled — your account requires an authenticator code at login"
              : "Add an extra layer of security with an authenticator app"}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${status.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {status.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {step === "idle" && !status.enabled && (
        <button
          type="button"
          onClick={() => void startSetup()}
          disabled={loading}
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? <Spinner size={13} /> : <Icon name="check" size={13} />}
          Set up 2FA
        </button>
      )}

      {step === "scan" && setup && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <p className="text-[12px] font-medium text-text">Scan this QR code with your authenticator app</p>
          <img src={setup.qrDataUrl} alt="2FA QR Code" className="h-40 w-40 rounded-md border border-border" />
          <div className="flex flex-col gap-1">
            <p className="text-[11px] text-text-3">Or enter this key manually:</p>
            <code className="rounded bg-surface-2 px-2 py-1 font-mono text-[12px] text-text select-all">{setup.secret}</code>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-28 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[14px] text-text text-center tracking-widest focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void confirmEnable()}
              disabled={loading || code.length !== 6}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? <Spinner size={13} /> : <Icon name="check" size={13} />}
              Confirm &amp; Enable
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-[12px] text-green-700">
          <Icon name="check" size={14} />
          2FA is now active. You will be prompted for a code at every login.
        </div>
      )}

      {status.enabled && step === "idle" && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Enter code to disable"
            maxLength={6}
            className="w-40 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[13px] text-text focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void disable2fa()}
            disabled={loading || code.length !== 6}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            {loading ? <Spinner size={13} /> : <Icon name="close" size={13} />}
            Disable 2FA
          </button>
        </div>
      )}
    </div>
  );
}
