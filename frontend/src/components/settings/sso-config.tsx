"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";

interface SsoProvider {
  name: string;
  issuer: string;
  clientId: string;
  configured: boolean;
}

export function SsoConfig() {
  const toast = useToast();
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState(false);
  const [form, setForm] = useState({
    provider: "google",
    clientId: "",
    clientSecret: "",
    issuer: "",
  });

  useEffect(() => {
    api
      .get<{ providers: Record<string, SsoProvider> }>("/auth/sso/providers")
      .then((res) => {
        setProviders(Object.values(res.providers || {}));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const saveConfig = useCallback(async () => {
    if (!form.clientId || !form.clientSecret || !form.issuer) {
      toast("Fill in all SSO fields", "danger");
      return;
    }
    setConfiguring(true);
    try {
      await api.post("/auth/sso/configure", form);
      toast(`${form.provider} SSO configured`);
      // Refresh list
      const res = await api.get<{ providers: Record<string, SsoProvider> }>("/auth/sso/providers");
      setProviders(Object.values(res.providers || {}));
      setForm({ provider: "google", clientId: "", clientSecret: "", issuer: "" });
    } catch {
      toast("Could not save SSO configuration", "danger");
    } finally {
      setConfiguring(false);
    }
  }, [form, toast]);

  if (loading) {
    return <div className="flex items-center gap-2 py-4 text-[12px] text-text-3"><Spinner size={14} /> Loading SSO config…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[13px] font-semibold text-text">Single Sign-On (OIDC)</p>
        <p className="text-[12px] text-text-3">
          Allow team members to sign in with their corporate identity provider (Google, Azure AD, Okta, etc.)
        </p>
      </div>

      {providers.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-3">Configured providers</p>
          {providers.map((p) => (
            <div key={p.name} className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
              <div className="flex items-center gap-2">
                <Icon name="check" size={14} className="text-green-500" />
                <span className="text-[12px] font-medium text-text capitalize">{p.name}</span>
                <span className="text-[11px] text-text-3">{p.issuer}</span>
              </div>
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">Active</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <p className="text-[12px] font-medium text-text">
          {providers.length > 0 ? "Add another provider" : "Configure SSO provider"}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-2">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text focus:border-primary focus:outline-none"
            >
              <option value="google">Google</option>
              <option value="azure">Azure AD</option>
              <option value="okta">Okta</option>
              <option value="github">GitHub</option>
              <option value="custom">Custom OIDC</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-2">Issuer URL</label>
            <input
              type="url"
              value={form.issuer}
              onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
              placeholder="https://accounts.google.com"
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-2">Client ID</label>
            <input
              type="text"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              placeholder="123456789.apps.googleusercontent.com"
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-2">Client Secret</label>
            <input
              type="password"
              value={form.clientSecret}
              onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
              placeholder="GOCSPX-..."
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void saveConfig()}
          disabled={configuring || !form.clientId || !form.clientSecret || !form.issuer}
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {configuring ? <Spinner size={13} /> : <Icon name="check" size={13} />}
          Save SSO Configuration
        </button>
      </div>
    </div>
  );
}
