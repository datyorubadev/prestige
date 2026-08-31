"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type { ColumnDef } from "@tanstack/react-table";
import type { ApiKey } from "@/lib/types";

const SCOPE_OPTIONS = ["tickets:read", "tickets:write", "reports:read", "webhooks:manage"];

export function ApiTab() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["tickets:read"]);
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => void api.get<ApiKey[]>("/api-keys").then(setKeys).catch(() => setKeys([]));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) {
      toast("Key name is required", "danger");
      return;
    }
    setSaving(true);
    try {
      const created = await api.post<ApiKey & { secret: string }>("/api-keys", {
        name: name.trim(),
        scopes: scopes.length ? scopes : ["tickets:read"],
      });
      setKeys((prev) => (prev ? [...prev, created] : [created]));
      setCreating(false);
      setRevealed({ name: created.name, secret: created.secret });
      setName("");
      setScopes(["tickets:read"]);
    } catch {
      toast("Could not create key", "danger");
    } finally {
      setSaving(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await api.del(`/api-keys/${revoking.id}`);
      setKeys((prev) => (prev ?? []).filter((k) => k.id !== revoking.id));
      toast(`${revoking.name} key revoked`);
      setRevoking(null);
    } catch {
      toast("Could not revoke key", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">API & data</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
        >
          <Icon name="plus" size={15} />
          Create key
        </button>
      </header>

      <div className="w-full">
        {!keys ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton mt-3 h-10 w-full" />
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <EmptyState
              icon="lock"
              title="No API keys yet"
              subtitle="Create a key to call the Prestige REST API — the key is shown once, so copy it to a safe place."
              action={
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-xs"
                >
                  <Icon name="plus" size={14} />
                  Create your first key
                </button>
              }
            />
          </div>
        ) : (
          <KeysTable keys={keys} onRevoke={setRevoking} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Knowledge base" icon="book">
          <p className="mb-3 text-[12.5px] text-text-2">
            Export your sources and articles as a portable JSON bundle, or import a
            Zendesk export to seed rules and articles.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const data = await api.get<any>("/kb/export");
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "knowledge-export.json";
                  a.click();
                  URL.revokeObjectURL(url);
                  toast("Knowledge base exported successfully");
                } catch {
                  toast("Could not export knowledge base", "danger");
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              <Icon name="file" size={13} />
              Export KB
            </button>
            <button
              type="button"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const articles = data.articles || [];
                    const res = await api.post<any>("/kb/import", { articles });
                    toast(`Imported ${res?.imported ?? 0} articles (${res?.skipped ?? 0} skipped)`);
                  } catch {
                    toast("Could not import — check the file format", "danger");
                  }
                };
                input.click();
              }}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              <Icon name="swap" size={13} />
              Import (Zendesk)
            </button>
          </div>
        </Card>

        <Card title="Data retention" icon="shield">
          <div className="flex flex-col gap-2 text-[12.5px] text-text-2">
            <Row label="Ticket transcripts" value="24 months" />
            <Row label="Automation logs" value="12 months" />
            <Row label="Webhook deliveries" value="6 months" />
            <Row label="Audit log" value="forever" />
          </div>
        </Card>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create API key"
        icon="lock"
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
              {saving ? <Spinner size={14} /> : <Icon name="plus" size={14} />}
              Create key
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Key name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production"
              className="input-control"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-micro uppercase text-text-3">Scopes</span>
            <div className="flex flex-col gap-1.5">
              {SCOPE_OPTIONS.map((s) => {
                const on = scopes.includes(s);
                return (
                  <label key={s} className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setScopes(on ? scopes.filter((x) => x !== s) : [...scopes, s])
                      }
                      className="accent-primary"
                    />
                    <code className="font-mono text-code">{s}</code>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!revealed}
        onClose={() => setRevealed(null)}
        title="Key created"
        icon="check"
        footer={
          <button
            type="button"
            onClick={() => setRevealed(null)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            Done
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-text-2">
            Copy the secret for <strong>{revealed?.name}</strong> now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-code text-text">{revealed?.secret}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(revealed?.secret ?? "");
                toast("Secret copied to clipboard");
              }}
              aria-label="Copy secret"
              className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              <Icon name="copy" size={13} />
            </button>
          </div>
          <p className="flex items-center gap-1.5 rounded-sm bg-primary-soft px-3 py-2 text-[11.5px] text-primary-dark">
            <Pill status="new" tone="info" />
            Store it in your server environment, never in client code.
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => void confirmRevoke()}
        busy={busy}
        title="Revoke API key?"
        description={
          <>
            <strong>{revoking?.name}</strong> will immediately stop authenticating. Any
            integration using it will fail until rotated.
          </>
        }
        confirmLabel="Revoke key"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="text-text-2">{label}</span>
      <span className="font-mono text-code text-text-2">{value}</span>
    </div>
  );
}

function KeysTable({ keys, onRevoke }: { keys: ApiKey[]; onRevoke: (k: ApiKey) => void }) {
  const columns: ColumnDef<ApiKey, unknown>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <CellMain main={row.original.name} />,
    },
    {
      accessorKey: "prefix",
      header: "Prefix",
      cell: ({ row }) => <span className="font-mono text-code">{row.original.prefix}…</span>,
    },
    {
      accessorKey: "scopes",
      header: "Scopes",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          {row.original.scopes.map((s) => (
            <code key={s} className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-text-2">
              {s}
            </code>
          ))}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => <span className="text-text-3">{row.original.createdAt}</span>,
    },
    {
      accessorKey: "lastUsed",
      header: "Last used",
      cell: ({ row }) => <span className="text-text-3">{row.original.lastUsed ?? "never"}</span>,
    },
    {
      id: "row_actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <button
            type="button"
            onClick={() => onRevoke(row.original)}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:border-danger-border hover:bg-danger-soft hover:text-danger"
          >
            <Icon name="trash" size={13} />
            Revoke
          </button>
        </div>
      ),
    },
  ];
  return <DataTable columns={columns} data={keys} getRowId={(k) => k.id} hoverable />;
}
