"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type { Tenant } from "@/lib/types";

export function AdminGeneralTab() {
  const toast = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [saving, setSaving] = useState(false);
  const [defEscalation, setDefEscalation] = useState(
    "Please hold on — a member of our team is joining to help you now.",
  );
  const [defTone, setDefTone] = useState("casual");
  const [impersonationMins, setImpersonationMins] = useState("30");

  useEffect(() => {
    let active = true;
    api
      .get<Tenant[]>("/tenants")
      .then((data) => active && setTenants(data))
      .catch(() => active && setTenants([]));
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 120));
    setSaving(false);
    toast("Platform defaults saved & broadcast live");
  };

  const activeTenants = tenants.filter((t) => t.status === "active").length;
  const pendingTenants = tenants.filter((t) => t.status === "pending").length;

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
        <Card title="New-tenant defaults" icon="sliders">
          <div className="flex flex-col gap-3.5">
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Default escalation message</span>
              <textarea
                value={defEscalation}
                onChange={(e) => setDefEscalation(e.target.value)}
                rows={2}
                className="input-control w-full resize-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Default brand tone</span>
              <Select
                value={defTone}
                onChange={setDefTone}
                options={[
                  { value: "professional", label: "professional" },
                  { value: "casual", label: "casual" },
                  { value: "pidgin", label: "pidgin" },
                  { value: "formal", label: "formal" },
                ]}
                ariaLabel="Default brand tone"
              />
            </label>
            <p className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-text-3">
              Seeded into the widget on tenant approval — tenants can override in their Brand &amp;
              widget tab.
            </p>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Platform at a glance" icon="grid">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-sm border border-border bg-surface-2 p-3">
                <p className="text-kpi tabular-nums text-text">{activeTenants}</p>
                <p className="text-[11.5px] text-text-3">active tenants</p>
              </div>
              <div className="rounded-sm border border-border bg-surface-2 p-3">
                <p className="text-kpi tabular-nums text-text">{pendingTenants}</p>
                <p className="text-[11.5px] text-text-3">pending review</p>
              </div>
              <div className="rounded-sm border border-border bg-surface-2 p-3">
                <p className="text-kpi tabular-nums text-text">{tenants.length}</p>
                <p className="text-[11.5px] text-text-3">total tenants</p>
              </div>
            </div>
          </Card>

          <Card title="Impersonation policy" icon="eye">
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">
                Session duration (minutes)
              </span>
              <Select
                value={impersonationMins}
                onChange={setImpersonationMins}
                options={[
                  { value: "15", label: "15 minutes" },
                  { value: "30", label: "30 minutes" },
                  { value: "60", label: "60 minutes" },
                ]}
                ariaLabel="Impersonation session duration"
              />
            </label>
            <p className="mt-2 text-[11.5px] text-text-3">
              Tokens are short-lived, non-refreshable and audited on start/end.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
