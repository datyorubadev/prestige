"use client";

import { Icon } from "@/components/icons";

export function SystemHealth() {
  const services = [
    { name: "REST API Gateway", status: "operational", latency: "24ms", errorRate: "0.01%" },
    { name: "Database Pool (SQLite / Postgres)", status: "operational", latency: "3ms", errorRate: "0.00%" },
    { name: "AI Vector RAG Engine", status: "operational", latency: "110ms", errorRate: "0.04%" },
    { name: "Email Inbound/Outbound Dispatcher", status: "operational", latency: "45ms", errorRate: "0.00%" },
    { name: "Webhooks Worker Queue", status: "operational", latency: "18ms", errorRate: "0.02%" },
    { name: "Chat Widget Gateway", status: "operational", latency: "12ms", errorRate: "0.00%" },
  ];

  return (
    <div className="flex flex-col gap-6 text-text">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text">System Health & Operational Status</h1>
          <p className="mt-1 text-[13px] text-text-3">
            Real-time monitoring of platform services, background queues, DB pools, and API health (§30 System Health).
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[12px] font-bold text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          All Systems Operational
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-micro font-bold uppercase tracking-wider text-text-3">Average API Latency</p>
          <p className="mt-2 text-2xl font-extrabold text-text">24 ms</p>
          <span className="text-[11px] font-semibold text-emerald-600">✓ Excellent</span>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-micro font-bold uppercase tracking-wider text-text-3">Global Error Rate</p>
          <p className="mt-2 text-2xl font-extrabold text-text">0.02%</p>
          <span className="text-[11px] font-semibold text-emerald-600">✓ Below 0.1% SLA</span>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-micro font-bold uppercase tracking-wider text-text-3">Background Queue Depth</p>
          <p className="mt-2 text-2xl font-extrabold text-text">0 jobs</p>
          <span className="text-[11px] font-semibold text-text-3">No backlogs</span>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-micro font-bold uppercase tracking-wider text-text-3">Active DB Pool Connections</p>
          <p className="mt-2 text-2xl font-extrabold text-text">14 / 100</p>
          <span className="text-[11px] font-semibold text-emerald-600">Healthy headroom</span>
        </div>
      </div>

      {/* Service Status Table */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-micro font-bold uppercase tracking-wider text-text-3 mb-3">Service Components</h3>
        <div className="flex flex-col gap-2">
          {services.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded border border-border p-3 text-[13px]">
              <div className="flex items-center gap-3">
                <Icon name="checkcircle" size={16} className="text-emerald-600" />
                <span className="font-semibold text-text">{s.name}</span>
              </div>

              <div className="flex items-center gap-4 font-mono text-[12px]">
                <span className="text-text-3">Latency: <strong className="text-text">{s.latency}</strong></span>
                <span className="text-text-3">Errors: <strong className="text-text">{s.errorRate}</strong></span>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-bold uppercase text-emerald-600">
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
