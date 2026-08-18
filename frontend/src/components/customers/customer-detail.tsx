"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ticketNumberFor } from "@/lib/utils";
import type { Customer, Ticket } from "@/lib/types";

export function CustomerDetail({ customerId }: { customerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { role } = useAuth();
  const isOwner = role === "owner" || role === "super_admin";
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [busy, setBusy] = useState(false);

  // Edit form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [isVip, setIsVip] = useState(false);

  const loadData = () => {
    api.get<Customer>(`/customers/${customerId}`).then((c) => {
      setCustomer(c);
      setFullName(c.fullName || "");
      setPhone(c.phone || "");
      setCompany(c.company || "");
      setLocation(c.location || "");
      setNotes(c.notes || "");
      setIsVip(Boolean(c.isVip));
    }).catch(() => {});

    api.get<{ customer: Customer; tickets: Ticket[] }>(`/customers/${customerId}/history`).then((res) => {
      if (res.tickets) setTickets(res.tickets);
    }).catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, [customerId]);

  const saveCustomer = async () => {
    if (!customer || busy) return;
    setBusy(true);
    try {
      const updated = await api.patch<Customer>(`/customers/${customerId}`, {
        full_name: fullName,
        phone_number: phone,
        company,
        location,
        notes,
        is_vip: isVip,
      });
      setCustomer(updated);
      toast("Customer details updated");
      setEditing(false);
    } catch {
      toast("Could not update customer", "danger");
    } finally {
      setBusy(false);
    }
  };

  const toggleSuspend = async () => {
    if (!customer || busy) return;
    setBusy(true);
    try {
      if (customer.isActive) {
        await api.post(`/customers/${customerId}/suspend`);
        setCustomer({ ...customer, isActive: false });
        toast("Customer account suspended");
      } else {
        const updated = await api.patch<Customer>(`/customers/${customerId}`, { is_active: true });
        setCustomer(updated);
        toast("Customer account reactivated");
      }
      setSuspending(false);
    } catch {
      toast("Action failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  if (!customer) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push("/dashboard/customers")}
            className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-text-3 transition-colors hover:text-text"
          >
            <Icon name="chevron-left" size={15} /> Back to customers
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-h1 text-text">{customer.fullName || customer.email}</h1>
            {customer.isVip && <Pill status="VIP" tone="violet" />}
            <Pill status={customer.isActive ? "active" : "suspended"} dot />
          </div>
          <p className="mt-1 text-[13.5px] text-text-2">{customer.email}</p>
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
              >
                <Icon name="edit" size={14} /> Edit Profile
              </button>
              <button
                type="button"
                onClick={() => setSuspending(true)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-danger-border bg-danger-soft px-3 py-1.5 text-[12.5px] font-semibold text-danger transition-colors hover:opacity-80"
              >
                <Icon name="close" size={14} /> {customer.isActive ? "Suspend Account" : "Reactivate Account"}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card title="Profile Details">
            <div className="flex flex-col gap-3.5 text-[13px]">
              <div>
                <span className="block font-medium text-text-3">Phone</span>
                <span className="font-medium text-text">{customer.phone || "—"}</span>
              </div>
              <div>
                <span className="block font-medium text-text-3">Company</span>
                <span className="font-medium text-text">{customer.company || "—"}</span>
              </div>
              <div>
                <span className="block font-medium text-text-3">Location</span>
                <span className="font-medium text-text">{customer.location || "—"}</span>
              </div>
              <div>
                <span className="block font-medium text-text-3">Account Number</span>
                <span className="font-mono text-code text-text">{customer.accountNumber || "—"}</span>
              </div>
              <div>
                <span className="block font-medium text-text-3">Tags</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {customer.tags && customer.tags.length > 0 ? (
                    customer.tags.map((t) => (
                      <span key={t} className="inline-flex rounded-sm bg-surface-3 px-2 py-0.5 text-[12px] font-medium text-text-2">
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-text-3">—</span>
                  )}
                </div>
              </div>
              <div>
                <span className="block font-medium text-text-3">Notes</span>
                <span className="text-text-2">{customer.notes || "—"}</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title={`Conversation History (${tickets.length})`} pad0>
            <div className="divide-y divide-border">
              {tickets.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-text-3">No conversations on record.</div>
              ) : (
                tickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/dashboard/tickets?email=${encodeURIComponent(customer.email)}`)}
                    className="flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text hover:text-primary truncate">
                          {t.subject}
                        </span>
                        <Pill status={t.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[12px] text-text-3">
                        <span className="font-mono">{ticketNumberFor(t)}</span>
                        <span>{t.time}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-surface p-5">
            <h3 className="mb-4 text-[16px] font-bold text-text">Edit Customer Profile</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-text">Full Name</label>
                <input value={fullName || ""} onChange={(e) => setFullName(e.target.value)} className="input-control" />
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-text">Phone</label>
                <input value={phone || ""} onChange={(e) => setPhone(e.target.value)} className="input-control" />
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-text">Company</label>
                <input value={company || ""} onChange={(e) => setCompany(e.target.value)} className="input-control" />
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-text">Location</label>
                <input value={location || ""} onChange={(e) => setLocation(e.target.value)} className="input-control" />
              </div>
              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-text">Notes</label>
                <textarea value={notes || ""} onChange={(e) => setNotes(e.target.value)} rows={3} className="input-control resize-y" />
              </div>
              <label className="flex items-center gap-2 pt-1 text-[13px] font-medium text-text">
                <input type="checkbox" checked={isVip} onChange={(e) => setIsVip(e.target.checked)} className="h-4 w-4 rounded border-border bg-surface text-primary" />
                Mark as VIP Customer
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
              <button onClick={() => setEditing(false)} className="rounded-sm border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2">
                Cancel
              </button>
              <button onClick={() => void saveCustomer()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
                {busy ? <Spinner size={14} /> : <Icon name="check" size={14} />} Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend / Activate Confirm Modal */}
      <ConfirmModal
        open={suspending}
        onClose={() => setSuspending(false)}
        title={customer.isActive ? "Suspend Customer" : "Reactivate Customer"}
        description={`Are you sure you want to ${customer.isActive ? "suspend" : "reactivate"} ${customer.fullName}?`}
        confirmLabel={customer.isActive ? "Suspend Account" : "Reactivate Account"}
        busy={busy}
        onConfirm={() => void toggleSuspend()}
      />
    </div>
  );
}
