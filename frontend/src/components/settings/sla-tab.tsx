"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import type {
  AutomationCondition,
  SlaEscalation,
  SlaPolicy,
  SlaSchedule,
} from "@/lib/types";

const MATCH_FIELD_OPTIONS: SelectOption[] = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "channel", label: "Channel" },
  { value: "type", label: "Type" },
];
const MATCH_OP_OPTIONS: SelectOption[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "in", label: "is one of" },
  { value: "not_in", label: "is none of" },
];
const CHANNEL_OPTIONS = ["chat", "whatsapp", "portal", "email"].map((v) => ({ value: v, label: v }));
const STATUS_OPTIONS = ["open", "in_progress", "escalated", "resolved", "closed"].map((v) => ({ value: v, label: v }));
const TYPE_OPTIONS = ["complaint", "request", "inquiry", "unclassified"].map((v) => ({ value: v, label: v }));
const PRIORITY_OPTIONS = ["low", "medium", "high"].map((v) => ({ value: v, label: v }));

const ESCALATION_ACTIONS: SelectOption[] = [
  { value: "notify_owner", label: "Notify owner" },
  { value: "notify_team", label: "Notify team" },
  { value: "escalate_agent", label: "Escalate to agent" },
  { value: "send_slack", label: "Send Slack" },
];

function matchValueOptions(field: string): SelectOption[] {
  return field === "status" ? STATUS_OPTIONS : field === "channel" ? CHANNEL_OPTIONS : field === "type" ? TYPE_OPTIONS : PRIORITY_OPTIONS;
}

function fmtMin(min: number): string {
  if (min >= 1440) return `${Math.round(min / 1440)}d`;
  if (min >= 60) return `${Math.round(min / 60)}h`;
  return `${min}m`;
}

interface TargetDraft {
  priority: "low" | "medium" | "high";
  firstResponseMin: string;
  resolutionMin: string;
}

interface EscalationDraft {
  afterMin: string;
  target: "first_response" | "resolution";
  action: string;
  message: string;
}

interface SlaDraft {
  id: string | null;
  name: string;
  desc: string;
  enabled: boolean;
  match: AutomationCondition[];
  targets: TargetDraft[];
  scheduleId: string;
  escalations: EscalationDraft[];
}

const TARGET_ORDER: TargetDraft["priority"][] = ["low", "medium", "high"];

export function SlaTab() {
  const toast = useToast();
  const [policies, setPolicies] = useState<SlaPolicy[] | null>(null);
  const [schedules, setSchedules] = useState<SlaSchedule[]>([]);

  const [editing, setEditing] = useState<SlaDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SlaPolicy | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    void api.get<SlaPolicy[]>("/sla").then(setPolicies).catch(() => setPolicies([]));
    void api.get<SlaSchedule[]>("/sla/schedules").then(setSchedules).catch(() => setSchedules([]));
  };

  useEffect(() => {
    load();
  }, []);

  useRealtime({ sla_changed: () => load() });

  const scheduleName = (id: string | null) =>
    id ? schedules.find((s) => s.id === id)?.name ?? "Custom" : "24/7";

  const openNew = () =>
    setEditing({
      id: null,
      name: "",
      desc: "",
      enabled: true,
      match: [{ field: "channel", op: "in", value: ["chat", "portal"] }],
      targets: TARGET_ORDER.map((p) => ({
        priority: p,
        firstResponseMin: p === "low" ? "240" : p === "medium" ? "120" : "30",
        resolutionMin: p === "low" ? "1440" : p === "medium" ? "720" : "360",
      })),
      scheduleId: schedules[0]?.id ?? "",
      escalations: [],
    });

  const openEdit = (p: SlaPolicy) =>
    setEditing({
      id: p.id,
      name: p.name,
      desc: p.desc ?? "",
      enabled: p.enabled,
      match: p.match.map((c) => ({ ...c })),
      targets: TARGET_ORDER.map((pr) => {
        const t = p.targets.find((x) => x.priority === pr);
        return {
          priority: pr,
          firstResponseMin: String(t?.firstResponseMin ?? 120),
          resolutionMin: String(t?.resolutionMin ?? 720),
        };
      }),
      scheduleId: p.scheduleId ?? "",
      escalations: p.escalations.map((e) => ({
        afterMin: String(e.afterMin),
        target: e.target,
        action: e.action,
        message: e.message,
      })),
    });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast("Policy name is required", "danger");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        desc: editing.desc.trim(),
        enabled: editing.enabled,
        match: editing.match.filter((c) => c.field),
        targets: editing.targets.map((t) => ({
          priority: t.priority,
          firstResponseMin: Math.max(1, Number(t.firstResponseMin) || 120),
          resolutionMin: Math.max(1, Number(t.resolutionMin) || 720),
        })),
        scheduleId: editing.scheduleId || null,
        escalations: editing.escalations.map((e, i) => ({
          id: `sle${Date.now().toString(36)}${i}`,
          level: i + 1,
          afterMin: Math.max(1, Number(e.afterMin) || 15),
          target: e.target,
          action: e.action as SlaEscalation["action"],
          message: e.message,
        })),
      };
      if (editing.id) {
        const updated = await api.patch<SlaPolicy>(`/sla/${editing.id}`, payload);
        setPolicies((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)));
        toast("SLA policy updated");
      } else {
        const created = await api.post<SlaPolicy>("/sla", payload);
        setPolicies((prev) => (prev ? [...prev, created] : [created]));
        toast("SLA policy created");
      }
      setEditing(null);
    } catch {
      toast("Could not save SLA policy", "danger");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: SlaPolicy) => {
    const updated = await api.patch<SlaPolicy>(`/sla/${p.id}`, { enabled: !p.enabled });
    setPolicies((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
  };

  const runCheck = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ rulesFired: number; breaches: number }>("/sla/tick");
      toast(`SLA check complete · ${result.breaches} breach${result.breaches === 1 ? "" : "es"} flagged`);
    } catch {
      toast("Could not run SLA check", "danger");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/sla/${deleting.id}`);
      setPolicies((prev) => (prev ?? []).filter((p) => p.id !== deleting.id));
      toast(`${deleting.name} deleted`);
      setDeleting(null);
    } catch {
      toast("Could not delete policy", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">SLA policies</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Spinner size={13} /> : <Icon name="clock" size={13} />}
            Run SLA check
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="plus" size={15} />
            New policy
          </button>
        </div>
      </header>

      {!policies ? (
        <div className="flex flex-col gap-4">
          <div className="skeleton h-40 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-xs">
          <EmptyState
            icon="clock"
            title="No SLA policies yet"
            subtitle="Create a policy to start tracking first-response and resolution times against a business-hours schedule."
            action={
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
              >
                <Icon name="plus" size={14} />
                Create your first policy
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {policies.map((p) => (
            <Card
              key={p.id}
              title={
                <span className="flex items-center gap-2">
                  {p.name}
                  {!p.enabled && <Pill status="paused" tone="neutral" />}
                </span>
              }
              icon="clock"
              actions={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    aria-label={`Edit ${p.name}`}
                    className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                  >
                    <Icon name="edit" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(p)}
                    aria-label={`Delete ${p.name}`}
                    className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:border-danger-border hover:bg-danger-soft hover:text-danger"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                  <Switch checked={p.enabled} onChange={() => void toggle(p)} label={`Toggle ${p.name}`} />
                </div>
              }
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-2">
                  <Icon name="filter" size={13} className="text-text-3" />
                  {p.match.length === 0 ? (
                    <span className="text-text-3">Applies to all tickets</span>
                  ) : (
                    p.match.map((c, i) => (
                      <code key={i} className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-text-2">
                        {c.field} {c.op} {Array.isArray(c.value) ? c.value.join("|") : String(c.value)}
                      </code>
                    ))
                  )}
                  <span className="ml-auto rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-text-2">
                    {scheduleName(p.scheduleId)}
                  </span>
                </div>

                <div className="overflow-hidden rounded-sm border border-border">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-surface-2 text-micro uppercase text-text-3">
                        <th className="px-3 py-1.5 text-left">Priority</th>
                        <th className="px-3 py-1.5 text-left">First response</th>
                        <th className="px-3 py-1.5 text-left">Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.targets.map((t) => (
                        <tr key={t.priority} className="border-t border-border">
                          <td className="px-3 py-1.5 font-semibold capitalize text-text">{t.priority}</td>
                          <td className="px-3 py-1.5 font-mono text-code text-text-2">{fmtMin(t.firstResponseMin)}</td>
                          <td className="px-3 py-1.5 font-mono text-code text-text-2">{fmtMin(t.resolutionMin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase text-text-3">Escalations</span>
                  {p.escalations.length === 0 ? (
                    <span className="text-[11.5px] text-text-3">none</span>
                  ) : (
                    p.escalations.map((e) => (
                      <Pill key={e.id} status={`L${e.level} @ ${fmtMin(e.afterMin)} · ${e.action}`} tone="warning" />
                    ))
                  )}
                  <span className="ml-auto">
                    <Pill status={`${p.breaches} breaches`} tone={p.breaches > 0 ? "danger" : "success"} />
                  </span>
                </div>

                {p.desc && <p className="text-[12px] text-text-3">{p.desc}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit SLA policy" : "New SLA policy"}
        icon="clock"
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
              Save policy
            </button>
          </>
        }
      >
        {editing && (
          <SlaBuilder
            draft={editing}
            setDraft={setEditing}
            schedules={schedules}
          />
        )}
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={busy}
        title="Delete SLA policy?"
        description={
          <>
            <strong>{deleting?.name}</strong> will stop applying to new and existing tickets.
            Ticket history is kept.
          </>
        }
        confirmLabel="Delete policy"
      />
    </div>
  );
}

function SlaBuilder({
  draft,
  setDraft,
  schedules,
}: {
  draft: SlaDraft;
  setDraft: (d: SlaDraft) => void;
  schedules: SlaSchedule[];
}) {
  const set = (patch: Partial<SlaDraft>) => setDraft({ ...draft, ...patch });

  const setMatch = (i: number, patch: Partial<AutomationCondition>) =>
    set({ match: draft.match.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  const setTarget = (i: number, patch: Partial<TargetDraft>) =>
    set({ targets: draft.targets.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) });

  const setEsc = (i: number, patch: Partial<EscalationDraft>) =>
    set({ escalations: draft.escalations.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });

  return (
    <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-micro uppercase text-text-3">Policy name</span>
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Standard support"
            className="input-control"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-micro uppercase text-text-3">Business hours</span>
          <Select
            value={draft.scheduleId}
            onChange={(v) => set({ scheduleId: v })}
            options={[
              { value: "", label: "24/7 (always)" },
              ...schedules.map((s) => ({ value: s.id, label: s.name })),
            ]}
            ariaLabel="Business hours schedule"
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

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-micro uppercase text-text-3">Applies to tickets where</span>
          <button
            type="button"
            onClick={() => set({ match: [...draft.match, { field: "channel", op: "in", value: ["chat"] }] })}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="plus" size={12} />
            Add filter
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {draft.match.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-2">
              <Select
                value={c.field}
                onChange={(v) => setMatch(i, { field: v, value: "" })}
                options={MATCH_FIELD_OPTIONS}
                ariaLabel={`Filter ${i + 1} field`}
              />
              <Select
                value={c.op}
                onChange={(v) => setMatch(i, { op: v as AutomationCondition["op"] })}
                options={MATCH_OP_OPTIONS}
                ariaLabel={`Filter ${i + 1} operator`}
              />
              <Select
                value={String(c.value)}
                onChange={(v) =>
                  setMatch(i, {
                    value:
                      c.op === "in" || c.op === "not_in" ? [v] : v,
                  })
                }
                options={matchValueOptions(c.field)}
                ariaLabel={`Filter ${i + 1} value`}
              />
              <button
                type="button"
                onClick={() => set({ match: draft.match.filter((_, idx) => idx !== i) })}
                aria-label="Remove filter"
                className="flex h-[34px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:border-danger-border hover:bg-danger-soft hover:text-danger"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-micro uppercase text-text-3">Targets (minutes)</span>
        <div className="flex flex-col gap-2">
          {draft.targets.map((t, i) => (
            <div key={t.priority} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
              <span className="text-[12.5px] font-semibold capitalize text-text">{t.priority}</span>
              <input
                type="number"
                min={1}
                value={t.firstResponseMin}
                onChange={(e) => setTarget(i, { firstResponseMin: e.target.value })}
                placeholder="First response"
                aria-label={`${t.priority} first response minutes`}
                className="input-control"
              />
              <input
                type="number"
                min={1}
                value={t.resolutionMin}
                onChange={(e) => setTarget(i, { resolutionMin: e.target.value })}
                placeholder="Resolution"
                aria-label={`${t.priority} resolution minutes`}
                className="input-control"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-micro uppercase text-text-3">Escalations</span>
          <button
            type="button"
            onClick={() =>
              set({
                escalations: [
                  ...draft.escalations,
                  { afterMin: "15", target: "first_response", action: "notify_owner", message: "" },
                ],
              })
            }
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
          >
            <Icon name="plus" size={12} />
            Add escalation
          </button>
        </div>
        {draft.escalations.length === 0 ? (
          <p className="text-[12px] text-text-3">No escalations — breaches are still counted.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {draft.escalations.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.5 py-2">
                <code className="font-mono text-code text-text-2">L{i + 1}</code>
                <input
                  type="number"
                  min={1}
                  value={e.afterMin}
                  onChange={(ev) => setEsc(i, { afterMin: ev.target.value })}
                  className="w-[74px] input-control"
                  aria-label={`Escalation ${i + 1} after minutes`}
                />
                <span className="text-[11.5px] text-text-3">min after</span>
                <Select
                  size="sm"
                  value={e.target}
                  onChange={(v) => setEsc(i, { target: v as EscalationDraft["target"] })}
                  options={[
                    { value: "first_response", label: "first response" },
                    { value: "resolution", label: "resolution" },
                  ]}
                  ariaLabel={`Escalation ${i + 1} target`}
                />
                <Select
                  size="sm"
                  value={e.action}
                  onChange={(v) => setEsc(i, { action: v })}
                  options={ESCALATION_ACTIONS}
                  ariaLabel={`Escalation ${i + 1} action`}
                />
                <input
                  value={e.message}
                  onChange={(ev) => setEsc(i, { message: ev.target.value })}
                  placeholder="message"
                  className="min-w-[140px] flex-1 input-control"
                />
                <button
                  type="button"
                  onClick={() => set({ escalations: draft.escalations.filter((_, idx) => idx !== i) })}
                  aria-label="Remove escalation"
                  className="flex h-[30px] w-[28px] items-center justify-center rounded-sm border border-border bg-surface text-text-2 transition-colors duration-150 hover:border-danger-border hover:bg-danger-soft hover:text-danger"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
