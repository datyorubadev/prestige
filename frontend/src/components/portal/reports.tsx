"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { BarsChart } from "@/components/dashboard/bars-chart";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { DataTable, type Column } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import type { TenantReportMetrics, AgentUser } from "@/lib/types";

type ReportsTab = "overview" | "performance" | "ai" | "sla" | "csat";

export function TenantReports() {
  const [metrics, setMetrics] = useState<TenantReportMetrics | null>(null);
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [tab, setTab] = useState<ReportsTab>("overview");
  const [dateRange, setDateRange] = useState<DateRange>({ preset: "30d", label: "Last 30 days" });
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);

  const channelRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (channelRef.current && !channelRef.current.contains(e.target as Node)) {
        setChannelOpen(false);
      }
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const { user } = useAuth();
  const toast = useToast();

  const load = useCallback(() => {
    let active = true;
    const daysParam = dateRange.preset === "today" ? 1 : dateRange.preset === "7d" ? 7 : dateRange.preset === "14d" ? 14 : dateRange.preset === "30d" ? 30 : dateRange.preset === "90d" ? 90 : undefined;
    const url = daysParam ? `/reports?days=${daysParam}` : "/reports";
    void Promise.all([
      api.get<TenantReportMetrics>(url).catch(() => null),
      api.get<AgentUser[]>("/agents").catch(() => []),
    ]).then(([m, ag]) => {
      if (!active) return;
      setMetrics(m);
      setAgents(ag);
    });
    return () => {
      active = false;
    };
  }, [dateRange.preset]);

  useEffect(load, [load]);

  useRealtime({
    ticket_updated: () => void load(),
    ticket_created: () => void load(),
  });

  // Export CSV Handler
  const exportCsv = () => {
    if (!metrics) return;
    const rows: string[][] = [
      ["PRESTIGE ENTERPRISE ANALYTICS REPORT"],
      ["Generated At", new Date().toLocaleString()],
      ["Date Range", dateRange.label],
      ["Channel Filter", selectedChannel.toUpperCase()],
      [],
      ["Metric", "Value"],
      ...metrics.kpis.map((k) => [k.label, k.value]),
      [],
      ["Agent Leaderboard (30d)"],
      ["Agent Name", "Resolutions", "CSAT Rating"],
      ...metrics.leaderboard.map((a) => [a.name, String(a.resolutions30d), a.csat ? String(a.csat) : "N/A"]),
      [],
      ["First Response Time (min)"],
      ["Day", "FRT"],
      ...metrics.frt.map((p) => [p.label, String(p.value)]),
      [],
      ["Deflection vs Escalation"],
      ["Day", "Deflection %"],
      ...metrics.deflection.map((p) => [p.label, String(p.value)]),
      [],
      ["Triage Distribution"],
      ["Category", "Percentage"],
      ...metrics.triage.map((t) => [t.label, `${t.value}%`]),
      [],
      ["Escalation Trigger Reasons"],
      ["Rule ID", "Rule Name", "Percentage"],
      ...metrics.escalationReasons.map((r) => [r.ruleId, r.name, `${r.pct}%`]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prestige-analytics-${dateRange.preset}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Report exported as CSV");
    setExportOpen(false);
  };

  // Export JSON Handler
  const exportJson = () => {
    if (!metrics) return;
    const data = {
      report: "Prestige Enterprise Analytics",
      tenantId: user?.tenantId ?? "t1",
      generatedAt: new Date().toISOString(),
      dateRange,
      channel: selectedChannel,
      metrics,
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prestige-analytics-${dateRange.preset}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Report exported as JSON");
    setExportOpen(false);
  };

  // Print PDF Handler
  const exportPdf = () => {
    window.print();
    setExportOpen(false);
  };

  const agentColumns: Column<TenantReportMetrics["leaderboard"][0] & { rank?: number }>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (r) => {
        const rank = r.rank ?? 1;
        if (rank === 1) return <span className="inline-flex items-center gap-1 font-bold text-amber-500"><Icon name="trophy" size={15} /> 1st</span>;
        if (rank === 2) return <span className="inline-flex items-center gap-1 font-bold text-slate-400"><Icon name="award" size={15} /> 2nd</span>;
        if (rank === 3) return <span className="inline-flex items-center gap-1 font-bold text-amber-700"><Icon name="award" size={15} /> 3rd</span>;
        return <span className="font-mono text-text-3 font-semibold pl-2">#{rank}</span>;
      },
    },
    {
      key: "name",
      header: "Agent Name",
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.name} color={r.color} size="sm" />
          <span className="font-semibold text-text">{r.name}</span>
        </div>
      ),
    },
    {
      key: "resolutions30d",
      header: "30D Resolutions",
      sortable: true,
      align: "right",
      render: (r) => <span className="font-mono font-bold text-text">{r.resolutions30d}</span>,
    },
    {
      key: "csat",
      header: "CSAT Score",
      sortable: true,
      align: "center",
      render: (r) =>
        r.csat != null ? (
          <span className="inline-flex items-center gap-1 font-bold text-amber-500">
            ★ {r.csat.toFixed(1)}
          </span>
        ) : (
          <span className="text-text-3">—</span>
        ),
    },
  ];

  const CHANNELS = [
    { value: "all", label: "All Channels" },
    { value: "chat", label: "Web Chat Widget" },
    { value: "portal", label: "Customer Portal" },
    { value: "email", label: "Email Support" },
  ];

  const isOwner = user?.role === "owner" || user?.role === "super_admin";

  const allTabs = [
    { id: "overview", label: "Overview", icon: "grid", ownerOnly: false },
    { id: "performance", label: isOwner ? "Agent Performance" : "My Performance", icon: "users", ownerOnly: false },
    { id: "ai", label: "AI & Deflection", icon: "zap", ownerOnly: true },
    { id: "sla", label: "SLA & Escalations", icon: "shield", ownerOnly: true },
    { id: "csat", label: "Customer CSAT", icon: "smile", ownerOnly: false },
  ];

  const visibleTabs = allTabs.filter((t) => !t.ownerOnly || isOwner);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header & Filter Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {isOwner ? "Reports & Analytics" : "My Performance Reports"}
          </h1>
          <p className="mt-1 text-sm text-text-2">
            {isOwner
              ? "Real-time performance metrics, team resolution SLAs, AI deflection, and CSAT benchmarks."
              : "Track your personal resolution rates, CSAT score, and active handling time."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Custom Channel Selector (Icon-free, clean) */}
          <div ref={channelRef} className="relative">
            <button
              type="button"
              onClick={() => setChannelOpen((v) => !v)}
              className="inline-flex h-9 items-center justify-between gap-2.5 rounded-md border border-border bg-surface px-3 text-[12.5px] font-medium text-text shadow-xs outline-none focus:outline-none transition-colors duration-150 hover:border-primary-border hover:bg-primary-soft/50 hover:text-primary-dark"
            >
              <span>{CHANNELS.find((c) => c.value === selectedChannel)?.label}</span>
              <Icon name="chevron-down" size={13} className="text-text-3" />
            </button>

            {channelOpen && (
              <div className="menu-panel absolute right-0 top-full z-40 mt-1.5 w-56 p-1.5 shadow-lg border border-border rounded-xl bg-surface animate-in fade-in zoom-in-95 duration-100">
                <div className="space-y-0.5">
                  {CHANNELS.map((c) => {
                    const isSelected = selectedChannel === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => {
                          setSelectedChannel(c.value);
                          setChannelOpen(false);
                        }}
                        className={cn(
                          "menu-item flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[12.5px] font-medium outline-none transition-colors duration-150",
                          isSelected
                            ? "bg-primary-soft/60 font-semibold text-primary-dark"
                            : "text-text hover:bg-primary-soft/60 hover:text-primary-dark",
                        )}
                      >
                        <span>{c.label}</span>
                        {isSelected && <Icon name="check" size={13} className="text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Date Range Picker */}
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          {/* Export Dropdown */}
          <div ref={exportRef} className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[12.5px] font-semibold text-text shadow-xs outline-none focus:outline-none"
            >
              <Icon name="file" size={14} className="text-text-3" />
              <span>Export</span>
              <Icon name="chevron-down" size={13} className="text-text-3" />
            </button>

            {exportOpen && (
              <div className="menu-panel absolute right-0 top-full z-40 mt-1.5 w-48 p-1 shadow-lg border border-border rounded-xl bg-surface animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="menu-item flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-text outline-none"
                >
                  <Icon name="file" size={14} className="text-emerald-600" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={exportJson}
                  className="menu-item flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-text outline-none"
                >
                  <Icon name="sliders" size={14} className="text-blue-600" />
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  onClick={exportPdf}
                  className="menu-item flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-text outline-none"
                >
                  <Icon name="printer" size={14} className="text-violet-600" />
                  <span>Print PDF Summary</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Interactive Tabs */}
      <div className="flex gap-2 border-b border-border pb-2 text-[13px] font-semibold">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as ReportsTab)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors duration-150 outline-none focus:outline-none",
              tab === t.id ? "bg-primary text-white" : "text-text-2 hover:bg-surface-2",
            )}
          >
            <Icon name={t.icon as any} size={14} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {!metrics ? (
        <ReportsSkeleton />
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
                {metrics.kpis.map((k) => (
                  <KpiCard key={k.label} {...k} />
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <BarsChart
                  title="First response time (min)"
                  data={metrics.frt}
                  color="#2563eb"
                />
                <BarsChart
                  title="Deflection vs escalation (14d)"
                  data={metrics.deflection}
                  color="#00a86b"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card title="Triage breakdown" icon="filter">
                  <p className="mb-4 text-meta text-text-3">How incoming chats are classified</p>
                  <div className="flex flex-col gap-4">
                    {metrics.triage.map((t) => (
                      <MeterRow key={t.label} label={t.label} value={`${t.value}%`} color={t.color} />
                    ))}
                  </div>
                </Card>

                <ActivityFeed items={metrics.feed} />
              </div>
            </div>
          )}

          {/* TAB 2: AGENT PERFORMANCE */}
          {tab === "performance" && (
            <div className="space-y-6">
              {!isOwner && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 shadow-xs">
                      <Icon name="trophy" size={26} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[15px] font-bold text-text">Your Performance Standing</h3>
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          Top Tier Performer
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-text-2">
                        You have resolved <span className="font-semibold text-text">{user?.fullName ?? "your"}</span> customer inquiries with an average CSAT of <span className="font-semibold text-amber-500">4.9 ★</span>.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div className="rounded-lg bg-surface border border-border px-4 py-2 text-center shadow-xs">
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-text-3">Your Rank</p>
                      <p className="mt-0.5 text-base font-black text-amber-500 flex items-center justify-center gap-1">
                        <Icon name="trophy" size={15} /> #1 Top Agent
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-text">
                    {isOwner ? "Team & Agent Performance Leaderboard" : "Team Performance Leaderboard"}
                  </h2>
                  <p className="text-xs text-text-3">Metrics for active team members over the past 30 days.</p>
                </div>
              </div>
              <DataTable
                data={metrics.leaderboard.map((item, idx) => ({ ...item, rank: idx + 1 }))}
                columns={agentColumns}
                searchKey="name"
                searchPlaceholder="Search agents..."
                pageSize={10}
              />
            </div>
          )}

          {/* TAB 3: AI & DEFLECTION */}
          {tab === "ai" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-xs font-bold uppercase text-text-3">AI Resolution Rate</p>
                  <p className="mt-2 text-2xl font-extrabold text-emerald-600">{metrics.aiResolutionRate ?? "0%"}</p>
                  <span className="text-[11px] text-text-3">Solved without human agent intervention</span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-xs font-bold uppercase text-text-3">AI Handoff Rate</p>
                  <p className="mt-2 text-2xl font-extrabold text-amber-500">{metrics.aiHandoffRate ?? "0%"}</p>
                  <span className="text-[11px] text-text-3">Escalated to human support staff</span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-xs font-bold uppercase text-text-3">Vector RAG Confidence</p>
                  <p className="mt-2 text-2xl font-extrabold text-indigo-600">{metrics.ragConfidence ?? "0.0%"}</p>
                  <span className="text-[11px] text-text-3">Average KB retrieval accuracy</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <BarsChart
                  title="Daily AI deflection trend"
                  data={metrics.deflection}
                  color="#00a86b"
                />
                <Card title="Triage classification share" icon="zap">
                  <div className="flex flex-col gap-4 mt-2">
                    {metrics.triage.map((t) => (
                      <MeterRow key={t.label} label={t.label} value={`${t.value}%`} color={t.color} />
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 4: SLA & ESCALATIONS */}
          {tab === "sla" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-xs font-bold uppercase text-text-3">SLA Compliance Rate</p>
                  <p className="mt-2 text-2xl font-extrabold text-emerald-600">{metrics.slaCompliance ?? "100%"}</p>
                  <span className="text-[11px] text-text-3">First response within target threshold</span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-xs font-bold uppercase text-text-3">Average Resolution Time</p>
                  <p className="mt-2 text-2xl font-extrabold text-blue-600">{metrics.avgResolutionTime ?? "0m"}</p>
                  <span className="text-[11px] text-text-3">From ticket creation to resolution</span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-xs font-bold uppercase text-text-3">SLA Breaches (30d)</p>
                  <p className="mt-2 text-2xl font-extrabold text-rose-500">{metrics.slaBreaches ?? "0 tickets"}</p>
                  <span className="text-[11px] text-text-3">Exceeded first response threshold</span>
                </div>
              </div>

              <Card title="Escalation Trigger Reasons (30d)" icon="shield">
                <p className="mb-4 text-meta text-text-3">Rule triggers that routed tickets to owners</p>
                {metrics.escalationReasons.length === 0 ? (
                  <div className="py-8 text-center text-text-3 text-[13px]">
                    No escalation rule triggers recorded in this period.
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {metrics.escalationReasons.map((r) => (
                      <MeterRow
                        key={r.ruleId}
                        label={
                          <span className="flex items-center gap-2">
                            <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-code text-text">
                              {r.ruleId}
                            </code>
                            <span className="font-semibold text-text">{r.name}</span>
                          </span>
                        }
                        value={`${r.pct}%`}
                        color={r.color}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* TAB 5: CSAT & CUSTOMER FEEDBACK */}
          {tab === "csat" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-border bg-surface p-4 text-center">
                  <p className="text-xs font-bold uppercase text-text-3">Overall CSAT Score</p>
                  <p className="mt-2 text-3xl font-extrabold text-amber-500">{metrics.csatScore ?? "N/A"}</p>
                  <span className="text-[11px] text-emerald-600 font-semibold">
                    {metrics.csatCount && metrics.csatCount > 0 ? "★ Calculated from ratings" : "No ratings yet"}
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4 text-center">
                  <p className="text-xs font-bold uppercase text-text-3">Ratings Received</p>
                  <p className="mt-2 text-3xl font-extrabold text-text">{metrics.csatCount ?? 0}</p>
                  <span className="text-[11px] text-text-3">30 day period</span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4 text-center">
                  <p className="text-xs font-bold uppercase text-text-3">5-Star Ratings</p>
                  <p className="mt-2 text-3xl font-extrabold text-emerald-600">{metrics.csat5Count ?? 0}</p>
                  <span className="text-[11px] text-text-3">
                    {metrics.csatCount ? `${Math.round(((metrics.csat5Count ?? 0) / metrics.csatCount) * 100)}% of total ratings` : "0% of total ratings"}
                  </span>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4 text-center">
                  <p className="text-xs font-bold uppercase text-text-3">1-Star Ratings</p>
                  <p className="mt-2 text-3xl font-extrabold text-rose-500">{metrics.csat1Count ?? 0}</p>
                  <span className="text-[11px] text-text-3">
                    {metrics.csatCount ? `${Math.round(((metrics.csat1Count ?? 0) / metrics.csatCount) * 100)}% of total ratings` : "0% of total ratings"}
                  </span>
                </div>
              </div>

              <Card title="Recent Customer Feedback Comments" icon="smile">
                {!metrics.csatFeedback || metrics.csatFeedback.length === 0 ? (
                  <div className="py-10 text-center text-text-3 text-[13px]">
                    No customer feedback ratings or comments recorded yet.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {metrics.csatFeedback.map((f, i) => (
                      <div key={i} className="py-3.5 flex items-start gap-3">
                        <Avatar name={f.name} color="#00a86b" size="sm" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-text text-[13px]">{f.name}</span>
                            <span className="text-[11px] text-text-3">{f.time}</span>
                          </div>
                          <div className="flex items-center gap-1 text-amber-500 text-[11px] mt-0.5">
                            {Array.from({ length: 5 }).map((_, st) => (
                              <span key={st} style={{ opacity: st < f.rating ? 1 : 0.2 }}>★</span>
                            ))}
                          </div>
                          <p className="mt-1 text-[12.5px] text-text-2">{f.comment}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MeterRow({
  label,
  value,
  color,
}: {
  label: React.ReactNode;
  value: string;
  color: string;
}) {
  const pct = Number.parseFloat(value.replace("%", ""));
  return (
    <div className="group flex items-center gap-3 rounded-sm px-1 py-0.5 transition-colors duration-150 hover:bg-surface-2/50">
      <span className="flex w-44 shrink-0 items-center gap-2 truncate text-[12.5px] text-text-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{label}</span>
      </span>
      <b className="w-10 shrink-0 text-right text-[12.5px] tabular-nums text-text">{value}</b>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-24 rounded-xl bg-surface-2 border border-border" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-surface-2 border border-border" />
    </div>
  );
}
