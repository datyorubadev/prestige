"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/lib/types";

interface Draft {
  name: string;
  email: string;
  city: string;
}

export function GeneralTab() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "t1";
  const toast = useToast();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    let active = true;
    api
      .get<Tenant>(`/tenants/${tenantId}`)
      .then((t) => {
        if (!active) return;
        setTenant(t);
        setDraft({ name: t.name, email: t.email, city: t.city });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(load, [load]);
  useRealtime({ settings_changed: () => void load() });

  const save = async () => {
    if (!draft || !tenant) return;
    setSaving(true);
    try {
      const updated = await api.put<Tenant>(`/tenants/${tenantId}`, {
        name: draft.name.trim(),
        email: draft.email.trim(),
        city: draft.city.trim(),
      });
      setTenant(updated);
      toast("Workspace details saved");
    } catch {
      toast("Could not save workspace details", "danger");
    } finally {
      setSaving(false);
    }
  };

  if (!tenant || !draft) {
    return (
      <div className="flex flex-col gap-4">
        <div className="skeleton h-7 w-56" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="h-[300px] rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton mt-4 h-4 w-full" />
            <div className="skeleton mt-3 h-4 w-full" />
            <div className="skeleton mt-3 h-4 w-2/3" />
          </div>
          <div className="h-[300px] rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="skeleton h-4 w-1/3" />
          </div>
        </div>
      </div>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">General</h1>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
          Save changes
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Workspace details" icon="building">
          <div className="flex flex-col gap-3.5">
            <Field label="Business name">
              <input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                className="input-control"
              />
            </Field>
            <Field label="Support email">
              <input
                value={draft.email}
                onChange={(e) => set({ email: e.target.value })}
                type="email"
                className="input-control"
              />
            </Field>
            <Field label="City / region">
              <input
                value={draft.city}
                onChange={(e) => set({ city: e.target.value })}
                className="input-control"
              />
            </Field>
            <div className="rounded-sm border border-border bg-surface-2 px-3 py-2.5 text-[11.5px] text-text-3">
              Widget URL uses your slug:{" "}
              <code className="font-mono text-code text-text-2">
                /widget/{tenant.slug}
              </code>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Current plan" icon="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-bold capitalize text-text">{tenant.plan}</p>
                <p className="mt-0.5 text-[12px] text-text-2">
                  {tenant.agents} agents · {tenant.customers.toLocaleString("en-NG")} customers ·{" "}
                  {tenant.kbMb} MB KB
                </p>
              </div>
              <span className="rounded-full bg-primary-soft px-[10px] py-[3px] text-[11.5px] font-bold text-primary-dark">
                {tenant.status}
              </span>
            </div>
            <p className="mt-3 rounded-sm border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-text-3">
              Billing and plan changes live in the Billing tab.
            </p>
          </Card>

          <Card title="Workspace identity" icon="eye">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-md text-[16px] font-bold text-white"
                style={{ backgroundColor: tenant.color }}
              >
                {tenant.name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-bold text-text">{tenant.name}</p>
                <p className="text-[12px] text-text-2">
                  {tenant.botName ?? `${tenant.name} Assistant`} · tone: {tenant.tone}
                </p>
              </div>
            </div>
          </Card>

          <Card title="AI Assistant & Copilot" icon="zap">
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface-2 p-3.5">
                <div>
                  <p className="text-[13.5px] font-bold text-text">AI Deflection & Auto-responder</p>
                  <p className="mt-0.5 text-[12px] text-text-2">
                    {tenant.aiEnabled !== false
                      ? "Active — AI automatically responds to incoming customer queries using KB knowledge."
                      : "Disabled — All incoming customer tickets route directly to human agent queues."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const updated = await api.post<Tenant>(`/tenants/${tenantId}/toggle-ai`);
                      setTenant(updated);
                      toast(updated.aiEnabled !== false ? "AI Assistant enabled" : "AI Assistant disabled");
                    } catch {
                      toast("Could not update AI status", "danger");
                    }
                  }}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    tenant.aiEnabled !== false ? "bg-primary" : "bg-surface-3",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      tenant.aiEnabled !== false ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>

              <div className="rounded-sm border border-border bg-surface-2 p-3 text-[12px] text-text-2">
                <div className="flex items-center justify-between mb-1.5 font-semibold">
                  <span>AI Tokens Consumed</span>
                  <span className="tabular-nums font-mono text-text">
                    {(tenant.aiTokensUsed ?? 0).toLocaleString()} / {(tenant.aiTokensLimit ?? 1000000).toLocaleString()}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (((tenant.aiTokensUsed ?? 0) / (tenant.aiTokensLimit ?? 1000000)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-micro uppercase text-text-3">{label}</span>
      {children}
    </label>
  );
}
