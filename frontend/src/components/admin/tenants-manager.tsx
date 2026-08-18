"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { Tenant } from "@/lib/types";

const STATUS_FILTERS = ["All", "Active", "Pending", "Suspended"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const PLAN_LIMITS: Record<string, number> = { starter: 1, pro: 5, enterprise: 50 };

export function TenantsManager() {
  const { impersonate } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [busy, setBusy] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<Tenant | null>(null);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("starter");

  useEffect(() => {
    let active = true;
    api
      .get<Tenant[]>("/tenants")
      .then((data) => active && setTenants(data))
      .catch(() => active && setTenants([]));
    return () => {
      active = false;
    };
  }, []);

  const list = (tenants ?? []).filter(
    (t) => filter === "All" || t.status === filter.toLowerCase(),
  );

  const run = useCallback(
    async (id: string, kind: "approve" | "suspend" | "reactivate") => {
      setBusy(id);
      try {
        const updated = await api.post<Tenant>(`/tenants/${id}/${kind}`);
        setTenants((prev) => (prev ?? []).map((t) => (t.id === id ? updated : t)));
        toast(kind === "approve" ? `${updated.name} approved` : `${updated.name} ${kind}ed`);
      } catch {
        toast("Action failed", "danger");
      } finally {
        setBusy(null);
      }
    },
    [setBusy, setTenants, toast],
  );

  const toggleAi = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        const updated = await api.post<Tenant>(`/tenants/${id}/toggle-ai`);
        setTenants((prev) => (prev ?? []).map((t) => (t.id === id ? updated : t)));
        const stateText = updated.aiEnabled !== false ? "enabled" : "paused";
        toast(`AI ${stateText} for ${updated.name}`);
      } catch {
        toast("Could not toggle AI status", "danger");
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  const deleteTenantFunc = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        await api.del(`/tenants/${id}`);
        setTenants((prev) => (prev ?? []).filter((t) => t.id !== id));
        toast("Tenant workspace deleted");
        setDeletingTenant(null);
      } catch {
        toast("Could not delete tenant. Check for active paid subscriptions.", "danger");
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [editingQuotas, setEditingQuotas] = useState<Tenant | null>(null);
  const [quotaTokens, setQuotaTokens] = useState<number>(1000000);
  const [quotaAgents, setQuotaAgents] = useState<number>(5);
  const [quotaCustomers, setQuotaCustomers] = useState<number>(2000);
  const [quotaPlan, setQuotaPlan] = useState<string>("pro");

  useEffect(() => {
    if (editingQuotas) {
      setQuotaTokens(editingQuotas.aiTokensLimit ?? 1000000);
      setQuotaAgents(editingQuotas.agents ?? 5);
      setQuotaCustomers(editingQuotas.customers ?? 2000);
      setQuotaPlan(editingQuotas.plan ?? "pro");
    }
  }, [editingQuotas]);

  const saveQuotas = async () => {
    if (!editingQuotas) return;
    setBusy(editingQuotas.id);
    try {
      const updated = await api.patch<Tenant>(`/tenants/${editingQuotas.id}/quotas`, {
        ai_tokens_limit: quotaTokens,
        max_agents: quotaAgents,
        max_customers: quotaCustomers,
        plan_code: quotaPlan,
      });
      setTenants((prev) => (prev ?? []).map((t) => (t.id === editingQuotas.id ? updated : t)));
      toast(`Quotas and plan limits updated for ${updated.name}`);
      setEditingQuotas(null);
    } catch {
      toast("Could not update quotas", "danger");
    } finally {
      setBusy(null);
    }
  };

  const columns = useMemo<ColumnDef<Tenant, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Business",
        cell: ({ row }) => (
          <CellMain main={row.original.name} sub={`${row.original.email} · ${row.original.city}`} />
        ),
      },
      {
        accessorKey: "plan",
        header: "Plan",
        cell: ({ row }) => <span className="capitalize font-medium">{row.original.plan}</span>,
      },
      {
        id: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <Pill status={row.original.status} dot />,
      },
      {
        accessorKey: "agents",
        header: "Agents",
        cell: ({ row }) => (
          <span className="font-mono text-code tabular-nums">
            {row.original.agents} / {PLAN_LIMITS[row.original.plan] ?? 1}
          </span>
        ),
      },
      {
        accessorKey: "customers",
        header: "Customers",
        cell: ({ row }) => (
          <span className="font-mono text-code tabular-nums">
            {row.original.customers.toLocaleString("en-NG")}
          </span>
        ),
      },
      {
        id: "row_actions",
        header: "Actions",
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
                    onClick={() => void run(t.id, "approve")}
                  />
                ) : (
                  <>
                    <ActionButton
                      icon="eye"
                      label="Impersonate"
                      busy={busy === t.id}
                      onClick={() => {
                        setBusy(t.id);
                        impersonate(t.id, t.name)
                          .then(() => router.push("/dashboard"))
                          .catch(() => {
                            toast("Could not impersonate this tenant", "danger");
                          })
                          .finally(() => setBusy(null));
                      }}
                    />
                    <ActionButton
                      icon="trend"
                      label="Quotas"
                      busy={busy === t.id}
                      onClick={() => setEditingQuotas(t)}
                    />
                    <ActionButton
                      icon="zap"
                      label={t.aiEnabled !== false ? "AI Active" : "AI Paused"}
                      aiActive={t.aiEnabled !== false}
                      busy={busy === t.id}
                      onClick={() => void toggleAi(t.id)}
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
                    <ActionButton
                      icon="close"
                      label="Delete"
                      danger
                      busy={busy === t.id}
                      onClick={() => setDeletingTenant(t)}
                    />
                  </>
                )}
              </div>
            </div>
          );
        },
      },
    ],
    [busy, run, toggleAi, impersonate, router, setSuspending, setDeletingTenant],
  );

  const create = async () => {
    if (!name.trim() || !slug.trim() || !email.trim()) {
      toast("Business name, slug and email are required", "danger");
      return;
    }
    setSaving(true);
    try {
      const created = await api.post<Tenant>("/tenants", { name, slug, email, plan });
      setTenants((prev) => (prev ? [...prev, created] : [created]));
      setCreating(false);
      setName("");
      setSlug("");
      setEmail("");
      setPlan("starter");
      toast(`${created.name} provisioned — pending approval`);
    } catch {
      toast("Could not provision tenant", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Tenants</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
        >
          <Icon name="plus" size={15} />
          New tenant
        </button>
      </header>

      <div className="sec-filter flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
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
            {f}
          </button>
        ))}
      </div>

      <div className="w-full">
        {!tenants ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton mt-3 h-10 w-full" />
            <div className="skeleton mt-3 h-10 w-full" />
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <p className="px-6 py-12 text-center text-[13px] text-text-3">
              No tenants match “{filter}”.
            </p>
          </div>
        ) : (
          <DataTable columns={columns} data={list} getRowId={(t) => t.id} hoverable />
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Provision a tenant"
        icon="building"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void create()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              Provision
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Business name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SwiftPay MFB"
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="swiftpay"
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Support email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="support@swiftpay.ng"
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Starting plan</span>
            <Select
              value={plan}
              onChange={setPlan}
              options={[
                { value: "starter", label: "Starter" },
                { value: "pro", label: "Pro" },
                { value: "enterprise", label: "Enterprise" },
              ]}
              ariaLabel="Starting plan"
            />
          </label>
          <p className="rounded-sm bg-primary-soft px-3 py-2 text-[11.5px] text-primary-dark">
            New tenants land as pending — the owner is notified and the workspace opens on
            approval.
          </p>
        </div>
      </Modal>

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
          suspending && (
            <>
              <b className="text-text">{suspending.name}</b> will be suspended immediately — the
              workspace locks for its staff and customers, a live banner is pushed and the owner
              is notified. This is audited.
            </>
          )
        }
      />

      <ConfirmModal
        open={!!deletingTenant}
        onClose={() => setDeletingTenant(null)}
        title="Delete tenant workspace"
        confirmLabel="Delete workspace"
        busy={busy === deletingTenant?.id}
        onConfirm={() => {
          if (deletingTenant) {
            void deleteTenantFunc(deletingTenant.id);
          }
        }}
        description={
          deletingTenant && (
            <>
              <b className="text-text">{deletingTenant.name}</b> and all associated workspace data (tickets, customers, knowledge sources) will be permanently deleted. This action is audited and irreversible.
            </>
          )
        }
      />

      {/* Adjust Quotas Modal */}
      <Modal
        open={!!editingQuotas}
        onClose={() => setEditingQuotas(null)}
        title={`Adjust Quotas — ${editingQuotas?.name ?? ""}`}
        icon="sparkles"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-[12.5px] text-text-2">
            Override AI token limits, seat quotas, and plan tiers for this tenant workspace.
          </p>

          <label className="block text-[12.5px] font-semibold text-text-2">
            Plan Tier
            <select
              value={quotaPlan}
              onChange={(e) => setQuotaPlan(e.target.value)}
              className="input-control mt-1.5 capitalize"
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro (Growth)</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>

          <label className="block text-[12.5px] font-semibold text-text-2">
            AI Token Quota Limit
            <input
              type="number"
              min={0}
              step={100000}
              value={quotaTokens}
              onChange={(e) => setQuotaTokens(Number(e.target.value))}
              className="input-control mt-1.5"
            />
            <span className="mt-1 block text-[11px] text-text-3">
              Default is 1,000,000 tokens. Set higher to grant bonus tokens.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12.5px] font-semibold text-text-2">
              Max Agent Seats
              <input
                type="number"
                min={1}
                value={quotaAgents}
                onChange={(e) => setQuotaAgents(Number(e.target.value))}
                className="input-control mt-1.5"
              />
            </label>

            <label className="block text-[12.5px] font-semibold text-text-2">
              Max Customers
              <input
                type="number"
                min={100}
                step={500}
                value={quotaCustomers}
                onChange={(e) => setQuotaCustomers(Number(e.target.value))}
                className="input-control mt-1.5"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setEditingQuotas(null)}
              className="rounded-sm border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy === editingQuotas?.id}
              onClick={() => void saveQuotas()}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {busy === editingQuotas?.id ? <Spinner size={13} /> : <Icon name="check" size={14} />}
              Save Quotas
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  primary,
  danger,
  aiActive,
  busy,
}: {
  icon: "check" | "eye" | "close" | "zap" | "trend" | "sparkles";
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  aiActive?: boolean;
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
            : aiActive !== undefined
              ? aiActive
                ? "inline-flex items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                : "inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-700 transition-colors duration-150 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              : "inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {busy ? <Spinner size={12} /> : <Icon name={icon} size={13} />}
      {label}
    </button>
  );
}
