"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/icons";
import { Select } from "@/components/ui/select";
import type { BusinessHours } from "@/lib/types";

const TIMEZONES = [
  "Africa/Lagos",
  "UTC",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
];

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export function BusinessHoursTab() {
  const toast = useToast();
  const { role } = useAuth();
  const canManage = role === "owner" || role === "super_admin";
  const [data, setData] = useState<BusinessHours | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    let active = true;
    api.get<BusinessHours>("/settings/business-hours").then((res) => {
      if (active) setData(res);
    }).catch(() => {
      if (active) setData({
        id: "default",
        tenantId: "t1",
        timezone: "Africa/Lagos",
        schedule: {
          mon: { enabled: true, open: "09:00", close: "17:00" },
          tue: { enabled: true, open: "09:00", close: "17:00" },
          wed: { enabled: true, open: "09:00", close: "17:00" },
          thu: { enabled: true, open: "09:00", close: "17:00" },
          fri: { enabled: true, open: "09:00", close: "17:00" },
          sat: { enabled: false, open: "10:00", close: "14:00" },
          sun: { enabled: false, open: "10:00", close: "14:00" }
        },
        outOfHoursMessage: "We're currently closed. Leave a message and we'll get back to you during business hours."
      });
    });
    return () => { active = false; };
  }, []);

  useEffect(load, [load]);

  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    try {
      await api.put("/settings/business-hours", data);
      toast("Business hours saved successfully");
    } catch {
      toast("Could not save business hours", "danger");
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <div className="p-8 text-center"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-[16px] font-semibold text-text">Business Hours</h2>
        <p className="mt-1 text-meta text-text-2">Set your team's operational schedule and auto-responder.</p>
      </header>

      <Card>
        <div className="flex flex-col gap-6">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">Timezone</label>
            <div className="w-full max-w-xs">
              <Select
                value={data.timezone}
                onChange={(v) => setData({ ...data, timezone: v })}
                disabled={!canManage}
                options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
                ariaLabel="Select Timezone"
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-[13px] font-semibold text-text">Weekly Schedule</h3>
            <div className="flex max-w-lg flex-col gap-3 rounded-md border border-border bg-surface-2 p-4">
              {DAYS.map(({ key, label }) => {
                const daySched = data.schedule[key] ?? { enabled: false, open: "09:00", close: "17:00" };
                return (
                  <div key={key} className="flex items-center justify-between gap-4 border-b border-border/50 pb-2.5 last:border-b-0 last:pb-0">
                    <label className="flex items-center gap-2 text-[13px] font-medium text-text min-w-[110px]">
                      <input
                        type="checkbox"
                        checked={daySched.enabled}
                        onChange={(e) => setData({
                          ...data,
                          schedule: {
                            ...data.schedule,
                            [key]: { ...daySched, enabled: e.target.checked }
                          }
                        })}
                        disabled={!canManage}
                        className="h-4 w-4 rounded border-border bg-surface text-primary"
                      />
                      {label}
                    </label>

                    {daySched.enabled ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={daySched.open}
                          onChange={(e) => setData({
                            ...data,
                            schedule: {
                              ...data.schedule,
                              [key]: { ...daySched, open: e.target.value }
                            }
                          })}
                          disabled={!canManage}
                          className="rounded-sm border border-border bg-surface px-2 py-1 text-[12.5px] text-text"
                        />
                        <span className="text-text-3">to</span>
                        <input
                          type="time"
                          value={daySched.close}
                          onChange={(e) => setData({
                            ...data,
                            schedule: {
                              ...data.schedule,
                              [key]: { ...daySched, close: e.target.value }
                            }
                          })}
                          disabled={!canManage}
                          className="rounded-sm border border-border bg-surface px-2 py-1 text-[12.5px] text-text"
                        />
                      </div>
                    ) : (
                      <span className="text-[12px] font-medium text-text-3">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">Out of Hours Message</label>
            <textarea
              value={data.outOfHoursMessage}
              onChange={(e) => setData({ ...data, outOfHoursMessage: e.target.value })}
              disabled={!canManage}
              rows={3}
              className="w-full max-w-lg input-control resize-y text-[13px]"
            />
          </div>

          {canManage && (
            <div>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
                Save Business Hours
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
