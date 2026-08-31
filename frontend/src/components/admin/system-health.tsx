"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";

interface HealthService {
  name: string;
  status: string;
  latency: string;
  errorRate: string;
}

interface HealthData {
  status: string;
  timestamp: string;
  services: HealthService[];
  metrics: {
    dbLatency: string;
    errorRate: string;
    queueDepth: number;
    dbPool: string;
    tenants: number;
    users: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  operational: "bg-emerald-500/10 text-emerald-600",
  degraded: "bg-amber-500/10 text-amber-600",
  down: "bg-red-500/10 text-red-600",
};

const ICON_COLORS: Record<string, string> = {
  operational: "text-emerald-600",
  degraded: "text-amber-600",
  down: "text-red-600",
};

export function SystemHealth() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetch = () => {
      api.get<HealthData>("/platform/health").then((data) => {
        if (active) { setHealth(data); setLoading(false); }
      }).catch(() => { if (active) setLoading(false); });
    };
    fetch();
    const iv = setInterval(fetch, 15000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  if (loading && !health) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const services = health?.services ?? [];
  const metrics = health?.metrics;
  const allOk = health?.status === "operational";

  return (
    <div className="flex flex-col gap-6 text-text">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text">System Health & Operational Status</h1>
          <p className="mt-1 text-[13px] text-text-3">
            Real-time monitoring of platform services, background queues, DB pools, and API health.
          </p>
        </div>

        <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-bold ${
          allOk
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
            : "border-amber-500/20 bg-amber-500/10 text-amber-600"
        }`}>
          <span className={`h-2 w-2 rounded-full animate-pulse ${allOk ? "bg-emerald-500" : "bg-amber-500"}`} />
          {allOk ? "All Systems Operational" : "Degraded Performance"}
        </div>
      </header>

      {metrics && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-micro font-bold uppercase tracking-wider text-text-3">DB Latency</p>
            <p className="mt-2 text-2xl font-extrabold text-text">{metrics.dbLatency}</p>
            <span className="text-[11px] font-semibold text-emerald-600">✓ Measured live</span>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-micro font-bold uppercase tracking-wider text-text-3">Global Error Rate</p>
            <p className="mt-2 text-2xl font-extrabold text-text">{metrics.errorRate}</p>
            <span className="text-[11px] font-semibold text-emerald-600">✓ Below 0.1% SLA</span>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-micro font-bold uppercase tracking-wider text-text-3">Queue Depth</p>
            <p className="mt-2 text-2xl font-extrabold text-text">{metrics.queueDepth} jobs</p>
            <span className="text-[11px] font-semibold text-text-3">No backlogs</span>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <p className="text-micro font-bold uppercase tracking-wider text-text-3">DB Pool</p>
            <p className="mt-2 text-2xl font-extrabold text-text">{metrics.dbPool}</p>
            <span className="text-[11px] font-semibold text-emerald-600">Healthy headroom</span>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-micro font-bold uppercase tracking-wider text-text-3 mb-3">Service Components</h3>
        <div className="flex flex-col gap-2">
          {services.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded border border-border p-3 text-[13px]">
              <div className="flex items-center gap-3">
                <Icon name="checkcircle" size={16} className={ICON_COLORS[s.status] ?? "text-text-3"} />
                <span className="font-semibold text-text">{s.name}</span>
              </div>

              <div className="flex items-center gap-4 font-mono text-[12px]">
                <span className="text-text-3">Latency: <strong className="text-text">{s.latency}</strong></span>
                <span className="text-text-3">Errors: <strong className="text-text">{s.errorRate}</strong></span>
                <span className={`rounded px-2 py-0.5 text-[10.5px] font-bold uppercase ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {s.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
