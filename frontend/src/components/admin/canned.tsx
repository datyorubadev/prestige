"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import type { CannedResponse } from "@/lib/types";

export function CannedManager() {
  const toast = useToast();
  const [items, setItems] = useState<CannedResponse[] | null>(null);
  const [query, setQuery] = useState("");

  const [modal, setModal] = useState<CannedResponse | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<CannedResponse | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<CannedResponse[]>("/canned")
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const openNew = () => {
    setLabel("");
    setText("");
    setModal("new");
  };

  const openEdit = (c: CannedResponse) => {
    setLabel(c.label);
    setText(c.text);
    setModal(c);
  };

  const save = async () => {
    if (!label.trim() || !text.trim()) {
      toast("Label and text required", "danger");
      return;
    }
    setSaving(true);
    try {
      if (modal === "new") {
        const created = await api.post<CannedResponse>("/canned", {
          label: label.trim(),
          text: text.trim(),
        });
        setItems((prev) => (prev ? [...prev, created] : [created]));
        toast(`${created.label} created`);
      } else if (modal) {
        const updated = await api.put<CannedResponse>(`/canned/${modal.id}`, {
          label: label.trim(),
          text: text.trim(),
        });
        setItems((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null);
        toast(`${updated.label} saved`);
      }
      setModal(null);
    } catch {
      toast("Could not save snippet", "danger");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: CannedResponse) => {
    setRemoving(true);
    try {
      await api.del(`/canned/${c.id}`);
      setItems((prev) => prev?.filter((x) => x.id !== c.id) ?? null);
      setDeleting(null);
      toast(`${c.label} deleted`);
    } catch {
      toast("Could not delete snippet", "danger");
    } finally {
      setRemoving(false);
    }
  };

  const filtered = (items ?? []).filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      c.text.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Canned responses</h1>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
        >
          <Icon name="plus" size={15} />
          New snippet
        </button>
      </header>

      <div className="relative max-w-sm">
        <Icon
          name="search"
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search snippets…"
          className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-2 pl-9 pr-3 text-[12.5px] text-text placeholder:text-text-3"
        />
      </div>

      {!items ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-4 shadow-card">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton mt-3 h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="edit"
          title={query ? "No snippets match your search" : "No canned responses yet"}
          subtitle={
            query
              ? "Check the spelling or try a shorter keyword."
              : "Canned snippets are shared with every agent — type / in the composer to insert one."
          }
          action={
            query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
              >
                <Icon name="close" size={13} />
                Clear search
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setModal("new")}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
              >
                <Icon name="plus" size={14} />
                New snippet
              </button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-3 rounded-md border border-border bg-surface p-4 shadow-card"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary-soft text-primary">
                <Icon name="copy" size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12.5px] font-bold text-text">{c.label}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-text-2">{c.text}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                >
                  <Icon name="edit" size={13} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(c)}
                  className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-danger transition-colors duration-150 hover:bg-danger-soft/70"
                >
                  <Icon name="close" size={13} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "new" ? "New canned response" : `Edit ${modal?.label}`}
        icon="copy"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModal(null)}
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
              {modal === "new" ? "Create snippet" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="/refund"
              className="input-control font-mono"
            />
            <p className="mt-1.5 text-[11.5px] text-text-3">
              A leading <code className="font-mono text-code">/</code> is added automatically.
            </p>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="The reply inserted into the composer…"
              className="input-control resize-y"
            />
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete canned response"
        icon="trash"
        confirmLabel="Delete snippet"
        busy={removing}
        onConfirm={() => deleting && void remove(deleting)}
        description={
          <>
            <b className="text-text">/{deleting?.label}</b> will be removed and the composer
            shortcut will stop working immediately. Agents can no longer insert this snippet.
          </>
        }
      />
    </div>
  );
}
