import dataset from "./dataset";
import { LABEL_LIBRARY_COLORS, LABEL_OPTIONS } from "@/lib/utils";
import {
  type AgentUser,
  type ApiKey,
  type AuditLog,
  type AutomationCondition,
  type AutomationLog,
  type AutomationRule,
  type AutomationTriggerType,
  type CannedResponse,
  type ChannelSettings,
  type DashboardMetrics,
  type EscalationRule,
  type EscalationReason,
  type EventBusEnvelope,
  type FeatureFlag,
  type FeedItem,
  type InviteSummary,
  type Invoice,
  type KnowledgeArticle,
  type KnowledgeSource,
  type Label,
  type NotificationItem,
  type NotificationPreferences,
  type PastTicket,
  type Plan,
  type PlanCode,
  type PresetVersion,
  type Role,
  type SessionUser,
  type SlaPolicy,
  type SlaSchedule,
  type Tenant,
  type TenantReportMetrics,
  type Ticket,
  type TicketChannel,
  type TicketMessage,
  type TicketPriority,
  type TicketType,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WidgetAttachment,
  type DemoUser,
  type FAQItem,
  type Team,
  type InboxScope,
} from "@/lib/types";
import { getSessionUser } from "@/lib/auth-store";

const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Safe merge — copies own enumerable keys only, never prototype-tampering
 *  names like `__proto__`, so hostile patch bodies can't pollute records. */
function applyPatch<T extends object>(target: T, patch: Partial<T>): T {
  for (const [key, value] of Object.entries(patch)) {
    if (PROTOTYPE_KEYS.has(key)) continue;
    (target as Record<string, unknown>)[key] = value;
  }
  return target;
}

/* ------------------------------------------------------------------ */
/* Dataset (prototype/data.js) as the dev database                     */
/* ------------------------------------------------------------------ */

export const MOCK_TICKETS = dataset.tickets as unknown as Ticket[];

interface MockDatabase {
  user: SessionUser | null;
  impersonating: { tenantId: string; label: string } | null;
  tenants: Tenant[];
  agents: AgentUser[];
  teams: Team[];
  tickets: Ticket[];
  articles: KnowledgeArticle[];
  canned: CannedResponse[];
  pastTickets: PastTicket[];
  rules: EscalationRule[];
  plans: Plan[];
  invoices: Invoice[];
  audit: AuditLog[];
  /** Dataset keys are role-based; the prototype used "super" for the admin feed. */
  feed: Partial<Record<Role | "super", FeedItem[]>>;
  notifications: NotificationItem[];
  /** invite token → pending agent invite (accept-invite flow). */
  invites: Record<string, { agentId: string; email: string; tenantId: string; role: Role }>;
  /** ingested sources listed on /dashboard/upload. */
  knowledgeSources: KnowledgeSource[];
  /** customer self-registrations (register flow) — login checks these too. */
  registeredUsers: DemoUser[];
  /** mock event bus — recent event-bus envelopes for realtime wiring (§6.6). */
  events: EventBusEnvelope[];
  /** widget/inbox CSAT ratings keyed by ticket id (v3.2). */
  ratings: Record<string, number>;
  /** automations engine (owner settings hub). */
  automationRules: AutomationRule[];
  automationLog: AutomationLog[];
  /** SLA policies + business-hours schedules. */
  slaPolicies: SlaPolicy[];
  slaSchedules: SlaSchedule[];
  /** outbound integrations. */
  webhooks: WebhookEndpoint[];
  webhookDeliveries: WebhookDelivery[];
  /** channel toggles. */
  channels: ChannelSettings[];
  /** developer API keys. */
  apiKeys: ApiKey[];
  /** persisted notification preferences keyed by user id. */
  notificationPrefs: Record<string, NotificationPreferences>;
  /** immutable escalation-preset snapshots (admin hub). */
  presetVersions: PresetVersion[];
  /** platform feature flags (admin hub). */
  featureFlags: FeatureFlag[];
  /** per-tenant label library (Chatwoot-style) — name + color. */
  labels: Label[];
  faqs: FAQItem[];
}

export const mockDb = dataset as unknown as MockDatabase;

/** Lazy-init collections that don't exist in the prototype dataset. */
if (!mockDb.registeredUsers) mockDb.registeredUsers = [];
if (!mockDb.events) mockDb.events = [];
if (!mockDb.ratings) mockDb.ratings = {};
if (!mockDb.automationRules) mockDb.automationRules = [];
if (!mockDb.automationLog) mockDb.automationLog = [];
if (!mockDb.slaPolicies) mockDb.slaPolicies = [];
if (!mockDb.slaSchedules) mockDb.slaSchedules = [];
if (!mockDb.webhooks) mockDb.webhooks = [];
if (!mockDb.webhookDeliveries) mockDb.webhookDeliveries = [];
if (!mockDb.channels) mockDb.channels = [];
if (!mockDb.apiKeys) mockDb.apiKeys = [];
if (!mockDb.notificationPrefs) mockDb.notificationPrefs = {};
if (!mockDb.presetVersions) mockDb.presetVersions = [];
if (!mockDb.featureFlags) mockDb.featureFlags = [];
if (!mockDb.faqs) {
  mockDb.faqs = [
    {
      id: 1,
      question: "What is your refund policy?",
      answer: "We offer full refunds within 30 days of purchase for all unused subscriptions.",
      tenantId: "t1",
    },
    {
      id: 2,
      question: "How do I upgrade my plan?",
      answer: "Navigate to Dashboard > Billing, select your desired tier, and click Upgrade.",
      tenantId: "t1",
    },
    {
      id: 3,
      question: "Can I add multiple human agents?",
      answer: "Yes, depending on your plan tier you can invite team members from Dashboard > Agents.",
      tenantId: "t1",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Label library (mirrors backend /api/labels)                          */
/* ------------------------------------------------------------------ */

/** Builds the seed label library — the union of ticket labels and the
 *  canonical vocabulary, each with the color from LABEL_LIBRARY_COLORS
 *  (kept in sync with backend SEED_LABELS). */
function buildLabelLibrary(): Label[] {
  const names = new Set<string>();
  for (const t of Object.values(SEED_LABELS)) t.forEach((n) => names.add(n));
  LABEL_OPTIONS.forEach((n) => names.add(n));
  return [...names].sort().map((name) => ({
    id: `LB-${name}`,
    tenantId: "t1",
    name,
    color: LABEL_LIBRARY_COLORS[name] ?? "#2563eb",
    description: "",
    createdAt: new Date().toISOString(),
  }));
}

function upsertLabel(label: Label): void {
  const i = mockDb.labels.findIndex((l) => l.name.toLowerCase() === label.name.toLowerCase());
  if (i >= 0) mockDb.labels[i] = label;
  else mockDb.labels.push(label);
}

/* ------------------------------------------------------------------ */
/* Seed enrichment (Chatwoot parity)                                    */
/* ------------------------------------------------------------------ */
/* The dataset ships minimal rows; we enrich once at load so every screen
   shows real labels, timestamps, stable message ids and delivery state
   without hand-editing 20 ticket objects. Labels are the seed "system" —
   agents can add/remove their own, which live alongside these. */

const SEED_LABELS: Record<string, string[]> = {
  "TK-1042": ["refund", "alerts", "high-value"],
  "TK-1041": ["transfers", "urgent"],
  "TK-1040": ["how-to", "security"],
  "TK-1039": ["ussd", "security"],
  "TK-1037": ["refund", "bills"],
  "TK-1036": ["profile", "how-to"],
  "TK-1035": ["delivery", "resolved"],
  "TK-1034": ["app", "bug"],
  "TK-1033": ["card", "refund", "urgent"],
  "TK-1030": ["savings", "how-to"],
  "TK-1022": ["card", "security"],
  "TK-1011": ["savings", "how-to"],
  "TK-1025": ["refund", "transfers"],
  "TK-1021": ["card", "security"],
  "TK-1018": ["alerts", "atm"],
  "TK-1016": ["profile", "alerts"],
};

const SEED_NOTES: Record<string, TicketMessage[]> = {
  "TK-1042": [
    {
      id: "seed-note-1",
      who: "human_agent",
      text: "Customer is a VIP (2nd fraud dispute this quarter). @Bisi Adeyemi — please fast-track the chargeback, CC ops.",
      kind: "note",
      author: "Amaka Okafor",
      timestamp: seedTs(35),
    },
  ],
  "TK-1041": [
    {
      id: "seed-note-2",
      who: "human_agent",
      text: "Settlement confirmed by receiving bank at 1:12pm. Waiting on @Yusuf Ibrahim to close the NIBSS trace.",
      kind: "note",
      author: "Chidi Eze",
      timestamp: seedTs(9),
    },
  ],
};

/** "2m" / "18m" / "1h" / "1d" → minutes ago. */
function timeToMinutesAgo(time: string): number {
  const m = /^(\d+)([mhd])$/.exec(String(time));
  if (!m) return 60;
  const n = Number(m[1]);
  if (m[2] === "m") return n;
  if (m[2] === "h") return n * 60;
  return n * 1440;
}

function seedTs(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function enrichTickets(tickets: Ticket[]): void {
  for (const t of tickets) {
    const labelSeed = SEED_LABELS[t.id];
    t.labels = labelSeed ? [...labelSeed] : [];
    const startAgo = Math.max(timeToMinutesAgo(t.time), t.msgs.length);
    const span = Math.max(startAgo, 3);
    const noteSeed = SEED_NOTES[t.id] ?? [];
    const all = [...noteSeed, ...t.msgs];
    t.msgs = all.map((m, i) => {
      const frac = (i + 1) / Math.max(all.length, 1);
      const timestamp = m.timestamp ?? seedTs(Math.max(1, Math.round(span * (1 - frac * 0.85))));
      const id =
        m.id ??
        (m.kind === "note" ? `note-${t.id}-${i}` : `msg-${t.id}-${i}`);
      const status = m.who === "human_agent" && !m.status ? ("sent" as const) : m.status;
      return { ...m, timestamp, id, ...(status ? { status } : {}) };
    });
  }
}

enrichTickets(mockDb.tickets);

/** Label library needs SEED_LABELS (declared above) — build once at load. */
if (!mockDb.labels) mockDb.labels = buildLabelLibrary();


/** Normalizes a role to its dataset feed key ("super_admin" → "super"). */
function feedFor(role: Role): FeedItem[] {
  const key = role === "super_admin" ? "super" : role;
  return [...(mockDb.feed[key] ?? [])];
}

/** Prepends an event to the super admin platform feed (realtime-simulator style). */
function pushFeedSuper(item: FeedItem) {
  mockDb.feed.super = [item, ...(mockDb.feed.super ?? [])];
}

/** Snapshot of preset rules at load — reset/preset-restore restores from here. */
const PRESET_RULE_DEFAULTS: EscalationRule[] = (dataset.rules ?? [])
  .filter((r) => r.preset)
  .map((r) => ({ ...r }));

/** Fallback preferences when a user has none persisted yet. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  email: { escalation: true, assigned: true, replies: true, weekly: true, billing: true, product: false },
  push: { escalation: true, assigned: true, replies: true, mentions: true },
  quietHours: { enabled: false, start: "21:00", end: "07:00" },
};

/* ------------------------------------------------------------------ */
/* Automations + SLA engines (mock runtime)                            */
/* ------------------------------------------------------------------ */
/* These run synchronously inside mutate() so ticket mutations evaluate
   workflow rules and SLA deadlines with the same state the UI reads. */

const STATUS_SET = new Set<Ticket["status"]>(["open", "in_progress", "escalated", "resolved", "closed"]);
const PRIORITY_SET = new Set<Ticket["priority"]>(["low", "medium", "high"]);

function isStatus(v: unknown): v is Ticket["status"] {
  return typeof v === "string" && STATUS_SET.has(v as Ticket["status"]);
}

function isPriority(v: unknown): v is Ticket["priority"] {
  return typeof v === "string" && PRIORITY_SET.has(v as Ticket["priority"]);
}

/** Mock ticket age from the display string ("2m", "1h", "3d", "just now"). */
function ticketAgeMinutes(t: Ticket): number {
  const m = String(t.time ?? "").match(/^(\d+)\s*(m|h|d)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === "m" ? n : m[2] === "h" ? n * 60 : n * 1440;
}

function parseAgeMin(value: unknown): number {
  const m = String(value ?? "").match(/^(\d+)\s*(m|h|d)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === "m" ? n : m[2] === "h" ? n * 60 : n * 1440;
}

function condValue(cond: AutomationCondition, t: Ticket): unknown {
  if (cond.field === "segment") {
    return /vip/i.test(`${t.email} ${t.subject}`) ? "vip" : "standard";
  }
  if (cond.field === "time") return ticketAgeMinutes(t);
  return (t as unknown as Record<string, unknown>)[cond.field];
}

function evalCondition(cond: AutomationCondition, t: Ticket): boolean {
  const v = condValue(cond, t);
  const str = (x: unknown) => String(x ?? "").toLowerCase();
  switch (cond.op) {
    case "eq":
      return typeof v === "string" && typeof cond.value === "string"
        ? str(v) === str(cond.value)
        : v === cond.value;
    case "neq":
      return typeof v === "string" && typeof cond.value === "string"
        ? str(v) !== str(cond.value)
        : v !== cond.value;
    case "contains":
      return str(v).includes(str(cond.value));
    case "in":
      return Array.isArray(cond.value)
        ? cond.value.map((x) => str(x)).includes(str(v))
        : false;
    case "not_in":
      return Array.isArray(cond.value)
        ? !cond.value.map((x) => str(x)).includes(str(v))
        : true;
    case "older_than":
      return ticketAgeMinutes(t) >= parseAgeMin(cond.value);
    default:
      return false;
  }
}

function conditionsMatch(
  t: Ticket,
  conditions: AutomationCondition[],
  match: "all" | "any",
): boolean {
  if (!conditions.length) return true;
  const results = conditions.map((c) => evalCondition(c, t));
  return match === "all" ? results.every(Boolean) : results.some(Boolean);
}

/** Applies a rule's ordered actions to a ticket and records the run. */
function applyAutomationActions(rule: AutomationRule, t: Ticket): void {
  const patches: Partial<Ticket> = {};
  let summary = "";
  for (const action of rule.actions) {
    switch (action.type) {
      case "assign_agent": {
        const agent = mockDb.agents.find((a) => a.id === action.config.agent);
        patches.assignee = agent?.name ?? patches.assignee;
        summary = `assign_agent → ${agent?.name ?? "unassigned"}`;
        break;
      }
      case "set_status":
        if (isStatus(action.config.status)) {
          patches.status = action.config.status;
          summary = `set_status → ${action.config.status}`;
        }
        break;
      case "set_priority":
        if (isPriority(action.config.priority)) {
          patches.priority = action.config.priority;
          summary = `set_priority → ${action.config.priority}`;
        }
        break;
      case "escalate":
        patches.status = "escalated";
        t.msgs = [
          ...t.msgs,
          { who: "system" as const, text: `Escalated by automation · ${rule.name}${action.config.note ? ` · ${action.config.note}` : ""}` },
        ];
        summary = `escalate — ${rule.name}`;
        break;
      case "add_note":
        t.msgs = [
          ...t.msgs,
          { who: "system" as const, text: `[Automation · ${rule.name}] ${action.config.note ?? ""}` },
        ];
        summary = "add_note";
        break;
      case "send_email":
        summary = `send_email → ${action.config.to ?? "recipient"}`;
        break;
      case "send_slack":
        summary = `send_slack → ${action.config.channel ?? "#channel"}`;
        break;
      case "trigger_webhook":
        summary = "trigger_webhook";
        break;
    }
  }
  applyPatch(t, patches);
  if (summary) {
    mockDb.automationLog.unshift({
      id: `al${Date.now().toString(36)}${mockDb.automationLog.length}`,
      ruleId: rule.id,
      ruleName: rule.name,
      ticketId: t.id,
      action: summary,
      result: "success",
      time: "just now",
    });
    if (mockDb.automationLog.length > 100) mockDb.automationLog.length = 100;
  }
  rule.runCount += 1;
  rule.lastRun = "just now";
}

/** Runs every enabled rule whose trigger matches the event against one ticket. */
function evaluateAutomations(event: AutomationTriggerType, t: Ticket): void {
  for (const rule of mockDb.automationRules) {
    if (!rule.enabled || rule.trigger !== event) continue;
    if (conditionsMatch(t, rule.conditions, rule.conditionMatch)) {
      applyAutomationActions(rule, t);
    }
  }
}

/* -- SLA engine -- */

function findSlaPolicy(t: Ticket): SlaPolicy | null {
  for (const p of mockDb.slaPolicies) {
    if (p.enabled && conditionsMatch(t, p.match, "all")) return p;
  }
  return null;
}

function slaTargetMin(p: SlaPolicy, priority: Ticket["priority"]): { first: number; resolve: number } {
  const target = p.targets.find((x) => x.priority === priority);
  return {
    first: target?.firstResponseMin ?? 120,
    resolve: target?.resolutionMin ?? 720,
  };
}

/** Applies the matching SLA policy's deadlines to a ticket. */
function evaluateSla(t: Ticket): void {
  const policy = findSlaPolicy(t);
  if (!policy) {
    t.slaPolicyId = undefined;
    t.slaFirstResponseAt = undefined;
    t.slaResolveAt = undefined;
    t.sla = "—";
    return;
  }
  t.slaPolicyId = policy.id;
  const { first, resolve } = slaTargetMin(policy, t.priority);
  t.slaFirstResponseAt = `${first}m`;
  t.slaResolveAt = `${resolve}m`;
  if (t.firstRespondedAt) {
    t.sla = t.slaResolveBreached ? "resolve overdue" : `${resolve}m to resolve`;
  } else {
    t.sla = t.slaFirstResponseBreached ? "overdue" : `${first}m left`;
  }
}

/** Marks tickets whose first-response deadline has passed as breached and fires
 *  the policy's first-response escalations. */
function runSlaTicker(): void {
  for (const t of mockDb.tickets) {
    if (t.status === "resolved" || t.status === "closed") continue;
    const policy = mockDb.slaPolicies.find((p) => p.id === t.slaPolicyId);
    if (!policy || !policy.enabled) continue;
    const { first } = slaTargetMin(policy, t.priority);
    if (!t.firstRespondedAt && !t.slaFirstResponseBreached && ticketAgeMinutes(t) >= first) {
      t.slaFirstResponseBreached = true;
      t.sla = "overdue";
      policy.breaches += 1;
      for (const esc of policy.escalations) {
        if (esc.target === "first_response" && ticketAgeMinutes(t) >= esc.afterMin) {
          mockDb.automationLog.unshift({
            id: `al${Date.now().toString(36)}${mockDb.automationLog.length}`,
            ruleId: policy.id,
            ruleName: `SLA · ${policy.name}`,
            ticketId: t.id,
            action: `sla_escalation L${esc.level} → ${esc.action}`,
            result: "success",
            time: "just now",
          });
        }
      }
      emitEvent("sla_breach", { ticket_id: t.id, policy_id: policy.id, priority: t.priority });
      pushFeedSuper({
        ic: "alert",
        color: "#d93636",
        title: `SLA breach · ${t.id} (${policy.name})`,
        meta: "just now · audited",
      });
    }
  }
}

/** Time-based automations: scans open tickets and fires interval rules. */
function runIntervalAutomations(): void {
  for (const rule of mockDb.automationRules) {
    if (!rule.enabled || rule.trigger !== "interval") continue;
    for (const t of mockDb.tickets) {
      if (t.status === "resolved" || t.status === "closed") continue;
      if (conditionsMatch(t, rule.conditions, rule.conditionMatch)) {
        applyAutomationActions(rule, t);
      }
    }
  }
  runSlaTicker();
}

/* ------------------------------------------------------------------ */
/* Demo credentials for the dev login (mock auth)                      */
/* ------------------------------------------------------------------ */

export const demoUsers: DemoUser[] = [
  {
    id: "sa1",
    email: "admin@prestige.io",
    password: "password123",
    fullName: "Glory Super",
    role: "super_admin",
    tenantId: null,
    initials: "GS",
    color: "violet",
  },
  {
    id: "u1",
    email: "bisi@nairawave.ng",
    password: "password123",
    fullName: "Bisi Adeyemi",
    role: "owner",
    tenantId: "t1",
    initials: "B",
    color: "green",
  },
  {
    id: "u2",
    email: "amaka@nairawave.ng",
    password: "password123",
    fullName: "Amaka Okafor",
    role: "agent",
    tenantId: "t1",
    initials: "A",
    color: "blue",
  },
  {
    id: "c1",
    email: "tunde.bakare@example.com",
    password: "password123",
    fullName: "Tunde Bakare",
    role: "customer",
    tenantId: "t1",
    initials: "T",
    color: "slate",
  },
];

export const MOCK_LATENCY_MS = 120;

export async function withLatency<T>(value: T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  return value;
}

/** Delayed mutation — simulates a write RTT, then computes against mockDb. */
async function mutate<T>(fn: () => T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  return fn();
}

/** Simulated delivery progress (sent → delivered → read) for agent replies. */
function markMessage(
  ticketId: string,
  messageId: string,
  status: "delivered" | "read",
): void {
  const t = mockDb.tickets.find((x) => x.id.toLowerCase() === ticketId.toLowerCase());
  if (!t) return;
  let changed = false;
  t.msgs = t.msgs.map((m) => {
    if (m.id !== messageId || m.status === "read") return m;
    changed = true;
    return { ...m, status };
  });
  if (changed) emitEvent("ticket_updated", { ticket_id: t.id });
}

/** Reverses the mock reset token back to its account email. */
function mockResetEmail(token: string): string | null {
  const match = /^mock-reset-(.+)$/.exec(token);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Mock event bus (realtime, guide §6.6)                               */
/* ------------------------------------------------------------------ */
/* Mirrors the real Event Bus: WS /ws/events + GET /api/events?since=…
   In mock mode the emitter and subscribers share this module, so pages can
   react to mutations immediately without polling. */

let eventCursor = 0;
const eventListeners = new Set<(ev: EventBusEnvelope) => void>();

/** Publishes an event-bus envelope to mockDb (polling fallback) and to any
 *  in-tab subscribers (useRealtime mock path). */
export function emitEvent(
  type: EventBusEnvelope["type"],
  data: EventBusEnvelope["data"] = {},
): EventBusEnvelope {
  const ev: EventBusEnvelope = { type, request_id: `evt_${++eventCursor}`, data };
  mockDb.events.unshift(ev);
  if (mockDb.events.length > 100) mockDb.events.length = 100;
  for (const cb of eventListeners) cb(ev);
  return ev;
}

/** Subscribes to the mock event bus. Returns an unsubscribe function. */
export function subscribeEvents(cb: (ev: EventBusEnvelope) => void): () => void {
  eventListeners.add(cb);
  return () => {
    eventListeners.delete(cb);
  };
}

/** Recent envelopes for the polling fallback (GET /api/events). */
export function eventLog(): EventBusEnvelope[] {
  return [...mockDb.events];
}

/** Widget → agent presence: the customer is composing in the widget. */
export function emitTyping(ticketId: string): void {
  emitEvent("customer_typing", { ticket_id: ticketId });
}

/* ------------------------------------------------------------------ */
/* Typed accessors                                                     */
/* ------------------------------------------------------------------ */

export const mockApi = {
  tenants: () => withLatency([...mockDb.tenants]),
  tenant: (idOrSlug: string) =>
    withLatency(
      mockDb.tenants.find(
        (t) => t.id.toLowerCase() === idOrSlug.toLowerCase() || t.slug.toLowerCase() === idOrSlug.toLowerCase(),
      ) ?? mockDb.tenants[0] ?? null,
    ),
  agents: () => withLatency([...mockDb.agents]),
  labels: () => withLatency([...mockDb.labels]),
  tickets: () => withLatency([...mockDb.tickets]),
  ticket: (id: string) =>
    withLatency(mockDb.tickets.find((t) => t.id.toLowerCase() === id.toLowerCase()) ?? null),
  articles: (tenantId?: string) =>
    withLatency(
      tenantId ? mockDb.articles.filter((a) => a.tenantId === tenantId) : [...mockDb.articles],
    ),
  canned: () => withLatency([...mockDb.canned]),
  rules: () => withLatency([...mockDb.rules]),
  plans: () => withLatency([...mockDb.plans]),
  invoices: () => withLatency([...mockDb.invoices]),
  audit: () => withLatency([...mockDb.audit]),
  feed: (role: Role) => withLatency(feedFor(role)),
  notifications: () => withLatency([...mockDb.notifications]),
  faqs: (tenantId: string) =>
    withLatency(mockDb.faqs.filter((f) => !f.tenantId || f.tenantId === tenantId)),
  createFaq: (tenantId: string, question: string, answer: string) => {
    const item: FAQItem = {
      id: Date.now(),
      tenantId,
      question,
      answer,
    };
    mockDb.faqs.unshift(item);
    return withLatency({ ...item });
  },
  updateFaq: (id: number, question?: string, answer?: string) => {
    const item = mockDb.faqs.find((f) => f.id === id);
    if (!item) return withLatency(null);
    if (question !== undefined) item.question = question;
    if (answer !== undefined) item.answer = answer;
    return withLatency({ ...item });
  },
  deleteFaq: (id: number) => {
    mockDb.faqs = mockDb.faqs.filter((f) => f.id !== id);
    return withLatency(true);
  },
  pastTickets: (email?: string) =>
    withLatency(email ? mockDb.pastTickets.filter((p) => p.email === email) : [...mockDb.pastTickets]),

  /* Mutations — write to the shared mock db so state stays consistent across
     views (portal → queue → chat). Each returns a copy of the affected row. */

  createLabel: (input: { name: string; color?: string; description?: string }) => {
    const name = input.name.trim();
    const existing = mockDb.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) return withLatency({ ...existing });
    const label: Label = {
      id: `LB-${name}`,
      tenantId: "t1",
      name,
      color: input.color ?? LABEL_LIBRARY_COLORS[name] ?? "#2563eb",
      description: input.description ?? "",
      createdAt: new Date().toISOString(),
    };
    upsertLabel(label);
    return withLatency({ ...label });
  },

  updateLabel: (id: string, patch: Partial<Pick<Label, "name" | "color" | "description">>) => {
    const label = mockDb.labels.find((l) => l.id === id);
    if (!label) return withLatency(null);
    if (patch.name && patch.name.trim()) label.name = patch.name.trim();
    if (patch.color) label.color = patch.color;
    if (patch.description !== undefined) label.description = patch.description;
    return withLatency({ ...label });
  },

  deleteLabel: (id: string) => {
    mockDb.labels = mockDb.labels.filter((l) => l.id !== id);
    return withLatency({ ok: true });
  },

  createTicket: (input: {
    email: string;
    cust: string;
    subject: string;
    text: string;
    type: TicketType;
    priority: TicketPriority;
    channel?: TicketChannel;
    phone?: string;
  }) =>
    mutate<Ticket>(() => {
      const maxNum = mockDb.tickets.reduce(
        (m, t) => Math.max(m, Number(t.id.replace(/^TK-/, "")) || 0),
        1042,
      );
      const ticket: Ticket = {
        id: `TK-${maxNum + 1}`,
        subject: input.subject,
        cust: input.cust,
        email: input.email,
        phone: input.phone ?? "—",
        channel: input.channel ?? "portal",
        status: "open",
        priority: input.priority,
        type: input.type,
        sentiment: "Neutral",
        time: "now",
        unread: true,
        sla: "1h left",
        assignee: null,
        preview: input.text.trim().slice(0, 72),
        msgs: [
          { who: "customer" as const, text: input.text.trim() },
          {
            who: "ai_bot" as const,
            text: "Thanks — I've logged this with the support team and they'll pick it up shortly. In the meantime, is there anything in the help center I can find for you?",
          },
        ],
        assist: null,
      };
      mockDb.tickets.unshift(ticket);
      evaluateSla(ticket);
      evaluateAutomations("ticket_created", ticket);
      emitEvent("ticket_created", { ticket_id: ticket.id, email: ticket.email });
      return ticket;
    }),

  addCustomerMessage: (id: string, text: string) =>
    mutate<Ticket | null>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return null;
      t.msgs = [...t.msgs, { who: "customer" as const, text: text.trim() }];
      t.unread = true;
      if (t.status === "resolved" || t.status === "closed") t.status = "open";
      evaluateAutomations("message_received", t);
      evaluateSla(t);
      emitEvent("ticket_updated", { ticket_id: t.id });
      return { ...t };
    }),

  /** Agent reply — mirrors POST /api/tickets/{id}/messages (real backend). */
  addAgentMessage: (id: string, text: string, replyTo?: TicketMessage["replyTo"]) =>
    mutate<Ticket | null>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return null;
      t.msgs = [
        ...t.msgs,
        {
          id: `msg-${Date.now().toString(36)}`,
          who: "human_agent" as const,
          text: text.trim(),
          timestamp: new Date().toISOString(),
          status: "sent" as const,
          ...(replyTo ? { replyTo } : {}),
        },
      ];
      t.unread = false;
      if (t.status === "open") t.status = "in_progress";
      // Simulated delivery progress: sent → delivered (1s) → read (3s).
      const newId = t.msgs[t.msgs.length - 1].id ?? "";
      if (typeof window !== "undefined") {
        window.setTimeout(() => markMessage(t.id, newId, "delivered"), 1000);
        window.setTimeout(() => markMessage(t.id, newId, "read"), 3000);
      }
      evaluateAutomations("message_received", t);
      evaluateSla(t);
      emitEvent("ticket_updated", { ticket_id: t.id });
      return { ...t };
    }),

  /** Remove an agent-sent message (WhatsApp/Chatwoot-style recall). */
  deleteMessage: (id: string, messageId: string) =>
    mutate<Ticket | null>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return null;
      t.msgs = t.msgs.filter((m) => m.id !== messageId);
      emitEvent("ticket_updated", { ticket_id: t.id });
      return { ...t };
    }),

  /** Internal note — mirrors PATCH /api/tickets/{id} { internal_note }. */
  addInternalNote: (id: string, text: string) =>
    mutate<Ticket | null>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return null;
      t.msgs = [
        ...t.msgs,
        {
          id: `note-${Date.now().toString(36)}`,
          who: "human_agent" as const,
          text: text.trim(),
          kind: "note" as const,
          author: mockDb.user?.fullName ?? "Agent",
        },
      ];
      emitEvent("ticket_updated", { ticket_id: t.id });
      return { ...t };
    }),

  reopenTicket: (id: string) =>
    mutate<Ticket | null>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return null;
      t.status = "open";
      t.unread = true;
      t.msgs = [...t.msgs, { who: "system" as const, text: "Reopened by customer" }];
      evaluateAutomations("status_changed", t);
      evaluateSla(t);
      emitEvent("ticket_updated", { ticket_id: t.id });
      return { ...t };
    }),

  /** Generic patch used by the two-step inbox (agent actions, message send,
   *  notes, unread reads) so the list and detail screens stay in sync via the
   *  realtime bus instead of diverging local copies. */
  updateTicket: (id: string, patch: Partial<Ticket>) =>
    mutate<Ticket | null>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return null;
      const statusChanged = patch.status && patch.status !== t.status;
      if ((patch as any).internal_note) {
        t.msgs = [
          ...t.msgs,
          {
            id: `note-${Date.now().toString(36)}`,
            who: "human_agent" as const,
            text: (patch as any).internal_note,
            kind: "note" as const,
            attachments: (patch as any).internal_note_attachments,
          },
        ];
      }
      applyPatch(t, patch);
      if (patch.status === "resolved" || patch.status === "closed") {
        t.firstRespondedAt ??= "earlier";
      }
      if (statusChanged) evaluateAutomations("status_changed", t);
      evaluateAutomations("ticket_updated", t);
      evaluateSla(t);
      emitEvent("ticket_updated", { ticket_id: t.id });
      return { ...t };
    }),

  /* Escalation rules (§4.3) — owner CRUD, super_admin read-only via guards. */

  updateRule: (id: string, patch: Partial<EscalationRule>) =>
    mutate<EscalationRule | null>(() => {
      const r = mockDb.rules.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!r) return null;
      applyPatch(r, patch);
      emitEvent("escalation_rules_changed", { rule_id: r.id });
      return { ...r };
    }),

  createRule: (input: Omit<EscalationRule, "id" | "preset" | "trigger" | "lastFired">) =>
    mutate<EscalationRule>(() => {
      const maxNum = mockDb.rules.reduce(
        (m, r) => Math.max(m, Number(r.id.replace(/^E/, "")) || 0),
        0,
      );
      const rule: EscalationRule = {
        ...input,
        id: `E${maxNum + 1}`,
        preset: false,
        trigger: 0,
        lastFired: undefined,
      };
      mockDb.rules.push(rule);
      emitEvent("escalation_rules_changed", { rule_id: rule.id });
      return { ...rule };
    }),

  deleteRule: (id: string) =>
    mutate<boolean>(() => {
      const before = mockDb.rules.length;
      mockDb.rules = mockDb.rules.filter((x) => x.id.toLowerCase() !== id.toLowerCase());
      if (mockDb.rules.length < before) emitEvent("escalation_rules_changed", { rule_id: id });
      return mockDb.rules.length < before;
    }),

  toggleRule: (id: string) =>
    mutate<EscalationRule | null>(() => {
      const r = mockDb.rules.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!r) return null;
      r.enabled = !r.enabled;
      emitEvent("escalation_rules_changed", { rule_id: r.id });
      return { ...r };
    }),

  resetRule: (id: string) =>
    mutate<EscalationRule | null>(() => {
      const def = PRESET_RULE_DEFAULTS.find(
        (r) => r.id.toLowerCase() === id.toLowerCase(),
      );
      if (!def) return null;
      const target = mockDb.rules.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!target) return null;
      target.name = def.name;
      target.desc = def.desc;
      target.preset = def.preset;
      target.enabled = def.enabled;
      target.cond = def.cond;
      target.action = def.action;
      target.terms = [...def.terms];
      emitEvent("escalation_rules_changed", { rule_id: target.id });
      return { ...target };
    }),

  resetPresets: () =>
    mutate<EscalationRule[]>(() => {
      const ids = new Set(PRESET_RULE_DEFAULTS.map((r) => r.id));
      const restored = PRESET_RULE_DEFAULTS.map((r) => ({ ...r }));
      mockDb.rules = [
        ...restored,
        ...mockDb.rules.filter((r) => !ids.has(r.id)),
      ];
      emitEvent("escalation_rules_changed", {});
      return [...mockDb.rules];
    }),

  /* Agents — owner invite (marks them pending; queue shows the invite CTA). */

  inviteAgent: (input: { name: string; email: string; role: "agent" | "owner" }) =>
    mutate<AgentUser>(() => {
      const initials = input.name
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      const agent: AgentUser = {
        id: `u${Date.now().toString(36)}`,
        name: input.name,
        email: input.email,
        role: input.role,
        online: false,
        color: "slate",
        csat: null,
        tickets: 0,
        initials,
        resolutions30d: 0,
        lastSeen: "invite sent",
        invitePending: true,
        tenantId: "t1",
        active: true,
      };
      mockDb.agents.push(agent);
      mockDb.invites[`invite-${agent.id}`] = {
        agentId: agent.id,
        email: input.email,
        tenantId: "t1",
        role: input.role,
      };
      return { ...agent };
    }),

  /** Public invite preview — what /accept-invite?token=… shows before submit. */
  inviteInfo: (token: string) => {
    const inv = mockDb.invites[token];
    if (!inv) return withLatency<InviteSummary | null>(null);
    const tenant = mockDb.tenants.find((t) => t.id === inv.tenantId);
    return withLatency<InviteSummary | null>({
      email: inv.email,
      role: inv.role,
      tenant: tenant?.name ?? "your team",
      expiresAt: "7 days",
    });
  },

  /** Activates a pending invite, creating the sign-in session (§5.2 accept-invite). */
  acceptInvite: (
    token: string,
    input: { fullName: string; password: string },
  ): Promise<{ token: string; user: SessionUser } | null> =>
    mutate<{ token: string; user: SessionUser } | null>(() => {
      const inv = mockDb.invites[token];
      if (!inv) return null;
      const agent = mockDb.agents.find((a) => a.id === inv.agentId);
      if (!agent) return null;
      agent.active = true;
      agent.invitePending = false;
      agent.online = true;
      agent.name = input.fullName;
      agent.email = inv.email;
      agent.initials = input.fullName
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      delete mockDb.invites[token];
      return {
        token: `mock-token-${agent.id}`,
        user: {
          id: agent.id,
          email: agent.email,
          fullName: agent.name,
          role: agent.role,
          tenantId: agent.tenantId ?? "t1",
          initials: agent.initials,
          color: agent.color,
        },
      };
    }),

  /** Password reset (§5.2 forgot-password → reset-password). Mock mode:
   *  any demo/registered email gets a working one-time token so the flow
   *  can be demoed end-to-end without SMTP. */
  forgotPassword: (email: string) =>
    mutate<{ ok: boolean; reset_url?: string }>(() => {
      const known =
        demoUsers.some((u) => u.email.toLowerCase() === email) ||
        mockDb.registeredUsers.some((u) => u.email.toLowerCase() === email);
      if (!known) return { ok: true };
      return { ok: true, reset_url: `/reset-password?token=mock-reset-${encodeURIComponent(email)}` };
    }),

  /** Public reset preview — what /reset-password?token=… shows before submit. */
  resetInfo: (token: string) => {
    const email = mockResetEmail(token);
    if (!email) return withLatency<{ email: string } | null>(null);
    return withLatency<{ email: string }>({ email });
  },

  /** Consumes the one-time token and sets the new password. */
  resetPassword: (token: string, newPassword: string) =>
    mutate<{ ok: boolean } | null>(() => {
      const email = mockResetEmail(token);
      if (!email) return null;
      const demo = demoUsers.find((u) => u.email.toLowerCase() === email);
      if (demo) demo.password = newPassword;
      const reg = mockDb.registeredUsers.find((u) => u.email.toLowerCase() === email);
      if (reg) reg.password = newPassword;
      return { ok: true };
    }),

  /** Customer self-signup (§6.2 /register). Auto-signs the new account in.
   *  Guest-history binding: tickets are keyed by email, so any chats a visitor
   *  sent before registering surface under My tickets the moment they sign in. */
  registerCustomer: (input: { fullName: string; email: string; password: string; tenantId: string }) =>
    mutate<{ token: string; user: SessionUser }>(() => {
      const email = input.email.trim().toLowerCase();
      const user: SessionUser = {
        id: `c${Date.now().toString(36)}`,
        email,
        fullName: input.fullName.trim(),
        role: "customer",
        tenantId: input.tenantId,
        initials:
          input.fullName
            .trim()
            .split(/\s+/)
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "C",
        color: "slate",
      };
      mockDb.registeredUsers.push({ ...user, password: input.password });
      return { token: `mock-token-${user.id}`, user };
    }),

  /** Public widget pre-chat identity (guide §6.3). Validates the visitor and
   *  returns their guest profile so chat history can follow them by email. */
  initializeSession: (input: { tenantId: string; name: string; email: string }) =>
    withLatency<{ sessionId: string; email: string; name: string; tenantId: string }>({
      sessionId: `guest-${input.email.replace(/[^a-z0-9]/gi, "").toLowerCase()}`,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      tenantId: input.tenantId,
    }),

  /* Knowledge base ingestion (§5.4) — link / PDF / raw text → source rows. */

  ingestLink: (tenantId: string, url: string) =>
    mutate<KnowledgeSource>(() => {
      const source: KnowledgeSource = {
        id: `ks${Date.now().toString(36)}`,
        tenantId,
        type: "link",
        title: prettyTitle(url),
        url,
        status: "ready",
        chunks: 6 + Math.floor(Math.random() * 20),
        createdAt: "just now",
      };
      mockDb.knowledgeSources.unshift(source);
      return { ...source };
    }),

  /** Simulates the live crawler: registers a source and returns the same
   *  response shape as the real POST /crawl endpoint. */
  crawlSite: (tenantId: string, url: string, maxPages: number) =>
    mutate(() => {
      const safeMax = Math.max(1, Math.min(50, maxPages || 15));
      const pagesCrawled = Math.max(1, Math.min(safeMax, 1 + Math.floor(Math.random() * 5)));
      const chunksIndexed = pagesCrawled * (8 + Math.floor(Math.random() * 12));
      const source: KnowledgeSource = {
        id: `ks${Date.now().toString(36)}`,
        tenantId,
        type: "link",
        title: `Crawled ${pagesCrawled} page${pagesCrawled === 1 ? "" : "s"} from ${prettyTitle(url)}`,
        url,
        status: "ready",
        chunks: chunksIndexed,
        createdAt: "just now",
      };
      source.text = previewText(source);
      mockDb.knowledgeSources.unshift(source);
      return {
        ok: true,
        startUrl: url,
        pagesCrawled,
        chunksIndexed,
        totalCharacters: chunksIndexed * 320,
      };
    }),

  ingestPdf: (tenantId: string, file: { name: string; sizeKb: number }) =>
    mutate<KnowledgeSource>(() => {
      const source: KnowledgeSource = {
        id: `ks${Date.now().toString(36)}`,
        tenantId,
        type: "pdf",
        title: file.name,
        sizeKb: file.sizeKb,
        status: "ready",
        chunks: Math.max(3, Math.round(file.sizeKb / 12)),
        createdAt: "just now",
      };
      mockDb.knowledgeSources.unshift(source);
      return { ...source };
    }),

  ingestText: (tenantId: string, title: string, content: string) =>
    mutate<KnowledgeSource>(() => {
      const words = content.trim().split(/\s+/).length;
      const source: KnowledgeSource = {
        id: `ks${Date.now().toString(36)}`,
        tenantId,
        type: "raw_text",
        title,
        status: "ready",
        chunks: Math.max(1, Math.ceil(words / 600)),
        createdAt: "just now",
        text: content,
      };
      mockDb.knowledgeSources.unshift(source);
      return { ...source };
    }),

  knowledgeSources: (tenantId: string) =>
    withLatency(
      mockDb.knowledgeSources.filter((s) => s.tenantId === tenantId),
    ),

  /** Full text for a single source (preview). Falls back to a generated
   *  excerpt when the mock row has no stored body. */
  knowledgeSourceText: (tenantId: string, id: string) => {
    const source = mockDb.knowledgeSources.find(
      (s) => s.id === id && s.tenantId === tenantId,
    );
    if (!source) {
      const err = new Error("Knowledge source not found") as Error & { code?: string };
      err.code = "NOT_FOUND";
      throw err;
    }
    return withLatency({ ...source, text: source.text ?? previewText(source) });
  },

  deleteKnowledgeSource: (id: string) =>
    mutate<boolean>(() => {
      const before = mockDb.knowledgeSources.length;
      mockDb.knowledgeSources = mockDb.knowledgeSources.filter((s) => s.id !== id);
      return mockDb.knowledgeSources.length < before;
    }),

  /* Tenant — owner brand & widget settings (§4.4/§4.5). */

  updateTenant: (id: string, patch: Partial<Tenant>) =>
    mutate<Tenant | null>(() => {
      const t = mockDb.tenants.find((x) => x.id === id);
      if (!t) return null;
      applyPatch(t, patch);
      emitEvent("settings_changed", { tenant_id: t.id });
      return { ...t };
    }),

  /* Super admin console — platform mutations, each audited (guide §5.16). */

  createTenant: (input: { name: string; slug: string; email: string; plan: PlanCode }) =>
    mutate<Tenant>(() => {
      const tenant: Tenant = {
        id: `t${Date.now().toString(36)}`,
        name: input.name,
        slug: input.slug.toLowerCase().replace(/\s+/g, "-"),
        email: input.email,
        status: "pending",
        plan: input.plan,
        agents: 0,
        customers: 0,
        kbMb: 0,
        volume30d: 0,
        color: "#00a86b",
        tone: "professional",
        city: "Lagos",
      };
      mockDb.tenants.push(tenant);
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "create_tenant",
        target: tenant.name,
        detail: "provisioned — pending approval",
      });
      emitEvent("tenant_status_changed", { tenant_id: tenant.id, status: "pending" });
      pushFeedSuper({
        ic: "building",
        color: "#7c3aed",
        title: `${tenant.name} submitted for approval`,
        meta: "just now · pending → review",
      });
      return { ...tenant };
    }),

  logAudit: (action: string, target: string, detail: string, actor = "super_admin") =>
    mutate<AuditLog>(() => {
      const entry: AuditLog = { time: "just now", actor, action, target, detail };
      mockDb.audit.unshift(entry);
      return { ...entry };
    }),

  /** Profile page — persists display name/email/presence against the session
   *  record and pushes presence to dashboards over the bus (§6.6). */
  updateProfile: (input: {
    userId: string;
    fullName: string;
    email: string;
    online?: boolean;
    prefs?: Record<string, boolean>;
  }) =>
    mutate<SessionUser | null>(() => {
      const demo = demoUsers.find((u) => u.id === input.userId);
      if (!demo) return null;
      const fullName = input.fullName.trim();
      const email = input.email.trim().toLowerCase();
      demo.fullName = fullName || demo.fullName;
      demo.email = email || demo.email;
      demo.initials =
        (fullName || demo.fullName)
          .split(/\s+/)
          .map((p) => p[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "U";
      if (input.online !== undefined && demo.role !== "super_admin") {
        const agent = mockDb.agents.find((a) => a.id === input.userId);
        if (agent) agent.online = input.online;
        emitEvent("agent_presence", { user_id: input.userId, online: input.online });
      }
      return {
        id: demo.id,
        email: demo.email,
        fullName: demo.fullName,
        role: demo.role,
        tenantId: demo.tenantId,
        initials: demo.initials,
        color: demo.color,
      };
    }),

  approveTenant: (id: string) =>
    mutate<Tenant | null>(() => {
      const t = mockDb.tenants.find((x) => x.id === id);
      if (!t) return null;
      t.status = "active";
      if (!t.plan) t.plan = "starter";
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "approve_tenant",
        target: t.name,
        detail: "provisioning completed",
      });
      emitEvent("tenant_status_changed", { tenant_id: t.id, status: "active" });
      pushFeedSuper({
        ic: "checkcircle",
        color: "#00a86b",
        title: `${t.name} approved — owner notified`,
        meta: "just now · provisioning completed",
      });
      return { ...t };
    }),

  suspendTenant: (id: string) =>
    mutate<Tenant | null>(() => {
      const t = mockDb.tenants.find((x) => x.id === id);
      if (!t) return null;
      t.status = "suspended";
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "suspend_tenant",
        target: t.name,
        detail: "manual suspension by platform admin",
      });
      emitEvent("tenant_status_changed", { tenant_id: t.id, status: "suspended" });
      pushFeedSuper({
        ic: "warning",
        color: "#d93636",
        title: `${t.name} suspended — live banner pushed to owner`,
        meta: "just now · audited",
      });
      return { ...t };
    }),

  reactivateTenant: (id: string) =>
    mutate<Tenant | null>(() => {
      const t = mockDb.tenants.find((x) => x.id === id);
      if (!t) return null;
      t.status = "active";
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "reactivate_tenant",
        target: t.name,
        detail: "after review",
      });
      emitEvent("tenant_status_changed", { tenant_id: t.id, status: "active" });
      return { ...t };
    }),

  changeTenantPlan: (id: string, code: PlanCode) =>
    mutate<Tenant | null>(() => {
      const t = mockDb.tenants.find((x) => x.id === id);
      if (!t) return null;
      t.plan = code;
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "change_plan",
        target: t.name,
        detail: `plan → ${code} (platform override)`,
      });
      emitEvent("billing_changed", { tenant_id: t.id, plan_code: code });
      pushFeedSuper({
        ic: "card",
        color: "#00a86b",
        title: `${t.name} moved to ${code} plan`,
        meta: "just now · platform override · audited",
      });
      return { ...t };
    }),

  updateAgent: (id: string, patch: Partial<AgentUser>) =>
    mutate<AgentUser | null>(() => {
      const a = mockDb.agents.find((x) => x.id === id);
      if (!a) return null;
      applyPatch(a, patch);
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "update_user",
        target: a.name,
        detail: `${Object.keys(patch).join(", ")} updated`,
      });
      return { ...a };
    }),

  updatePlan: (code: PlanCode, patch: Partial<Plan>) =>
    mutate<Plan | null>(() => {
      const p = mockDb.plans.find((x) => x.code === code);
      if (!p) return null;
      applyPatch(p, patch);
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "update_plan_template",
        target: p.name,
        detail: `${Object.keys(patch).join(", ")} edited`,
      });
      emitEvent("billing_changed", { plan_code: p.code });
      return { ...p };
    }),

  /* Canned responses — shared snippets for the agent composer. */

  createCanned: (input: { label: string; text: string }) =>
    mutate<CannedResponse>(() => {
      const item: CannedResponse = {
        id: `can${Date.now().toString(36)}`,
        label: input.label.trim().startsWith("/") ? input.label.trim() : `/${input.label.trim()}`,
        text: input.text.trim(),
      };
      mockDb.canned.push(item);
      return { ...item };
    }),

  updateCanned: (id: string, patch: Partial<CannedResponse>) =>
    mutate<CannedResponse | null>(() => {
      const c = mockDb.canned.find((x) => x.id === id);
      if (!c) return null;
      applyPatch(c, patch);
      return { ...c };
    }),

  deleteCanned: (id: string) =>
    mutate<boolean>(() => {
      const before = mockDb.canned.length;
      mockDb.canned = mockDb.canned.filter((x) => x.id !== id);
      return mockDb.canned.length < before;
    }),

  /* Customer widget — ported from prototype custSend: creates the session
     ticket on first message, runs the SAME rule engine as the test console,
     and pushes escalations straight into the agent queue. */

  widgetSend: (input: {
    tenantId: string;
    sessionId: string | null;
    text: string;
    email?: string;
    cust?: string;
    /** v3.2: defer the AI reply so the widget can stream it (SSE contract). */
    stream?: boolean;
    /** v3.3: files attached in the widget composer. */
    attachments?: WidgetAttachment[];
  }) =>
    mutate<{
      ticket: Ticket;
      sessionId: string;
      fired: EscalationRule[];
      escalated: boolean;
      reply?: string;
      tone?: string;
    }>(() => {
      const tenant = mockDb.tenants.find((t) => t.id === input.tenantId);
      const tone = tenant?.tone ?? "professional";
      const sessionKey = input.sessionId?.toLowerCase() ?? "";
      const existing = input.sessionId
        ? mockDb.tickets.find((t) => t.id.toLowerCase() === sessionKey)
        : null;
      let ticket: Ticket;
      if (existing) {
        ticket = existing;
      } else {
        const maxNum = mockDb.tickets.reduce(
          (m, t) => Math.max(m, Number(t.id.replace(/^TK-/, "")) || 0),
          1042,
        );
        const id = `TK-${maxNum + 1}`;
        const subject = firstWords(input.text, 6) + "…";
        ticket = {
          id,
          subject,
          cust: input.cust?.trim() || "Guest",
          email: input.email?.trim().toLowerCase() || "guest@example.com",
          phone: "—",
          channel: "chat",
          status: "open",
          priority: "low",
          type: "inquiry",
          sentiment: detectSentiment(input.text),
          time: "just now",
          unread: true,
          sla: "1h left",
          assignee: null,
          preview: subject.slice(0, 72),
          msgs: [],
          assist: null,
        };
        mockDb.tickets.unshift(ticket);
        evaluateSla(ticket);
        evaluateAutomations("ticket_created", ticket);
      }
      ticket.msgs = [
        ...ticket.msgs,
        {
          who: "customer" as const,
          text: input.text.trim(),
          attachments: input.attachments?.length ? input.attachments : undefined,
        },
      ];
      evaluateAutomations("message_received", ticket);
      const fired = mockDb.rules.filter((r) => r.enabled && ruleTestHit(r, input.text));
      if (fired.length) {
        ticket.status = "escalated";
        if (fired.some((r) => r.action.includes("HIGH"))) ticket.priority = "high";
        const ids = fired.map((r) => r.id).join(" + ");
        ticket.msgs = [
          ...ticket.msgs,
          { who: "system" as const, text: `Escalated · ${ids} · priority ${ticket.priority.toUpperCase()} · routed to online agent` },
          {
            who: "ai_bot" as const,
            text: tenant?.escalationMessage ?? "Please hold on — a member of our team is joining to help you now.",
          },
        ];
        ticket.assist = {
          reason: ids,
          summary: `Auto-routed from the widget — "${firstWords(input.text, 10)}${input.text.length > 60 ? "…" : ""}"`,
          chunks: ["Generated live from customer chat", "Rule engine: " + ids],
          suggest: "Acknowledge the issue, confirm the account detail, and take ownership of this ticket.",
        };
        emitEvent("ticket_updated", { ticket_id: ticket.id, escalated: true });
        return { ticket: { ...ticket }, sessionId: ticket.id, fired, escalated: true };
      }
      const reply = botReply(input.text.trim() || "a file attachment", tone);
      if (input.stream) {
        emitEvent("ticket_updated", { ticket_id: ticket.id });
        return { ticket: { ...ticket }, sessionId: ticket.id, fired: [], escalated: false, reply, tone };
      }
      ticket.msgs = [...ticket.msgs, { who: "ai_bot" as const, text: reply }];
      emitEvent("ticket_updated", { ticket_id: ticket.id });
      return { ticket: { ...ticket }, sessionId: ticket.id, fired: [], escalated: false };
    }),

  /** v3.2 — persist the aggregated AI reply after the widget streams it. */
  persistWidgetReply: (id: string, text: string) =>
    mutate<Ticket | null>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return null;
      const last = t.msgs[t.msgs.length - 1];
      if (last && ((last.who as string) === "ai" || last.who === "ai_bot") && last.text.trim() === text.trim()) {
        return { ...t };
      }
      t.msgs = [...t.msgs, { who: "ai_bot" as const, text }];
      emitEvent("ticket_updated", { ticket_id: t.id });
      return { ...t };
    }),

  /** v3.2 — CSAT rating on resolution (feeds agent/owner analytics). */
  rateTicket: (id: string, rating: number, comment?: string) =>
    mutate<boolean>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return false;
      mockDb.ratings[t.id] = Math.min(5, Math.max(1, Math.round(rating)));
      t.csatRating = mockDb.ratings[t.id];
      if (comment) t.csatComment = comment;
      emitEvent("csat_rated", { ticket_id: t.id, rating: mockDb.ratings[t.id] });
      return true;
    }),

  /** v3.4 — public message log for a widget session (HITL resolution poll). */
  widgetMessages: (ticketId: string) =>
    mutate<{ messages: { who: string; text: string }[] }>(() => {
      const t = mockDb.tickets.find((x) => x.id.toLowerCase() === String(ticketId).toLowerCase());
      return {
        messages: (t?.msgs ?? []).map((m) => ({
          who: m.who === "ai_bot" ? "ai" : m.who,
          text: m.text,
        })),
      };
    }),

  /* Automations engine (§ owner settings → Automations). */

  automations: () => withLatency([...mockDb.automationRules]),
  automationLog: () => withLatency([...mockDb.automationLog]),

  createAutomation: (input: Omit<AutomationRule, "id" | "order" | "runCount" | "lastRun" | "createdAt">) =>
    mutate<AutomationRule>(() => {
      const maxNum = mockDb.automationRules.reduce(
        (m, r) => Math.max(m, Number(r.id.replace(/^AT-/, "")) || 0),
        0,
      );
      const rule: AutomationRule = {
        ...input,
        id: `AT-${maxNum + 1}`,
        order: mockDb.automationRules.length + 1,
        runCount: 0,
        lastRun: undefined,
        createdAt: "just now",
      };
      mockDb.automationRules.push(rule);
      emitEvent("automations_changed", { rule_id: rule.id });
      return { ...rule };
    }),

  updateAutomation: (id: string, patch: Partial<AutomationRule>) =>
    mutate<AutomationRule | null>(() => {
      const r = mockDb.automationRules.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!r) return null;
      applyPatch(r, patch);
      emitEvent("automations_changed", { rule_id: r.id });
      return { ...r };
    }),

  deleteAutomation: (id: string) =>
    mutate<boolean>(() => {
      const before = mockDb.automationRules.length;
      mockDb.automationRules = mockDb.automationRules.filter((x) => x.id.toLowerCase() !== id.toLowerCase());
      if (mockDb.automationRules.length < before) emitEvent("automations_changed", { rule_id: id });
      return mockDb.automationRules.length < before;
    }),

  toggleAutomation: (id: string) =>
    mutate<AutomationRule | null>(() => {
      const r = mockDb.automationRules.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!r) return null;
      r.enabled = !r.enabled;
      emitEvent("automations_changed", { rule_id: r.id });
      return { ...r };
    }),

  /** Manual "run now" — fires a rule against all matching open tickets. */
  runAutomationNow: (id: string) =>
    mutate<AutomationLog[]>(() => {
      const rule = mockDb.automationRules.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!rule) return [];
      const fired: AutomationLog[] = [];
      for (const t of mockDb.tickets) {
        if (t.status === "resolved" || t.status === "closed") continue;
        if (conditionsMatch(t, rule.conditions, rule.conditionMatch)) {
          applyAutomationActions(rule, t);
          fired.push(mockDb.automationLog[0]);
        }
      }
      emitEvent("automations_changed", { rule_id: rule.id, ran: true });
      return fired;
    }),

  /** Simulated scheduler tick — runs interval automations + SLA breach check. */
  runScheduleTick: () =>
    mutate<{ rulesFired: number; breaches: number }>(() => {
      const before = mockDb.automationRules.reduce((s, r) => s + r.runCount, 0);
      runIntervalAutomations();
      const rulesFired = mockDb.automationRules.reduce((s, r) => s + r.runCount, 0) - before;
      const breaches = mockDb.slaPolicies.reduce((s, p) => s + p.breaches, 0);
      emitEvent("automations_changed", { tick: true });
      return { rulesFired, breaches };
    }),

  /* SLA policies. */

  slaPolicies: () => withLatency([...mockDb.slaPolicies]),
  slaSchedules: () => withLatency([...mockDb.slaSchedules]),

  createSlaPolicy: (input: Omit<SlaPolicy, "id" | "breaches" | "createdAt">) =>
    mutate<SlaPolicy>(() => {
      const maxNum = mockDb.slaPolicies.reduce(
        (m, p) => Math.max(m, Number(p.id.replace(/^SL-/, "")) || 0),
        0,
      );
      const policy: SlaPolicy = { ...input, id: `SL-${maxNum + 1}`, breaches: 0, createdAt: "just now" };
      mockDb.slaPolicies.push(policy);
      emitEvent("sla_changed", { policy_id: policy.id });
      return { ...policy };
    }),

  updateSlaPolicy: (id: string, patch: Partial<SlaPolicy>) =>
    mutate<SlaPolicy | null>(() => {
      const p = mockDb.slaPolicies.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!p) return null;
      applyPatch(p, patch);
      emitEvent("sla_changed", { policy_id: p.id });
      return { ...p };
    }),

  deleteSlaPolicy: (id: string) =>
    mutate<boolean>(() => {
      const before = mockDb.slaPolicies.length;
      mockDb.slaPolicies = mockDb.slaPolicies.filter((x) => x.id.toLowerCase() !== id.toLowerCase());
      if (mockDb.slaPolicies.length < before) emitEvent("sla_changed", { policy_id: id });
      return mockDb.slaPolicies.length < before;
    }),

  toggleSlaPolicy: (id: string) =>
    mutate<SlaPolicy | null>(() => {
      const p = mockDb.slaPolicies.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!p) return null;
      p.enabled = !p.enabled;
      emitEvent("sla_changed", { policy_id: p.id });
      return { ...p };
    }),

  createSlaSchedule: (input: Omit<SlaSchedule, "id">) =>
    mutate<SlaSchedule>(() => {
      const schedule: SlaSchedule = { ...input, id: `sched${Date.now().toString(36)}` };
      mockDb.slaSchedules.push(schedule);
      return { ...schedule };
    }),

  /* Webhooks. */

  webhooks: () => withLatency([...mockDb.webhooks]),
  webhookDeliveries: () => withLatency([...mockDb.webhookDeliveries]),

  createWebhook: (input: Omit<WebhookEndpoint, "id" | "createdAt">) =>
    mutate<WebhookEndpoint>(() => {
      const endpoint: WebhookEndpoint = { ...input, id: `wh${Date.now().toString(36)}`, createdAt: "just now" };
      mockDb.webhooks.push(endpoint);
      emitEvent("webhooks_changed", { endpoint_id: endpoint.id });
      return { ...endpoint };
    }),

  updateWebhook: (id: string, patch: Partial<WebhookEndpoint>) =>
    mutate<WebhookEndpoint | null>(() => {
      const w = mockDb.webhooks.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!w) return null;
      applyPatch(w, patch);
      emitEvent("webhooks_changed", { endpoint_id: w.id });
      return { ...w };
    }),

  deleteWebhook: (id: string) =>
    mutate<boolean>(() => {
      const before = mockDb.webhooks.length;
      mockDb.webhooks = mockDb.webhooks.filter((x) => x.id.toLowerCase() !== id.toLowerCase());
      if (mockDb.webhooks.length < before) emitEvent("webhooks_changed", { endpoint_id: id });
      return mockDb.webhooks.length < before;
    }),

  toggleWebhook: (id: string) =>
    mutate<WebhookEndpoint | null>(() => {
      const w = mockDb.webhooks.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!w) return null;
      w.active = !w.active;
      emitEvent("webhooks_changed", { endpoint_id: w.id });
      return { ...w };
    }),

  testWebhook: (id: string) =>
    mutate<WebhookDelivery>(() => {
      const endpoint = mockDb.webhooks.find((x) => x.id.toLowerCase() === id.toLowerCase());
      const delivery: WebhookDelivery = {
        id: `wd${Date.now().toString(36)}`,
        endpointId: id,
        endpointName: endpoint?.name ?? "Unknown endpoint",
        event: "ticket.test",
        status: "success",
        attempts: 1,
        httpStatus: 200,
        durationMs: 120 + Math.floor(Math.random() * 180),
        time: "just now",
      };
      mockDb.webhookDeliveries.unshift(delivery);
      return { ...delivery };
    }),

  /* Channels. */

  channels: () => withLatency([...mockDb.channels]),

  updateChannel: (id: string, patch: Partial<ChannelSettings>) =>
    mutate<ChannelSettings | null>(() => {
      const c = mockDb.channels.find((x) => x.id === id);
      if (!c) return null;
      applyPatch(c, patch);
      emitEvent("settings_changed", { channel_id: c.id });
      return { ...c };
    }),

  connectChannel: (id: string, config: Record<string, string | boolean>) =>
    mutate<ChannelSettings | null>(() => {
      const c = mockDb.channels.find((x) => x.id === id);
      if (!c) return null;
      c.enabled = true;
      c.connected = true;
      c.providerStatus = "connected";
      c.lastError = undefined;
      c.webhookUrl =
        id === "whatsapp" || id === "email"
          ? `https://api.example.ng/api/webhooks/${id}`
          : id === "telegram"
            ? `https://api.example.ng/api/webhooks/telegram/${config.botToken}`
            : id === "sms"
              ? "https://api.example.ng/api/webhooks/twilio"
              : undefined;
      c.configPresent = Object.keys(config).length > 0;
      emitEvent("settings_changed", { channel_id: c.id });
      return { ...c };
    }),

  disconnectChannel: (id: string) =>
    mutate<ChannelSettings | null>(() => {
      const c = mockDb.channels.find((x) => x.id === id);
      if (!c) return null;
      c.connected = false;
      c.providerStatus = "disconnected";
      c.lastError = undefined;
      emitEvent("settings_changed", { channel_id: c.id });
      return { ...c };
    }),

  testChannel: (id: string, config?: Record<string, string | boolean>) =>
    mutate<{ ok: boolean; message: string }>(() => {
      const c = mockDb.channels.find((x) => x.id === id);
      const builtin = id === "chat" || id === "portal";
      const present = Object.keys(config ?? {}).length > 0;
      const ok = builtin ? true : present || Boolean(c?.configPresent);
      c && (c.providerStatus = ok ? "connected" : "error");
      c && (c.connected = ok ? c.connected || !builtin : false);
      c && (c.lastError = ok ? undefined : "Credentials missing — connect this channel first.");
      emitEvent("settings_changed", { channel_id: id });
      return {
        ok,
        message: ok
          ? `${c?.label ?? "Channel"} is reachable.`
          : "Credentials missing — connect this channel first.",
      };
    }),

  syncChannel: (id: string) =>
    mutate<{ ok: boolean; ingested: number }>(() => {
      const c = mockDb.channels.find((x) => x.id === id);
      const pollable = id === "email" || id === "telegram";
      if (!pollable) return { ok: false, ingested: 0 };
      const ingested = 1 + Math.floor(Math.random() * 3);
      emitEvent("settings_changed", { channel_id: id });
      return { ok: true, ingested };
    }),

  channelEmbed: (id: string) =>
    withLatency<{ url: string; code: string }>(
      (() => {
        if (id === "chat") {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          const slug = mockDb.tenants[0]?.slug ?? "nairawave";
          const url = `${origin}/widget-embed?tenantId=${encodeURIComponent(slug)}`;
          return {
            url,
            code: `<iframe src="${url}" title="Website chat" width="100%" height="100%" style="border:0;min-height:600px"></iframe>`,
          };
        }
        const c = mockDb.channels.find((x) => x.id === id);
        return { url: c?.webhookUrl ?? "", code: c?.webhookUrl ?? "" };
      })(),
    ),

  /* API keys. */

  apiKeys: () => withLatency([...mockDb.apiKeys].filter((k) => !k.revoked)),

  createApiKey: (input: { name: string; scopes: string[] }) =>
    mutate<ApiKey & { secret: string }>(() => {
      const prefix = `pre_${Math.random().toString(16).slice(2, 10)}`;
      const key: ApiKey = {
        id: `ak${Date.now().toString(36)}`,
        name: input.name,
        prefix,
        scopes: input.scopes,
        createdAt: "just now",
      };
      mockDb.apiKeys.push(key);
      return { ...key, secret: `${prefix}.${Math.random().toString(16).repeat(4).slice(2, 34)}` };
    }),

  revokeApiKey: (id: string) =>
    mutate<ApiKey | null>(() => {
      const k = mockDb.apiKeys.find((x) => x.id === id);
      if (!k) return null;
      k.revoked = true;
      return { ...k };
    }),

  /* Notification preferences (persisted per user). */

  notificationPrefs: (userId: string) =>
    withLatency<NotificationPreferences>({
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(mockDb.notificationPrefs[userId] ?? {}),
    }),

  updateNotificationPrefs: (userId: string, prefs: NotificationPreferences) =>
    mutate<NotificationPreferences>(() => {
      mockDb.notificationPrefs[userId] = prefs;
      emitEvent("settings_changed", { prefs_user: userId });
      return { ...prefs };
    }),

  /* Preset versions (admin hub) — immutable snapshots of escalation presets. */

  presetVersions: () => withLatency([...mockDb.presetVersions]),

  createPresetVersion: (input: { label: string; note?: string; createdBy?: string }) =>
    mutate<PresetVersion>(() => {
      const presets = [...PRESET_RULE_DEFAULTS, ...mockDb.rules.filter((r) => !r.preset)];
      const nextNum = mockDb.presetVersions.length + 1;
      const version: PresetVersion = {
        id: `pv${Date.now().toString(36)}`,
        version: `v1.${nextNum}`,
        label: input.label,
        note: input.note,
        rules: presets.map((r) => ({ ...r })),
        createdAt: "just now",
        createdBy: input.createdBy ?? "super_admin",
      };
      mockDb.presetVersions.unshift(version);
      mockDb.audit.unshift({
        time: "just now",
        actor: version.createdBy,
        action: "create_preset_version",
        target: version.version,
        detail: version.label,
      });
      return { ...version };
    }),

  restorePresetVersion: (versionId: string) =>
    mutate<{ version: PresetVersion; rules: EscalationRule[] } | null>(() => {
      const version = mockDb.presetVersions.find((v) => v.id === versionId);
      if (!version) return null;
      mockDb.rules = version.rules.map((r) => ({ ...r }));
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "restore_preset_version",
        target: version.version,
        detail: `${version.label} restored as live presets`,
      });
      emitEvent("escalation_rules_changed", { restored: version.version });
      return { version: { ...version }, rules: [...mockDb.rules] };
    }),

  /* Feature flags (admin hub). */

  featureFlags: () => withLatency([...mockDb.featureFlags]),

  updateFeatureFlag: (key: string, enabled: boolean) =>
    mutate<FeatureFlag | null>(() => {
      const f = mockDb.featureFlags.find((x) => x.key === key);
      if (!f) return null;
      f.enabled = enabled;
      mockDb.audit.unshift({
        time: "just now",
        actor: "super_admin",
        action: "update_feature_flag",
        target: f.label,
        detail: enabled ? "enabled" : "disabled",
      });
      return { ...f };
    }),

  /* Agents — resend invite / manage (owner Team tab). */

  resendInvite: (agentId: string) =>
    mutate<AgentUser | null>(() => {
      const a = mockDb.agents.find((x) => x.id === agentId);
      if (!a) return null;
      mockDb.invites[`invite-${a.id}`] = {
        agentId: a.id,
        email: a.email,
        tenantId: a.tenantId ?? "t1",
        role: a.role === "owner" ? "owner" : "agent",
      };
      a.lastSeen = "invite resent";
      a.invitePending = true;
      return { ...a };
    }),

  setAgentActive: (agentId: string, active: boolean) =>
    mutate<AgentUser | null>(() => {
      const a = mockDb.agents.find((x) => x.id === agentId);
      if (!a) return null;
      a.active = active;
      a.online = active && a.online;
      return { ...a };
    }),

  /* Routing teams (P4) — name + membership, used to scope agent inboxes. */
  teams: (tenantId?: string) =>
    withLatency(
      mockDb.teams
        .filter((t) => !tenantId || t.tenantId === tenantId)
        .map((t) => ({
          ...t,
          members: mockDb.agents
            .filter((a) => t.memberIds.includes(a.id))
            .map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role })),
        })),
    ),
  createTeam: (name: string, tenantId = mockDb.tenants[0]?.id ?? "t1") => {
    const team: Team = {
      id: `tm-${Date.now().toString(36)}`,
      tenantId,
      name,
      memberIds: [],
      members: [],
      createdAt: new Date().toISOString(),
    };
    mockDb.teams.push(team);
    return withLatency({ ...team });
  },
  updateTeam: (teamId: string, name: string) =>
    mutate<Team | null>(() => {
      const t = mockDb.teams.find((x) => x.id === teamId);
      if (!t) return null;
      t.name = name;
      return { ...t, members: mockDb.agents.filter((a) => t.memberIds.includes(a.id)).map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role })) };
    }),
  deleteTeam: (teamId: string) =>
    mutate<boolean>(() => {
      const i = mockDb.teams.findIndex((x) => x.id === teamId);
      if (i < 0) return false;
      mockDb.teams.splice(i, 1);
      return true;
    }),
  addTeamMember: (teamId: string, userId: string) =>
    mutate<Team | null>(() => {
      const t = mockDb.teams.find((x) => x.id === teamId);
      if (!t || t.memberIds.includes(userId)) return null;
      t.memberIds.push(userId);
      return { ...t, members: mockDb.agents.filter((a) => t.memberIds.includes(a.id)).map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role })) };
    }),
  removeTeamMember: (teamId: string, userId: string) =>
    mutate<Team | null>(() => {
      const t = mockDb.teams.find((x) => x.id === teamId);
      if (!t) return null;
      t.memberIds = t.memberIds.filter((id) => id !== userId);
      return { ...t, members: mockDb.agents.filter((a) => t.memberIds.includes(a.id)).map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role })) };
    }),

  /* Inbox scoping (P4). */
  setAgentScope: (agentId: string, scope: InboxScope) =>
    mutate<AgentUser | null>(() => {
      const a = mockDb.agents.find((x) => x.id === agentId);
      if (!a) return null;
      a.inboxScope = scope;
      return { ...a };
    }),

  /* Knowledge base article management (draft/publish workflow). */
  createArticle: (input: { title: string; content?: string; category?: string; status?: "draft" | "published" }) => {
    const article: KnowledgeArticle = {
      id: `A-${Date.now().toString(36)}`,
      tenantId: mockDb.tenants[0]?.id ?? "t1",
      title: input.title,
      snippet: (input.content ?? "").slice(0, 140),
      body: input.content ?? "",
      category: input.category || "General",
      status: input.status === "published" ? "published" : "draft",
      createdBy: getSessionUser()?.id ?? null,
      views: 0,
      helpful: 0,
    };
    mockDb.articles.unshift(article);
    return withLatency({ ...article });
  },
  updateArticle: (articleId: string, patch: { title?: string; content?: string; category?: string; status?: "draft" | "published" }) =>
    mutate<KnowledgeArticle | null>(() => {
      const a = mockDb.articles.find((x) => x.id === articleId);
      if (!a) return null;
      if (patch.title !== undefined) a.title = patch.title;
      if (patch.content !== undefined) {
        a.body = patch.content;
        a.snippet = patch.content.slice(0, 140);
      }
      if (patch.category !== undefined) a.category = patch.category;
      if (patch.status !== undefined) a.status = patch.status;
      return { ...a };
    }),
  deleteArticle: (articleId: string) =>
    mutate<boolean>(() => {
      const i = mockDb.articles.findIndex((x) => x.id === articleId);
      if (i < 0) return false;
      mockDb.articles.splice(i, 1);
      return true;
    }),
};

/* Rule test engine — ported from prototype/app.js testHit (§4.3). */
export function ruleTestHit(rule: EscalationRule, text: string): boolean {
  const t = text.toLowerCase();
  switch (rule.cond) {
    case "customer_request":
      return /human|agent|manager|representative|speak to (someone|a person)/.test(t);
    case "keywords":
      return (rule.terms ?? []).some((k) => t.includes(String(k).toLowerCase()));
    case "sentiment_negative":
      return /frustrat|angry|thiev|stole|embarrass|ridiculous|annoyed/.test(t);
    case "confidence_below":
      return /(don't understand|not helping|what do you mean)/.test(t);
    case "conversation_loop":
      return /(why aren't you answering|are you there|hello\?)/.test(t);
    case "repeat_failed_self_service":
      return /(asked three times|same question|still the same)/.test(t);
    case "pii_security":
      return /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b|otp|password|card number/.test(t);
    case "sla_timeout":
      return /(waiting for hours|no reply)/.test(t);
    case "customer_segment":
      return /vip/.test(t);
    default:
      return false;
  }
}

export async function testRules(text: string): Promise<EscalationRule[]> {
  return mutate(() =>
    mockDb.rules.filter((r) => r.enabled && ruleTestHit(r, text)),
  );
}

/* ------------------------------------------------------------------ */
/* Widget reply engine (prototype/app.js botReply + detectSentiment)   */
/* ------------------------------------------------------------------ */

const AI_REPLIES = [
  "Let me check that for you now, one moment.",
  "I can help with that. Give me a moment to look.",
  "That one is common — here's how to fix it.",
  "No wahala, I go sort this out for you.",
  "Let me route this to a human on our team, hold on.",
  "You can do this under Settings → Security. Want me to walk you through?",
];

function firstWords(s: string, n: number): string {
  return String(s).split(/\s+/).slice(0, n).join(" ");
}

/** Generated excerpt for a source without stored body text (mock preview). */
function previewText(source: KnowledgeSource): string {
  const lead =
    source.type === "link"
      ? `Excerpt of ${source.title} from ${source.url ?? "the linked page"}.`
      : source.type === "pdf"
        ? `Text extracted from ${source.title}.`
        : `Notes titled "${source.title}".`;
  return `${lead}\n\n${Array.from(
    { length: 3 + Math.min(2, source.chunks % 4) },
    (_, i) =>
      `\u2022 This ${source.type.replace("_", " ")} source contributes ${source.chunks} indexed chunk(s). ` +
      `Chunk ${i + 1} covers the ${["introduction", "key steps", "FAQ answers", "policy detail", "contact notes"][i % 5]}. ` +
      `The AI assistant retrieves these chunks to answer customer questions about your business.`,
  ).join("\n")}`;
}

/** URL → human title for ingested link sources (mock ingestion). */
function prettyTitle(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.hostname.replace(/^www\./, "").split(".").filter(Boolean);
    const name = parts.slice(0, Math.max(1, parts.length - 1)).join(" ") || parts[0] || u.hostname;
    const label = name
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return `${label} — ${u.pathname.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") || "help docs"}`;
  } catch {
    return url;
  }
}

function detectSentiment(text: string): string {
  const t = String(text).toLowerCase();
  if (/(thief|stole|angry|frustrat|useless|stupid|scam|fraud|ridiculous|embarrass|rip)/.test(t)) return "Negative";
  if (/(thank|great|awesome|perfect|love)/.test(t)) return "Positive";
  return "Neutral";
}

/** Streams a canned AI reply in small token chunks — the mock transport for
 *  the SSE contract (§6.3). The client aggregates chunks and persists the full
 *  reply on done. */
export async function* streamWidgetReply(
  text: string,
  tone: string,
): AsyncGenerator<string> {
  const reply = botReply(text, tone);
  const step = 14;
  for (let i = 0; i < reply.length; i += step) {
    await new Promise((resolve) => setTimeout(resolve, 55));
    yield reply.slice(i, i + step);
  }
}

/** CSAT ratings recorded for a tenant's tickets (feeds agent/owner analytics). */
export function ticketRatings(tenantId?: string): Record<string, number> {
  if (!tenantId) return { ...mockDb.ratings };
  const ids = new Set(
    mockDb.tickets.filter((t) => t.channel === "chat").map((t) => t.id),
  );
  return Object.fromEntries(
    Object.entries(mockDb.ratings).filter(([id]) => ids.has(id)),
  );
}

function botReply(text: string, tone: string): string {
  const t = text.toLowerCase();
  const R: Record<string, Record<string, string>> = {
    transfer: {
      professional: "Transfers can take a few minutes to settle. Track it under Transactions, and if it's stuck past 2 hours I'll escalate it for you.",
      casual: "Transfers usually settle in minutes — check Transactions for live status.",
      pidgin: "Abeg check under Transactions. If e still dey Processing after 2 hours, make you tell me now.",
      formal: "Transfers typically settle within a few minutes; you may verify the status under Transactions.",
    },
    pin: {
      professional: "You can reset your PIN under Settings → Security → Transfer PIN, or dial *737*1# on your linked number.",
      casual: "Reset it in Settings → Security → Transfer PIN, or dial *737*1#.",
      pidgin: "Reset am for Settings → Security → Transfer PIN, or dial *737*1#.",
      formal: "You may reset your PIN under Settings → Security → Transfer PIN or via *737*1#.",
    },
    refund: {
      professional: "Refund requests are reviewed within 24–48 hours. I've started the check — if it needs a human I'll hand it over.",
      casual: "Refunds are usually reviewed within 24–48h. On it!",
      pidgin: "Refund dey review for 24–48 hours. I don start am.",
      formal: "Refund requests are processed within 24–48 hours and I have initiated the review.",
    },
    card: {
      professional: "For card issues, you can instantly block the card under Cards in the app. I can walk you through it.",
      casual: "You can block your card instantly under Cards in the app.",
      pidgin: "You fit block your card for Cards section right now.",
      formal: "You may block the card immediately under Cards in the application.",
    },
    security: {
      professional: "Security issues are taken seriously. Please never share an OTP or password — I'm flagging this for review.",
      casual: "Never share OTPs or passwords. I've flagged this for a secure review.",
      pidgin: "No share your OTP or password for anybody. I don flag am.",
      formal: "We treat security matters with the highest priority; I have flagged this for a secure review.",
    },
    fee: {
      professional: "All fees are listed on our pricing page. Want me to look up a specific charge on your account?",
      casual: "Fees are on the pricing page — want me to check a charge for you?",
      pidgin: "Fees dey for pricing page. You wan make I check one charge for you?",
      formal: "Our fee schedule is available on the pricing page; I can review a specific charge if you wish.",
    },
    fallback: {
      professional: "Let me check that for you now, one moment.",
      casual: "No wahala, I go sort this out for you.",
      pidgin: "Let me check that for you now, one moment.",
      formal: "Allow me a moment to check that for you.",
    },
  };
  const intent = /(transfer|send money|settlement|gtbank|bank)/.test(t) ? "transfer"
    : /(pin|password|login)/.test(t) ? "pin"
    : /(refund|money back|reversal|reverse)/.test(t) ? "refund"
    : /(card|block|charge)/.test(t) ? "card"
    : /(otp|security|fraud|hack)/.test(t) ? "security"
    : /(fee|price|cost)/.test(t) ? "fee"
    : AI_REPLIES[Math.floor(Math.random() * AI_REPLIES.length)];
  return R[intent]?.[tone] ?? R[intent]?.professional ?? intent;
}

/* ------------------------------------------------------------------ */
/* Agent assist (staff in-conversation AI, /api/agent/assist)          */
/* ------------------------------------------------------------------ */

/** A pending approval the agent AI is awaiting human sign-off on. */
export interface AgentAssistPending {
  type: string;
  ticket_id?: string;
  tenant_id?: string;
  prompt?: string;
  status?: string;
  customer_reply?: string;
}

/** Mock approvals awaiting a staff decision, keyed by ticket id. */
const mockApprovals = new Map<string, AgentAssistPending>();

/** Mock mirror of the backend LangGraph interrupt — registering a refund
 *  approval so the widget shows its "pending" state and the staff rail can
 *  act on it (shared map, so approve/decline resolves both sides). */
export function widgetApprovalFor(
  ticketId: string,
  query: string,
): AgentAssistPending | null {
  const t = query.toLowerCase();
  if (!/(refund|money back|reversal|reverse)/.test(t)) return null;
  const payload: AgentAssistPending = {
    type: "initiate_refund",
    ticket_id: ticketId,
    prompt: "Initiate a refund on this ticket?",
    status: "pending",
    customer_reply:
      "We've flagged your refund request with our team — it's under review.",
  };
  mockApprovals.set(ticketId, payload);
  emitEvent("agent_approval_pending", { ticket_id: ticketId, payload });
  return payload;
}

function agentAssistReply(query: string, ticketId: string): string {
  const t = query.toLowerCase();
  if (/(refund|money back|reversal|reverse)/.test(t)) {
    widgetApprovalFor(ticketId, query);
    return "This one needs human sign-off. I've registered a refund approval on this ticket — Approve or Decline it in the card above, then I'll follow through.";
  }
  if (/(escalat|human agent|talk to a person|second level|handover)/.test(t)) {
    return `Escalation flagged for ${ticketId}. The handover note in this rail gives the human agent the full context — I can also draft the handover message if you want.`;
  }
  if (/(status|where|transfer|settlement|track)/.test(t)) {
    return `Ticket ${ticketId} is still open and awaiting our reply. The customer's last message is about their transfer — I'd suggest clearing that question now. Want a draft?`;
  }
  if (/(draft|reply|suggest|what should i say)/.test(t)) {
    return "Here's a draft: \"Hi — thanks for reaching out. I've confirmed the details on your ticket and I'm handling it now; you'll see the update within the hour. — Your support team.\"";
  }
  if (/(fee|charge|cost)/.test(t)) {
    return "All fees are listed on the pricing page. I can pull up the exact charge on this ticket if you want.";
  }
  return `I've read ticket ${ticketId} — it's open and awaiting a reply. Ask me for a draft reply, a status read, an escalation, or mention \"refund\" to start an approval.`;
}

/** Mock streaming transport for POST /agent/assist — mirrors the SSE
 *  contract; the staff UI aggregates chunks and re-checks pending after. */
export async function* streamAgentAssist(
  ticketId: string,
  query: string,
): AsyncGenerator<string> {
  const reply = agentAssistReply(query, ticketId);
  const step = 14;
  for (let i = 0; i < reply.length; i += step) {
    await new Promise((resolve) => setTimeout(resolve, 45));
    yield reply.slice(i, i + step);
  }
}

/** Mock GET /agent/assist/:ticketId/pending — approval the AI is awaiting. */
export async function mockAgentAssistPending(
  ticketId: string,
): Promise<{ pending: boolean; payload: AgentAssistPending | null }> {
  await withLatency(null);
  return {
    pending: mockApprovals.has(ticketId),
    payload: mockApprovals.get(ticketId) ?? null,
  };
}

/** Mock POST /agent/assist/:ticketId/approve — resolves a pending approval. */
export async function mockAgentAssistApprove(
  ticketId: string,
  approved: boolean,
): Promise<{ ok: boolean; reply?: string }> {
  await withLatency(null);
  mockApprovals.delete(ticketId);
  const reply = approved
    ? "Approved — the refund has been initiated. The customer sees a confirmation within 24–48 hours."
    : "Declined — no refund was started. I've left a note on the ticket so a human can follow up.";
  emitEvent("agent_approval_resolved", { ticket_id: ticketId, approved, reply });
  const t = mockDb.tickets.find((x) => x.id.toLowerCase() === ticketId.toLowerCase());
  if (t) {
    t.msgs = [...t.msgs, { who: "ai_bot" as const, text: reply }];
    emitEvent("ticket_updated", { ticket_id: t.id });
  }
  return { ok: true, reply };
}

/* ------------------------------------------------------------------ */
/* Dashboard (design.md §4.3)                                          */
/* ------------------------------------------------------------------ */

const CHART_PALETTE = ["#00a86b", "#2563eb", "#b98800", "#7c3aed", "#64748b"];

export async function mockDashboard(role: Role): Promise<DashboardMetrics> {
  await withLatency(null);

  const open = mockDb.tickets.filter((t) =>
    ["open", "in_progress", "escalated"].includes(t.status),
  ).length;

  const channelCounts = mockDb.tickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.channel] = (acc[t.channel] ?? 0) + 1;
    return acc;
  }, {});
  const channels = ["chat", "whatsapp", "portal", "email"];
  const channelMix = channels
    .filter((c) => channelCounts[c])
    .map((c, i) => ({
      label: c === "chat" ? "Chat" : c === "whatsapp" ? "WhatsApp" : c === "portal" ? "Portal" : "Email",
      value: channelCounts[c],
      color: CHART_PALETTE[i],
    }));

  const csatAvg =
    mockDb.agents.filter((a) => a.csat != null).reduce((s, a) => s + (a.csat ?? 0), 0) /
    mockDb.agents.filter((a) => a.csat != null).length;

  const leaderboard = [...mockDb.agents]
    .sort((a, b) => b.resolutions30d - a.resolutions30d)
    .map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      online: a.online,
      resolutions30d: a.resolutions30d,
      csat: a.csat,
    }));

  return {
    kpis: [
      {
        label: "Open tickets",
        value: String(open),
        trend: "down",
        delta: "−3",
        goodWhen: "down",
        context: "Target < 5",
      },
      {
        label: "Deflection",
        value: "68.4%",
        trend: "up",
        delta: "+2.1 pts",
        goodWhen: "up",
        context: "Target 70%",
      },
      {
        label: "First response",
        value: "4.2m",
        trend: "down",
        delta: "−38s",
        goodWhen: "down",
        context: "SLA 15m",
      },
      {
        label: "CSAT",
        value: `${csatAvg.toFixed(1)} ★`,
        trend: "up",
        delta: "+0.1",
        goodWhen: "up",
        context: "Target 4.5",
      },
      {
        label: "Avg. resolution",
        value: "2.4h",
        trend: "down",
        delta: "−18m",
        goodWhen: "down",
        context: "Target 3h",
      },
    ],
    volume: [
      { label: "Mon", value: 42 },
      { label: "Tue", value: 51 },
      { label: "Wed", value: 38 },
      { label: "Thu", value: 63 },
      { label: "Fri", value: 57 },
      { label: "Sat", value: 29 },
      { label: "Sun", value: 34 },
    ],
    channelMix,
    leaderboard,
    recentTickets: [...mockDb.tickets].slice(0, 5),
    feed: feedFor(role),
  };
}

/* ------------------------------------------------------------------ */
/* Tenant analytics hub (design.md §4.4)                               */
/* ------------------------------------------------------------------ */

const FRT_SERIES = [4.2, 3.8, 3.1, 2.9, 3.3, 2.7, 2.5, 2.8, 2.4, 2.2, 2.0, 1.9, 2.1, 1.8];
const DEFLECTION_SERIES = [72, 78, 75, 82, 88, 90, 87, 92, 94, 95, 93, 96, 95, 96];

export async function mockReports(role: Role): Promise<TenantReportMetrics> {
  await withLatency(null);

  const leaderboard = [...mockDb.agents]
    .filter((a) => a.role !== "owner" && a.resolutions30d > 0)
    .sort((a, b) => b.resolutions30d - a.resolutions30d)
    .map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      online: a.online,
      resolutions30d: a.resolutions30d,
      csat: a.csat,
    }));

  // Escalation reasons fed by live rule trigger counts (§4.3 / prototype).
  const fired = [...mockDb.rules]
    .filter((r) => (r.trigger ?? 0) > 0)
    .sort((a, b) => (b.trigger ?? 0) - (a.trigger ?? 0));
  const firedTotal = fired.reduce((s, r) => s + (r.trigger ?? 0), 0) || 1;
  const escalationReasons: EscalationReason[] = fired.slice(0, 6).map((r, i) => ({
    ruleId: r.id,
    name: r.name,
    pct: Math.round(((r.trigger ?? 0) / firedTotal) * 100),
    color: CHART_PALETTE[i % CHART_PALETTE.length],
  }));

  return {
    kpis: [
      { label: "Tickets this week", value: "1,284", trend: "up", delta: "+8.2%", goodWhen: "up", context: "vs last week" },
      { label: "Deflection rate", value: "95.2%", trend: "up", delta: "+1.4 pts", goodWhen: "up", context: "≈ ₦3.2M saved / week" },
      { label: "Avg first response", value: "0.4s", trend: "down", delta: "−0.1s", goodWhen: "down", context: "human handoff 3.1 min" },
      { label: "CSAT", value: "4.6 / 5", trend: "up", delta: "+0.2", goodWhen: "up", context: "this month" },
      { label: "First-contact resolution", value: "78%", trend: "up", delta: "+1 pt", goodWhen: "up", context: "industry band 70–80%" },
      { label: "Escalation rate", value: "11.2%", trend: "down", delta: "−0.6 pts", goodWhen: "down", context: "healthy band 8–15%" },
    ],
    frt: FRT_SERIES.map((v, i) => ({ label: `D${i + 1}`, value: v })),
    deflection: DEFLECTION_SERIES.map((v, i) => ({ label: `D${i + 1}`, value: v })),
    triage: [
      { label: "Inquiries", value: 62, color: "#00a86b" },
      { label: "Requests", value: 26, color: "#b98800" },
      { label: "Complaints", value: 12, color: "#d93636" },
    ],
    escalationReasons,
    leaderboard,
    feed: feedFor(role),
  };
}
