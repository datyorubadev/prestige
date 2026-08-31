"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatNgn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { Plan, PlanCode, Tenant } from "@/lib/types";

const PLAN_ORDER: PlanCode[] = ["starter", "pro", "enterprise"];

export function Subscriptions() {
  const toast = useToast();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [changing, setChanging] = useState<{
    tenant: Tenant;
    to: PlanCode;
    dir: "up" | "down";
  } | null>(null);
  const [saving, setSaving] = useState(false);

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
    return () => {
      active = false;
    };
  }, []);

  useEffect(load, [load]);

  // MRR recomputes from tenant plans — a platform override pushes in realtime.
  useRealtime({
    billing_changed: () => {
      void load();
    },
  });

  const priceOf = (code: PlanCode) => plans.find((p) => p.code === code)?.priceNum ?? 0;
  const mrr = (tenants ?? [])
    .filter((t) => t.status === "active" && t.plan !== "starter")
    .reduce((s, t) => s + priceOf(t.plan), 0);
  const paidCount = (tenants ?? []).filter(
    (t) => t.status === "active" && t.plan !== "starter",
  ).length;
  const trialCount = (tenants ?? []).filter((t) => t.status === "pending").length;
  const totalTrials = trialCount + paidCount;
  const conversionRate = totalTrials > 0 ? Math.round((paidCount / totalTrials) * 100) : 0;

  const planIndex = useCallback((code: PlanCode) => PLAN_ORDER.indexOf(code), []);
  const subStatus = useCallback(
    (t: Tenant) => (t.status === "pending" ? "trial" : t.status === "active" ? "active" : "canceled"),
    [],
  );

  const openChange = useCallback(
    (t: Tenant, to: PlanCode) => {
      const dir = planIndex(to) > planIndex(t.plan) ? "up" : "down";
      setChanging({ tenant: t, to, dir });
    },
    [planIndex],
  );

  const confirmChange = async () => {
    if (!changing) return;
    setSaving(true);
    try {
      const updated = await api.post<Tenant>(`/tenants/${changing.tenant.id}/plan`, {
        code: changing.to,
      });
      setTenants((prev) => (prev ?? []).map((t) => (t.id === updated.id ? updated : t)));
      toast(
        `${updated.name} moved to ${plans.find((p) => p.code === updated.plan)?.name ?? updated.plan}`,
      );
      setChanging(null);
    } catch {
      toast("Plan change failed", "danger");
    } finally {
      setSaving(false);
    }
  };

  const confirmDowngrade = (t: Tenant, target: Plan) => {
    const quota = target.agents;
    if (t.agents > quota) {
      toast(`Over-quota: ${t.name} has ${t.agents} agents, ${target.name} allows ${quota}`, "danger");
      return;
    }
    void confirmChange();
  };

  const columns = useMemo<ColumnDef<Tenant, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Tenant",
        cell: ({ row }) => <CellMain main={row.original.name} sub={row.original.email} />,
      },
      {
        accessorKey: "plan",
        header: "Current plan",
        cell: ({ row }) => <span className="capitalize">{row.original.plan}</span>,
      },
      {
        id: "price",
        header: "Price",
        accessorFn: (t) => plans.find((p) => p.code === t.plan)?.priceNum ?? 0,
        cell: ({ row }) => (
          <span className="font-mono text-code tabular-nums">
            {plans.find((p) => p.code === row.original.plan)?.price ?? "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <Pill status={subStatus(row.original)} dot />,
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
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const t = row.original;
          return (
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                {t.status === "pending" ? (
                  <span className="text-[11.5px] text-text-3">onboarding</span>
                ) : (
                  PLAN_ORDER.filter((c) => c !== t.plan).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => openChange(t, c)}
                      className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold capitalize text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                    >
                      <Icon name="swap" size={13} />
                      {planIndex(c) > planIndex(t.plan) ? "Upgrade" : "Downgrade"}
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        },
      },
    ],
    [plans, subStatus, openChange, planIndex],
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 text-text">Subscriptions</h1>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <Kpi label="MRR" value={mrr ? formatNgn(mrr) : "—"} note={`${paidCount} paid tenants`} icon="card" />
        <Kpi label="Trial → paid" value={`${conversionRate}%`} note={`${trialCount} trials · ${paidCount} paid`} icon="trend" good />
        <Kpi label="Avg. per tenant" value={paidCount ? formatNgn(Math.round(mrr / paidCount)) : "—"} note="paid plans only" icon="users" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((code) => {
          const p = plans.find((x) => x.code === code);
          if (!p) return null;
          return (
            <div
              key={code}
              className={cn(
                "relative rounded-md border bg-surface p-5 shadow-card",
                p.tag === "Popular" ? "border-primary-border" : "border-border",
              )}
            >
              {p.tag === "Popular" && (
                <span className="absolute right-4 top-4 rounded-full bg-primary-soft px-2.5 py-1 text-[10.5px] font-bold uppercase text-primary-dark">
                  Popular
                </span>
              )}
              <p className="text-[13px] font-bold text-text">{p.name}</p>
              <p className="mt-1 text-[22px] font-extrabold tabular-nums text-text">
                {p.price}
                <span className="text-[12px] font-medium text-text-3"> / month</span>
              </p>
              <p className="mt-1 text-[11.5px] text-text-3">{p.tag}</p>
              <ul className="mt-4 flex flex-col gap-2 text-[12.5px] text-text-2">
                <li className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-primary" /> {p.agents} agents
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-primary" />{" "}
                  {p.customers.toLocaleString("en-NG")} customers
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-primary" /> {p.kb} knowledge base
                </li>
              </ul>
            </div>
          );
        })}
      </div>

      <Card title="Tenant plans" icon="card">
        <p className="mb-4 text-meta text-text-3">
          Override a tenant&apos;s plan — effective immediately, prorated, audited
        </p>
        <div className="rounded-md border border-border">
          {!tenants ? (
            <div className="p-6">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton mt-3 h-10 w-full" />
            </div>
          ) : tenants.length === 0 ? (
            <EmptyState
              icon="building"
              title="No tenants yet"
              subtitle="Provisioned workspaces will appear here with their plan, usage and status."
              className="py-12"
            />
          ) : (
            <DataTable columns={columns} data={tenants} getRowId={(t) => t.id} hoverable borderless />
          )}
        </div>
      </Card>

      <Modal
        open={!!changing}
        onClose={() => setChanging(null)}
        title={`Confirm ${changing?.dir ?? ""} → ${
          plans.find((p) => p.code === changing?.to)?.name ?? ""
        }`}
        icon="card"
        footer={
          <>
            <button
              type="button"
              onClick={() => setChanging(null)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!changing) return;
                const target = plans.find((p) => p.code === changing.to);
                if (target && changing.dir === "down") confirmDowngrade(changing.tenant, target);
                else void confirmChange();
              }}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              Confirm
            </button>
          </>
        }
      >
        {changing && (
          <div className="flex flex-col gap-3 text-[12.5px]">
            <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface-2 px-3 py-2.5">
              <div>
                <p className="text-text-3">Current plan</p>
                <p className="font-semibold capitalize text-text">
                  {changing.tenant.plan} ·{" "}
                  {plans.find((p) => p.code === changing.tenant.plan)?.price ?? "—"}
                </p>
              </div>
              <Icon name="arrow-right" size={16} className="text-text-3" />
              <div className="text-right">
                <p className="text-text-3">New plan</p>
                <p className="font-semibold capitalize text-text">
                  {plans.find((p) => p.code === changing.to)?.name ?? changing.to} ·{" "}
                  {plans.find((p) => p.code === changing.to)?.price ?? "—"}
                </p>
              </div>
            </div>
            <p className="text-text-2">
              Effective immediately ·{" "}
              {changing.dir === "up" ? "prorated to next cycle" : "invoice generated for current cycle"}{" "}
              · audited.
            </p>
            {changing.dir === "down" &&
              (() => {
                const target = plans.find((p) => p.code === changing.to);
                return target && changing.tenant.agents > target.agents ? (
                  <p className="rounded-sm bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
                    {changing.tenant.name} has {changing.tenant.agents} agents but{" "}
                    {target.name} allows {target.agents} — over-quota agents will be blocked
                    (QUOTA_EXCEEDED).
                  </p>
                ) : null;
              })()}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  note,
  good,
}: {
  icon: "card" | "trend" | "users";
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
