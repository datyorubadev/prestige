"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import type { ColumnDef } from "@tanstack/react-table";
import type { Invoice, Plan } from "@/lib/types";

const STATUS_FILTERS = ["All", "Paid", "Pending", "Waived"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export function Billing() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [paystackKey, setPaystackKey] = useState<string>("");

  useEffect(() => {
    let active = true;
    api
      .get<Invoice[]>("/invoices")
      .then((data) => active && setInvoices(data))
      .catch(() => active && setInvoices([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<Plan[]>("/plans").catch(() => []),
      api.get<{ publicKey: string }>("/billing/public-key").catch(() => ({ publicKey: "" })),
    ]).then(([planData, keyData]) => {
      if (!active) return;
      setPlans(planData);
      setPaystackKey(keyData.publicKey);
    });
    return () => { active = false; };
  }, []);

  // Handle payment callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    const reference = params.get("reference");
    if (paymentStatus === "success" && reference) {
      api
        .post<any>("/billing/verify", { reference })
        .then((res) => {
          toast(`Payment confirmed! Plan activated: ${res?.planCode ?? "pro"}`);
          // Refresh invoices
          api.get<Invoice[]>("/invoices").then(setInvoices).catch(() => {});
        })
        .catch(() => toast("Payment verification failed — contact support", "danger"))
        .finally(() => {
          // Clean up URL params
          window.history.replaceState({}, "", window.location.pathname);
        });
    }
  }, []);

  const subscribeToPlan = useCallback(async (planCode: string) => {
    if (!paystackKey) {
      toast("Payment gateway not configured", "danger");
      return;
    }
    setSubscribing(planCode);
    try {
      const res = await api.post<{
        authorizationUrl: string;
        accessCode: string;
        reference: string;
      }>("/billing/initialize", {
        planCode,
        callbackUrl: `${window.location.origin}/admin/billing?payment=success`,
      });
      if (res?.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      }
    } catch {
      toast("Could not initialize payment", "danger");
      setSubscribing(null);
    }
  }, [paystackKey, toast]);

  const download = async (inv: Invoice) => {
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const resp = await fetch(`${base}/api/invoices/${inv.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("PDF download failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${inv.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`${inv.id} downloaded`);
    } catch {
      // Fallback: client-side HTML invoice
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${inv.id}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 40px auto; color: #1a1a2e; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #00a86b; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 22px; font-weight: 800; color: #00a86b; }
  .meta { text-align: right; font-size: 13px; color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #999; border-bottom: 1px solid #eee; padding: 8px 0; }
  td { padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .amount { font-size: 20px; font-weight: 700; color: #00a86b; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .status-paid { background: #dcfce7; color: #166534; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
</style></head><body>
<div class="header">
  <div><div class="brand">Prestige</div><div style="font-size:12px;color:#666">Support Suite</div></div>
  <div class="meta"><div style="font-size:16px;font-weight:700">INVOICE</div><div>${inv.id}</div><div>${inv.period}</div></div>
</div>
<table>
  <tr><th>Description</th><th>Method</th><th>Status</th><th style="text-align:right">Amount</th></tr>
  <tr>
    <td>Support plan subscription</td>
    <td>${inv.method}</td>
    <td><span class="status status-${inv.status}">${inv.status}</span></td>
    <td style="text-align:right" class="amount">${inv.amount}</td>
  </tr>
</table>
<div class="footer">Generated by Prestige Support Suite · ${new Date().toLocaleDateString()}</div>
</body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${inv.id}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`${inv.id} downloaded (HTML fallback)`);
    }
  };

  const list = (invoices ?? []).filter(
    (inv) => filter === "All" || inv.status === filter.toLowerCase(),
  );
  const paid = (invoices ?? []).filter((i) => i.status === "paid");
  const next = invoices?.[0];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1 text-text">Billing</h1>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <Kpi icon="check" label="Paid this cycle" value={String(paid.length)} note="all settled" />
        <Kpi
          icon="card"
          label="Outstanding"
          value={(invoices ?? []).filter((i) => i.status !== "paid" && i.status !== "waived").length > 0 ? "1" : "0"}
          note="0 overdue"
          good
        />
        <Kpi icon="clock" label="Next billing" value={next?.period.split(" – ")[1] ?? "—"} note={next?.method ?? "Visa ···· 4821"} />
      </div>

      {plans.length > 0 && (
        <Card title="Subscription plans" icon="zap">
          <p className="mb-4 text-meta text-text-3">
            Upgrade or change your plan — powered by Paystack
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {plans.map((plan) => (
              <div
                key={plan.code}
                className={cn(
                  "relative flex flex-col gap-3 rounded-md border p-5 transition-all",
                  plan.tag === "popular"
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-surface hover:border-text-3",
                )}
              >
                {plan.tag === "popular" && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Popular
                  </span>
                )}
                <div>
                  <h3 className="text-[14px] font-semibold text-text">{plan.name}</h3>
                  <p className="mt-1 text-[22px] font-bold text-text">
                    {plan.price}
                    <span className="text-[12px] font-normal text-text-3">/mo</span>
                  </p>
                </div>
                <ul className="flex flex-1 flex-col gap-1.5 text-[12px] text-text-2">
                  <li>{plan.agents} agents</li>
                  <li>{plan.customers.toLocaleString()} customers</li>
                  <li>{plan.kb} KB quota</li>
                </ul>
                <button
                  type="button"
                  onClick={() => void subscribeToPlan(plan.code)}
                  disabled={subscribing !== null}
                  className={cn(
                    "mt-auto flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-semibold transition-colors",
                    plan.tag === "popular"
                      ? "bg-primary text-white hover:bg-primary-dark"
                      : "border border-border bg-surface text-text-2 hover:bg-surface-3",
                    subscribing === plan.code && "opacity-60",
                  )}
                >
                  {subscribing === plan.code ? (
                    <>
                      <Spinner size={13} /> Processing…
                    </>
                  ) : (
                    <>
                      <Icon name="card" size={13} /> Subscribe
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Invoice register" icon="file">
        <p className="mb-4 text-meta text-text-3">
          Generated on plan change and each billing cycle
        </p>
        <div className="sec-filter mb-4 flex flex-wrap gap-2">
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
          {!invoices ? (
            <div className="p-6">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton mt-3 h-10 w-full" />
            </div>
          ) : list.length === 0 ? (
            <p className="px-6 py-12 text-center text-[13px] text-text-3">
              No invoices match “{filter}”.
            </p>
          ) : (
            <InvoiceTable invoices={list} onDownload={download} />
          )}
        </div>
      </Card>
    </div>
  );
}

function InvoiceTable({ invoices, onDownload }: { invoices: Invoice[]; onDownload: (inv: Invoice) => void }) {
  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Invoice",
        cell: ({ row }) => (
          <span className="font-mono text-code font-semibold text-text">{row.original.id}</span>
        ),
      },
      {
        accessorKey: "period",
        header: "Period",
        cell: ({ row }) => <span className="text-text-2">{row.original.period}</span>,
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <span className="font-mono text-code tabular-nums">{row.original.amount}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => <Pill status={row.original.status} />,
      },
      {
        accessorKey: "method",
        header: "Method",
        cell: ({ row }) => <span className="text-text-2">{row.original.method}</span>,
      },
      {
        id: "row_actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <button
              type="button"
              onClick={() => onDownload(row.original)}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              <Icon name="file" size={13} />
              Download
            </button>
          </div>
        ),
      },
    ],
    [onDownload],
  );
  return <DataTable columns={columns} data={invoices} getRowId={(inv) => inv.id} hoverable borderless />;
}

function Kpi({
  icon,
  label,
  value,
  note,
  good,
}: {
  icon: "check" | "card" | "clock";
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
