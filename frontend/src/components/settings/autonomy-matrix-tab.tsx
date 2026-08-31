"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Icon, type IconName } from "@/components/icons";
import { Select, type SelectOption } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

export interface ToolAutonomyRule {
  id: string;
  toolName: string;
  description: string;
  category: "customer" | "orders" | "tickets" | "communication";
  autonomyLevel: "autonomous" | "requires_approval" | "disabled";
  minConfidence: number;
}

const CATEGORY_MAP: Record<string, ToolAutonomyRule["category"]> = {
  api: "customer",
  kyc: "customer",
  doc_verify: "orders",
  callback: "tickets",
  custom: "communication",
};

const AUTONOMY_OPTIONS: SelectOption[] = [
  { value: "autonomous", label: "Fully Autonomous", icon: "check", iconColor: "text-primary" },
  { value: "requires_approval", label: "Requires Approval", icon: "zap", iconColor: "text-warning" },
  { value: "disabled", label: "Disabled", icon: "close", iconColor: "text-danger" },
];

export function AutonomyMatrixTab() {
  const router = useRouter();
  const toast = useToast();
  const [tools, setTools] = useState<ToolAutonomyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<{ tools: any[] }>("/ai/tools")
      .then((res) => {
        if (!active) return;
        const mapped: ToolAutonomyRule[] = (res.tools ?? []).map((t: any) => ({
          id: t.id,
          toolName: t.name,
          description: t.description || "",
          category: CATEGORY_MAP[t.category] ?? "customer",
          autonomyLevel: t.requiresApproval ? "requires_approval" : t.isActive ? "autonomous" : "disabled",
          minConfidence: 75,
        }));
        setTools(mapped);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tools.filter((t) => {
      const matchCat = categoryFilter === "all" || t.category === categoryFilter;
      const matchQuery = !q || t.toolName.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [tools, search, categoryFilter]);

  const updateLevel = (id: string, level: "autonomous" | "requires_approval" | "disabled") => {
    setTools((prev) =>
      prev.map((t) => (t.id === id ? { ...t, autonomyLevel: level } : t))
    );
  };

  const updateConfidence = (id: string, conf: number) => {
    setTools((prev) =>
      prev.map((t) => (t.id === id ? { ...t, minConfidence: conf } : t))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        tools.map((t) =>
          api.put(`/ai/tools/${t.id}`, {
            requiresApproval: t.autonomyLevel === "requires_approval",
            isActive: t.autonomyLevel !== "disabled",
          })
        )
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      toast("Could not save autonomy settings", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 text-text">
      {saved && (
        <div className="flex items-center gap-2 rounded-md border border-primary-border bg-primary-soft p-3 text-[13px] text-primary-dark font-medium animate-in fade-in">
          <Icon name="check" size={16} />
          Autonomy matrix permissions updated successfully.
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-2">
          <Spinner size={20} />
          <p className="text-[12.5px]">Loading AI tools…</p>
        </div>
      ) : (
        <>
      {/* Linear-style Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium">
          {[
            { id: "all", label: "All Tools" },
            { id: "customer", label: "Customer Data" },
            { id: "orders", label: "Orders & Refunds" },
            { id: "tickets", label: "Tickets & Routing" },
            { id: "communication", label: "Communication" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                categoryFilter === cat.id
                  ? "border-primary bg-primary text-white font-semibold"
                  : "border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Bar + Add Action */}
        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          <div className="relative w-full sm:w-60">
            <Icon name="search" size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search AI tools…"
              className="w-full rounded-md border border-border bg-surface pl-8 pr-3 py-1 text-[12px] text-text placeholder:text-text-3 focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              router.push("/dashboard/tools?builder=1");
            }}
            title="Open the Visual Action Builder to create a new AI action or tool"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary-dark cursor-pointer shadow-xs"
          >
            <Icon name="plus" size={13} />
            Add Action / Tool
          </button>
        </div>
      </div>

      {/* Flat Linear-Style Tools List */}
      <div className="flex flex-col gap-2.5">
        {filteredTools.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
            <EmptyState
              icon="sparkles"
              title="No AI tools found"
              subtitle={
                search
                  ? "Try changing your search query or switching the category filter."
                  : "No AI tools configured for this category."
              }
              action={
                search ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setCategoryFilter("all");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-text hover:bg-surface-3 transition-colors"
                  >
                    Reset filters
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      router.push("/dashboard/tools?builder=1");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark shadow-xs"
                  >
                    <Icon name="plus" size={13} />
                    Add Action / Tool
                  </button>
                )
              }
            />
          </div>
        ) : (
          filteredTools.map((tool) => {
            const isHigh = tool.minConfidence >= 80;
            const isMed = tool.minConfidence >= 70 && tool.minConfidence < 80;

            const iconName: IconName =
              tool.autonomyLevel === "autonomous"
                ? "check"
                : tool.autonomyLevel === "requires_approval"
                ? "zap"
                : "close";

            const iconColor =
              tool.autonomyLevel === "autonomous"
                ? "text-primary"
                : tool.autonomyLevel === "requires_approval"
                ? "text-warning"
                : "text-danger";

            return (
              <div
                key={tool.id}
                className="flex flex-col gap-2.5 rounded-md border border-border bg-surface p-3.5 text-[12.5px] transition-colors hover:border-border-strong"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                      <Icon name={iconName} size={15} className={iconColor} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-text text-[13px]">{tool.toolName}</span>
                        <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-3">
                          {tool.category}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-text-2">{tool.description}</p>
                    </div>
                  </div>

                  <div className="w-[190px] shrink-0">
                    <Select
                      value={tool.autonomyLevel}
                      onChange={(v) => updateLevel(tool.id, v as any)}
                      size="sm"
                      options={AUTONOMY_OPTIONS}
                      ariaLabel={`Autonomy level for ${tool.toolName}`}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between border-t border-border/60 pt-2.5 text-[11.5px]">
                  <span className="text-text-3 font-medium">Confidence Threshold</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={50}
                      max={95}
                      value={tool.minConfidence}
                      onChange={(e) => updateConfidence(tool.id, Number(e.target.value))}
                      className="h-1.5 w-32"
                    />
                    <span
                      className={`font-mono text-[11px] font-bold rounded px-2 py-0.5 tabular-nums border ${
                        isHigh
                          ? "bg-primary-soft text-primary-dark border-primary-border"
                          : isMed
                          ? "bg-warning-soft text-warning-dark border-warning-border"
                          : "bg-danger-soft text-danger-dark border-danger-border"
                      }`}
                    >
                      {tool.minConfidence}% Min Confidence
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
          Save Autonomy Settings
        </button>
      </div>
        </>
      )}
    </div>
  );
}
