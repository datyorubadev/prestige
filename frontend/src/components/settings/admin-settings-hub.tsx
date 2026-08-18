"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";
import { AdminGeneralTab } from "./admin-general-tab";
import { AdminPlansTab } from "./admin-plans-tab";
import { AdminFlagsTab } from "./admin-flags-tab";
import { AdminPresetsTab } from "./admin-presets-tab";
import { AdminSecurityTab } from "./admin-security-tab";

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: "general", label: "General", icon: "building" },
  { id: "plans", label: "Plans & quotas", icon: "card" },
  { id: "flags", label: "Feature flags", icon: "sliders" },
  { id: "presets", label: "Automation presets", icon: "zap" },
  { id: "security", label: "Security", icon: "shield" },
];

const TAB_PANES: Record<string, () => React.ReactNode> = {
  general: () => <AdminGeneralTab />,
  plans: () => <AdminPlansTab />,
  flags: () => <AdminFlagsTab />,
  presets: () => <AdminPresetsTab />,
  security: () => <AdminSecurityTab />,
};

/** Super-admin settings hub — grouped tabs mirroring the owner hub.
 *  Panes stay mounted once visited so tab switches never re-show skeletons. */
export function AdminSettingsHub() {
  const [tab, setTab] = useState("general");
  const [visited, setVisited] = useState<string[]>(["general"]);

  const activate = (id: string) => {
    setTab(id);
    setVisited((v) => (v.includes(id) ? v : [...v, id]));
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 text-text">Platform settings</h1>
      </header>

      <div
        role="tablist"
        aria-label="Platform settings sections"
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

      <div>
        {visited.map((id) => (
          <div key={id} className={cn(id !== tab && "hidden")}>
            {TAB_PANES[id]()}
          </div>
        ))}
      </div>
    </div>
  );
}
