# Prestige — Multi-Tenant AI Customer Support Portal
## Comprehensive Project Summary

---

### 1. Project Overview & Purpose

**Prestige** is a **Multi-Tenant SaaS AI Customer Support Portal** designed for the Nigerian market. It enables any business (fintech, logistics, utility, telecom, etc.) to:

- Upload their knowledge base (PDFs, website links, raw text)
- Get an isolated AI agent that answers customer queries via a chat widget
- Triage complaints, escalate to live human agents, and report analytics
- Manage everything from a unified dashboard

The system implements a **4-tier Role-Based Access Control (RBAC)** hierarchy:

1. **Super Admin** — Platform-wide management (tenants, plans, audit, impersonation)
2. **Owner** — Business owner (brand settings, agents, billing, knowledge base)
3. **Agent** — Support staff (ticket queue, live chat, internal notes)
4. **Customer** — End user (tickets, chat, knowledge base browsing)

---

### 2. Complete Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 16 (App Router, TypeScript, React 19), Tailwind CSS v4 | Landing page, super-admin console, business dashboard, customer portal, chat widget |
| **Backend** | FastAPI 0.141 (Python 3.11+), Uvicorn | All APIs, auth, ingestion, orchestration |
| **LLM** | Groq API — `meta-llama/llama-3.3-70b-versatile` + `whisper-large-v3-turbo` (STT) | Inference, triage, summaries, tool calling, voice-to-text |
| **RAG Framework** | LangGraph + LangChain (`langgraph`, `langchain-groq`) | Agentic graph: retrieve → route → tools → generate, human-in-the-loop interrupts |
| **Vector DB** | ChromaDB ≥1.5 (local) + `all-MiniLM-L6-v2` embeddings | Semantic retrieval, per-tenant isolated collections |
| **Relational DB** | SQLite (dev) / PostgreSQL (prod), SQLAlchemy 2.0 | Tenants, users, customers, tickets, messages, subscriptions, audit logs |
| **Cache/Limits** | Redis | Rate-limit counters, refresh-token blacklist, agent presence |
| **Email** | SendGrid SMTP (mock fallback) | Ticket confirmations, password reset, agent alerts |
| **Charts** | Recharts | Analytics dashboards |
| **Real-time** | FastAPI WebSockets | Human handoff, live chat override, presence, event bus |
| **API Docs** | FastAPI auto `/docs` | Built-in Swagger UI |
| **Web Scraping** | BeautifulSoup4, Requests, Scrapy | Website knowledge ingestion |
| **PDF Processing** | pypdf | PDF document ingestion |
| **Task Scheduling** | APScheduler | SLA breach checks, background jobs |

---

### 3. Frontend Implementation

#### 3.1 Pages & Routes

| Route | Access | Description |
|---|---|---|
| `/` | Public | Landing page with hero section, platform KPIs, live embedded chat widget demo |
| `/login`, `/forgot-password`, `/register` | Public | Authentication flows with role-based redirects |
| `/accept-invite?token=` | Public | Invite acceptance for owners/agents (password setup) |
| `/chat/[tenantSlug]` | Public | Pre-chat identity form → SSE-streamed AI chat with teaser/typing/chips/CSAT/fullscreen |
| `/admin` | Super Admin | Platform analytics (KPIs, tenant table, approve/suspend/impersonate) |
| `/admin/tenants` | Super Admin | Tenant directory + provisioning |
| `/admin/billing` | Super Admin | Platform MRR/subscriptions + plan management |
| `/admin/audit` | Super Admin | Filterable audit log viewer |
| `/dashboard` | Owner/Agent | Analytics hub (KPI cards, charts, agent leaderboard, activity feed) |
| `/dashboard/tickets` | Owner/Agent | **3-pane inbox** (queue + conversation + context rail) — Zendesk/Chatwoot-style |
| `/dashboard/escalation` | Owner | Rule builder: E1–E10 presets + custom rules, condition editor, test console |
| `/dashboard/agents` | Owner | Agent list + invite form (quota indicator) |
| `/dashboard/billing` | Owner | Plan + usage-vs-quota bars, invoices |
| `/dashboard/settings` | Owner | Brand & widget customization with live preview |
| `/dashboard/upload` | Owner/Agent | Link + PDF + raw-text knowledge ingestion |
| `/portal/[tenantSlug]` | Customer | Searchable KB, manual ticket form, live tracker |
| `/portal/[tenantSlug]/inbox` | Customer | "My tickets" tracker with reopen capability |
| `/widget-embed` | Public | Standalone embeddable widget page |

#### 3.2 Component Architecture

```
components/
├── admin/              # Super admin panels
│   ├── agents.tsx
│   ├── audit-log.tsx
│   ├── billing.tsx
│   ├── canned.tsx
│   ├── escalation-rules.tsx
│   ├── jobs-inspector.tsx
│   ├── kb-manager.tsx
│   ├── platform-overview.tsx
│   ├── security-center.tsx
│   ├── subscriptions.tsx
│   ├── system-health.tsx
│   ├── teams.tsx
│   ├── tenants-manager.tsx
│   └── users-manager.tsx
├── dashboard/          # Analytics & charts
│   ├── activity-feed.tsx
│   ├── bars-chart.tsx
│   ├── donut-chart.tsx
│   ├── kpi-card.tsx
│   ├── onboarding-card.tsx
│   └── onboarding-modal.tsx
├── inbox/              # 3-pane inbox system
│   ├── agent-assist.tsx
│   ├── ai-decision-trail.tsx
│   ├── context-pane.tsx
│   ├── context-rail.tsx
│   ├── conversation-pane.tsx
│   ├── queue-pane.tsx
│   ├── ticket-detail.tsx
│   └── ticket-list.tsx
├── widget/             # Chat widget
│   └── widget-chat.tsx
├── portal/             # Customer portal
│   ├── article-viewer.tsx
│   ├── create-ticket-modal.tsx
│   ├── customer-chat.tsx
│   ├── reports.tsx
│   └── tenant-settings.tsx
├── settings/           # 23 settings tab components
│   ├── admin-flags-tab.tsx
│   ├── admin-general-tab.tsx
│   ├── admin-plans-tab.tsx
│   ├── admin-presets-tab.tsx
│   ├── admin-security-tab.tsx
│   ├── admin-settings-hub.tsx
│   ├── ai-tools-tab.tsx
│   ├── api-tab.tsx
│   ├── automations-tab.tsx
│   ├── autonomy-matrix-tab.tsx
│   ├── business-hours-tab.tsx
│   ├── channels-tab.tsx
│   ├── connect-channel-modal.tsx
│   ├── custom-fields-tab.tsx
│   ├── general-tab.tsx
│   ├── labels-tab.tsx
│   ├── macros-tab.tsx
│   ├── notifications-tab.tsx
│   ├── settings-hub.tsx
│   ├── sla-tab.tsx
│   ├── webhooks-tab.tsx
│   ├── widget-builder-tab.tsx
│   └── workflows-tab.tsx
├── upload/             # Knowledge upload
│   └── knowledge-upload.tsx
├── landing/            # Landing page
├── layout/             # App shell (topbar, sidebar, nav)
├── profile/            # User profile
├── icons.tsx           # SVG icon system
└── ui/                 # Primitive components
```

#### 3.3 Custom Hooks

| Hook | Purpose |
|---|---|
| `useStreamingChat` | SSE token streaming for AI responses with reader/parser |
| `useWebSocketChat` | WebSocket for live human agent chat takeover |
| `useAgentAssist` | AI-assisted agent panel (KB search, suggested replies) |
| `useRealtime` | Event bus client with polling fallback (`/ws/events`) |

#### 3.4 Mock System

A complete in-process mock system (`src/lib/mock/`) enables full UI demo without a backend:

- `dataset.js` — Pre-seeded data (tenants, tickets, agents, customers, knowledge sources)
- `index.ts` — Mock API layer with event bus, streaming simulation, CRUD operations
- Toggled via `NEXT_PUBLIC_API_MOCK=true`

---

### 4. Backend Implementation

#### 4.1 API Endpoints (30 modules)

| Module | Key Endpoints |
|---|---|
| **auth.py** | Login, refresh, logout, forgot-password, reset-password, accept-invite, register (customer) |
| **superadmin.py** | Create/approve/suspend/terminate tenants, platform analytics, impersonation |
| **tickets.py** | Initialize-session, create, list (with filters), messages, reply, assign, notes |
| **chat.py** | SSE streaming chat endpoint with RAG retrieval |
| **knowledge.py** | Ingest link/PDF/text → ChromaDB, list/delete sources |
| **rules.py** | Escalation rule CRUD, toggle, test console, reset-presets |
| **agents.py** | Agent invite, presence (online/offline), list, manage |
| **analytics.py** | Tenant + platform analytics (deflection, FRT, FCR, escalation rate, leaderboard) |
| **settings.py** | Tenant brand/widget settings CRUD |
| **billing.py** | Plans, subscriptions, quota enforcement, invoices |
| **webhooks.py** | Mock WhatsApp webhook endpoint |
| **realtime.py** | WebSocket event bus with channel permissions |
| **assist.py** | AI agent-assist panel (summary, KB chunks, suggested reply) |
| **channels.py** | Multi-channel management (WhatsApp, Telegram, email, SMS) |
| **sla.py** | SLA policy management and breach tracking |
| **portal.py** | Customer portal APIs |
| **widget.py** | Widget configuration and chat APIs |
| **crawl.py** | Website crawling for knowledge ingestion |
| **faqs.py** | FAQ management |
| **labels.py** | Ticket labeling |
| **canned.py** | Canned response management |
| **macros.py** | Macro automation |
| **custom_fields.py** | Extensible custom fields |
| **custom_tools.py** | User-defined tool definitions |
| **notifications.py** | Notification management |
| **teams.py** | Agent team groupings |
| **attachments.py** | File attachment handling |
| **invoices.py** | Invoice generation |
| **customers.py** | Customer management |
| **deps.py** | Shared dependencies |

#### 4.2 Database Models (31 model files)

Core tables with UUID primary keys and `tenant_id` isolation:

| Table | Purpose |
|---|---|
| `tenants` | Business profiles (name, brand tone, colors, widget config, plan tier, quotas) |
| `users` | Staff accounts (super_admin/owner/agent roles, password hashes, presence) |
| `customers` | End-user profiles (email, phone, account number, VIP flag) |
| `tickets` | Support tickets (status, priority, type, channel, AI summary/sentiment, assignee) |
| `messages` | Chat transcripts (customer/AI_bot/human_agent/system senders, metadata) |
| `knowledge_sources` | Ingested documents (PDF/link/text, vector collection ID, chunk count) |
| `plans` | Subscription tiers (Starter/Pro/Enterprise with quotas) |
| `subscriptions` | Tenant billing status |
| `escalation_rules` | DB-driven rules with condition builders (E1–E10 presets + custom) |
| `audit_logs` | Full action trail (actor, action, before/after JSON, IP) |
| `invites` | Owner/agent invite tokens |
| `notifications` | User notification queue |
| `refresh_tokens` | JWT refresh token store |
| `kb_articles` | Help center knowledge base articles |
| `canned_responses` | Pre-written reply templates |
| `labels` | Ticket classification labels |
| `macros` | Multi-step automation macros |
| `automation_rules` | Workflow automation rules |
| `sla_policies` | SLA targets per priority |
| `sla_schedules` | Business hours configuration |
| `custom_fields` | Extensible ticket fields |
| `custom_tools` | User-defined tool definitions |
| `webhooks` | Outbound webhook configurations |
| `feature_flags` | Platform feature toggles |
| `teams` | Agent team groupings |
| `background_jobs` | Scheduled/async job tracking |
| `password_reset_tokens` | Password reset token store |
| `tenant_members` | Extended tenant membership |
| `settings` | Platform/tenant settings store |
| `workflows` | Workflow definitions |

#### 4.3 Services Layer

| Service | Purpose |
|---|---|
| `ai.py` | Groq LLM integration, prompt construction, streaming |
| `chat_service.py` | Full chat pipeline (persist → triage → escalate → retrieve → augment → generate) |
| `ingestion.py` | Document processing (scrape → clean → chunk → embed → store) |
| `vector_store.py` | ChromaDB client, per-tenant collection management, local embeddings |
| `escalation.py` | DB-driven rule engine (evaluate conditions, apply actions, nullification) |
| `agent.py` | Agent routing (online preference, workload balancing) |
| `automation.py` | Workflow automation engine (trigger → conditions → ordered actions) |
| `sla.py` | SLA breach detection (business-hours-aware, first-response + resolution) |
| `event_bus.py` | Realtime event publishing to WebSocket channels |
| `guardrails.py` | Safety controls for AI responses |
| `crawler.py` | Website scraping for knowledge ingestion |
| `webhooks.py` | Outbound webhook delivery |
| `serializers.py` | Data formatting utilities |
| `channels/` | Multi-channel adapters (WhatsApp, Telegram, email, SMS via Twilio) |
| `mock_tools/` | 8 mocked Nigerian industry tools |

#### 4.4 Core Infrastructure

| Module | Purpose |
|---|---|
| `security.py` | JWT creation/validation, password hashing, RBAC dependencies |
| `errors.py` | Structured error envelope handler (VALIDATION_ERROR, UNAUTHORIZED, etc.) |
| `permissions.py` | Role-based permission checks |
| `logging.py` | Structured logging with request IDs |

---

### 5. RAG (Retrieval-Augmented Generation) Pipeline

#### 5.1 Ingestion Pipeline

1. **Parsing**: Load PDFs (pypdf), scrape websites (BeautifulSoup), accept raw text
2. **Chunking**: `RecursiveCharacterTextSplitter` (600 tokens, 100 overlap)
3. **Embedding**: `all-MiniLM-L6-v2` (runs locally, no paid API)
4. **Storage**: ChromaDB per-tenant collections (`tenant-{id}`) with metadata (source_id, chunk_index, source_type)

#### 5.2 Inference Pipeline (Live Chat)

1. **Authenticate** request (session token for widget, JWT for staff)
2. **Persist** customer message to database (with PII redaction)
3. **Triage** intent (complaint/request/inquiry) via zero-temp Groq classification
4. **Escalation check** — if triggered, skip LLM, return handoff message, notify agents via WebSocket
5. **Retrieve** — embed query, search `tenant-{id}` ChromaDB collection, top-3 chunks
6. **Augment** — system prompt = brand tone + retrieved chunks + last 6 conversation turns
7. **Generate** — stream tokens via SSE to frontend
8. **Persist** AI response to messages table

---

### 6. Agentic Tool Calling (8 Mock Tools)

| Tool | Industry | Purpose |
|---|---|---|
| `verify_nuban_transaction_status` | Fintech | Check Nigerian bank transaction |
| `check_interbank_transfer_status` | Banking | NIBSS transfer status |
| `resolve_atm_pos_dispense_error` | Banking | POS/ATM failure resolution |
| `verify_account_tier_and_restrictions` | Banking | Account tier check |
| `track_nigerian_waybill_status` | Logistics | Package tracking |
| `fetch_prepaid_electricity_token` | Utilities | Electricity token fetch |
| `re_verify_telecom_data_bundle` | Telecom | Data bundle verification |
| `check_government_kyc_status` | KYC | Government ID verification |

All tools are **read-only** (safety constraint) and return mock data for demonstration.

---

### 7. Escalation System (DB-Driven Rule Engine)

#### 10 Default Preset Rules (E1–E10)

| Rule | Trigger | Action |
|---|---|---|
| E1 | Direct human request | Escalate |
| E2 | Frustration keywords ("useless bot", "ole", "thief") | Escalate |
| E3 | Money/legal threats ("stole my money", "EFCC", "police") | Escalate + HIGH priority |
| E4 | Refund demands | Escalate |
| E5 | Conversational loop (repeated messages) | Escalate |
| E6 | Repeated failed self-service | Escalate + flag KB gap |
| E7 | AI low confidence (refuses twice) | Escalate |
| E8 | Negative sentiment burst | Escalate |
| E9 | Security-sensitive content (card/OTP mentioned) | Escalate + audit |
| E10 | SLA timeout (no reply in N minutes) | Escalate + notify |

#### Key Features

- **Live propagation**: Owner edits a rule → next message honours it, no restart
- **Test console**: Owner pastes sample text, sees which rules fire
- **Nullification**: Once escalated, rules don't re-fire the same ticket
- **Custom rules**: Owners can create additional rules beyond presets
- **Condition builder**: keywords, sentiment, confidence, loops, PII, SLA timeout
- **Ordered evaluation**: Rules evaluated in owner-defined priority order

---

### 8. Real-Time System (WebSocket Event Bus)

| Channel | Subscribers | Events |
|---|---|---|
| `user.{id}` | That user | Own notifications, own ticket updates |
| `tenant.{id}` | Owner + agents | ticket_updated, settings_changed, escalation_rules_changed, agent_presence |
| `admin` | Super admin | tenant_status_changed, plan_changed, audit_created |
| `ticket.{id}` | Assignee + agents | Conversation events |

**Fallback**: If WebSocket fails (corporate proxy), falls back to polling `GET /api/events?since=<cursor>` every 10 seconds.

---

### 9. Multi-Channel Support

Backend adapters for multiple communication channels:

- **WhatsApp** (mock webhook, simulated incoming messages)
- **Telegram** (adapter scaffolded)
- **Email** (inbound parsing + outbound SMTP/SendGrid)
- **SMS** (Twilio adapter scaffolded)
- **Web Widget** (primary channel, SSE for AI + WebSocket for human handoff)

---

### 10. Security Implementation

- **Authentication**: JWT HS256 (15-min access + 7-day refresh tokens, bcrypt password hashing)
- **RBAC**: 4-tier role system enforced server-side on every route
- **Tenant Isolation**: Every SQL query filters by `tenant_id`; every vector search targets `tenant-{id}` collections
- **PII Redaction**: Cards, BVN/NIN, phone numbers redacted before storage and LLM calls
- **Rate Limiting**: Redis-backed (10/min auth, 30/min chat, 5/min ingestion, 120/min tickets)
- **Audit Logging**: Every admin and destructive owner action logged with actor, action, before/after state
- **Impersonation**: Short-lived (30 min), scoped, audited, with visible red banner
- **UUID Primary Keys**: No enumerable sequential IDs
- **CORS**: Restricted to frontend origin
- **Error Envelope**: Never leaks stack traces or internal details
- **Input Validation**: Pydantic schemas on every endpoint
- **Webhook Security**: Shared-secret header check

---

### 11. Design System (v4.0)

A comprehensive design specification covering:

- **6 Design Principles**: Calm tool, green for action, density is respect, every number has context, widget as conversation surface, restraint builds trust
- **Color System**: 20+ semantic tokens (primary `#00a86b`, danger, warning, info, violet)
- **Typography**: Inter with explicit weight/size/leading hierarchy, tabular numerals for KPIs
- **Component Library**: Buttons, inputs, modals, tables, pills/badges, avatars, charts, chat bubbles
- **Layout**: Topbar + 236px sidebar + main area; 3-pane inbox (queue | conversation | context rail)
- **Motion**: 150ms hover, 220ms pop, typing dots, skeleton shimmer
- **Accessibility**: WCAG 2.2 AA baseline
- **Forbidden Defaults**: Purple gradients, Inter without hierarchy, centered heroes, identical icon cards, excessive shadows

---

### 12. Prototype

A clickable HTML prototype demonstrating all major surfaces:

- `index.html` — Multi-page prototype with all UI surfaces
- `app.js` — Application logic (mock data, routing, interactions)
- `data.js` — Pre-seeded dataset with realistic Nigerian business data
- `styles.css` — Complete design system implementation
- `icons.js` — SVG icon set (60+ icons)

---

### 13. Competitive Analysis & Industry Parity

| Area | Competitor Reference | Implementation |
|---|---|---|
| Inbox | Zendesk, Chatwoot | 3-pane layout: queue + conversation + context rail |
| Handover | Gorgias | In-thread AI handover summary banner |
| Queue | Zendesk | SLA pills, unread dots, priority/status pills |
| Composer | Zendesk, Intercom | Canned responses, internal notes |
| Help Center | Freshdesk, Intercom | KB search + articles + reactions + My Tickets + reopen |
| Widget Teaser | Intercom | Proactive message card, once per session |
| Typing | Intercom, Conferbot | Typing indicator (~900ms before AI reply) |
| Quick Replies | Intercom | Choice chips in widget |
| CSAT | Zendesk, Intercom | 1–5 star rating after resolution |
| Mobile | Conferbot | Full-screen widget under 700px |

---

### 14. Key Academic Differentiators

1. **DB-Driven Escalation Rules with Live Propagation** — Owner edits a rule → next message honours it, no restart
2. **Realtime Event Bus** — Settings/rules/tickets push to every dashboard instantly via WebSocket
3. **4-Tier RBAC** — Super Admin → Owner → Agent → Customer with full capability matrix
4. **Per-Tenant Vector Isolation** — Complete data separation between businesses in ChromaDB
5. **Local Embeddings** — `all-MiniLM-L6-v2` runs offline (data sovereignty argument for Nigerian context)
6. **Read-Only Agentic Tools** — Safety constraint on AI actions (cannot mutate money/balances)
7. **Nigerian Market Localization** — Pidgin support, local mock tools (Paystack, GIG Logistics, NIBSS)
8. **Industry-Standard KPIs** — FCR (70-80%), escalation rate (8-15%), FRT (1-5 min), deflection (30-50%)
9. **Competitor Parity** — 3-pane inbox, help center, proactive teaser, CSAT, typing indicator, SLA tracking
10. **Full Audit Trail** — Every admin action logged with before/after state for compliance
11. **Scoped Impersonation** — Super admin can temporarily view as any tenant owner (30-min limit, audited)
12. **Mock Subscription & Quota System** — Demonstrates SaaS business model understanding

---

### 15. Thesis Mapping

| Thesis Chapter | Source in Project |
|---|---|
| Chapter 1–3 (Intro/Literature/Design) | Project overview, architecture, design spec |
| Chapter 4 (System Implementation & Testing) | Backend/frontend code, API endpoints, RAG pipeline |
| Chapter 5 (Security/Compliance) | Security checklist, PII redaction, RBAC, audit logging, NDPA framing |
| Chapter 6 (Evaluation) | Test suite (pytest), Ragas metrics, latency data, KPI benchmarks |
| Chapter 7 (Conclusion & Future Work) | Gaps: live WhatsApp, real banking APIs, fine-tuning, multi-language voice |

---

### 16. Defense Talking Points

- **Data Sovereignty**: Local embeddings mean sensitive Nigerian business data never leaves the country
- **Deterministic Triage + Escalation**: E1–E10 catalogue with agent routing — auditable, configurable
- **Live Rule Propagation**: Owner edits a rule → next message honours it, no restart — a demo competitor tools can't trivially match
- **Realtime Event Bus**: Settings/rule/tenant/ticket changes push to every dashboard instantly
- **Read-Only Agent Safety**: AI may inspect data, never mutate money/balances
- **Cost Modelling**: Deflection rate × ₦2,500 per resolved ticket = estimated savings
- **Competitor Parity**: Matches Zendesk, Intercom, Freshdesk, Gorgias features in a unified platform

---

### 17. Phased Build Order

| Phase | Scope |
|---|---|
| 0 | Repo structure, requirements, env config, app factory |
| 1 | DB models + seeding (super admin, plans, audit) |
| 2 | Auth: login/refresh/logout/reset/accept-invite + RBAC |
| 3 | Middleware: errors, rate limiting, PII, logging, CORS, audit |
| 4 | Ingestion: link + PDF + text → ChromaDB isolation |
| 5 | RAG chat endpoint (SSE) + memory injection |
| 6 | Agentic tools + triage + escalation rules (DB-driven, E1–E10) |
| 7 | Ticketing + assignment + notes + WebSocket + presence |
| 8 | Agent management (invite/accept/toggle) |
| 9 | Realtime event bus + escalation rule endpoints |
| 10 | Analytics API + frontend dashboards |
| 11 | Super Admin console |
| 12 | Billing & quotas |
| 13 | Full frontend (landing, auth, admin, dashboard, portal, widget) |
| 13a | Prototype parity pass (3-pane inbox, help center, widget features) |
| 14 | Webhooks + email service |
| 15 | Hardening pass |
| 16 | Ragas eval + thesis screenshots + defense prep |
