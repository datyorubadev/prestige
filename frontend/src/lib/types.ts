/**
 * Shared data contracts for the Prestige portal.
 * Mirrors IMPLEMENTATION_GUIDE.md §4.1 (enums), §4.2 (tables), §8 (error envelope).
 * These are the shapes the mock layer (src/lib/mock) and the real API both produce.
 */

/* ------------------------------------------------------------------ */
/* Enums (guide §4.1)                                                  */
/* ------------------------------------------------------------------ */

export type Role = "super_admin" | "owner" | "agent" | "customer";

export type TicketStatus = "open" | "in_progress" | "waiting_for_customer" | "waiting_internal" | "escalated" | "resolved" | "closed";

export type TicketPriority = "low" | "medium" | "high";

export type TicketType = "complaint" | "request" | "inquiry" | "unclassified";

export type TicketChannel = "chat" | "whatsapp" | "portal" | "email" | "telegram" | "sms";

export type MessageSender = "customer" | "ai_bot" | "human_agent" | "system" | "agent";

export type KnowledgeType = "pdf" | "link" | "raw_text";

/** Ingested knowledge source shown on /dashboard/upload (§6.2). */
export type KnowledgeSourceType = "link" | "pdf" | "raw_text";

export interface KnowledgeSource {
  id: string;
  tenantId: string;
  type: KnowledgeSourceType;
  title: string;
  url?: string;
  sizeKb?: number;
  status: "processing" | "ready";
  chunks: number;
  createdAt: string;
  /** Extracted body text, present on the single-source preview response. */
  text?: string;
}

export interface FAQItem {
  id: number;
  question: string;
  answer: string;
  tenantId?: string;
}

export type TenantStatus = "pending" | "active" | "suspended" | "terminated";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled";

export type PlanCode = "starter" | "pro" | "enterprise";

export type NotificationType =
  | "escalation"
  | "ticket_assigned"
  | "new_reply"
  | "suspension"
  | "system";

/* ------------------------------------------------------------------ */
/* Error envelope (guide §8)                                           */
/* ------------------------------------------------------------------ */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "TENANT_CONFLICT"
  | "INVITE_EXPIRED"
  | "RESET_TOKEN_EXPIRED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "PLAN_DOWNGRADE_BLOCKED"
  | "TENANT_NOT_ACTIVE"
  | "IMPERSONATION_EXPIRED"
  | "GROQ_ERROR"
  | "INTERNAL_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown> & { request_id?: string };
}

export interface ErrorEnvelope {
  error: ApiError;
}

/* ------------------------------------------------------------------ */
/* Domain models (guide §4.2)                                          */
/* ------------------------------------------------------------------ */

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: TenantStatus;
  plan: PlanCode;
  agents: number;
  customers: number;
  kbMb: number;
  volume30d: number;
  color: string;
  tone: string;
  city: string;
  /* §4.4/§4.5 Brand & widget settings (owner-managed, tenant-scoped). */
  /** Widget/brand logo — data URL (mock) or server-served upload URL. */
  logoUrl?: string | null;
  /** Large cover/banner image shown at the top of the chat panel header,
   *  distinct from the small circular logo avatar. */
  displayImage?: string | null;
  botName?: string;
  welcomeMessage?: string;
  launcherText?: string;
  widgetPosition?: "bottom-right" | "bottom-left";
  escalationMessage?: string;
  mobileFullscreen?: boolean;
  proactiveTeaser?: string;
  secondaryColor?: string;
  /** Agents currently online — drives the widget's truthful presence line
   *  (Online / Away / Offline) and the offline email-capture mode (§4.5). */
  agentsOnline?: number;
  aiEnabled?: boolean;
  aiTokensUsed?: number;
  aiTokensLimit?: number;
}

export interface AgentUser {
  id: string;
  name: string;
  role: Role;
  online: boolean;
  email: string;
  tickets: number;
  initials: string;
  color: string;
  resolutions30d: number;
  csat: number | null;
  /** Invite-only fields (§4.3 agents manager). */
  lastSeen?: string;
  invitePending?: boolean;
  /** Platform directory (§5.16 users): tenant scope + account state. */
  tenantId?: string;
  active?: boolean;
  /** P4 inbox scoping: what this agent sees in the conversation queue. */
  inboxScope?: InboxScope;
}

export interface TicketMessage {
  who: MessageSender;
  text: string;
  /** ISO or relative time — rendered as date dividers + hover tooltips (Chatwoot-style). */
  timestamp?: string;
  /** Stable id — lets agents edit/delete internal notes by reference (v3.3). */
  id?: string;
  /** Frontend-only variant: internal note (rendered as dashed purple, never customer-visible). */
  kind?: "note";
  /** Files shared in the thread — widget and agent composers (v3.3). */
  attachments?: WidgetAttachment[];
  /** True once an internal note has been edited (Intercom-style "Edited" marker). */
  edited?: boolean;
  /** Who wrote an internal note (shown on hover in the agent workspace). */
  author?: string;
  /** Delivery state — drives the WhatsApp-style ✓✓ receipts on sent messages. */
  status?: "sent" | "delivered" | "read";
  /** Quoted message when the agent replies-to a thread message (Chatwoot quoting). */
  replyTo?: { author: string; text: string };
}

export interface WidgetAttachment {
  id: string;
  name: string;
  size: number;
  /** MIME type, e.g. "image/png" or "application/pdf". */
  type: string;
  kind: "image" | "file";
  /** Server-served URL (e.g. /static/uploads/...) — used when the file was
   *  uploaded so it can be previewed at any size. */
  url?: string;
  /** Client-side preview for images (data URL) — mock transport only. */
  dataUrl?: string;
}

export interface AssistInfo {
  reason: string;
  summary: string;
  chunks: string[];
  suggest: string;
}

export interface Ticket {
  id: string;
  /** Human-facing number: {3-letter tenant prefix}{YYYYMMDD}{6 digits}
   *  (e.g. NAI20260814786523) from the backend DTO. Falls back to the raw id
   *  when absent (mock/optimistic tickets). */
  ticketNumber?: string;
  subject: string;
  cust: string;
  /** Customer email — shown in the context rail and used for ?email= deep links. */
  email: string;
  phone: string;
  channel: TicketChannel;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  sentiment: string;
  time: string;
  unread: boolean;
  sla?: string;
  assignee: string | null;
  assigneeId?: string | null;
  tenantId?: string;
  preview: string;
  msgs: TicketMessage[];
  assist: AssistInfo | null;
  /** SLA engine tracking (owner SLA policies). */
  slaPolicyId?: string;
  slaFirstResponseAt?: string;
  slaResolveAt?: string;
  slaFirstResponseBreached?: boolean;
  slaResolveBreached?: boolean;
  firstRespondedAt?: string;
  /** Categorization tags (Chatwoot-style labels) — agent-managed, colored chips. */
  labels?: string[];
  /** Routing team name (P4) — shown as a chip in the queue when set. */
  teamName?: string;
  /** Post-chat CSAT comment (collected with the rating in the widget). */
  csatComment?: string;
  csatRating?: number;
}

export interface KnowledgeArticle {
  id: string;
  tenantId: string;
  title: string;
  content?: string;
  body?: string;
  snippet: string;
  category: string;
  status: "draft" | "pending_review" | "published" | "archived";
  createdBy?: string | null;
  reviewedBy?: string | null;
  rejectNote?: string | null;
  views: number;
  helpful: number;
  createdAt?: string;
}

/** Routing team (P4): a named group of agents a tenant can assign tickets to.
 *  Agents scope their inbox to one of these to see only their team's work. */
export interface TeamMemberRef {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Team {
  id: string;
  tenantId: string;
  name: string;
  memberIds: string[];
  members: TeamMemberRef[];
  createdAt?: string;
}

/** Inbox scoping (P4): "all" = every ticket, "assigned" = only mine,
 *  "team" = my team's tickets plus anything unassigned. */
export type InboxScope = "all" | "assigned" | "team";

/** Per-tenant label library entry (Chatwoot-style) — name + color so chips
 *  render consistently across the queue, the workspace and filters. */
export interface Label {
  id: string;
  tenantId?: string;
  name: string;
  color: string;
  description?: string;
  createdAt?: string;
}

export interface CannedResponse {
  id: string;
  label: string;
  text: string;
}

export interface EscalationRuleCondition {
  [key: string]: unknown;
}

export interface EscalationRuleAction {
  [key: string]: unknown;
}

export interface EscalationRule {
  id: string;
  name: string;
  desc: string;
  preset: boolean;
  enabled: boolean;
  cond: string;
  action: string;
  terms: string[];
  /** Times the rule has fired (owner-facing stats, §4.3). */
  trigger?: number;
  /** Last ticket the rule fired on. */
  lastFired?: string;
}

export interface Plan {
  code: PlanCode;
  name: string;
  price: string;
  priceNum: number;
  agents: number;
  customers: number;
  kb: string;
  tag: string;
}

export interface Invoice {
  id: string;
  period: string;
  amount: string;
  status: string;
  method: string;
}

export interface AuditLog {
  time: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
  ip?: string;
  device?: string;
  result?: string;
}

export interface FeedItem {
  ic: string;
  color: string;
  title: string;
  meta: string;
}

export interface NotificationItem {
  ic: string;
  color: string;
  title: string;
  meta: string;
  unread: boolean;
  /** Route to open when the item is clicked (design.md §4.3 Notification feed). */
  target?: string;
}

export interface PastTicket {
  email: string;
  id: string;
  ticketNumber?: string;
  subject: string;
  status: string;
  date: string;
}

/* ------------------------------------------------------------------ */
/* Streaming / realtime (guide §6.3, §6.6)                             */
/* ------------------------------------------------------------------ */

/** SSE frame — guide §6.3: token frames, a terminal {done:true}, and
 *  error frames {error:{code,message}}. The terminal frame may also carry
 *  needs_approval + approval_payload when the agent paused for human approval. */
export interface ChatStreamFrame {
  token?: string;
  done?: boolean;
  response_by?: "ai" | "human" | "system_alert";
  error?: { code?: string; message?: string } | string;
  needs_approval?: boolean;
  approval_payload?: {
    type?: string;
    ticket_id?: string;
    tenant_id?: string;
    prompt?: string;
    status?: string;
    customer_reply?: string;
  } | null;
}

export interface EventBusEnvelope<T = Record<string, unknown>> {
  type:
    | "ticket_created"
    | "ticket_updated"
    | "settings_changed"
    | "escalation_rules_changed"
    | "notification"
    | string;
  request_id: string;
  data: T;
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  tenantId: string | null;
  initials: string;
  color: string;
}

export interface DemoUser extends SessionUser {
  password: string;
}

/** Invite summary returned by GET /auth/invites/:token (public preview). */
export interface InviteSummary {
  email: string;
  role: Role;
  tenant: string;
  expiresAt: string;
}

/** Result of POST /auth/accept-invite — sign-in payload like /auth/login. */
export interface AcceptInviteResult {
  token: string;
  refresh_token?: string;
  user: SessionUser;
}

/* ------------------------------------------------------------------ */
/* Dashboard (design.md §4.3)                                          */
/* ------------------------------------------------------------------ */

export interface DashboardKpi {
  label: string;
  value: string;
  trend: "up" | "down";
  delta: string;
  /** "up" = higher is better; "down" = lower is better (inverted good/bad). */
  goodWhen: "up" | "down";
  context?: string;
}

export interface VolumePoint {
  label: string;
  value: number;
}

export interface ChannelSlice {
  label: string;
  value: number;
  color: string;
}

export interface LeaderboardRow {
  id: string;
  name: string;
  color: string;
  online: boolean;
  resolutions30d: number;
  csat: number | null;
}

export interface DashboardMetrics {
  kpis: DashboardKpi[];
  volume: VolumePoint[];
  channelMix: ChannelSlice[];
  leaderboard: LeaderboardRow[];
  recentTickets: Ticket[];
  feed: FeedItem[];
}

export interface TriageSlice {
  label: string;
  value: number;
  color: string;
}

export interface EscalationReason {
  ruleId: string;
  name: string;
  pct: number;
  color: string;
}

export interface TenantReportMetrics {
  kpis: DashboardKpi[];
  frt: VolumePoint[];
  deflection: VolumePoint[];
  triage: TriageSlice[];
  escalationReasons: EscalationReason[];
  leaderboard: LeaderboardRow[];
  feed: FeedItem[];
  aiResolutionRate?: string;
  aiHandoffRate?: string;
  ragConfidence?: string;
  slaCompliance?: string;
  avgResolutionTime?: string;
  slaBreaches?: string;
  csatScore?: string;
  csatCount?: number;
  csat5Count?: number;
  csat1Count?: number;
  csatFeedback?: Array<{ name: string; rating: number; comment: string; time: string }>;
}

/** Result of a widget send — mirrors the session ticket plus fired rules. */
export interface WidgetSendResult {
  ticket: Ticket;
  sessionId: string;
  fired: EscalationRule[];
  escalated: boolean;
}

/* ------------------------------------------------------------------ */
/* Automations engine (owner settings hub — trigger → conditions →     */
/* ordered actions). Mirrors Zendesk/Freshdesk-style workflow rules.   */
/* ------------------------------------------------------------------ */

export type AutomationTriggerType =
  | "ticket_created"
  | "ticket_updated"
  | "status_changed"
  | "message_received"
  | "sla_breach"
  | "interval";

export type AutomationConditionOp =
  | "eq"
  | "neq"
  | "contains"
  | "in"
  | "not_in"
  | "older_than";

/** One predicate in an automation rule (e.g. status == "escalated"). */
export interface AutomationCondition {
  /** Ticket field name: status, priority, channel, type, sentiment, assignee. */
  field: string;
  op: AutomationConditionOp;
  value: unknown;
}

export type AutomationActionType =
  | "assign_agent"
  | "set_status"
  | "set_priority"
  | "send_email"
  | "send_slack"
  | "add_note"
  | "trigger_webhook"
  | "escalate";

export interface AutomationAction {
  type: AutomationActionType;
  /** Action-specific payload (agent id, status, priority, note text, …). */
  config: Record<string, string>;
}

export interface AutomationRule {
  id: string;
  name: string;
  desc?: string;
  enabled: boolean;
  trigger: AutomationTriggerType;
  /** Conditions must ALL or ANY match for the rule to fire. */
  conditionMatch: "all" | "any";
  conditions: AutomationCondition[];
  /** Ordered actions executed when the rule fires. */
  actions: AutomationAction[];
  /** Time-based automations: the periodic tick every N minutes/hours/days. */
  interval?: { unit: "minutes" | "hours" | "days"; value: number };
  order: number;
  runCount: number;
  lastRun?: string;
  createdAt: string;
}

/** Execution trace for an automation run (owner automations tab). */
export interface AutomationLog {
  id: string;
  ruleId: string;
  ruleName: string;
  ticketId?: string;
  action: string;
  result: "success" | "skipped" | "error";
  time: string;
}

/* ------------------------------------------------------------------ */
/* SLA policies (owner settings hub)                                    */
/* ------------------------------------------------------------------ */

/** Per-priority response/resolution targets, in minutes. */
export interface SlaTarget {
  priority: TicketPriority;
  firstResponseMin: number;
  resolutionMin: number;
}

/** A single escalation step that triggers when a target is at risk/breached. */
export interface SlaEscalation {
  id: string;
  level: number;
  /** minutes after ticket creation (response) or assignment (resolution). */
  afterMin: number;
  target: "first_response" | "resolution";
  action: "notify_owner" | "notify_team" | "escalate_agent" | "send_slack";
  message: string;
}

/** Business-hours window a policy runs inside (null on policy = 24/7). */
export interface SlaSchedule {
  id: string;
  name: string;
  /** Days of week with work (0 = Monday … 6 = Sunday). */
  days: number[];
  start: string;
  end: string;
}

export interface SlaPolicy {
  id: string;
  name: string;
  desc?: string;
  enabled: boolean;
  /** Ticket filters the policy applies to (status/channel/type/priority). */
  match: AutomationCondition[];
  targets: SlaTarget[];
  scheduleId: string | null;
  escalations: SlaEscalation[];
  /** Live breach counter for reporting. */
  breaches: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Outbound integrations (owner settings hub)                          */
/* ------------------------------------------------------------------ */

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  /** Stored secret; UI renders a masked form. */
  secret: string;
  /** Subscribed events, e.g. ticket.created, ticket.escalated. */
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  endpointName: string;
  event: string;
  status: "success" | "failed" | "retrying";
  attempts: number;
  httpStatus?: number;
  durationMs: number;
  time: string;
}

/* ------------------------------------------------------------------ */
/* Channels & API keys (owner settings hub)                            */
/* ------------------------------------------------------------------ */

export interface ChannelSettings {
  id: TicketChannel;
  label: string;
  enabled: boolean;
  connected: boolean;
  detail?: string;
  phone?: string;
  address?: string;
  /** disconnected | connecting | connected | error */
  providerStatus?: string;
  lastError?: string;
  /** Public webhook URL providers POST inbound messages to. */
  webhookUrl?: string;
  /** True once provider credentials have been saved. */
  configPresent?: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  /** Public preview prefix, e.g. "pre_ab12…". */
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsed?: string;
  revoked?: boolean;
}

/* ------------------------------------------------------------------ */
/* Notification preferences (persisted, owner/agent)                   */
/* ------------------------------------------------------------------ */

export interface NotificationPreferences {
  email: Record<string, boolean>;
  push: Record<string, boolean>;
  quietHours: { enabled: boolean; start: string; end: string };
}

/* ------------------------------------------------------------------ */
/* Automation preset versioning (admin settings hub)                   */
/* ------------------------------------------------------------------ */

/** Immutable snapshot of the global escalation rule set at a point in time. */
export interface PresetVersion {
  id: string;
  version: string;
  label: string;
  rules: EscalationRule[];
  createdAt: string;
  createdBy: string;
  note?: string;
}

/** Feature flags the platform can toggle per tenant (admin feature flags tab). */
export interface FeatureFlag {
  key: string;
  label: string;
  desc: string;
  enabled: boolean;
  scope: "platform" | "tenant";
}

// New ticket statuses
export type Customer = {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  phone: string;
  company: string;
  location: string;
  notes: string;
  tags: string[];
  isVip: boolean;
  isActive: boolean;
  accountNumber: string;
  ticketCount: number;
  createdAt: string;
};

export interface CustomerListResponse {
  total: number;
  page: number;
  perPage: number;
  customers: Customer[];
}

export type MacroActionType =
  | "assign_team"
  | "assign_agent"
  | "set_status"
  | "set_label"
  | "send_message"
  | "add_note"
  | "set_priority";

export interface MacroAction {
  type: MacroActionType;
  value: string;
}

export interface Macro {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  actions: MacroAction[];
  visibility: "private" | "shared";
  createdBy: string | null;
  runCount: number;
  isActive: boolean;
  createdAt: string;
}

export type CustomFieldType = "text" | "number" | "date" | "dropdown" | "checkbox" | "url" | "email";

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  name: string;
  key: string;
  fieldType: CustomFieldType;
  options: string[];
  appliesTo: "ticket" | "customer";
  required: boolean;
  isActive: boolean;
  position: number;
  createdAt: string;
}

export interface CustomFieldValue {
  fieldDefId: string;
  name: string;
  key: string;
  fieldType: CustomFieldType;
  value: string | null;
}

export interface DaySchedule {
  enabled: boolean;
  open: string;
  close: string;
}

export interface BusinessHours {
  id: string;
  tenantId: string;
  timezone: string;
  schedule: Record<string, DaySchedule>;
  outOfHoursMessage: string;
}

// Platform stats
export interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  pendingTenants: number;
  totalAgents: number;
  totalCustomers: number;
  totalTickets: number;
  aiResolutions: number;
  humanHandoffs: number;
  aiTokensUsed: number;
  subscriptionDistribution: Record<string, number>;
}

// Agent personal analytics
export interface AgentAnalytics {
  assignedOpen: number;
  resolved30d: number;
  csatAvg: number | null;
  ticketsByDay: Array<{ label: string; value: number }>;
  channelMix?: Array<{ label: string; value: number; color: string }>;
  totalAssigned: number;
}

// Dynamic Custom Tools & Actions (§5.6 / §6.5)
export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

export interface TenantCustomTool {
  id: string;
  tenantId: string;
  toolType: "api" | "kyc" | "doc_verify" | "callback";
  name: string;
  displayName: string;
  description: string;
  category: "fintech" | "logistics" | "ecommerce" | "healthcare" | "hospitality" | "custom";
  config: Record<string, unknown>;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  urlTemplate: string;
  headers: Record<string, string>;
  parametersSchema: ToolParameter[];
  bodyTemplate?: string | null;
  responseExtractor?: string | null;
  requiresApproval: boolean;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IndustryTemplate {
  id: string;
  name: string;
  displayName: string;
  category: string;
  description: string;
  toolType?: "api" | "kyc" | "doc_verify" | "callback";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  urlTemplate: string;
  headers: Record<string, string>;
  parametersSchema: ToolParameter[];
  bodyTemplate?: string;
  requiresApproval: boolean;
  responseExtractor?: string;
  config?: Record<string, unknown>;
}

export interface ToolTestResult {
  ok: boolean;
  simulated?: boolean;
  statusCode: number;
  elapsedMs: number;
  renderedUrl: string;
  renderedHeaders: Record<string, string>;
  renderedBody?: string | null;
  response: unknown;
}

