"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { Icon, type IconName } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { formatNgn, cn } from "@/lib/utils";
import { SystemHealth } from "./system-health";
import { JobsInspector } from "./jobs-inspector";
import { SecurityCenter } from "./security-center";
import type { ColumnDef } from "@tanstack/react-table";
import type { FeedItem, Plan, Tenant, PlatformStats } from "@/lib/types";

export function PlatformOverview() {
  const { impersonate } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<Tenant | null>(null);

  const load = useCallback(() => {
    let active = true;
    api
      .get<Tenant[]>("/tenants")
      .then((data) => active && setTenants(data))
      .catch(() => active && setTenants([]));
    api
      .get<Plan[]>("/plans")
      .then((data) => active && setPlans(data))
      .catch(() => active && setPlans([]));
    api
      .get<FeedItem[]>("/platform-feed")
      .then((data) => active && setFeed(data))
      .catch(() => active && setFeed([]));
    api
      .get<PlatformStats>("/platform/stats")
      .then((data) => active && setStats(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(load, [load]);

  // Platform lifecycle events (approve/suspend/reactivate) push in realtime.
  useRealtime({
    tenant_status_changed: () => {
      void load();
    },
  });

  const active = tenants?.filter((t) => t.status === "active") ?? [];
  const pending = tenants?.filter((t) => t.status === "pending") ?? [];
  const suspended = tenants?.filter((t) => t.status === "suspended") ?? [];
  const paid = active.filter((t) => t.plan !== "starter");
  const mrr = paid.reduce(
    (s, t) => s + (plans.find((p) => p.code === t.plan)?.priceNum ?? 0),
    0,
  );
  const volume30d = (tenants ?? []).reduce((s, t) => s + t.volume30d, 0);

  const run = useCallback(async (id: string, kind: "approve" | "suspend" | "reactivate") => {
    setBusy(id);
    try {
      const updated = await api.post<Tenant>(`/tenants/${id}/${kind}`);
      setTenants((prev) => (prev ?? []).map((t) => (t.id === id ? updated : t)));
      setFeed((prev) => [
        {
          ic: kind === "approve" ? "checkcircle" : "warning",
          color: kind === "approve" ? "#00a86b" : "#d93636",
          title:
            kind === "approve"
              ? `${updated.name} approved — owner notified`
              : kind === "suspend"
                ? `${updated.name} suspended — live banner pushed`
                : `${updated.name} reactivated`,
          meta: "just now · audited",
        },
        ...prev,
      ]);
      toast(kind === "approve" ? `${updated.name} approved` : `${updated.name} ${kind}ed`);
    } catch {
      toast("Action failed", "danger");
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const startImpersonation = useCallback(
    (t: Tenant) => {
      setBusy(t.id);
      impersonate(t.id, t.name)
        .then(() => router.push("/dashboard"))
        .catch(() => {
          toast("Could not impersonate this tenant", "danger");
        })
        .finally(() => setBusy(null));
    },
    [impersonate, router, setBusy, toast],
  );

  const topVolume = (tenants ?? [])
    .filter((t) => t.volume30d > 0)
    .sort((a, b) => b.volume30d - a.volume30d);
  const maxVolume = topVolume[0]?.volume30d ?? 1;

  const tenantColumns = useMemo<ColumnDef<Tenant, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Business",
        cell: ({ row }) => <CellMain main={row.original.name} sub={row.original.email} />,
      },
      {
        accessorKey: "plan",
        header: "Plan",
        cell: ({ row }) => <span className="capitalize">{row.original.plan}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <Pill status={row.original.status} dot />,
      },
      {
        accessorKey: "agents",
        header: "Agents",
        cell: ({ row }) => (
          <span className="font-mono text-code tabular-nums">{row.original.agents}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const t = row.original;
          return (
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                {t.status === "pending" ? (
                  <ActionButton
                    icon="check"
                    label="Approve"
                    primary
                    busy={busy === t.id}
                    onClick={() => run(t.id, "approve")}
                  />
                ) : (
                  <>
                    <ActionButton
                      icon="eye"
                      label="Impersonate"
                      busy={busy === t.id}
                      onClick={() => startImpersonation(t)}
                    />
                    {t.status === "active" && (
                      <ActionButton
                        icon="close"
                        label="Suspend"
                        danger
                        busy={busy === t.id}
                        onClick={() => setSuspending(t)}
                      />
                    )}
                    {t.status === "suspended" && (
                      <ActionButton
                        icon="refresh"
                        label="Reactivate"
                        busy={busy === t.id}
                        onClick={() => run(t.id, "reactivate")}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        },
      },
    ],
    [busy, run, startImpersonation],
  );

  const [activeTab, setActiveTab] = useState<"overview" | "health" | "jobs" | "security">("overview");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Platform Overview</h1>
        <button
          type="button"
          onClick={() => router.push("/admin/tenants")}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
        >
          <Icon name="plus" size={15} />
          Provision tenant
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/80 pb-3 text-[13px] font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] transition-all duration-150",
            activeTab === "overview"
              ? "bg-primary text-white shadow-xs"
              : "border border-border/70 bg-surface text-text-2 hover:border-text-3/40 hover:bg-surface-2 hover:text-text",
          )}
        >
          <Icon name="building" size={14} className={activeTab === "overview" ? "text-white" : "text-text-3"} />
          <span>Tenants Overview</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("health")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] transition-all duration-150",
            activeTab === "health"
              ? "bg-primary text-white shadow-xs"
              : "border border-border/70 bg-surface text-text-2 hover:border-text-3/40 hover:bg-surface-2 hover:text-text",
          )}
        >
          <Icon name="activity" size={14} className={activeTab === "health" ? "text-white" : "text-text-3"} />
          <span>System Health</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("jobs")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] transition-all duration-150",
            activeTab === "jobs"
              ? "bg-primary text-white shadow-xs"
              : "border border-border/70 bg-surface text-text-2 hover:border-text-3/40 hover:bg-surface-2 hover:text-text",
          )}
        >
          <Icon name="zap" size={14} className={activeTab === "jobs" ? "text-white" : "text-text-3"} />
          <span>Jobs Queue</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[12.5px] transition-all duration-150",
            activeTab === "security"
              ? "bg-primary text-white shadow-xs"
              : "border border-border/70 bg-surface text-text-2 hover:border-text-3/40 hover:bg-surface-2 hover:text-text",
          )}
        >
          <Icon name="shield" size={14} className={activeTab === "security" ? "text-white" : "text-text-3"} />
          <span>Security Center</span>
        </button>
      </div>

      {activeTab === "health" && <SystemHealth />}
      {activeTab === "jobs" && <JobsInspector />}
      {activeTab === "security" && <SecurityCenter />}

      {activeTab === "overview" && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <Kpi
          icon="building"
          label="Total tenants"
          value={String(stats?.totalTenants ?? "—")}
          note={`${stats?.activeTenants ?? 0} active · ${stats?.pendingTenants ?? 0} pending · ${stats?.suspendedTenants ?? 0} suspended`}
        />
        <Kpi
          icon="users"
          label="Total Agents"
          value={String(stats?.totalAgents ?? "—")}
          note="Across all tenants"
        />
        <Kpi
          icon="users"
          label="Total Customers"
          value={String(stats?.totalCustomers ?? "—")}
          note="Across all tenants"
        />
        <Kpi
          icon="ticket"
          label="Total Tickets"
          value={String(stats?.totalTickets ?? "—")}
          note="Across all tenants"
        />
        <Kpi
          icon="zap"
          label="AI Resolutions"
          value={String(stats?.aiResolutions ?? "—")}
          note={`Saved ${stats?.humanHandoffs ?? 0} handoffs`}
          good
        />
        <Kpi
          icon="bar-chart"
          label="AI Tokens Used"
          value={String(stats?.aiTokensUsed ?? "—")}
          note="Platform-wide consumption"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Tenants" icon="building" pad0 actions={undefined}>
          <div className="border-b border-border px-4 pb-1 pt-2 text-meta text-text-3">
            Approve, suspend or impersonate from here
          </div>
          {!tenants ? (
            <div className="p-6">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton mt-3 h-10 w-full" />
              <div className="skeleton mt-3 h-10 w-full" />
            </div>
          ) : (
            <DataTable columns={tenantColumns} data={tenants} getRowId={(t) => t.id} hoverable borderless />
          )}
        </Card>
        <ActivityFeed items={feed} />
      </div>

      <Card title="Top tenants by ticket volume (30d)" icon="bar-chart">
        <p className="mb-4 text-meta text-text-3">Where support load is heaviest</p>
        <div className="flex flex-col gap-4">
          {topVolume.map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <span className="flex w-52 shrink-0 items-center gap-2 truncate text-[12.5px] font-medium text-text-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span className="truncate">{t.name}</span>
              </span>
              <b className="w-14 shrink-0 text-right text-[12.5px] tabular-nums text-text">
                {t.volume30d.toLocaleString("en-NG")}
              </b>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((t.volume30d / maxVolume) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {topVolume.length === 0 && (
            <EmptyState
              icon="chart"
              title="No traffic recorded"
              subtitle="Usage data for this period will appear here."
              className="py-8"
            />
          )}
        </div>
      </Card>

      <ConfirmModal
        open={!!suspending}
        onClose={() => setSuspending(null)}
        title="Suspend tenant"
        confirmLabel="Suspend tenant"
        busy={busy === suspending?.id}
        onConfirm={() => {
          if (suspending) {
            setSuspending(null);
            void run(suspending.id, "suspend");
          }
        }}
        description={
          suspending ? (
            <span>
              <b className="text-text">{suspending.name}</b> will be suspended immediately — the
              workspace locks for its staff and customers, a live banner is pushed and the owner
              is notified. This is audited.
            </span>
          ) : ""
        }
      />
        </>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  primary,
  danger,
  busy,
}: {
  icon: "check" | "eye" | "close" | "refresh";
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        primary
          ? "inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          : danger
            ? "inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-danger transition-colors duration-150 hover:bg-danger-soft/70 disabled:cursor-not-allowed disabled:opacity-50"
            : "inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {busy ? <Spinner size={12} /> : <Icon name={icon} size={13} />}
      {label}
    </button>
  );
}

function Kpi({
  icon,
  label,
  value,
  note,
  good,
}: {
  icon: IconName;
  label: string;
  value: string;
  note: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <p className="flex items-center justify-between text-[12px] font-semibold text-text-2">
        {label}
        <Icon name={icon} size={14} className={good ? "text-primary" : "text-text-3"} />
      </p>
      <p className="mt-2 text-kpi tabular-nums text-text">{value}</p>
      <p className="mt-1 text-meta text-text-3">{note}</p>
    </div>
  );
}
