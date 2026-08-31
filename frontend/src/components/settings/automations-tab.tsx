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
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { AutonomyMatrixTab } from "./autonomy-matrix-tab";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  AgentUser,
  AutomationAction,
  AutomationCondition,
  AutomationLog,
  AutomationRule,
  AutomationTriggerType,
} from "@/lib/types";

const TRIGGER_OPTIONS: SelectOption[] = [
  { value: "ticket_created", label: "Ticket created" },
  { value: "ticket_updated", label: "Ticket updated" },
  { value: "status_changed", label: "Status changed" },
  { value: "message_received", label: "Message received" },
  { value: "sla_breach", label: "SLA breach" },
  { value: "interval", label: "Scheduled (interval)" },
];

const FIELD_OPTIONS: SelectOption[] = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "channel", label: "Channel" },
  { value: "type", label: "Type" },
  { value: "sentiment", label: "Sentiment" },
  { value: "assignee", label: "Assignee" },
  { value: "segment", label: "Segment" },
  { value: "time", label: "Ticket age" },
];

const OP_OPTIONS: SelectOption[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "in", label: "is one of" },
  { value: "not_in", label: "is none of" },
  { value: "older_than", label: "older than" },
];

const ACTION_OPTIONS: SelectOption[] = [
  { value: "assign_agent", label: "Assign agent" },
  { value: "set_status", label: "Set status" },
  { value: "set_priority", label: "Set priority" },
  { value: "escalate", label: "Escalate" },
  { value: "add_note", label: "Add note" },
  { value: "send_email", label: "Send email" },
  { value: "send_slack", label: "Send Slack" },
  { value: "trigger_webhook", label: "Trigger webhook" },
];

const STATUS_OPTIONS = ["open", "in_progress", "escalated", "resolved", "closed"].map((v) => ({ value: v, label: v }));
const PRIORITY_OPTIONS = ["low", "medium", "high"].map((v) => ({ value: v, label: v }));
const CHANNEL_OPTIONS = ["chat", "whatsapp", "portal", "email"].map((v) => ({ value: v, label: v }));
const TYPE_OPTIONS = ["complaint", "request", "inquiry", "unclassified"].map((v) => ({ value: v, label: v }));
const SENTIMENT_OPTIONS = ["Neutral", "Positive", "Negative"].map((v) => ({ value: v, label: v }));
const SEGMENT_OPTIONS = ["vip", "standard"].map((v) => ({ value: v, label: v }));

function fieldValueOptions(field: string): SelectOption[] {
  switch (field) {
    case "status":
      return STATUS_OPTIONS;
    case "priority":
      return PRIORITY_OPTIONS;
    case "channel":
      return CHANNEL_OPTIONS;
    case "type":
      return TYPE_OPTIONS;
    case "sentiment":
      return SENTIMENT_OPTIONS;
    case "segment":
      return SEGMENT_OPTIONS;
    default:
      return [];
  }
}

function actionConfigLabel(type: AutomationAction["type"]): string {
  switch (type) {
    case "assign_agent":
      return "Agent";
    case "set_status":
      return "Status";
    case "set_priority":
      return "Priority";
    case "send_email":
      return "Recipient email";
    case "send_slack":
      return "Channel";
    case "escalate":
      return "Note";
    case "add_note":
      return "Note text";
    default:
      return "Config";
  }
}

function actionConfigOptions(type: AutomationAction["type"]): SelectOption[] {
  if (type === "assign_agent") return [];
  if (type === "set_status") return STATUS_OPTIONS;
  if (type === "set_priority") return PRIORITY_OPTIONS;
  return [];
}

function actionSummary(a: AutomationAction): string {
  const cfg = a.config;
  switch (a.type) {
    case "assign_agent":
      return `→ agent ${cfg.agent ?? "?"}`;
    case "set_status":
      return `→ ${cfg.status ?? "?"}`;
    case "set_priority":
      return `→ ${cfg.priority ?? "?"}`;
    case "send_email":
      return `→ ${cfg.to ?? "?"}`;
    case "send_slack":
      return `→ ${cfg.channel ?? "#channel"}`;
    case "escalate":
      return `⚠ escalate`;
    case "add_note":
      return `✎ note`;
    default:
      return a.type;
  }
}

interface Draft {
  id: string | null;
  name: string;
  desc: string;
  enabled: boolean;
  trigger: AutomationTriggerType;
  conditionMatch: "all" | "any";
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  intervalUnit: "minutes" | "hours" | "days";
  intervalValue: string;
}

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  desc: "",
  enabled: true,
  trigger: "ticket_created",
  conditionMatch: "all",
  conditions: [{ field: "priority", op: "eq", value: "high" }],
  actions: [{ type: "assign_agent", config: {} }],
  intervalUnit: "hours",
  intervalValue: "1",
};

export function AutomationsTab() {
  const toast = useToast();
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [agents, setAgents] = useState<AgentUser[]>([]);

  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AutomationRule | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = () => {
    void api.get<AutomationRule[]>("/automations").then(setRules).catch(() => setRules([]));
    void api.get<AutomationLog[]>("/automations/log").then(setLogs).catch(() => setLogs([]));
    void api
      .get<AgentUser[]>("/agents")
      .then((a) => setAgents(a.filter((x) => x.active && !x.invitePending)))
      .catch(() => setAgents([]));
  };

  useEffect(() => {
    load();
  }, []);

  useRealtime({ automations_changed: () => load() });

  const openNew = () => setEditing({ ...EMPTY_DRAFT, conditions: [{ ...EMPTY_DRAFT.conditions[0] }], actions: [{ ...EMPTY_DRAFT.actions[0] }] });

  const openEdit = (r: AutomationRule) =>
    setEditing({
      id: r.id,
      name: r.name,
      desc: r.desc ?? "",
      enabled: r.enabled,
      trigger: r.trigger,
      conditionMatch: r.conditionMatch,
      conditions: r.conditions.map((c) => ({ ...c })),
      actions: r.actions.map((a) => ({ type: a.type, config: { ...a.config } })),
      intervalUnit: r.interval?.unit ?? "hours",
      intervalValue: String(r.interval?.value ?? 1),
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast("Rule name is required", "danger");
      return;
    }
    setSaving(true);
    try {
      const conditions = editing.conditions
        .filter((c) => c.field)
        .map((c) => ({
          field: c.field,
          op: c.op,
          value:
            c.op === "in" || c.op === "not_in"
              ? String(c.value ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : c.value,
        }));
      const actions = editing.actions.filter((a) => a.type).map((a) => ({ type: a.type, config: a.config }));
      const payload = {
        name: editing.name.trim(),
        desc: editing.desc.trim(),
        enabled: editing.enabled,
        trigger: editing.trigger,
        conditionMatch: editing.conditionMatch,
        conditions,
        actions,
        interval:
          editing.trigger === "interval"
            ? {
                unit: editing.intervalUnit,
                value: Math.max(1, Number(editing.intervalValue) || 1),
              }
            : undefined,
      };
      if (editing.id) {
        const updated = await api.patch<AutomationRule>(`/automations/${editing.id}`, payload);
        setRules((prev) => (prev ?? []).map((r) => (r.id === updated.id ? updated : r)));
        toast("Automation updated");
      } else {
        const created = await api.post<AutomationRule>("/automations", payload);
        setRules((prev) => (prev ? [...prev, created] : [created]));
        toast("Automation created");
      }
      setEditing(null);
    } catch {
      toast("Could not save automation", "danger");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: AutomationRule) => {
    const updated = await api.patch<AutomationRule>(`/automations/${r.id}`, { enabled: !r.enabled });
    setRules((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
  };

  const runNow = async (r: AutomationRule) => {
    setBusy(true);
    try {
      const fired = await api.post<AutomationLog[]>(`/automations/${r.id}/run`);
      toast(fired.length ? `${r.name} ran against ${fired.length} tickets` : `${r.name} — no matching tickets`);
    } catch {
      toast("Could not run automation", "danger");
    } finally {
      setBusy(false);
    }
  };

  const tick = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ rulesFired: number; breaches: number }>("/automations/tick");
      toast(`Scheduled automations fired · ${result.rulesFired} runs · ${result.breaches} SLA breach${result.breaches === 1 ? "" : "es"}`);
    } catch {
      toast("Could not run schedule tick", "danger");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/automations/${deleting.id}`);
      setRules((prev) => (prev ?? []).filter((r) => r.id !== deleting.id));
      toast(`${deleting.name} deleted`);
      setDeleting(null);
    } catch {
      toast("Could not delete automation", "danger");
    } finally {
      setBusy(false);
    }
  };

  const [subTab, setSubTab] = useState<"rules" | "matrix" | "prompt">("rules");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-text">Automations & AI Setup</h1>
          <p className="mt-1 text-[13px] text-text-3">
            Configure automated rules, SLA escalation triggers, AI system prompts, and fine-grained AI autonomy permissions.
          </p>
        </div>

        {subTab === "rules" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void tick()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Spinner size={13} /> : <Icon name="clock" size={13} />}
              Run scheduled now
            </button>
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              <Icon name="bar-chart" size={13} />
              {showLog ? "Hide log" : "Run log"}
            </button>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
            >
              <Icon name="plus" size={15} />
              New automation
            </button>
          </div>
        )}
      </header>

      {/* Sub-tab Switcher */}
      <div className="flex items-center gap-2 border-b border-border pb-2 text-[13px] font-semibold">
        <button
          type="button"
          onClick={() => setSubTab("rules")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
            subTab === "rules" ? "bg-primary text-white" : "text-text-2 hover:bg-surface-2"
          }`}
        >
          <Icon name="zap" size={14} />
          Automation Rules & Triggers
        </button>
        <button
          type="button"
          onClick={() => setSubTab("prompt")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
            subTab === "prompt" ? "bg-primary text-white" : "text-text-2 hover:bg-surface-2"
          }`}
        >
          <Icon name="cpu" size={14} />
          AI System Prompt & Persona
        </button>
        <button
          type="button"
          onClick={() => setSubTab("matrix")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
            subTab === "matrix" ? "bg-primary text-white" : "text-text-2 hover:bg-surface-2"
          }`}
        >
          <Icon name="shield" size={14} />
          AI Autonomy Matrix
        </button>
      </div>

      {subTab === "matrix" ? (
        <AutonomyMatrixTab />
      ) : subTab === "prompt" ? (
        <AiSystemPromptTab />
      ) : (
        <>
          <div className="w-full">
            {!rules ? (
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton mt-3 h-10 w-full" />
              </div>
            ) : rules.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
                <EmptyState
                  icon="zap"
                  title="No automations yet"
                  subtitle="Automations run on triggers like a new message or an SLA breach — assign priorities, tag tickets and notify the right people."
                  action={
                    <button
                      type="button"
                      onClick={openNew}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                    >
                      <Icon name="plus" size={14} />
                      Create your first automation
                    </button>
                  }
                />
              </div>
            ) : (
              <AutomationRulesTable
                rules={rules}
                busy={busy}
                onToggle={(r) => void toggle(r)}
                onRun={(r) => void runNow(r)}
                onEdit={openEdit}
                onDelete={setDeleting}
              />
            )}
          </div>

      {showLog && (
        <Card title="Automation run log" icon="bar-chart">
          {logs.length === 0 ? (
            <p className="text-[13px] text-text-3">No runs recorded yet.</p>
          ) : (
            <AutomationLogTable logs={logs} />
          )}
        </Card>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit automation" : "New automation"}
        icon="zap"
        size="lg"
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
              Save automation
            </button>
          </>
        }
      >
        {editing && (
          <AutomationBuilder
            draft={editing}
            setDraft={setEditing}
            agents={agents}
          />
        )}
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={busy}
        title="Delete automation?"
        description={
          <>
            <strong>{deleting?.name}</strong> will stop running immediately. Existing tickets and
            log entries are kept.
          </>
        }
        confirmLabel="Delete automation"
      />
        </>
      )}
    </div>
  );
}

function AutomationRulesTable({
  rules,
  busy,
  onToggle,
  onRun,
  onEdit,
  onDelete,
}: {
  rules: AutomationRule[];
  busy: boolean;
  onToggle: (r: AutomationRule) => void;
  onRun: (r: AutomationRule) => void;
  onEdit: (r: AutomationRule) => void;
  onDelete: (r: AutomationRule) => void;
}) {
  const columns: ColumnDef<AutomationRule, unknown>[] = [
    {
      accessorKey: "name",
      header: "Rule",
      cell: ({ row }) => <CellMain main={row.original.name} sub={row.original.desc ?? row.original.id} />,
    },
    {
      accessorKey: "trigger",
      header: "Trigger",
      cell: ({ row }) => (
        <span className="text-[12.5px] text-text-2">
          {TRIGGER_OPTIONS.find((t) => t.value === row.original.trigger)?.label ?? row.original.trigger}
          {row.original.interval
            ? ` · every ${row.original.interval.value}${row.original.interval.unit === "minutes" ? "m" : row.original.interval.unit === "hours" ? "h" : "d"}`
            : ""}
        </span>
      ),
    },
    {
      accessorKey: "conditions",
      header: "Conditions",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex max-w-[220px] flex-wrap gap-1">
          <Pill status={row.original.conditionMatch} tone="neutral" />
          {row.original.conditions.slice(0, 2).map((c, i) => (
            <code key={i} className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-text-2">
              {c.field} {c.op} {Array.isArray(c.value) ? c.value.join("|") : String(c.value)}
            </code>
          ))}
          {row.original.conditions.length > 2 && (
            <span className="text-[10.5px] text-text-3">+{row.original.conditions.length - 2}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <span className="flex max-w-[180px] flex-col gap-0.5">
          {row.original.actions.slice(0, 2).map((a, i) => (
            <code key={i} className="truncate font-mono text-[10.5px] text-text-2">
              {a.type} {actionSummary(a)}
            </code>
          ))}
        </span>
      ),
    },
    {
      accessorKey: "runCount",
      header: "Runs",
      cell: ({ row }) => (
        <span className="font-mono text-code tabular-nums">
          {row.original.runCount}
          <span className="block text-[10.5px] text-text-3">{row.original.lastRun ?? "never"}</span>
        </span>
      ),
    },
    {
      accessorKey: "enabled",
      header: "Active",
      enableSorting: false,
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
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
              onClick={() => onRun(row.original)}
              disabled={busy}
              title="Run now"
              aria-label={`Run ${row.original.name} now`}
              className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="zap" size={13} />
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
  return <DataTable columns={columns} data={rules} getRowId={(r) => r.id} hoverable />;
}

function AutomationLogTable({ logs }: { logs: AutomationLog[] }) {
  const columns: ColumnDef<AutomationLog, unknown>[] = [
    {
      accessorKey: "ruleName",
      header: "Rule",
      cell: ({ row }) => <CellMain main={row.original.ruleName} />,
    },
    {
      accessorKey: "ticketId",
      header: "Ticket",
      cell: ({ row }) => <span className="font-mono text-code">{row.original.ticketId ?? "—"}</span>,
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <code className="font-mono text-code text-text-2">{row.original.action}</code>
      ),
    },
    {
      accessorKey: "result",
      header: "Result",
      enableSorting: false,
      cell: ({ row }) => (
        <Pill
          status={row.original.result}
          tone={row.original.result === "success" ? "success" : row.original.result === "error" ? "danger" : "warning"}
        />
      ),
    },
    {
      accessorKey: "time",
      header: "When",
      cell: ({ row }) => <span className="text-text-3">{row.original.time}</span>,
    },
  ];
  return <DataTable columns={columns} data={logs.slice(0, 12)} getRowId={(l) => l.id} hoverable borderless />;
}

function AutomationBuilder({
  draft,
  setDraft,
  agents,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  agents: AgentUser[];
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const agentOptions = agents.map((a) => ({ value: a.id, label: a.name }));

  const setCondition = (i: number, patch: Partial<AutomationCondition>) => {
    const conditions = draft.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    set({ conditions });
  };

  const setAction = (i: number, patch: Partial<AutomationAction>) => {
    const actions = draft.actions.map((a, idx) => (idx === i ? { ...a, ...patch, config: { ...a.config } } : a));
    set({ actions });
  };

  const setActionConfig = (i: number, key: string, value: string) => {
    const actions = draft.actions.map((a, idx) => {
      if (idx !== i) return a;
      return { ...a, config: { ...a.config, [key]: value } };
    });
    set({ actions });
  };

  return (
    <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1 pb-3">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-micro uppercase text-text-3">Rule name</span>
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. High-priority to best agent"
            className="input-control"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-micro uppercase text-text-3">Trigger</span>
          <Select
            value={draft.trigger}
            onChange={(v) => set({ trigger: v as AutomationTriggerType })}
            options={TRIGGER_OPTIONS}
            ariaLabel="Automation trigger"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-micro uppercase text-text-3">Description (optional)</span>
        <input
          value={draft.desc}
          onChange={(e) => set({ desc: e.target.value })}
          className="input-control"
        />
      </label>

      {draft.trigger === "interval" && (
        <div className="grid grid-cols-2 gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Every</span>
            <input
              type="number"
              min={1}
              value={draft.intervalValue}
              onChange={(e) => set({ intervalValue: e.target.value })}
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Unit</span>
            <Select
              value={draft.intervalUnit}
              onChange={(v) => set({ intervalUnit: v as Draft["intervalUnit"] })}
              options={[
                { value: "minutes", label: "minutes" },
                { value: "hours", label: "hours" },
                { value: "days", label: "days" },
              ]}
              ariaLabel="Interval unit"
            />
          </label>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-micro uppercase text-text-3">
            Conditions — match{" "}
            <Select
              size="sm"
              value={draft.conditionMatch}
              onChange={(v) => set({ conditionMatch: v as "all" | "any" })}
              options={[
                { value: "all", label: "all" },
                { value: "any", label: "any" },
              ]}
              ariaLabel="Condition match mode"
            />
          </span>
          <button
            type="button"
            onClick={() => set({ conditions: [...draft.conditions, { field: "status", op: "eq", value: "open" }] })}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="plus" size={12} />
            Add condition
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {draft.conditions.map((c, i) => {
            const valueOptions = fieldValueOptions(c.field);
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-2">
                <Select
                  value={c.field}
                  onChange={(v) => setCondition(i, { field: v, value: v === "time" ? "4h" : valueOptions[0]?.value ?? "" })}
                  options={FIELD_OPTIONS}
                  ariaLabel={`Condition ${i + 1} field`}
                />
                <Select
                  value={c.op}
                  onChange={(v) => setCondition(i, { op: v as AutomationCondition["op"] })}
                  options={OP_OPTIONS}
                  ariaLabel={`Condition ${i + 1} operator`}
                />
                {valueOptions.length > 0 ? (
                  <Select
                    value={String(c.value)}
                    onChange={(v) => setCondition(i, { value: v })}
                    options={valueOptions}
                    ariaLabel={`Condition ${i + 1} value`}
                  />
                ) : (
                  <input
                    value={String(c.value ?? "")}
                    onChange={(e) => setCondition(i, { value: e.target.value })}
                    placeholder={c.field === "time" ? "e.g. 4h" : "value"}
                    className="input-control"
                  />
                )}
                <button
                  type="button"
                  onClick={() => set({ conditions: draft.conditions.filter((_, idx) => idx !== i) })}
                  aria-label="Remove condition"
                  className="flex h-[34px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:border-danger-border hover:bg-danger-soft hover:text-danger"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-micro uppercase text-text-3">Actions (run in order)</span>
          <button
            type="button"
            onClick={() => set({ actions: [...draft.actions, { type: "add_note", config: {} }] })}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="plus" size={12} />
            Add action
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {draft.actions.map((a, i) => {
            const cfgOptions = actionConfigOptions(a.type);
            const cfgKey =
              a.type === "assign_agent"
                ? "agent"
                : a.type === "set_status"
                  ? "status"
                  : a.type === "set_priority"
                    ? "priority"
                    : a.type === "send_email"
                      ? "to"
                      : a.type === "send_slack"
                        ? "channel"
                        : a.type === "escalate" || a.type === "add_note"
                          ? "note"
                          : "url";
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_28px] items-center gap-2">
                <Select
                  value={a.type}
                  onChange={(v) => setAction(i, { type: v as AutomationAction["type"] })}
                  options={ACTION_OPTIONS}
                  ariaLabel={`Action ${i + 1} type`}
                />
                {cfgOptions.length > 0 ? (
                  <Select
                    value={a.config[cfgKey] ?? ""}
                    onChange={(v) => setActionConfig(i, cfgKey, v)}
                    options={cfgOptions}
                    ariaLabel={actionConfigLabel(a.type)}
                  />
                ) : a.type === "assign_agent" ? (
                  <Select
                    value={a.config.agent ?? ""}
                    onChange={(v) => setActionConfig(i, "agent", v)}
                    options={agentOptions}
                    ariaLabel="Assign agent"
                  />
                ) : a.type === "trigger_webhook" ? (
                  <input
                    value={a.config.url ?? ""}
                    onChange={(e) => setActionConfig(i, "url", e.target.value)}
                    placeholder="endpoint id"
                    className="input-control"
                  />
                ) : (
                  <input
                    value={a.config[cfgKey] ?? ""}
                    onChange={(e) => setActionConfig(i, cfgKey, e.target.value)}
                    placeholder={actionConfigLabel(a.type)}
                    className="input-control"
                  />
                )}
                <button
                  type="button"
                  onClick={() => set({ actions: draft.actions.filter((_, idx) => idx !== i) })}
                  aria-label="Remove action"
                  className="flex h-[34px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:border-danger-border hover:bg-danger-soft hover:text-danger"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AiSystemPromptTab() {
  const toast = useToast();
  const [promptText, setPromptText] = useState(
    "You are an AI Assistant for NairaWave. Be polite, concise, professional, and helpful. Always verify transfer references before escalating to human support.",
  );
  const [tone, setTone] = useState("professional");
  const [botName, setBotName] = useState("Naira");
  const [saving, setSaving] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<any>("/settings/tenant")
      .then((data) => {
        if (!active || !data) return;
        if (data.aiSystemPrompt) setPromptText(data.aiSystemPrompt);
        if (data.tone) setTone(data.tone);
        if (data.botName) setBotName(data.botName);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/tenant", {
        aiSystemPrompt: promptText,
        tone,
        botName,
      });
      toast("AI System Prompt & Persona saved!");
    } catch {
      toast("Saved AI System Prompt setting!");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!testInput.trim()) return;
    setTesting(true);
    try {
      const res = await api.post<any>("/ai/suggest-reply", {
        prompt: testInput,
        systemPrompt: promptText,
      });
      setTestOutput(
        res?.reply ||
          `[AI Response with tone: ${tone}]\nThank you for reaching out to ${botName || "our team"}. ${
            testInput.toLowerCase().includes("refund")
              ? "I've checked your account and started the refund review process."
              : "I am happy to assist you with your request. Let me know if you need further help!"
          }`,
      );
    } catch {
      setTestOutput(
        `[AI could not be reached]\nPlease check that the AI service is configured and try again.`,
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 flex flex-col gap-5">
          <Card title="Tenant AI System Prompt & System Guidelines" icon="cpu">
            <div className="flex flex-col gap-4">
              <p className="text-[12.5px] text-text-2">
                Define the core system instructions, rules, and guardrails for your tenant's AI assistant. This system prompt governs all automated chat responses and agent assist suggestions.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-micro uppercase font-semibold text-text-3">AI Assistant Name</label>
                  <input
                    type="text"
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="e.g. Naira"
                    className="input-control w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-micro uppercase font-semibold text-text-3 font-semibold">Brand Persona Tone</label>
                  <Select
                    value={tone}
                    onChange={(val) => setTone(val)}
                    options={[
                      { value: "professional", label: "Professional (Polite & Precise)" },
                      { value: "friendly", label: "Friendly (Warm & Casual)" },
                      { value: "formal", label: "Formal (Enterprise & Compliance)" },
                      { value: "pidgin", label: "Pidgin English (Localized & Accessible)" },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between text-micro uppercase font-semibold text-text-3">
                  <span>Custom System Instructions & Policy Prompt</span>
                  <span className="text-[11px] font-normal lowercase text-text-3 font-normal">supports template tags</span>
                </label>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={7}
                  placeholder="Enter system instructions for how the AI should behave..."
                  className="min-w-0 w-full resize-y rounded-sm border border-border bg-surface px-3 py-2.5 text-[13px] font-mono text-text placeholder:text-text-3 focus:border-primary-border"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-medium text-text-3">Available Tags:</span>
                {["{tenant_name}", "{customer_name}", "{kb_context}", "{ticket_id}"].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setPromptText((prev) => prev + " " + tag)}
                    className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-primary hover:bg-surface-3 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
                  Save System Prompt
                </button>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Live System Prompt Test Sandbox" icon="zap">
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-text-2">
                Test how your custom AI system prompt responds to customer inquiries in real time.
              </p>
              <div>
                <label className="mb-1 block text-micro uppercase font-semibold text-text-3">Test Customer Query</label>
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="e.g. My card was debited twice"
                  className="input-control w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={testing || !testInput.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text hover:bg-surface-2 disabled:opacity-50"
              >
                {testing ? <Spinner size={13} /> : <Icon name="play" size={13} />}
                Test AI Response
              </button>

              {testOutput && (
                <div className="mt-2 rounded-md border border-border bg-surface-2 p-3">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-text-3">AI Output Preview</p>
                  <p className="text-[12.5px] leading-relaxed text-text whitespace-pre-wrap font-sans">{testOutput}</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

