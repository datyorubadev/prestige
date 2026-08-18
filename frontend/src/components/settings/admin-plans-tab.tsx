"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type { ColumnDef } from "@tanstack/react-table";
import type { Plan } from "@/lib/types";

export function AdminPlansTab() {
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);

  const [price, setPrice] = useState("0");
  const [agents, setAgents] = useState("1");
  const [customers, setCustomers] = useState("500");
  const [kb, setKb] = useState("2 GB");

  const load = () => void api.get<Plan[]>("/plans").then(setPlans).catch(() => setPlans([]));
  useEffect(() => {
    load();
  }, []);

  useRealtime({ billing_changed: () => load() });

  const openEdit = (p: Plan) => {
    setEditing(p);
    setPrice(String(p.priceNum));
    setAgents(String(p.agents));
    setCustomers(String(p.customers));
    setKb(p.kb);
  };

  const savePlan = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const patch = {
        priceNum: Math.max(0, Number(price) || 0),
        price: `₦${Number(price).toLocaleString("en-NG")}`,
        agents: Math.max(0, Number(agents) || 0),
        customers: Math.max(0, Number(customers) || 0),
        kb,
      };
      const updated = await api.patch<Plan>(`/plans/${editing.code}`, patch);
      setPlans((prev) => (prev ?? []).map((p) => (p.code === updated.code ? updated : p)));
      setEditing(null);
      toast(`${updated.name} template updated`);
    } catch {
      toast("Could not save plan template", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Plans & quotas</h1>
      </header>

      <Card title="Plan templates" icon="card">
        {!plans ? (
          <div className="flex flex-col gap-3">
            <div className="skeleton h-14 w-full" />
            <div className="skeleton h-14 w-full" />
            <div className="skeleton h-14 w-full" />
          </div>
        ) : (
          <PlansTable plans={plans} onEdit={openEdit} />
        )}
      </Card>

      <Card title="Quota enforcement" icon="shield">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuotaCard label="Agents" desc="Hard stop on invites at plan limit" value="enforced" />
          <QuotaCard label="Customers" desc="Soft warning, then suspension after 3 days" value="warning + suspend" />
          <QuotaCard label="Knowledge base" desc="Blocked at 100%, alert at 90%" value="block at limit" />
        </div>
      <p className="mt-3 rounded-sm border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-text-3">
        Overage behavior follows the plan template — edits here apply to new and existing
        subscriptions at their next billing cycle.
      </p>
    </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? ""} template`}
        icon="card"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void savePlan()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              Save template
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Price / month (₦)</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              min={0}
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Agents</span>
            <input
              value={agents}
              onChange={(e) => setAgents(e.target.value)}
              type="number"
              min={0}
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Customers</span>
            <input
              value={customers}
              onChange={(e) => setCustomers(e.target.value)}
              type="number"
              min={0}
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Knowledge base</span>
            <input
              value={kb}
              onChange={(e) => setKb(e.target.value)}
              placeholder="e.g. 20 GB"
              className="input-control"
            />
          </label>
          <p className="rounded-sm bg-primary-soft px-3 py-2 text-[11.5px] text-primary-dark">
            Changes propagate to every tenant on this plan at next billing.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function PlansTable({ plans, onEdit }: { plans: Plan[]; onEdit: (p: Plan) => void }) {
  const columns: ColumnDef<Plan, unknown>[] = [
    {
      accessorKey: "name",
      header: "Plan",
      cell: ({ row }) => (
        <CellMain
          main={
            <span className="flex items-center gap-2">
              <span className="font-bold text-text">{row.original.name}</span>
              <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-code text-text-3">
                {row.original.code}
              </code>
            </span>
          }
        />
      ),
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) => <span className="font-mono text-code">{row.original.price}/mo</span>,
    },
    {
      accessorKey: "agents",
      header: "Quotas",
      cell: ({ row }) => (
        <span>
          {row.original.agents} agents · {row.original.customers.toLocaleString("en-NG")} customers · {row.original.kb}
        </span>
      ),
    },
    {
      accessorKey: "tag",
      header: "Tag",
      enableSorting: false,
      cell: ({ row }) => (
        <Pill status={row.original.tag} tone={row.original.code === "pro" ? "info" : "neutral"} />
      ),
    },
    {
      id: "row_actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <button
            type="button"
            onClick={() => onEdit(row.original)}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="edit" size={13} />
            Edit
          </button>
        </div>
      ),
    },
  ];
  return <DataTable columns={columns} data={plans} getRowId={(p) => p.code} hoverable borderless />;
}

function QuotaCard({ label, desc, value }: { label: string; desc: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface-2 p-3">
      <p className="text-[12.5px] font-semibold text-text">{label}</p>
      <p className="mt-0.5 text-[11.5px] text-text-3">{desc}</p>
      <p className="mt-2 text-[11.5px] font-bold text-primary-dark">{value}</p>
    </div>
  );
}
