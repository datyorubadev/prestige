"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { Customer, CustomerListResponse } from "@/lib/types";

function CreateCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [isVip, setIsVip] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email.trim() || !email.includes("@")) {
      toast("Valid email address is required", "danger");
      return;
    }
    setSaving(true);
    try {
      const created = await api.post<Customer>("/customers", {
        email: email.trim(),
        full_name: fullName.trim() || undefined,
        phone_number: phone.trim() || undefined,
        company: company.trim() || undefined,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        is_vip: isVip,
      });
      toast("Customer created successfully");
      onCreated(created);
    } catch {
      toast("Could not create customer", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-md border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-[15px] font-bold text-text">Add New Customer</h3>
          <button onClick={onClose} className="rounded-sm p-1 text-text-3 hover:text-text">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Email Address *</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className="input-control"
              autoFocus
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Full Name</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="input-control"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Phone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 800 000 0000"
                className="input-control"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Company</span>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corp"
                className="input-control"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Location</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Lagos, Nigeria"
                className="input-control"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Internal Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Account notes for support agents..."
              rows={3}
              className="input-control resize-y"
            />
          </label>
          <label className="flex items-center gap-2 pt-1 text-[13px] font-medium text-text">
            <input
              type="checkbox"
              checked={isVip}
              onChange={(e) => setIsVip(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface text-primary"
            />
            VIP Customer
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-sm border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
            Create Customer
          </button>
        </div>
      </div>
    </div>
  );
}

export function CustomerList() {
  const router = useRouter();
  const { role } = useAuth();
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "vip">("all");
  const [query, setQuery] = useState("");
  const [openCreate, setOpenCreate] = useState(false);

  const load = useCallback(() => {
    let active = true;
    api
      .get<CustomerListResponse>(`/customers?filter=${filter}&q=${encodeURIComponent(query)}`)
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        if (active) setData({ total: 0, page: 1, perPage: 50, customers: [] });
      });
    return () => {
      active = false;
    };
  }, [filter, query]);

  useEffect(load, [load]);

  const onCreated = (c: Customer) => {
    setOpenCreate(false);
    setData((prev) =>
      prev
        ? { ...prev, total: prev.total + 1, customers: [c, ...prev.customers] }
        : { total: 1, page: 1, perPage: 50, customers: [c] }
    );
  };

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Name",
        cell: ({ row }) => <CellMain main={row.original.fullName || row.original.email} sub={row.original.email} />,
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => <span className="text-text-2">{row.original.phone || "—"}</span>,
      },
      {
        accessorKey: "company",
        header: "Company",
        cell: ({ row }) => <span className="text-text-2">{row.original.company || "—"}</span>,
      },
      {
        accessorKey: "ticketCount",
        header: "Tickets",
        cell: ({ row }) => <span className="tabular-nums font-mono text-code">{row.original.ticketCount ?? 0}</span>,
      },
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.isVip && <Pill status="VIP" tone="violet" />}
            {row.original.tags &&
              row.original.tags.map((t) => (
                <span key={t} className="inline-flex rounded-sm bg-surface-3 px-2 py-0.5 text-[12px] font-medium text-text-2">
                  {t}
                </span>
              ))}
          </div>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => <Pill status={row.original.isActive ? "active" : "suspended"} dot />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <button
              onClick={() => router.push(`/dashboard/customers/${row.original.id}`)}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
            >
              <Icon name="eye" size={13} /> View
            </button>
          </div>
        ),
      },
    ],
    [router]
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Customers</h1>
          <p className="mt-1 text-meta text-text-2">
            {data ? `${data.total} total customers` : "Loading..."}
          </p>
        </div>
        {(role === "owner" || role === "super_admin") && (
          <button
            type="button"
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="plus" size={15} />
            Add Customer
          </button>
        )}
      </header>

      <Card pad0>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
          <div className="relative w-full max-w-xs">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers..."
              className="w-full rounded-sm border border-border bg-surface py-1.5 pl-8 pr-3 text-[13px] text-text focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex rounded-sm bg-surface-2 p-1">
            {(["all", "active", "vip"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-sm px-3 py-1 text-[12px] font-semibold capitalize transition-colors",
                  filter === f ? "bg-surface text-text" : "text-text-2 hover:text-text"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {!data ? (
          <div className="p-8 text-center"><Spinner /></div>
        ) : (
          <DataTable
            columns={columns}
            data={data.customers}
            getRowId={(r) => r.id}
            hoverable
            borderless
            emptyIcon="users"
            emptyTitle="No customers yet"
            emptySubtitle="New customer records will appear here as conversations are opened."
          />
        )}
      </Card>

      {openCreate && (
        <CreateCustomerModal onClose={() => setOpenCreate(false)} onCreated={onCreated} />
      )}
    </div>
  );
}
