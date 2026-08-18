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
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type { ColumnDef } from "@tanstack/react-table";
import type { EscalationRule, PresetVersion } from "@/lib/types";

export function AdminPresetsTab() {
  const toast = useToast();
  const [presets, setPresets] = useState<EscalationRule[]>([]);
  const [versions, setVersions] = useState<PresetVersion[] | null>(null);

  const [snapshotting, setSnapshotting] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState<PresetVersion | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    void api
      .get<EscalationRule[]>("/rules")
      .then((data) => setPresets(data.filter((r) => r.preset)))
      .catch(() => setPresets([]));
    void api.get<PresetVersion[]>("/presets").then(setVersions).catch(() => setVersions([]));
  };

  useEffect(() => {
    load();
  }, []);

  useRealtime({ escalation_rules_changed: () => load() });

  const snapshot = async () => {
    if (!label.trim()) {
      toast("A version label is required", "danger");
      return;
    }
    setSaving(true);
    try {
      const version = await api.post<PresetVersion>("/presets", { label: label.trim(), note: note.trim() });
      setVersions((prev) => (prev ? [version, ...prev] : [version]));
      setSnapshotting(false);
      setLabel("");
      setNote("");
      toast(`Snapshot ${version.version} created`);
    } catch {
      toast("Could not create snapshot", "danger");
    } finally {
      setSaving(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoring) return;
    setBusy(true);
    try {
      const result = await api.post<{ version: PresetVersion; rules: EscalationRule[] }>(
        `/presets/${restoring.id}/restore`,
      );
      toast(`${result.version.version} restored as live presets`);
      setRestoring(null);
    } catch {
      toast("Could not restore version", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Automation presets</h1>
        <button
          type="button"
          onClick={() => setSnapshotting(true)}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
        >
          <Icon name="plus" size={15} />
          Snapshot current
        </button>
      </header>

      <Card title="Live presets (E1–E10)" icon="zap">
        <LivePresetsTable presets={presets} />
      </Card>

      <Card title="Version history" icon="clock">
        {!versions ? (
          <div className="flex flex-col gap-3">
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        ) : versions.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No snapshots yet"
            subtitle="Take a snapshot to make the live presets restorable — versioned and audit-recorded."
            className="py-10"
            action={
              <button
                type="button"
                onClick={() => setSnapshotting(true)}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
              >
                <Icon name="plus" size={14} />
                Take a snapshot
              </button>
            }
          />
        ) : (
          <PresetVersionsTable versions={versions} onRestore={setRestoring} />
        )}
      </Card>

      <Modal
        open={snapshotting}
        onClose={() => setSnapshotting(false)}
        title="Snapshot current presets"
        icon="clock"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSnapshotting(false)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void snapshot()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              Create snapshot
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-[12.5px] text-text-2">
            Snapshots are immutable — restoring a version overwrites the live E1–E10 presets and
            is recorded in the audit log.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Version label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Refund & money-threat hardening"
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What changed in this snapshot?"
              className="input-control"
            />
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={!!restoring}
        onClose={() => setRestoring(null)}
        onConfirm={() => void confirmRestore()}
        busy={busy}
        tone="primary"
        icon="swap"
        title={`Restore ${restoring?.version}?`}
        description={
          <>
            The live E1–E10 presets will be replaced with the <strong>{restoring?.version}</strong>{" "}
            snapshot ({restoring?.label}). Tenants that customized rules keep their custom rules;
            preset rules reset to this snapshot. Audited.
          </>
        }
        confirmLabel="Restore version"
      />
    </div>
  );
}

function LivePresetsTable({ presets }: { presets: EscalationRule[] }) {
  const columns: ColumnDef<EscalationRule, unknown>[] = [
    {
      accessorKey: "name",
      header: "Rule",
      cell: ({ row }) => (
        <CellMain
          main={
            <span className="flex items-center gap-2">
              <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-code text-text">
                {row.original.id}
              </code>
              <span className="font-semibold text-text">{row.original.name}</span>
            </span>
          }
          sub={row.original.desc}
        />
      ),
    },
    {
      accessorKey: "cond",
      header: "Condition",
      cell: ({ row }) => <span className="font-mono text-code">{row.original.cond}</span>,
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => <span className="font-mono text-code">{row.original.action}</span>,
    },
    {
      accessorKey: "enabled",
      header: "State",
      enableSorting: false,
      cell: ({ row }) => (
        <Pill
          status={row.original.enabled ? "active" : "disabled"}
          tone={row.original.enabled ? "success" : "neutral"}
        />
      ),
    },
  ];
  return <DataTable columns={columns} data={presets} getRowId={(r) => r.id} hoverable borderless />;
}

function PresetVersionsTable({
  versions,
  onRestore,
}: {
  versions: PresetVersion[];
  onRestore: (v: PresetVersion) => void;
}) {
  const columns: ColumnDef<PresetVersion, unknown>[] = [
    {
      accessorKey: "version",
      header: "Version",
      cell: ({ row }) => (
        <span className="font-mono text-[12.5px] font-bold text-text">{row.original.version}</span>
      ),
    },
    {
      accessorKey: "label",
      header: "Label",
      cell: ({ row }) => (
        <CellMain main={row.original.label} sub={`${row.original.rules.length} rules`} />
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <>
          <p className="text-[12.5px] text-text-2">{row.original.createdAt}</p>
          <p className="text-[11px] text-text-3">{row.original.createdBy}</p>
        </>
      ),
    },
    {
      accessorKey: "note",
      header: "Note",
      cell: ({ row }) => (
        <span className="max-w-[240px] text-[12px] text-text-2">{row.original.note ?? "—"}</span>
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
            onClick={() => onRestore(row.original)}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="swap" size={13} />
            Restore
          </button>
        </div>
      ),
    },
  ];
  return <DataTable columns={columns} data={versions} getRowId={(v) => v.id} hoverable borderless />;
}
