"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type { NotificationPreferences } from "@/lib/types";

const EMAIL_PREFS: { key: string; label: string; desc: string }[] = [
  { key: "escalation", label: "Escalations", desc: "A ticket in your queue escalates or breaches" },
  { key: "assigned", label: "New assignments", desc: "A ticket is assigned to you" },
  { key: "replies", label: "Customer replies", desc: "The customer responds to your ticket" },
  { key: "weekly", label: "Weekly digest", desc: "Monday summary of team performance" },
  { key: "billing", label: "Billing & plan", desc: "Invoices, payment failures and plan changes" },
  { key: "product", label: "Product updates", desc: "New Prestige features and tips" },
];

const PUSH_PREFS: { key: string; label: string; desc: string }[] = [
  { key: "escalation", label: "Escalations", desc: "Instant alert when a ticket escalates" },
  { key: "assigned", label: "New assignments", desc: "Push when work is routed to you" },
  { key: "replies", label: "Customer replies", desc: "Reply arrives on a ticket you own" },
  { key: "mentions", label: "Mentions", desc: "You are @-mentioned in a note" },
];

export function NotificationsTab() {
  const { user } = useAuth();
  const toast = useToast();
  const userId = user?.id ?? "u1";

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<NotificationPreferences>("/notifications/preferences")
      .then((p) => active && setPrefs(p))
      .catch(() => active && setPrefs(null));
    return () => {
      active = false;
    };
  }, []);

  const toggle = (channel: "email" | "push", key: string, value: boolean) => {
    if (!prefs) return;
    setPrefs({ ...prefs, [channel]: { ...prefs[channel], [key]: value } });
  };

  const setQuiet = (patch: Partial<NotificationPreferences["quietHours"]>) => {
    if (!prefs) return;
    setPrefs({ ...prefs, quietHours: { ...prefs.quietHours, ...patch } });
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      await api.put<NotificationPreferences>("/notifications/preferences", {
        ...prefs,
        userId,
      });
      toast("Notification preferences saved");
    } catch {
      toast("Could not save preferences", "danger");
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="h-[260px] rounded-md border border-border bg-surface p-4 shadow-card">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton mt-4 h-4 w-full" />
          <div className="skeleton mt-3 h-4 w-full" />
        </div>
        <div className="h-[220px] rounded-md border border-border bg-surface p-4 shadow-card">
          <div className="skeleton h-4 w-1/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Notifications</h1>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
          Save preferences
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Email notifications" icon="mail">
          <div className="flex flex-col">
            {EMAIL_PREFS.map((p) => (
              <Row
                key={p.key}
                label={p.label}
                desc={p.desc}
                checked={!!prefs.email[p.key]}
                onToggle={(v) => toggle("email", p.key, v)}
              />
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Push notifications" icon="bell">
            <div className="flex flex-col">
              {PUSH_PREFS.map((p) => (
                <Row
                  key={p.key}
                  label={p.label}
                  desc={p.desc}
                  checked={!!prefs.push[p.key]}
                  onToggle={(v) => toggle("push", p.key, v)}
                />
              ))}
            </div>
          </Card>

          <Card title="Quiet hours" icon="clock">
            <div className="flex flex-col gap-3.5">
              <Row
                label="Enable quiet hours"
                desc="Silence push notifications during a window"
                checked={prefs.quietHours.enabled}
                onToggle={(v) => setQuiet({ enabled: v })}
              />
              <div className="grid grid-cols-2 gap-3.5">
                <label className="block">
                  <span className="mb-1.5 block text-micro uppercase text-text-3">From</span>
                  <input
                    type="time"
                    value={prefs.quietHours.start}
                    onChange={(e) => setQuiet({ start: e.target.value })}
                    className="input-control"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-micro uppercase text-text-3">Until</span>
                  <input
                    type="time"
                    value={prefs.quietHours.end}
                    onChange={(e) => setQuiet({ end: e.target.value })}
                    className="input-control"
                  />
                </label>
              </div>
              <p className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-text-3">
                Escalations and SLA breach alerts always get through, even in quiet hours.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  desc,
  checked,
  onToggle,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div>
        <p className="text-[12.5px] font-semibold text-text">{label}</p>
        <p className="mt-0.5 text-[11.5px] text-text-3">{desc}</p>
      </div>
      <Switch checked={checked} onChange={onToggle} label={label} />
    </div>
  );
}
