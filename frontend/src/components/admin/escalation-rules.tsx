"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { EscalationRule, PresetVersion } from "@/lib/types";

const CONDITIONS = [
  "customer_request",
  "keywords",
  "sentiment_negative",
  "confidence_below",
  "conversation_loop",
  "repeat_failed_self_service",
  "pii_security",
  "sla_timeout",
  "customer_segment",
];

const ACTIONS = [
  "escalate",
  "escalate + priority HIGH",
  "set_priority",
  "route_to",
  "notify",
  "halt_ai",
];

/** Sample texts ported from prototype/app.js — one per condition type. */
const SAMPLES: Record<string, string> = {
  customer_request: "I want to speak to a human being right now!",
  keywords: "You people are thieves! Wetin dey happen? I want my money back.",
  sentiment_negative: "This is absolutely ridiculous. I'm so frustrated right now.",
  confidence_below: "I don't understand what you're saying and this isn't helping.",
  conversation_loop: "Hello? Hello? Why aren't you answering me?",
  repeat_failed_self_service: "I already asked three times and I still have the same question.",
  pii_security: "My card number is 5123 4567 8910 1121 and the OTP is 452110.",
  sla_timeout: "I've been waiting for hours now with no reply at all.",
  customer_segment: "I'm a VIP customer, why am I talking to a bot?",
};

const conditionOptions: SelectOption[] = CONDITIONS.map((c) => ({ value: c, label: c }));
const actionOptions: SelectOption[] = ACTIONS.map((a) => ({ value: a, label: a }));

interface RuleDraft {
  name: string;
  desc: string;
  cond: string;
  action: string;
  terms: string;
  enabled: boolean;
}

const EMPTY_DRAFT: RuleDraft = {
  name: "",
  desc: "",
  cond: "keywords",
  action: "escalate",
  terms: "",
  enabled: true,
};

export function EscalationRules() {
  const { role } = useAuth();
  const toast = useToast();
  const canEdit = role === "owner";

  const [rules, setRules] = useState<EscalationRule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [ruleBusy, setRuleBusy] = useState(false);

  // Confirmation state for destructive / irreversible rule actions.
  const [confirmRule, setConfirmRule] = useState<
    { kind: "reset" | "delete"; rule: EscalationRule } | null
  >(null);
  const [confirmPresets, setConfirmPresets] = useState(false);

  // Test console state.
  const [testText, setTestText] = useState("");
  const [testLog, setTestLog] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  // Preset version history (snapshots taken from the admin console).
  const [versions, setVersions] = useState<PresetVersion[] | null>(null);

  // Editor modal state.
  const [editing, setEditing] = useState<EscalationRule | "new" | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(() => {
    let active = true;
    api
      .get<EscalationRule[]>("/rules")
      .then((data) => {
        if (active) setRules(data);
      })
      .catch(() => {
        if (active) setRules([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(loadRules, [loadRules]);

  useEffect(() => {
    let active = true;
    api
      .get<PresetVersion[]>("/presets")
      .then((data) => {
        if (active) setVersions(data);
      })
      .catch(() => {
        if (active) setVersions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Rules are shared with the test console — changes push in realtime.
  useRealtime({
    escalation_rules_changed: () => {
      void loadRules();
    },
  });

  const runTest = useCallback(
    async (text: string) => {
      setTesting(true);
      try {
        const hits = await api.post<EscalationRule[]>("/rules/test", { text });
        const enabled = rules?.filter((r) => r.enabled).length ?? 0;
        const log: string[] = [];
        log.push("$ POST /api/tenants/me/escalation-rules/test");
        log.push(
          `→ "${text.trim().slice(0, 58)}${text.trim().length > 58 ? "…" : ""}" · enabled rules: ${enabled}`,
        );
        if (!hits.length) log.push("✓ no rules fired — AI replies directly");
        hits.forEach((h) => log.push(`⚡ ${h.id} ${h.name} → ${h.action}`));
        if (hits.some((h) => h.action.startsWith("escalate")))
          log.push("→ escalated_at set · routed to online agent · audit written");
        setTestLog(log);
      } catch {
        setTestLog(["! test request failed — check the mock layer"]);
      } finally {
        setTesting(false);
      }
    },
    [rules],
  );

  const toggleRule = async (r: EscalationRule) => {
    if (!canEdit) return;
    try {
      await api.put(`/rules/${r.id}`, { enabled: !r.enabled });
      setRules((prev) =>
        prev?.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)) ?? null,
      );
      toast(`${r.id} ${r.enabled ? "disabled" : "enabled"} — live on next message`);
    } catch {
      toast("Could not update rule", "danger");
    }
  };

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setEditing("new");
  };

  const openEdit = (r: EscalationRule) => {
    setDraft({
      name: r.name,
      desc: r.desc,
      cond: r.cond,
      action: r.action,
      terms: (r.terms ?? []).join(", "),
      enabled: r.enabled,
    });
    setEditing(r);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast("Name required", "danger");
      return;
    }
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      desc: draft.desc.trim() || "Custom rule",
      cond: draft.cond,
      action: draft.action,
      terms: draft.terms
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      enabled: draft.enabled,
    };
    try {
      if (editing === "new") {
        const created = await api.post<EscalationRule>("/rules", payload);
        setRules((prev) => (prev ? [...prev, created] : [created]));
        toast(`${created.id} created · active immediately`);
      } else if (editing) {
        const updated = await api.put<EscalationRule>(`/rules/${editing.id}`, payload);
        setRules((prev) =>
          prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null,
        );
        toast(`${editing.id} updated · live on next message`);
      }
      setEditing(null);
    } catch {
      toast("Could not save rule", "danger");
    } finally {
      setSaving(false);
    }
  };

  const resetRule = async (r: EscalationRule) => {
    setRuleBusy(true);
    try {
      const restored = await api.put<EscalationRule>(`/rules/${r.id}`, { reset: true });
      setRules((prev) => prev?.map((x) => x.id === restored.id ? restored : x) ?? null);
      setConfirmRule(null);
      toast(`${r.id} reset to default`);
    } catch {
      toast("Could not reset rule", "danger");
    } finally {
      setRuleBusy(false);
    }
  };

  const resetPresets = async () => {
    setBusy(true);
    try {
      const all = await api.post<EscalationRule[]>("/rules/reset-presets");
      setRules(all);
      setConfirmPresets(false);
      toast("E1–E10 restored · live on next message");
    } catch {
      toast("Could not reset presets", "danger");
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (r: EscalationRule) => {
    setRuleBusy(true);
    try {
      await api.del(`/rules/${r.id}`);
      setRules((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
      setConfirmRule(null);
      toast(`${r.id} removed from escalation_rules`);
    } catch {
      toast("Could not delete rule", "danger");
    } finally {
      setRuleBusy(false);
    }
  };

  const enabledCount = rules?.filter((r) => r.enabled).length ?? 0;
  const fired30d = rules?.reduce((s, r) => s + (r.trigger ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Escalation rules</h1>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmPresets(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Spinner size={14} /> : <Icon name="clock" size={14} />}
              Reset presets
            </button>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
            >
              <Icon name="plus" size={15} />
              New rule
            </button>
          </div>
        )}
      </header>

      <p className="text-meta text-text-3">
        <span className="font-semibold text-text-2">{enabledCount}</span> of{" "}
        <span className="font-semibold text-text-2">{rules?.length ?? 0}</span> rules enabled ·{" "}
        <span className="font-semibold text-text-2 tabular-nums">{fired30d}</span> fires (30d)
      </p>

      {!rules ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-4 shadow-card">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton mt-3 h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon="zap"
          title="No escalation rules yet"
          subtitle="Rules decide when the AI hands a conversation to a human — evaluated on every incoming message."
          action={
            canEdit ? (
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
              >
                <Icon name="plus" size={15} />
                Create the first rule
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              canEdit={canEdit}
              onToggle={() => void toggleRule(r)}
              onEdit={() => openEdit(r)}
              onReset={() => setConfirmRule({ kind: "reset", rule: r })}
              onDelete={() => setConfirmRule({ kind: "delete", rule: r })}
              onTest={() => {
                setTestText(SAMPLES[r.cond] ?? "Sample customer message…");
                void runTest(SAMPLES[r.cond] ?? "Sample customer message…");
              }}
            />
          ))}
        </div>
      )}

      <RuleTestConsole
        text={testText}
        onText={setTestText}
        log={testLog}
        testing={testing}
        onRun={() => void runTest(testText)}
        disabled={testing}
      />

      {versions && versions.length > 0 && (
        <section className="rounded-xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Icon name="clock" size={15} className="text-text-2" />
              <p className="text-[13px] font-bold text-text">Preset version history</p>
            </div>
            <p className="text-[11.5px] text-text-3">immutable snapshots · restorable by platform admin</p>
          </div>
          <div className="flex flex-col">
            {versions.slice(0, 4).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 last:border-b-0"
              >
                <div className="flex items-center gap-2.5">
                  <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-code text-text">
                    {v.version}
                  </code>
                  <span className="text-[12.5px] font-semibold text-text">{v.label}</span>
                </div>
                <p className="text-[11.5px] text-text-3">
                  {v.rules.length} rules · {v.createdAt} · {v.createdBy}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New escalation rule" : `Edit rule ${editing?.id}`}
        icon={editing === "new" ? "plus" : "zap"}
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
              {editing === "new" ? "Create rule" : "Save rule"}
            </button>
          </>
        }
      >
        <RuleForm draft={draft} onDraft={setDraft} />
      </Modal>

      {confirmRule && (
        <ConfirmModal
          open
          onClose={() => setConfirmRule(null)}
          title={confirmRule.kind === "reset" ? "Reset rule to default" : "Delete escalation rule"}
          icon={confirmRule.kind === "reset" ? "clock" : "trash"}
          tone={confirmRule.kind === "reset" ? "primary" : "danger"}
          confirmLabel={confirmRule.kind === "reset" ? "Reset rule" : "Delete rule"}
          busy={ruleBusy}
          onConfirm={() =>
            confirmRule.kind === "reset"
              ? void resetRule(confirmRule.rule)
              : void deleteRule(confirmRule.rule)
          }
          description={
            confirmRule.kind === "reset" ? (
              <>
                <b className="text-text">{confirmRule.rule.id}</b> is a platform preset. Any
                changes you made to it will be discarded and the default condition + action
                restored.
              </>
            ) : (
              <>
                <b className="text-text">{confirmRule.rule.id}</b> — “{confirmRule.rule.name}” —
                will be removed and no longer evaluated on incoming messages.
              </>
            )
          }
        />
      )}

      <ConfirmModal
        open={confirmPresets}
        onClose={() => setConfirmPresets(false)}
        title="Reset all presets"
        icon="clock"
        tone="primary"
        confirmLabel="Reset presets"
        busy={busy}
        onConfirm={() => void resetPresets()}
        description={
          <>
            All platform presets <b className="text-text">E1–E10</b> will be restored to their
            original condition + action. Your custom rules are kept.
          </>
        }
      />
    </div>
  );
}

function RuleCard({
  rule,
  canEdit,
  onToggle,
  onEdit,
  onReset,
  onDelete,
  onTest,
}: {
  rule: EscalationRule;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "rounded-md border bg-surface shadow-card transition-opacity duration-150",
        rule.enabled ? "border-border" : "border-border opacity-70",
      )}
      data-rule={rule.id}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={rule.enabled}
            onChange={onToggle}
            disabled={!canEdit}
            label={`${rule.id} ${rule.enabled ? "enabled" : "disabled"}`}
          />
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13.5px] font-bold text-text">
            {rule.id} · {rule.name}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-text-2">{rule.desc}</span>
        </button>
        <span
          className={cn(
            "rounded-full px-[10px] py-[3px] text-[11.5px] font-bold leading-none",
            rule.preset ? "bg-violet-soft text-violet" : "bg-surface-2 text-text-2",
          )}
        >
          {rule.preset ? "preset E1–E10" : "custom"}
        </span>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              <Icon name="edit" size={13} />
              Edit
            </button>
            <button
              type="button"
              onClick={rule.preset ? onReset : onDelete}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors duration-150",
                rule.preset
                  ? "border-border bg-surface text-text-2 hover:bg-surface-3 hover:text-text"
                  : "border-danger-border bg-danger-soft text-danger hover:bg-danger-soft/70",
              )}
            >
              <Icon name={rule.preset ? "clock" : "close"} size={13} />
              {rule.preset ? "Reset" : "Delete"}
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-border px-4 py-3.5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4">
            <KvCell label="Condition" value={rule.cond} />
            <KvCell label="Action" value={rule.action} />
            <KvCell label="Last fired" value={rule.lastFired ?? "—"} />
            <KvCell label="Trigger count (30d)" value={String(rule.trigger ?? 0)} mono />
          </div>
          {rule.terms?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rule.terms.map((t) => (
                <span
                  key={t}
                  className={cn(
                    "rounded-full border border-border bg-surface-2 px-2.5 py-[3px] text-[11px] font-semibold text-text-2",
                    !rule.enabled && "opacity-50",
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onTest}
            className="mt-3.5 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="trend" size={13} />
            Test against sample text
          </button>
        </div>
      )}
    </div>
  );
}

function KvCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-micro uppercase text-text-3">{label}</p>
      <code
        className={cn(
          "mt-1 block truncate rounded-sm bg-surface-2 px-1.5 py-0.5 text-[12px] text-text",
          mono && "font-mono text-code tabular-nums",
        )}
      >
        {value}
      </code>
    </div>
  );
}

function RuleTestConsole({
  text,
  onText,
  log,
  testing,
  onRun,
  disabled,
}: {
  text: string;
  onText: (v: string) => void;
  log: string[];
  testing: boolean;
  onRun: () => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon name="zap" size={16} className="text-text-2" />
        <h3 className="text-card-title text-text">Rule test console</h3>
      </header>
      <div className="flex flex-col gap-3 p-[18px]">
        <label className="block">
          <span className="mb-1.5 block text-micro uppercase text-text-3">Sample customer message</span>
          <textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            rows={3}
            placeholder="Paste a sample customer message and run all enabled rules against it…"
            className="focus-ring-soft w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text placeholder:text-text-3"
          />
        </label>
        <div>
          <button
            type="button"
            onClick={onRun}
            disabled={disabled || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? <Spinner size={14} /> : <Icon name="trend" size={14} />}
            Run test
          </button>
        </div>
        {log.length > 0 && (
          <pre className="overflow-x-auto rounded-sm border border-border bg-[#0f172a] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-200">
            {log.map((line, i) => (
              <span
                key={i}
                className={cn(
                  "block whitespace-pre-wrap",
                  line.startsWith("!") && "text-danger",
                  line.startsWith("✓") && "text-[#4ade80]",
                  line.startsWith("⚡") && "text-[#fbbf24]",
                  line.startsWith("→") && "text-slate-400",
                  line.startsWith("$") && "text-slate-500",
                )}
              >
                {line}
              </span>
            ))}
          </pre>
        )}
      </div>
    </section>
  );
}

function RuleForm({
  draft,
  onDraft,
}: {
  draft: RuleDraft;
  onDraft: (d: RuleDraft) => void;
}) {
  const set = (patch: Partial<RuleDraft>) => onDraft({ ...draft, ...patch });
  return (
    <div className="flex flex-col gap-3.5">
      <Field label="Name">
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. VIP complaint about delivery"
          className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text placeholder:text-text-3"
        />
      </Field>
      <Field label="Description">
        <input
          value={draft.desc}
          onChange={(e) => set({ desc: e.target.value })}
          placeholder="Short description of when this fires"
          className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text placeholder:text-text-3"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Condition type">
          <Select
            value={draft.cond}
            onChange={(v) => set({ cond: v })}
            options={conditionOptions}
            ariaLabel="Condition type"
          />
        </Field>
        <Field label="Action">
          <Select
            value={draft.action}
            onChange={(v) => set({ action: v })}
            options={actionOptions}
            ariaLabel="Action"
          />
        </Field>
      </div>
      <Field label="Trigger terms (comma separated)">
        <textarea
          value={draft.terms}
          onChange={(e) => set({ terms: e.target.value })}
          rows={3}
          placeholder="delayed package, lost, where my package"
          className="focus-ring-soft w-full resize-y rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text placeholder:text-text-3"
        />
        <p className="mt-1.5 text-[11.5px] text-text-3">
          Used for keyword / segment conditions — lowercase, comma separated. E.g. wetin dey
          happen, ole, scam
        </p>
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface-2 px-3 py-2.5">
        <div>
          <p className="text-[12.5px] font-semibold text-text">Enabled</p>
          <p className="text-[11.5px] text-text-3">Evaluated on every incoming message</p>
        </div>
        <Switch
          checked={draft.enabled}
          onChange={(v) => set({ enabled: v })}
          label="Rule enabled"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-micro uppercase text-text-3">{label}</span>
      {children}
    </label>
  );
}
