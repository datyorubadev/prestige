"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";
import { TenantSettings } from "@/components/portal/tenant-settings";
import { AgentsManager } from "@/components/admin/agents";
import { GeneralTab } from "./general-tab";
import { AutomationsTab } from "./automations-tab";
import { SlaTab } from "./sla-tab";
import { NotificationsTab } from "./notifications-tab";
import { ChannelsTab } from "./channels-tab";
import { WebhooksTab } from "./webhooks-tab";
import { ApiTab } from "./api-tab";
import { CustomFieldsTab } from "./custom-fields-tab";
import { BusinessHoursTab } from "./business-hours-tab";
import { LabelsTab } from "./labels-tab";

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: "general", label: "General", icon: "building" },
  { id: "brand", label: "Brand & widget", icon: "sparkles" },
  { id: "team", label: "Team", icon: "users" },
  { id: "labels", label: "Labels", icon: "tag" },
  { id: "automations", label: "Automations & Workflows", icon: "zap" },
  { id: "sla", label: "SLA", icon: "clock" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "channels", label: "Channels", icon: "send" },
  { id: "webhooks", label: "Webhooks", icon: "link" },
  { id: "api", label: "API & data", icon: "lock" },
  { id: "custom_fields", label: "Custom Fields", icon: "file" },
  { id: "business_hours", label: "Business Hours", icon: "clock" },
];

const TAB_PANES: Record<string, () => React.ReactNode> = {
  general: () => <GeneralTab />,
  brand: () => <TenantSettings />,
  team: () => <AgentsManager />,
  labels: () => <LabelsTab />,
  automations: () => <AutomationsTab />,
  sla: () => <SlaTab />,
  notifications: () => <NotificationsTab />,
  channels: () => <ChannelsTab />,
  webhooks: () => <WebhooksTab />,
  api: () => <ApiTab />,
  custom_fields: () => <CustomFieldsTab />,
  business_hours: () => <BusinessHoursTab />,
};

/** Owner settings hub — grouped tabs matching the Stripe/Linear settings model
 *  (design research): General, Brand & widget, Team, Automations, SLA,
 *  Notifications, Channels, Webhooks, API & data.
 *
 *  Panes stay mounted once visited so switching tabs never re-fetches or
 *  re-shows the loading skeleton — only the active pane is visible. */
export function SettingsHub() {
  const { role } = useAuth();
  const [tab, setTab] = useState("general");
  const [visited, setVisited] = useState<string[]>(["general"]);
  const canEdit = role === "owner" || role === "super_admin";

  const activate = (id: string) => {
    setTab(id);
    setVisited((v) => (v.includes(id) ? v : [...v, id]));
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 text-text">Settings</h1>
      </header>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => activate(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-sm border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition-colors duration-150",
                active
                  ? "border-primary text-primary-dark"
                  : "border-transparent text-text-2 hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon name={t.icon} size={15} className={cn("opacity-80", active && "opacity-100")} />
              {t.label}
            </button>
          );
        })}
      </div>

      {!canEdit ? (
        <p className="rounded-sm border border-border bg-surface px-4 py-3 text-[13px] text-text-2">
          Read-only preview — only owners can change settings.
        </p>
      ) : (
        <div>
          {visited.map((id) => (
            <div key={id} className={cn(id !== tab && "hidden")}>
              {TAB_PANES[id]()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
