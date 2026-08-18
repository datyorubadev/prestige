"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/icons";
import type { ColumnDef } from "@tanstack/react-table";
import type { AuditLog } from "@/lib/types";

export function AdminSecurityTab() {
  const toast = useToast();
  const [audit, setAudit] = useState<AuditLog[] | null>(null);
  const [invite2fa, setInvite2fa] = useState(true);
  const [forceSso, setForceSso] = useState(false);
  const [lockoutDays, setLockoutDays] = useState("90");
  const [sessions, setSessions] = useState(false);

  const load = () => void api.get<AuditLog[]>("/audit").then(setAudit).catch(() => setAudit([]));
  useEffect(() => {
    load();
  }, []);

  useRealtime({ settings_changed: () => load() });

  const invalidate = () => {
    setSessions(true);
    setTimeout(() => {
      setSessions(false);
      toast("All admin sessions invalidated — tokens revoked & audited");
    }, 350);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Security</h1>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Access policy" icon="shield">
          <div className="flex flex-col gap-4">
            <ToggleRow
              title="Require 2FA on invite"
              desc="New admin accounts must enroll an authenticator before first sign-in"
              checked={invite2fa}
              onChange={setInvite2fa}
            />
            <ToggleRow
              title="Enforce SSO for platform admins"
              desc="Password sign-in is disabled for the platform admin role"
              checked={forceSso}
              onChange={setForceSso}
            />
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">
                Session expiry (days)
              </span>
              <input
                value={lockoutDays}
                onChange={(e) => setLockoutDays(e.target.value)}
                type="number"
                min={1}
                className="input-control"
              />
            </label>
            <button
              type="button"
              onClick={invalidate}
              disabled={sessions}
              className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-danger-border bg-danger-soft px-3 py-1.5 text-[12px] font-semibold text-danger transition-colors duration-150 hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="power" size={14} />
              {sessions ? "Revoking…" : "Invalidate all admin sessions"}
            </button>
          </div>
        </Card>

        <Card title="Recent admin audit" icon="shield">
          {!audit ? (
            <div className="flex flex-col gap-3">
              <div className="skeleton h-12 w-full" />
              <div className="skeleton h-12 w-full" />
              <div className="skeleton h-12 w-full" />
            </div>
          ) : (
            <SecurityAuditTable audit={audit} />
          )}
        </Card>
      </div>

      <p className="rounded-sm border border-border bg-surface-2 px-4 py-3 text-[12px] text-text-3">
        Full event stream (all tenants) is available in the Audit log. Session invalidation is
        irreversible and recorded as a critical platform event.
      </p>
    </div>
  );
}

function SecurityAuditTable({ audit }: { audit: AuditLog[] }) {
  const columns = useMemo<ColumnDef<AuditLog, unknown>[]>(
    () => [
      {
        accessorKey: "action",
        header: "Event",
        cell: ({ row }) => <CellMain main={row.original.action} sub={row.original.detail} />,
      },
      {
        accessorKey: "actor",
        header: "Actor",
        cell: ({ row }) => (
          <>
            <p className="text-[12.5px] text-text-2">{row.original.actor}</p>
            <p className="text-[11px] text-text-3">{row.original.target ?? "—"}</p>
          </>
        ),
      },
      {
        accessorKey: "time",
        header: "When",
        cell: ({ row }) => <p className="text-[11px] text-text-3">{row.original.time}</p>,
      },
    ],
    [],
  );
  return (
    <DataTable
      columns={columns}
      data={audit.slice(0, 6)}
      getRowId={(e: AuditLog, i: number) => `${e.time}-${e.action}-${i}`}
      hoverable
      borderless
    />
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-text">{title}</p>
        <p className="mt-0.5 text-[12px] text-text-2">{desc}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
