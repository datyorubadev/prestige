"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import type { Label } from "@/lib/types";

const COLOR_PRESETS = [
  "#0d8f63",
  "#2563eb",
  "#7c3aed",
  "#d93636",
  "#b98800",
  "#0891b2",
  "#db2777",
  "#ea580c",
  "#475569",
  "#10b981",
];

export function LabelsTab() {
  const toast = useToast();
  const [labels, setLabels] = useState<Label[] | null>(null);

  const [modal, setModal] = useState<Label | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<Label | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => {
    api
      .get<Label[]>("/labels")
      .then((data) => setLabels(data))
      .catch(() => setLabels([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setName("");
    setDescription("");
    setColor(COLOR_PRESETS[0]);
    setModal("new");
  };

  const openEdit = (l: Label) => {
    setName(l.name);
    setDescription(l.description ?? "");
    setColor(l.color || COLOR_PRESETS[0]);
    setModal(l);
  };

  const save = async () => {
    if (!name.trim()) {
      toast("Label name required", "danger");
      return;
    }
    setSaving(true);
    try {
      if (modal === "new") {
        const created = await api.post<Label>("/labels", {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
        });
        setLabels((prev) => (prev ? [...prev, created] : [created]));
        toast(`Label "${created.name}" created`);
      } else if (modal) {
        const updated = await api.patch<Label>(`/labels/${modal.id}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
        });
        setLabels((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
        toast(`Label "${updated.name}" updated`);
      }
      setModal(null);
    } catch {
      toast("Could not save label", "danger");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: Label) => {
    setRemoving(true);
    try {
      await api.del(`/labels/${l.id}`);
      setLabels((prev) => prev?.filter((x) => x.id !== l.id) ?? null);
      setDeleting(null);
      toast(`Label "${l.name}" deleted`);
    } catch {
      toast("Could not delete label", "danger");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h2 text-text">Workspace labels</h2>
          <p className="mt-1 text-[12.5px] text-text-3">
            Categorize and filter conversations with custom color-coded labels.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-primary-dark"
        >
          <Icon name="plus" size={15} />
          Create label
        </button>
      </header>

      {!labels ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full rounded-md" />
          ))}
        </div>
      ) : labels.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
          <EmptyState
            icon="tag"
            title="No labels created yet"
            subtitle="Create your first label to organize ticket routing and inbox filters."
            action={
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
              >
                <Icon name="plus" size={14} />
                Create your first label
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {labels.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-text">{l.name}</p>
                  {l.description && (
                    <p className="truncate text-[11.5px] text-text-3">{l.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(l)}
                  className="rounded-sm p-1 text-text-3 hover:bg-surface-2 hover:text-text"
                  title="Edit label"
                >
                  <Icon name="edit" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(l)}
                  className="rounded-sm p-1 text-text-3 hover:bg-danger-soft hover:text-danger"
                  title="Delete label"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Label Create/Edit Modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "new" ? "Create label" : "Edit label"}
        icon="tag"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModal(null)}
              className="rounded-sm border border-border px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? <Spinner size={13} /> : <Icon name="check" size={13} />}
              {modal === "new" ? "Create label" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1 block text-micro uppercase text-text-3">Name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIP, Bug, Billing"
              className="input-control"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-micro uppercase text-text-3">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              className="input-control"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-micro uppercase text-text-3">Color Badge</span>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    color === c ? "border-text scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <label
                title="Custom color palette"
                className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border bg-surface-2 transition-transform hover:scale-105 hover:border-text"
                style={{ backgroundColor: COLOR_PRESETS.includes(color) ? undefined : color }}
              >
                <Icon name="sparkles" size={13} className="text-text-2" />
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete label"
        icon="tag"
        confirmLabel="Delete label"
        busy={removing}
        onConfirm={() => deleting && void remove(deleting)}
        description={
          deleting && (
            <>
              Delete label <b className="text-text">{deleting.name}</b>? It will be removed from all assigned tickets.
            </>
          )
        }
      />
    </div>
  );
}
