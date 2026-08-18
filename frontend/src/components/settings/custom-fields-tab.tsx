"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icons";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { CustomFieldDefinition, CustomFieldType } from "@/lib/types";

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Single Line Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown Select" },
  { value: "checkbox", label: "Checkbox (True/False)" },
  { value: "url", label: "URL Link" },
  { value: "email", label: "Email Address" },
];

function FieldModal({
  editField,
  onClose,
  onSaved,
}: {
  editField: CustomFieldDefinition | null;
  onClose: () => void;
  onSaved: (f: CustomFieldDefinition) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(editField?.name ?? "");
  const [key, setKey] = useState(editField?.key ?? "");
  const [fieldType, setFieldType] = useState<CustomFieldType>(editField?.fieldType ?? "text");
  const [appliesTo, setAppliesTo] = useState<"ticket" | "customer">(editField?.appliesTo ?? "ticket");
  const [optionsStr, setOptionsStr] = useState(editField?.options?.join(", ") ?? "");
  const [required, setRequired] = useState(editField?.required ?? false);
  const [isActive, setIsActive] = useState(editField?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  // Auto-slugify key when name changes (if creating new)
  const handleNameChange = (val: string) => {
    setName(val);
    if (!editField) {
      setKey(val.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_"));
    }
  };

  const save = async () => {
    if (!name.trim() || !key.trim()) {
      toast("Name and Key are required", "danger");
      return;
    }
    setSaving(true);
    try {
      const options = fieldType === "dropdown" ? optionsStr.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const payload = {
        name: name.trim(),
        key: key.trim(),
        fieldType,
        appliesTo,
        options,
        required,
        isActive,
      };
      let result: CustomFieldDefinition;
      if (editField) {
        result = await api.patch<CustomFieldDefinition>(`/custom-fields/${editField.id}`, payload);
        toast("Custom field updated");
      } else {
        result = await api.post<CustomFieldDefinition>("/custom-fields", payload);
        toast("Custom field created");
      }
      onSaved(result);
    } catch {
      toast("Could not save custom field", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-md border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-[15px] font-bold text-text">
            {editField ? "Edit Custom Field" : "Add Custom Field"}
          </h3>
          <button onClick={onClose} className="rounded-sm p-1 text-text-3 hover:text-text">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Field Name *</span>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Account Tier"
                className="input-control"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Field Key (API slug) *</span>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g. account_tier"
                className="input-control font-mono text-[12px]"
                disabled={!!editField}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Field Type</span>
              <Select
                value={fieldType}
                onChange={(v) => setFieldType(v as CustomFieldType)}
                options={FIELD_TYPES}
                ariaLabel="Field Type"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Applies To</span>
              <Select
                value={appliesTo}
                onChange={(v) => setAppliesTo(v as "ticket" | "customer")}
                disabled={!!editField}
                options={[
                  { value: "ticket", label: "Ticket / Conversation" },
                  { value: "customer", label: "Customer Profile" },
                ]}
                ariaLabel="Applies To"
              />
            </label>
          </div>

          {fieldType === "dropdown" && (
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Dropdown Options</span>
              <input
                value={optionsStr}
                onChange={(e) => setOptionsStr(e.target.value)}
                placeholder="Comma separated: Option A, Option B, Option C"
                className="input-control"
              />
            </label>
          )}

          <div className="flex items-center gap-6 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-text">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface text-primary"
              />
              Required field
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-text">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface text-primary"
              />
              Active
            </label>
          </div>
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
            {editField ? "Save Changes" : "Create Field"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CustomFieldsTab() {
  const toast = useToast();
  const { role } = useAuth();
  const canManage = role === "owner" || role === "super_admin";
  const [fields, setFields] = useState<CustomFieldDefinition[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editField, setEditField] = useState<CustomFieldDefinition | null>(null);
  const [activeTab, setActiveTab] = useState<"ticket" | "customer">("ticket");

  const load = useCallback(() => {
    let active = true;
    api.get<CustomFieldDefinition[]>("/custom-fields").then((data) => {
      if (active) setFields(data);
    }).catch(() => {
      if (active) setFields([]);
    });
    return () => { active = false; };
  }, []);

  useEffect(load, [load]);

  const openCreate = () => { setEditField(null); setOpen(true); };
  const openEditFunc = (f: CustomFieldDefinition) => { setEditField(f); setOpen(true); };

  const deleteField = async (id: string) => {
    try {
      await api.del(`/custom-fields/${id}`);
      setFields((prev) => prev?.filter((f) => f.id !== id) ?? null);
      toast("Custom field deleted");
    } catch {
      toast("Could not delete custom field", "danger");
    }
  };

  const onSaved = (f: CustomFieldDefinition) => {
    setFields((prev) => {
      if (!prev) return [f];
      const exists = prev.find((x) => x.id === f.id);
      return exists ? prev.map((x) => (x.id === f.id ? f : x)) : [...prev, f];
    });
    setOpen(false);
  };

  const filteredFields = useMemo(() => {
    return fields?.filter((f) => f.appliesTo === activeTab) ?? [];
  }, [fields, activeTab]);

  const columns = useMemo<ColumnDef<CustomFieldDefinition, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <CellMain main={row.original.name} sub={row.original.key} />,
      },
      {
        accessorKey: "fieldType",
        header: "Type",
        cell: ({ row }) => <span className="capitalize text-text-2">{row.original.fieldType}</span>,
      },
      {
        accessorKey: "required",
        header: "Required",
        cell: ({ row }) => (
          <span className={cn("text-[12px] font-semibold", row.original.required ? "text-primary" : "text-text-3")}>
            {row.original.required ? "Yes" : "No"}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <span className={cn("text-[12px] font-semibold", row.original.isActive ? "text-primary" : "text-text-3")}>
            {row.original.isActive ? "Active" : "Disabled"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            {canManage && (
              <>
                <button
                  onClick={() => openEditFunc(row.original)}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 hover:bg-surface-3 hover:text-text"
                >
                  <Icon name="edit" size={12} /> Edit
                </button>
                <button
                  onClick={() => void deleteField(row.original.id)}
                  className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-danger hover:opacity-80"
                >
                  <Icon name="close" size={12} /> Delete
                </button>
              </>
            )}
          </div>
        ),
      },
    ],
    [canManage]
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-text">Custom Fields</h2>
          <p className="mt-1 text-meta text-text-2">
            Configure custom metadata fields for tickets and customer profiles.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <Icon name="plus" size={15} />
            Add Field
          </button>
        )}
      </header>

      {/* Target entity selector tabs */}
      <div className="flex gap-1 border-b border-border pb-px">
        {(["ticket", "customer"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-t-sm border-b-2 px-4 py-2 text-[13px] font-semibold capitalize transition-colors",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-text-2 hover:text-text"
            )}
          >
            {tab === "ticket" ? "Ticket Fields" : "Customer Fields"}
          </button>
        ))}
      </div>

      <div className="w-full">
        {!fields ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-xs"><Spinner /></div>
        ) : filteredFields.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <EmptyState
              icon="file"
              title={`No ${activeTab} custom fields`}
              subtitle={`Add custom schema fields to track structured metadata on ${activeTab}s.`}
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark shadow-xs"
                  >
                    <Icon name="plus" size={14} /> Add Field
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <DataTable columns={columns} data={filteredFields} getRowId={(f) => f.id} hoverable />
        )}
      </div>

      {open && (
        <FieldModal
          editField={editField}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
