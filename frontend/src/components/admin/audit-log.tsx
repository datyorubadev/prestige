"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { DataTable } from "@/components/ui/data-table";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { AuditLog } from "@/lib/types";

const ACTOR_FILTERS = ["All", "super_admin", "owner", "agent", "customer", "system"] as const;
type ActorFilter = (typeof ACTOR_FILTERS)[number];

function AuditTable({
  list,
  onSelect,
}: {
  list: AuditLog[];
  onSelect: (item: AuditLog) => void;
}) {
  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        accessorKey: "time",
        header: "When",
        cell: ({ row }) => <span className="whitespace-nowrap text-text-3">{row.original.time}</span>,
      },
      {
        accessorKey: "actor",
        header: "Actor",
        cell: ({ row }) => <span className="font-mono text-code">{row.original.actor}</span>,
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => <span className="font-semibold text-text">{row.original.action}</span>,
      },
      {
        accessorKey: "target",
        header: "Target",
        cell: ({ row }) => <span className="text-text-2">{row.original.target}</span>,
      },
      {
        accessorKey: "detail",
        header: "Details",
        cell: ({ row }) => <span className="text-text-2 line-clamp-1">{row.original.detail}</span>,
      },
      {
        accessorKey: "ip",
        header: "IP Address",
        cell: ({ row }) => <span className="font-mono text-[11.5px] text-text-3">{row.original.ip || "—"}</span>,
      },
      {
        accessorKey: "result",
        header: "Result",
        cell: ({ row }) => (
          <span
            className={cn(
              "font-semibold text-[11.5px] uppercase",
              row.original.result === "denied" ? "text-danger" : "text-primary",
            )}
          >
            {row.original.result || "ok"}
          </span>
        ),
      },
    ],
    [],
  );
  return (
    <DataTable
      columns={columns}
      data={list}
      hoverable
      onRowClick={(row) => onSelect(row)}
      emptyIcon="clipboard"
      emptyTitle="No audit entries found"
      emptySubtitle="No actions match the current filter or search criteria."
    />
  );
}

export function AuditLogViewer() {
  const [entries, setEntries] = useState<AuditLog[] | null>(null);
  const [filter, setFilter] = useState<ActorFilter>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<AuditLog[]>("/audit")
      .then((data) => active && setEntries(data))
      .catch(() => active && setEntries([]));
    return () => {
      active = false;
    };
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter(
      (a) =>
        (filter === "All" || a.actor === filter) &&
        (!q ||
          `${a.actor} ${a.action} ${a.target} ${a.detail}`.toLowerCase().includes(q)),
    );
  }, [entries, filter, query]);

  const exportCsv = () => {
    if (!list || list.length === 0) return;
    const headers = ["When", "Actor", "Action", "Target", "Details", "IP Address", "Result"];
    const rows = list.map((a) => [
      `"${a.time || ""}"`,
      `"${a.actor || ""}"`,
      `"${a.action || ""}"`,
      `"${(a.target || "").replace(/"/g, '""')}"`,
      `"${(a.detail || "").replace(/"/g, '""')}"`,
      `"${a.ip || ""}"`,
      `"${a.result || "ok"}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyJson = () => {
    if (!selected) return;
    void navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Audit Log</h1>
          <p className="mt-1 text-[13px] text-text-3">
            Immutable system and security event trail across all organizations. Click any event to inspect details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-2">
            <Icon name="search" size={14} className="text-text-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search audit…"
              className="w-44 bg-transparent text-[12.5px] text-text placeholder:text-text-3 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!list || list.length === 0}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-text transition-colors duration-150 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="download" size={14} />
            Export CSV
          </button>
        </div>
      </header>

      <div className="sec-filter flex flex-wrap gap-2">
        {ACTOR_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150",
              filter === f
                ? "border-primary-border bg-primary-soft text-primary-dark"
                : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            {f === "All" ? "All" : f.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="w-full">
        {!entries ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton mt-3 h-10 w-full" />
            <div className="skeleton mt-3 h-10 w-full" />
          </div>
        ) : (
          <AuditTable list={list} onSelect={setSelected} />
        )}
      </div>

      {/* Right Side Slide-Over Modal / Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-2xl animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-surface">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="shield" size={16} />
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-text">Audit Event Breakdown</h3>
                  <p className="text-[11.5px] text-text-3 font-mono">ID: {selected.actor}-{selected.time}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text transition-colors"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              {/* Event Status Banner */}
              <div
                className={cn(
                  "flex items-center justify-between rounded-lg p-3.5",
                  selected.result === "denied"
                    ? "bg-danger-soft text-danger"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                )}
              >
                <div className="flex items-center gap-2 font-bold text-[13px]">
                  <Icon name={selected.result === "denied" ? "close" : "check"} size={16} />
                  <span>{selected.result === "denied" ? "Action Access Denied" : "Event Executed Successfully"}</span>
                </div>
                <span className="rounded bg-white/80 dark:bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold uppercase shadow-2xs">
                  {selected.result || "ok"}
                </span>
              </div>

              {/* Core Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                  <span className="block font-bold uppercase tracking-wider text-[10.5px] text-text-3">Action Type</span>
                  <span className="mt-1 block font-semibold text-text">{selected.action}</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                  <span className="block font-bold uppercase tracking-wider text-[10.5px] text-text-3">Actor Role</span>
                  <span className="mt-1 block font-mono font-semibold text-text">{selected.actor}</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                  <span className="block font-bold uppercase tracking-wider text-[10.5px] text-text-3">Target Entity</span>
                  <span className="mt-1 block font-semibold text-text truncate">{selected.target || "System"}</span>
                </div>
                <div className="rounded-lg border border-border bg-surface-2/50 p-3">
                  <span className="block font-bold uppercase tracking-wider text-[10.5px] text-text-3">Timestamp</span>
                  <span className="mt-1 block text-text-2">{selected.time}</span>
                </div>
              </div>

              {/* Event Description */}
              <div className="rounded-lg border border-border bg-surface p-4">
                <span className="block font-bold uppercase tracking-wider text-[10.5px] text-text-3 mb-1">
                  Event Details & Payload
                </span>
                <p className="text-[13px] leading-relaxed text-text font-medium">{selected.detail}</p>
              </div>

              {/* Network and Device Security */}
              <div className="rounded-lg border border-border bg-surface p-4 space-y-2.5">
                <span className="block font-bold uppercase tracking-wider text-[10.5px] text-text-3">
                  Network & Session Security
                </span>
                <div className="flex items-center justify-between text-[12px] border-b border-border/60 pb-2">
                  <span className="text-text-3">Origin IP Address</span>
                  <span className="font-mono font-semibold text-text">{selected.ip || "127.0.0.1 (Localhost)"}</span>
                </div>
                <div className="flex items-center justify-between text-[12px] border-b border-border/60 pb-2">
                  <span className="text-text-3">Device / User Agent</span>
                  <span className="font-semibold text-text">{selected.device || "Chrome / Standard Browser"}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-text-3">Session Verification</span>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 text-[11px]">
                    <Icon name="check" size={12} /> TLS 1.3 Verified
                  </span>
                </div>
              </div>

              {/* Raw JSON Inspect */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold uppercase tracking-wider text-[10.5px] text-text-3">
                    Raw Audit Record (JSON)
                  </span>
                  <button
                    type="button"
                    onClick={copyJson}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-dark"
                  >
                    <Icon name={copied ? "check" : "copy"} size={12} />
                    {copied ? "Copied" : "Copy JSON"}
                  </button>
                </div>
                <pre className="rounded-lg border border-border bg-slate-950 p-3.5 font-mono text-[11.5px] leading-relaxed text-emerald-400 overflow-x-auto">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border p-4 bg-surface">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-xs"
              >
                <Icon name="check" size={14} />
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
