"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icons";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { Macro, MacroAction, MacroActionType, AgentUser } from "@/lib/types";

const ACTION_TYPES: { value: MacroActionType; label: string }[] = [
  { value: "assign_team", label: "Assign Team" },
  { value: "assign_agent", label: "Assign Agent" },
  { value: "set_status", label: "Set Status" },
  { value: "set_label", label: "Set Label" },
  { value: "set_priority", label: "Set Priority" },
  { value: "send_message", label: "Send Message (customer reply)" },
  { value: "add_note", label: "Add Internal Note" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_for_customer", label: "Waiting (Customer)" },
  { value: "waiting_internal", label: "Waiting (Internal)" },
  { value: "resolved", label: "Resolved" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function ActionRow({
  action,
  index,
  agents,
  onChange,
  onRemove,
}: {
  action: MacroAction;
  index: number;
  agents: AgentUser[];
  onChange: (i: number, updated: MacroAction) => void;
  onRemove: (i: number) => void;
}) {
  const needsTextarea = action.type === "send_message" || action.type === "add_note";
  const needsStatus = action.type === "set_status";
  const needsPriority = action.type === "set_priority";
  const needsAgent = action.type === "assign_agent";

  return (
    <div className="flex items-start gap-2 rounded-sm border border-border bg-surface-2 p-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-text-2">
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Select
          value={action.type}
          onChange={(v) =>
            onChange(index, { type: v as MacroActionType, value: "" })
          }
          options={ACTION_TYPES}
          ariaLabel="Action Type"
        />
        {needsTextarea ? (
          <textarea
            rows={3}
            value={action.value}
            onChange={(e) => onChange(index, { ...action, value: e.target.value })}
            placeholder={action.type === "send_message" ? "Customer-visible reply text…" : "Internal note text…"}
            className="input-control resize-y text-[12.5px]"
          />
        ) : needsStatus ? (
          <Select
            value={action.value}
            onChange={(v) => onChange(index, { ...action, value: v })}
            placeholder="Select status…"
            options={STATUS_OPTIONS}
            ariaLabel="Status"
          />
        ) : needsPriority ? (
          <Select
            value={action.value}
            onChange={(v) => onChange(index, { ...action, value: v })}
            placeholder="Select priority…"
            options={PRIORITY_OPTIONS}
            ariaLabel="Priority"
          />
        ) : needsAgent ? (
          <Select
            value={action.value}
            onChange={(v) => onChange(index, { ...action, value: v })}
            placeholder="Select agent…"
            options={agents.map((a) => ({ value: a.id, label: a.name }))}
            ariaLabel="Agent"
          />
        ) : (
          <input
            type="text"
            value={action.value}
            onChange={(e) => onChange(index, { ...action, value: e.target.value })}
            placeholder={action.type === "set_label" ? "e.g. billing" : "Team name or ID"}
            className="input-control"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-danger-border bg-danger-soft text-danger transition-colors hover:bg-danger/10"
        title="Remove step"
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

interface BuilderModalProps {
  editMacro: Macro | null;
  agents: AgentUser[];
  onClose: () => void;
  onSaved: (m: Macro) => void;
}

function BuilderModal({ editMacro, agents, onClose, onSaved }: BuilderModalProps) {
  const toast = useToast();
  const [name, setName] = useState(editMacro?.name ?? "");
  const [description, setDescription] = useState(editMacro?.description ?? "");
  const [visibility, setVisibility] = useState<"private" | "shared">(editMacro?.visibility ?? "shared");
  const [actions, setActions] = useState<MacroAction[]>(
    editMacro?.actions ?? [{ type: "set_status", value: "" }]
  );
  const [saving, setSaving] = useState(false);

  const addStep = () => setActions((prev) => [...prev, { type: "set_status", value: "" }]);
  const updateAction = (i: number, updated: MacroAction) =>
    setActions((prev) => prev.map((a, idx) => (idx === i ? updated : a)));
  const removeAction = (i: number) =>
    setActions((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { toast("Name is required", "danger"); return; }
    if (actions.length === 0) { toast("Add at least one action step", "danger"); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description, visibility, actions };
      let result: Macro;
      if (editMacro) {
        result = await api.patch<Macro>(`/macros/${editMacro.id}`, payload);
        toast("Macro updated");
      } else {
        result = await api.post<Macro>("/macros", payload);
        toast("Macro created");
      }
      onSaved(result);
    } catch {
      toast("Could not save macro", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-md border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-primary/10 text-primary">
            <Icon name="zap" size={16} />
          </div>
          <h2 className="flex-1 text-[15px] font-bold text-text">
            {editMacro ? "Edit Macro" : "Create Macro"}
          </h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-sm text-text-3 hover:bg-surface-2 hover:text-text">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Resolve billing issue" className="input-control" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description for your team" className="input-control" />
          </label>
          <div>
            <span className="mb-1.5 block text-micro uppercase text-text-3">Visibility</span>
            <div className="flex gap-3">
              {(["shared", "private"] as const).map((v) => (
                <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-[12.5px] font-semibold transition-colors", visibility === v ? "border-primary bg-primary/5 text-primary" : "border-border bg-surface text-text-2 hover:bg-surface-2")}>
                  <input type="radio" value={v} checked={visibility === v} onChange={() => setVisibility(v)} className="sr-only" />
                  <Icon name={v === "shared" ? "users" : "lock"} size={13} />
                  {v === "shared" ? "Shared (team)" : "Private (only me)"}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-micro uppercase text-text-3">Action Steps</span>
              <span className="text-[11px] text-text-3">{actions.length} step{actions.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex flex-col gap-2">
              {actions.map((action, i) => (
                <ActionRow key={i} action={action} index={i} agents={agents} onChange={updateAction} onRemove={removeAction} />
              ))}
            </div>
            <button type="button" onClick={addStep} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-border py-2 text-[12.5px] font-semibold text-text-2 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary">
              <Icon name="plus" size={13} /> Add step
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-sm border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 transition-colors hover:bg-surface-2">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50">
            {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
            {editMacro ? "Save changes" : "Create macro"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MacrosTab() {
  const toast = useToast();
  const { role } = useAuth();
  const [macros, setMacros] = useState<Macro[] | null>(null);
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [open, setOpen] = useState(false);
  const [editMacro, setEditMacro] = useState<Macro | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    api.get<Macro[]>("/macros").then((data) => { if (active) setMacros(data); }).catch(() => { if (active) setMacros([]); });
    api.get<AgentUser[]>("/agents").then((data) => { if (active) setAgents(data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(load, [load]);

  const openCreate = () => { setEditMacro(null); setOpen(true); };
  const openEdit = (m: Macro) => { setEditMacro(m); setOpen(true); };
  const close = () => { setOpen(false); setEditMacro(null); };

  const onSaved = (m: Macro) => {
    setMacros((prev) => {
      if (!prev) return [m];
      const exists = prev.find((x) => x.id === m.id);
      return exists ? prev.map((x) => (x.id === m.id ? m : x)) : [m, ...prev];
    });
    close();
  };

  const deleteMacro = async (id: string) => {
    try {
      await api.del(`/macros/${id}`);
      setMacros((prev) => prev?.filter((m) => m.id !== id) ?? null);
      toast("Macro deleted");
    } catch {
      toast("Could not delete macro", "danger");
    } finally {
      setConfirmDelete(null);
    }
  };

  const columns = useMemo<ColumnDef<Macro, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <CellMain main={row.original.name} sub={row.original.description} />,
      },
      {
        accessorKey: "actions",
        header: "Steps",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.actions.map((a, i) => (
              <span key={i} className="inline-flex rounded-sm bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-text-2">
                {ACTION_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
              </span>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "visibility",
        header: "Visibility",
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 capitalize text-text-2">
            <Icon name={row.original.visibility === "private" ? "lock" : "users"} size={11} />
            {row.original.visibility}
          </span>
        ),
      },
      {
        accessorKey: "runCount",
        header: "Runs",
        cell: ({ row }) => <span className="tabular-nums text-text-2">{row.original.runCount}</span>,
      },
      {
        id: "rowActions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={() => openEdit(row.original)} className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 hover:bg-surface-3 hover:text-text">
              <Icon name="edit" size={12} /> Edit
            </button>
            {confirmDelete === row.original.id ? (
              <div className="flex gap-1">
                <button onClick={() => void deleteMacro(row.original.id)} className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2 py-1.5 text-[11.5px] font-semibold text-danger hover:opacity-80">
                  Confirm
                </button>
                <button onClick={() => setConfirmDelete(null)} className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1.5 text-[11.5px] font-semibold text-text-2 hover:bg-surface-2">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(row.original.id)} className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-danger hover:opacity-80">
                <Icon name="close" size={12} /> Delete
              </button>
            )}
          </div>
        ),
      },
    ],
    [confirmDelete]
  );

  const [query, setQuery] = useState("");

  const filteredMacros = useMemo(() => {
    if (!macros) return null;
    if (!query.trim()) return macros;
    const q = query.toLowerCase();
    return macros.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.visibility.toLowerCase().includes(q)
    );
  }, [macros, query]);

  const canManage = role === "owner" || role === "super_admin";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Macros</h1>
          <p className="mt-1 text-meta text-text-2">One-click action sequences for common tasks. Run them from any conversation.</p>
        </div>
        {canManage && (
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark">
            <Icon name="plus" size={15} /> Create Macro
          </button>
        )}
      </header>

      {macros && macros.length > 0 && (
        <div className="relative max-w-sm">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search macros…"
            className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-2 pl-9 pr-3 text-[12.5px] text-text placeholder:text-text-3"
          />
        </div>
      )}

      <div className="w-full">
        {!filteredMacros ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-xs"><Spinner /></div>
        ) : filteredMacros.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <EmptyState
              icon="zap"
              title={query ? "No macros match your search" : "No macros yet"}
              subtitle={
                query
                  ? "Try a different keyword or clear the search filter."
                  : "Create your first macro to speed up repetitive ticket actions with 1-click execution."
              }
              action={
                query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-text hover:bg-surface-3 transition-colors"
                  >
                    Clear search
                  </button>
                ) : canManage ? (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark shadow-xs"
                  >
                    <Icon name="plus" size={14} /> Create Macro
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <DataTable columns={columns} data={filteredMacros} getRowId={(m) => m.id} hoverable />
        )}
      </div>

      {open && <BuilderModal editMacro={editMacro} agents={agents} onClose={close} onSaved={onSaved} />}
    </div>
  );
}
