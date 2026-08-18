"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type { ColumnDef } from "@tanstack/react-table";
import type { WebhookDelivery, WebhookEndpoint } from "@/lib/types";

const EVENT_OPTIONS = [
  "ticket.created",
  "ticket.updated",
  "ticket.escalated",
  "ticket.resolved",
  "automation.ran",
];

interface WebhookDraft {
  id: string | null;
  name: string;
  url: string;
  events: string[];
  active: boolean;
}

export function WebhooksTab() {
  const toast = useToast();
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[] | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);

  const [editing, setEditing] = useState<WebhookDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);

  const load = () => {
    void api.get<WebhookEndpoint[]>("/webhooks").then(setEndpoints).catch(() => setEndpoints([]));
    void api
      .get<WebhookDelivery[]>("/webhooks/deliveries")
      .then(setDeliveries)
      .catch(() => setDeliveries([]));
  };

  useEffect(() => {
    load();
  }, []);

  useRealtime({ webhooks_changed: () => load() });

  const openNew = () => setEditing({ id: null, name: "", url: "", events: ["ticket.escalated"], active: true });

  const openEdit = (w: WebhookEndpoint) =>
    setEditing({ id: w.id, name: w.name, url: w.url, events: [...w.events], active: w.active });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !/^https?:\/\//.test(editing.url.trim())) {
      toast("A name and valid http(s) URL are required", "danger");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        url: editing.url.trim(),
        events: editing.events,
        active: editing.active,
      };
      if (editing.id) {
        const updated = await api.patch<WebhookEndpoint>(`/webhooks/${editing.id}`, payload);
        setEndpoints((prev) => (prev ?? []).map((w) => (w.id === updated.id ? updated : w)));
        toast("Webhook updated");
      } else {
        const created = await api.post<WebhookEndpoint>("/webhooks", payload);
        setEndpoints((prev) => (prev ? [...prev, created] : [created]));
        toast("Webhook endpoint created");
      }
      setEditing(null);
    } catch {
      toast("Could not save webhook", "danger");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (w: WebhookEndpoint) => {
    const updated = await api.patch<WebhookEndpoint>(`/webhooks/${w.id}`, { active: !w.active });
    setEndpoints((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
  };

  const test = async (w: WebhookEndpoint) => {
    setBusy(true);
    try {
      const delivery = await api.post<WebhookDelivery>(`/webhooks/${w.id}/test`);
      toast(`Test delivered · ${delivery.httpStatus} in ${delivery.durationMs}ms`);
    } catch {
      toast("Test delivery failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/webhooks/${deleting.id}`);
      setEndpoints((prev) => (prev ?? []).filter((w) => w.id !== deleting.id));
      toast(`${deleting.name} deleted`);
      setDeleting(null);
    } catch {
      toast("Could not delete webhook", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Webhooks</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDeliveries((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="bar-chart" size={13} />
            {showDeliveries ? "Hide deliveries" : "Deliveries"}
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="plus" size={15} />
            New endpoint
          </button>
        </div>
      </header>

      <div className="w-full">
        {!endpoints ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton mt-3 h-10 w-full" />
          </div>
        ) : endpoints.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <EmptyState
              icon="send"
              title="No webhook endpoints yet"
              subtitle="Create an endpoint to start receiving ticket events — each one gets a signing secret so payloads are verifiable."
              action={
                <button
                  type="button"
                  onClick={openNew}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                >
                  <Icon name="plus" size={14} />
                  Create your first endpoint
                </button>
              }
            />
          </div>
        ) : (
          <WebhookEndpointsTable
            endpoints={endpoints}
            busy={busy}
            onToggle={(w) => void toggle(w)}
            onTest={(w) => void test(w)}
            onEdit={openEdit}
            onDelete={setDeleting}
          />
        )}
      </div>

      {showDeliveries && (
        <Card title="Recent deliveries" icon="bar-chart">
          {deliveries.length === 0 ? (
            <p className="text-[13px] text-text-3">No deliveries yet.</p>
          ) : (
            <WebhookDeliveriesTable deliveries={deliveries} />
          )}
        </Card>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit webhook" : "New webhook endpoint"}
        icon="link"
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
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              Save endpoint
            </button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-3.5">
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Name</span>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Slack #tickets"
                className="input-control"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Endpoint URL</span>
              <input
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                placeholder="https://hooks.example.com/tickets"
                className="input-control"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-micro uppercase text-text-3">Events</span>
              <div className="flex flex-col gap-1.5">
                {EVENT_OPTIONS.map((e) => {
                  const on = editing.events.includes(e);
                  return (
                    <label key={e} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setEditing({
                            ...editing,
                            events: on ? editing.events.filter((x) => x !== e) : [...editing.events, e],
                          })
                        }
                        className="accent-primary"
                      />
                      <code className="font-mono text-code">{e}</code>
                    </label>
                  );
                })}
              </div>
            </div>
            <p className="rounded-sm bg-primary-soft px-3 py-2 text-[11.5px] text-primary-dark">
              A signing secret is generated on creation and shown once — keep it server-side.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={busy}
        title="Delete webhook?"
        description={
          <>
            <strong>{deleting?.name}</strong> will stop receiving events immediately.
            Delivery history is kept.
          </>
        }
        confirmLabel="Delete webhook"
      />
    </div>
  );
}

function WebhookEndpointsTable({
  endpoints,
  busy,
  onToggle,
  onTest,
  onEdit,
  onDelete,
}: {
  endpoints: WebhookEndpoint[];
  busy: boolean;
  onToggle: (w: WebhookEndpoint) => void;
  onTest: (w: WebhookEndpoint) => void;
  onEdit: (w: WebhookEndpoint) => void;
  onDelete: (w: WebhookEndpoint) => void;
}) {
  const columns: ColumnDef<WebhookEndpoint, unknown>[] = [
    {
      accessorKey: "name",
      header: "Endpoint",
      cell: ({ row }) => (
        <CellMain
          main={row.original.name}
          sub={<span className="font-mono text-code">{row.original.url}</span>}
        />
      ),
    },
    {
      accessorKey: "events",
      header: "Events",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex max-w-[220px] flex-wrap gap-1">
          {row.original.events.map((e) => (
            <code key={e} className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-text-2">
              {e}
            </code>
          ))}
        </span>
      ),
    },
    {
      accessorKey: "secret",
      header: "Secret",
      cell: ({ row }) => <span className="font-mono text-code">{row.original.secret}</span>,
    },
    {
      accessorKey: "active",
      header: "Active",
      enableSorting: false,
      cell: ({ row }) => (
        <Switch
          checked={row.original.active}
          onChange={() => onToggle(row.original)}
          label={`Toggle ${row.original.name}`}
        />
      ),
    },
    {
      id: "row_actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => onTest(row.original)}
              disabled={busy}
              title="Send test"
              aria-label={`Test ${row.original.name}`}
              className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="send" size={13} />
            </button>
            <button
              type="button"
              onClick={() => onEdit(row.original)}
              aria-label={`Edit ${row.original.name}`}
              className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              <Icon name="edit" size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(row.original)}
              aria-label={`Delete ${row.original.name}`}
              className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:border-danger-border hover:bg-danger-soft hover:text-danger"
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        </div>
      ),
    },
  ];
  return <DataTable columns={columns} data={endpoints} getRowId={(w) => w.id} hoverable />;
}

function WebhookDeliveriesTable({ deliveries }: { deliveries: WebhookDelivery[] }) {
  const columns: ColumnDef<WebhookDelivery, unknown>[] = [
    {
      accessorKey: "endpointName",
      header: "Endpoint",
      cell: ({ row }) => <CellMain main={row.original.endpointName} />,
    },
    {
      accessorKey: "event",
      header: "Event",
      cell: ({ row }) => (
        <code className="font-mono text-code text-text-2">{row.original.event}</code>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => (
        <Pill
          status={row.original.status === "success" ? `${row.original.httpStatus}` : row.original.status}
          tone={row.original.status === "success" ? "success" : row.original.status === "failed" ? "danger" : "warning"}
        />
      ),
    },
    {
      accessorKey: "attempts",
      header: "Attempts",
      cell: ({ row }) => (
        <span className="font-mono text-code tabular-nums">{row.original.attempts}</span>
      ),
    },
    {
      accessorKey: "durationMs",
      header: "Latency",
      cell: ({ row }) => (
        <span className="font-mono text-code tabular-nums">{row.original.durationMs}ms</span>
      ),
    },
    {
      accessorKey: "time",
      header: "When",
      cell: ({ row }) => <span className="text-text-3">{row.original.time}</span>,
    },
  ];
  return <DataTable columns={columns} data={deliveries.slice(0, 12)} getRowId={(d) => d.id} hoverable borderless />;
}
