"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { Icon, type IconName } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Ticket } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  ownerOnly?: boolean;
  /** Live queued-work count shown as a badge (design.md §4.2 `.count`). */
  count?: "open" | "mine";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const ADMIN_NAV: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { href: "/admin", label: "Overview", icon: "grid" },
      { href: "/admin/tenants", label: "Tenants", icon: "building" },
      { href: "/admin/users", label: "Users", icon: "users" },
    ],
  },
  {
    label: "Commercial",
    items: [{ href: "/admin/billing", label: "Billing & plans", icon: "card" }],
  },
  {
    label: "Governance",
    items: [
      { href: "/admin/audit", label: "Audit log", icon: "shield" },
      { href: "/admin/settings", label: "Settings", icon: "sliders" },
    ],
  },
];

const TENANT_NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "grid" },
      { href: "/dashboard/tickets", label: "Conversations", icon: "ticket", count: "open" },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/dashboard/tools", label: "AI Actions & Tools", icon: "wrench", ownerOnly: true },
      { href: "/dashboard/teams", label: "Teams", icon: "team", ownerOnly: true },
      { href: "/dashboard/customers", label: "Customers", icon: "users", ownerOnly: false },
      { href: "/dashboard/macros", label: "Macros", icon: "zap", ownerOnly: false },
      { href: "/dashboard/kb", label: "KB articles", icon: "file", ownerOnly: false },
      { href: "/dashboard/upload", label: "Knowledge base", icon: "book", ownerOnly: true },
      { href: "/dashboard/escalation", label: "Escalation rules", icon: "zap", ownerOnly: true },
      { href: "/dashboard/agents", label: "Agents", icon: "users", ownerOnly: true },
      { href: "/dashboard/canned", label: "Canned replies", icon: "edit", ownerOnly: false },
      { href: "/dashboard/settings", label: "Settings", icon: "sliders", ownerOnly: true },
    ],
  },
  {
    label: "Analytics",
    items: [{ href: "/dashboard/reports", label: "Reports", icon: "bar-chart" }],
  },
  {
    label: "Commercial",
    items: [{ href: "/dashboard/billing", label: "Billing", icon: "card", ownerOnly: true }],
  },
  {
    label: "Developer",
    items: [{ href: "/widget/{tenant}", label: "Widget demo", icon: "bot", ownerOnly: true }],
  },
  {
    label: "Account",
    items: [{ href: "/dashboard/profile", label: "Profile", icon: "user" }],
  },
];

const CUSTOMER_NAV: NavGroup[] = [
  {
    label: "Customer",
    items: [
      { href: "/chat/{tenant}", label: "Support chat", icon: "send" },
      { href: "/portal/{tenant}", label: "Help center", icon: "book" },
      { href: "/portal/{tenant}/inbox", label: "My tickets", icon: "inbox", count: "mine" },
      { href: "/portal/{tenant}/profile", label: "Profile", icon: "user" },
    ],
  },
];

export function Sidebar({ bannerActive = false }: { bannerActive?: boolean }) {
  const { user, role, impersonating } = useAuth();
  const pathname = usePathname();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const isAdminPath = pathname.startsWith("/admin");
  const isTenantPath = pathname.startsWith("/dashboard");
  const isPortalPath = pathname.startsWith("/portal");
  const groups = isAdminPath
    ? ADMIN_NAV
    : isTenantPath
      ? TENANT_NAV
      : isPortalPath
        ? CUSTOMER_NAV
        : impersonating
          ? TENANT_NAV
          : role === "super_admin"
            ? ADMIN_NAV
            : role === "customer"
              ? CUSTOMER_NAV
              : TENANT_NAV;
  const tenant = impersonating?.tenantId ?? user?.tenantId ?? "t1";

  const activeHref = (() => {
    let best: string | null = null;
    for (const group of groups) {
      for (const item of group.items) {
        if (item.ownerOnly && role !== "owner" && role !== "super_admin" && !impersonating) continue;
        const href = item.href.replace("{tenant}", tenant);
        if (pathname === href || pathname.startsWith(href + "/")) {
          if (!best || href.length > best.length) best = href;
        }
      }
    }
    return best;
  })();

  const refreshTickets = useCallback(() => {
    void api
      .get<Ticket[]>("/tickets")
      .then((t) => setTickets(t))
      .catch(() => setTickets([]));
  }, []);

  useEffect(() => {
    refreshTickets();
  }, [refreshTickets]);

  useRealtime({
    ticket_created: refreshTickets,
    ticket_updated: refreshTickets,
    ticket_escalated: refreshTickets,
    message_created: refreshTickets,
  });

  const countFor = (item: NavItem): number | null => {
    if (item.count === "open") {
      const n = tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length;
      return n > 0 ? n : null;
    }
    if (item.count === "mine") {
      const email = user?.email?.toLowerCase();
      if (!email) return null;
      const n = tickets.filter(
        (t) => t.email.toLowerCase() === email && t.status !== "resolved" && t.status !== "closed",
      ).length;
      return n > 0 ? n : null;
    }
    return null;
  };

  const homeHref = isAdminPath
    ? "/admin"
    : isPortalPath || pathname.startsWith("/chat") || role === "customer"
      ? `/portal/${tenant}`
      : "/dashboard";

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "h-screen shrink-0 border-r border-border bg-surface flex flex-col transition-all duration-200 z-40 select-none",
        collapsed ? "w-[60px]" : "w-[236px]",
      )}
    >
      {/* Linear-style Top Brand Panel */}
      <div
        className={cn(
          "flex h-[56px] shrink-0 items-center border-b border-border/60 px-3.5",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {collapsed ? (
          <Tooltip content="Expand sidebar (Prestige)" side="right">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#2ecf96] text-white shadow-card transition-transform duration-150 hover:scale-105"
            >
              <Icon name="sparkles" size={17} />
            </button>
          </Tooltip>
        ) : (
          <>
            <Link href={homeHref} className="flex items-center gap-2.5 min-w-0" aria-label="Prestige home">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#2ecf96] text-white shadow-card shrink-0">
                <Icon name="sparkles" size={17} />
              </span>
              <span className="text-[15px] font-extrabold tracking-tight text-text truncate">
                Prestige
              </span>
            </Link>
            <Tooltip content="Collapse sidebar" side="right">
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
              >
                <Icon name="chevron-right" size={15} className="rotate-180" />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        <nav className="flex flex-col gap-4 py-1">
          {groups.map((group) => {
            const visible = group.items.filter(
              (item) =>
                !item.ownerOnly ||
                role === "owner" ||
                role === "super_admin" ||
                !!impersonating,
            );
            if (visible.length === 0) return null;
            return (
              <div key={group.label} className="space-y-1">
                {!collapsed && (
                  <p className="px-2.5 text-micro uppercase text-text-3 font-semibold tracking-wider">
                    {group.label}
                  </p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {visible.map((item) => {
                    const href = item.href.replace("{tenant}", tenant);
                    const active = href === activeHref;
                    const badge = countFor(item);
                    const linkContent = (
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[9px] text-[13.5px] font-medium transition-colors duration-150 outline-none focus:outline-none",
                          collapsed
                            ? "h-9 w-9 justify-center mx-auto"
                            : "px-2.5 py-2 w-full",
                          active
                            ? "bg-primary-soft font-semibold text-primary-dark"
                            : "text-text-2 hover:bg-surface-2 hover:text-text",
                        )}
                      >
                        <Icon
                          name={item.icon}
                          size={17}
                          className={cn("opacity-80 shrink-0", active && "opacity-100")}
                        />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                        {!collapsed && badge != null && (
                          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-[10.5px] font-bold tabular-nums leading-none text-white">
                            {badge}
                          </span>
                        )}
                        {collapsed && badge != null && (
                          <span className="absolute top-1 right-1 flex h-2 w-2 rounded-full bg-danger" />
                        )}
                      </Link>
                    );

                    return (
                      <li key={href} className="relative flex items-center justify-center">
                        {collapsed ? (
                          <Tooltip content={item.label} side="right">
                            {linkContent}
                          </Tooltip>
                        ) : (
                          linkContent
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
