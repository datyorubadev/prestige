"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { BarsChart } from "@/components/dashboard/bars-chart";
import { DonutChart } from "@/components/dashboard/donut-chart";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Card } from "@/components/ui/card";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { Avatar } from "@/components/ui/avatar";
import type { ColumnDef } from "@tanstack/react-table";
import type { DashboardMetrics, LeaderboardRow, Ticket, AgentAnalytics } from "@/lib/types";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { ticketNumberFor } from "@/lib/utils";

import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { OnboardingModal } from "@/components/dashboard/onboarding-modal";

const CHANNEL_LABEL: Record<string, string> = {
  chat: "Chat",
  whatsapp: "WhatsApp",
  portal: "Portal",
  email: "Email",
};

export default function DashboardPage() {
  const { role, user } = useAuth();
  const router = useRouter();

  if (role === "customer") {
    router.push(`/portal/${user?.tenantId ?? "t1"}`);
    return null;
  }

  if (role === "agent") {
    return <AgentDashboard />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  const load = useCallback(() => {
    let active = true;
    api
      .get<DashboardMetrics>("/dashboard")
      .then((m) => {
        if (active) setMetrics(m);
      })
      .catch(() => {
        if (active) setMetrics(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(load, [load]);

  // Live metrics — ticket activity pushes in realtime.
  const { connected } = useRealtime({
    ticket_created: () => {
      void load();
    },
    ticket_updated: () => {
      void load();
    },
    ticket_escalated: () => {
      void load();
    },
    message_created: () => {
      void load();
    },
    agent_approval_pending: () => {
      void load();
    },
    agent_approval_resolved: () => {
      void load();
    },
    channel_message: () => {
      void load();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Dashboard</h1>
        <p className="flex items-center gap-1.5 text-meta font-medium text-text-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full animate-pulse-ring ${connected ? "bg-primary" : "bg-warning"}`}
          />
          {connected ? "Live" : "Reconnecting"}
        </p>
      </header>

      <OnboardingModal tenantId={user?.tenantId ?? "t1"} />
      <OnboardingCard tenantId={user?.tenantId ?? "t1"} />

      {!metrics ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
            {metrics.kpis.map((k) => (
              <KpiCard key={k.label} {...k} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <BarsChart title="Tickets by day" data={metrics.volume} />
            <DonutChart title="Channel mix" data={metrics.channelMix} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            <Card title="Recent tickets" pad0 className="2xl:col-span-1">
              <RecentTicketsTable tickets={metrics.recentTickets} />
            </Card>

            <Card title="Agent leaderboard" pad0 className="2xl:col-span-1">
              <LeaderboardTable agents={metrics.leaderboard} />
            </Card>

            <ActivityFeed items={metrics.feed} className="xl:col-span-2 2xl:col-span-1" />
          </div>
        </>
      )}
    </div>
  );
}

function AgentDashboard() {
  const [stats, setStats] = useState<AgentAnalytics>({
    assignedOpen: 0,
    resolved30d: 0,
    csatAvg: null,
    totalAssigned: 0,
    ticketsByDay: [],
    channelMix: [],
  });
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    let active = true;
    api
      .get<AgentAnalytics>("/analytics/me")
      .then((s) => {
        if (active && s) setStats(s);
      })
      .catch(() => {});

    api
      .get<Ticket[]>("/tickets")
      .then((tks) => {
        if (active && tks) {
          setTickets(tks.slice(0, 5));
          const openCount = tks.filter((t) => t.status !== "resolved" && t.status !== "closed").length;
          const resolvedCount = tks.filter((t) => t.status === "resolved" || t.status === "closed").length;
          setStats((prev) => ({
            ...prev,
            assignedOpen: openCount,
            resolved30d: resolvedCount,
            totalAssigned: tks.length,
          }));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 text-text">My Dashboard</h1>
      </header>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <KpiCard
          label="My Open Tickets"
          value={String(stats.assignedOpen)}
          trend={stats.assignedOpen > 0 ? "up" : "down"}
          delta="0%"
          goodWhen="down"
          context="Requires attention"
        />
        <KpiCard
          label="Resolved This Month"
          value={String(stats.resolved30d)}
          trend={stats.resolved30d > 0 ? "up" : "down"}
          delta="0%"
          goodWhen="up"
          context="Good job!"
        />
        <KpiCard
          label="Avg CSAT"
          value={stats.csatAvg ? `${stats.csatAvg.toFixed(1)} ★` : "N/A"}
          trend="up"
          delta="0%"
          goodWhen="up"
          context="From customer ratings"
        />
        <KpiCard
          label="Total Assigned"
          value={String(stats.totalAssigned)}
          trend={stats.totalAssigned > 0 ? "up" : "down"}
          delta="0%"
          goodWhen="up"
          context="All time"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BarsChart title="My Tickets by Day" data={stats.ticketsByDay ?? []} />
        <DonutChart
          title="My Channel Breakdown"
          data={stats.channelMix ?? []}
        />
      </div>

      <Card title="Quick Actions & Recent Queue" className="w-full">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <Link
            href="/dashboard/tickets?mine=true"
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-primary-dark"
          >
            <Icon name="ticket" size={13} />
            View my assigned tickets
          </Link>
          <Link
            href="/dashboard/tickets"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="inbox" size={13} />
            View all open conversations
          </Link>
        </div>

        {tickets.length > 0 ? (
          <div className="w-full overflow-x-auto">
            <RecentTicketsTable tickets={tickets} />
          </div>
        ) : (
          <p className="text-[12.5px] text-text-3">No active tickets assigned to you right now.</p>
        )}
      </Card>
    </div>
  );
}

function RecentTicketsTable({ tickets }: { tickets: Ticket[] }) {
  const columns = useMemo<ColumnDef<Ticket, unknown>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Ticket",
        cell: ({ row }) => {
          const t = row.original;
          return (
            <Link
              href={`/dashboard/tickets?email=${encodeURIComponent(t.email)}`}
              className={`font-mono text-code ${t.unread ? "font-bold text-text" : ""} hover:text-primary`}
            >
              {ticketNumberFor(t)}
            </Link>
          );
        },
      },
      {
        accessorKey: "subject",
        header: "Subject",
        cell: ({ row }) => {
          const t = row.original;
          return (
            <CellMain
              main={
                <Link
                  href={`/dashboard/tickets?email=${encodeURIComponent(t.email)}`}
                  className="font-semibold hover:text-primary"
                >
                  {t.subject}
                </Link>
              }
              sub={<Pill status={t.status} className="mt-1" />}
            />
          );
        },
      },
      {
        accessorKey: "cust",
        header: "Customer",
        cell: ({ row }) => <CellMain main={row.original.cust} sub={row.original.phone} />,
      },
      {
        accessorKey: "channel",
        header: "Channel",
        cell: ({ row }) => CHANNEL_LABEL[row.original.channel] ?? row.original.channel,
      },
      {
        accessorKey: "time",
        header: "Time",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-text-2">{row.original.time}</span>
        ),
      },
    ],
    [],
  );
  return (
    <DataTable
      columns={columns}
      data={tickets}
      getRowId={(t) => t.id}
      hoverable
      borderless
      emptyIcon="ticket"
      emptyTitle="Nothing here yet"
      emptySubtitle="New customer tickets will land here."
    />
  );
}

function LeaderboardTable({ agents }: { agents: LeaderboardRow[] }) {
  const columns = useMemo<ColumnDef<LeaderboardRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Agent",
        cell: ({ row }) => {
          const a = row.original;
          return (
            <span className="flex items-center gap-2.5">
              <span className="relative">
                <Avatar name={a.name} color={a.color} size="sm" />
                {a.online && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-surface bg-primary" />
                )}
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-text">{a.name}</span>
                <span className="block text-[11px] text-text-3">{a.online ? "Online" : "Offline"}</span>
              </span>
            </span>
          );
        },
      },
      {
        accessorKey: "resolutions30d",
        header: "Resolved 30d",
        cell: ({ row }) => (
          <span className="font-mono text-code text-right tabular-nums">{row.original.resolutions30d}</span>
        ),
      },
      {
        accessorKey: "csat",
        header: "CSAT",
        cell: ({ row }) => (
          <span className="text-right tabular-nums">
            {row.original.csat != null ? `${row.original.csat.toFixed(1)} ★` : "—"}
          </span>
        ),
      },
    ],
    [],
  );
  return (
    <DataTable
      columns={columns}
      data={agents}
      getRowId={(a) => a.id}
      hoverable
      borderless
      emptyIcon="users"
      emptyTitle="Nothing here yet"
      emptySubtitle="New agent resolutions will appear here."
    />
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="skeleton h-3.5 w-2/3" />
            <div className="skeleton mt-3 h-6 w-1/2" />
            <div className="skeleton mt-2 h-3 w-3/4" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton mt-4 h-[190px] w-full" />
          </div>
        ))}
      </div>
    </>
  );
}
