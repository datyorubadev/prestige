"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/ui/pill";
import type { FeatureFlag } from "@/lib/types";

export function AdminFlagsTab() {
  const toast = useToast();
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);

  const load = () => void api.get<FeatureFlag[]>("/feature-flags").then(setFlags).catch(() => setFlags([]));
  useEffect(() => {
    load();
  }, []);

  useRealtime({ settings_changed: () => load() });

  const toggle = async (f: FeatureFlag) => {
    try {
      const updated = await api.patch<FeatureFlag>(`/feature-flags/${f.key}`, {
        enabled: !f.enabled,
      });
      setFlags((prev) => (prev ?? []).map((x) => (x.key === updated.key ? updated : x)));
      toast(`${updated.label} ${updated.enabled ? "enabled" : "disabled"} — audited`);
    } catch {
      toast("Could not update feature flag", "danger");
    }
  };

  const enabledCount = flags?.filter((f) => f.enabled).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Feature flags</h1>
        <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-text-2">
          {enabledCount} of {flags?.length ?? 0} enabled
        </span>
      </header>

      {!flags ? (
        <div className="flex flex-col gap-3">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      ) : (
        <Card title="Flags" icon="sliders">
          <div className="flex flex-col">
            {flags.map((f) => (
              <div
                key={f.key}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-text">{f.label}</p>
                    <Pill status={f.scope} tone={f.scope === "platform" ? "violet" : "info"} />
                  </div>
                  <p className="mt-0.5 text-[12px] text-text-2">{f.desc}</p>
                  <code className="mt-1 inline-block rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-text-3">
                    {f.key}
                  </code>
                </div>
                <Switch checked={f.enabled} onChange={() => void toggle(f)} label={`Toggle ${f.label}`} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="rounded-sm border border-border bg-surface-2 px-4 py-3 text-[12px] text-text-3">
        Platform flags ship to all tenants on deploy. Tenant-scoped flags can additionally be
        overridden per workspace from the Tenants manager.
      </p>
    </div>
  );
}
