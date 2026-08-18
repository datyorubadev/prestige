# Multi-Tenant AI Customer Support Portal — Implementation Guide

**Version:** 3.4 (authoritative spec — supersedes `Final Year Project Work.md`)

**v3 changes:** 4-role RBAC (Super Admin / Owner / Agent / Customer), agent management & live takeover, full escalation case catalogue, mock subscription & quotas, audit logging, impersonation, platform analytics, and a refresh to the current framework versions (Next.js 16, Tailwind 4, FastAPI 0.14x, langchain-groq 1.x, chromadb 1.x, groq SDK 1.x).

**v3.1 changes:** escalation rules moved from hardcoded constants to a **DB-driven rule engine** with a condition builder + "test against sample text" console (owner-managed, dynamic); a **realtime event bus** (`WS /ws/events`) so settings, rule, tenant-status, ticket, presence, and billing changes propagate live to every connected dashboard; a **clickable HTML prototype** (`prototype/`) showing the super admin, owner, and agent surfaces; plus competitor-informed upgrades: agent-assist after handoff, SLA-timeout escalation, rule nullification, and a shared-inbox queue. Default escalation presets remain E1–E10 and are seeded per tenant.

**v3.2 changes (competitor-informed enrichment):** inbox upgraded to a **Zendesk/Chatwoot-style 3-pane layout** (queue | conversation | context rail) with SLA tags, unread dots, a Gorgias-style in-thread **AI handover summary**, private notes, and a KB search in the context rail; the public portal became a **help center** (searchable knowledge base with reactions + related articles, manual ticket form, and a **"My tickets" tracker with reopen**); the chat widget gained an **Intercom-style proactive teaser (once/session)**, **typing indicator**, **choice chips**, **CSAT rating on resolution**, and **full-screen mobile** under 700px; dashboards/billing/super-admin gained **FCR & escalation-rate KPIs**, agent leaderboards, **usage-vs-quota meters**, and filterable audit/tenant views. Prototype (`prototype/`) reflects all of it.

**v3.3 changes (full settings surface, mock-first):** the owner workspace gained a **tabbed Settings hub** (`/dashboard/settings`) — General, Brand & widget, Team, **Automations**, **SLA**, Notifications, **Channels**, **Webhooks**, **API keys** — and the super-admin console a matching **Platform Settings hub** (`/admin/settings`) — General, Plans & quotas, Feature flags, Automation presets, Security. Automation rules (triggers/conditions/ordered actions, run-now + scheduled tick) and **SLA policies** (per-priority targets, business hours, escalations, breach counts) are runtime engines wired into ticket mutations over the shared `mockDb` bus; webhooks carry a **delivery log + test**; API keys expose a **one-time secret + revoke**; notification prefs persist per user. Escalation presets are now **immutable versioned snapshots** (snapshot/restore, audit-recorded) surfaced on both the admin hub and the escalation-rules page; agents gained a real **Manage panel** (pause/activate + resend invite) and invoices download as files. Legacy single-page admin `PlatformSettings` was retired.

**v3.4 changes (conversation UX polish, competitor-informed):** both composers now use a shared **auto-growing textarea** (Zendesk/Intercom behaviour — grows 1→N rows, then scrolls internally) with **paperclip attachments** (image thumbnails / file chips with size, mock transport persists them on the ticket) and an **emoji picker** popover — in the customer widget and in the agent reply/note composers. **Internal notes are now editable and deletable** (Intercom "Edit your notes"): inline textarea save with an "Edited" marker, author attribution, and ConfirmModal-gated delete — in both the thread (`conversation-pane.tsx` `NoteBubble`) and the context-rail Notes tab (`RailNote`); notes are stable by message `id` and routed through `mockDb.updateTicket`. The widget's **AI→human handoff** gained an explicit lifecycle (connecting banner + header status + disabled composer until the WS agent joins) and the WS transport now carries attachments end-to-end. The context rail's Customer tab shows richer past-ticket cards (id · date · status, repeat-contact count).

This document is the single source of truth for building the project. The earlier file (`Final Year Project Work.md`) is treated as **historical research only**; its code samples contain bugs, missing modules, and architectural gaps. Where they conflict, **this guide wins**.

---

## §0. How to Use This Guide

| Symbol | Meaning |
| :--- | :--- |
| **SPEC** | A requirement, data contract, or behavior that MUST be implemented as described. |
| **CODE** | A minimal, working code skeleton you must adapt, not copy verbatim. |
| **⚠️ FIX** | A correction to a bug/gap in the original design. Do not reintroduce the old behaviour. |

**Build order:** Follow §13 strictly. Each phase ends with a verification command. Do not start a later phase until the current one passes.

**Key principles repeated throughout:**
1. **Decoupled architecture** — `/backend` (FastAPI) and `/frontend` (Next.js) are completely separate folders.
2. **UUIDv4 primary keys everywhere** — never sequential integers.
3. **Absolute tenant isolation** — every SQL query filters by `tenant_id`; every vector search targets `tenant-{id}` ChromaDB collection.
4. **Local embeddings** — `all-MiniLM-L6-v2` runs offline; no paid embedding API.
5. **Read-only tools** — the AI may inspect data, never mutate money/balances.

---

## §1. Project Overview

A **Multi-Tenant SaaS Customer Support Portal** for the Nigerian market. Any business (fintech, logistics, utility, telecom) is provisioned by a **Super Admin**, uploads its knowledge base (links/PDFs/text), and gets an isolated AI agent that answers customers on a chat widget, triages complaints, escalates to live agents, and reports analytics — all in one platform.

### 1.0 Role Hierarchy & Access Model (4-tier RBAC)

```
SUPER_ADMIN (platform)              manages the WHOLE app: provisions owners/tenants,
        │                           approves, suspends, quotas, audits, impersonates
        ▼
OWNER (tenant = a business)         NairaWave, GidiExpress, ... owns brand, knowledge,
        │                           agents, billing, tenant analytics
        ▼
AGENT (tenant staff)                answers tickets, takes over escalated chats, notes,
        │                           presence (online/offline), assignment
        ▼
CUSTOMER (end user)                 opens tickets, chats with AI/agent, tracks own tickets
```

**Capability matrix:**

| Capability | Super Admin | Owner | Agent | Customer |
| :--- | :---: | :---: | :---: | :---: |
| Create/approve/suspend/delete tenants (owners) | ✅ | — | — | — |
| Platform-wide analytics (all tenants) | ✅ | — | — | — |
| Manage plans/subscriptions/quotas | ✅ | view own | — | — |
| View audit logs | ✅ | own-tenant | — | — |
| Impersonate a tenant (scoped, audited) | ✅ | — | — | — |
| Brand settings (bot name, tone, colors, widget) | — | ✅ | — | — |
| Invite/manage agents, assign tickets | — | ✅ | — | — |
| Manage knowledge base (upload/delete) | — | ✅ | view sources | — |
| Tenant analytics | — | ✅ | limited | — |
| Answer tickets / take over chat / internal notes | — | ✅ | ✅ | — |
| Resolve/close tickets | — | ✅ | ✅ | — |
| Open & track own tickets, chat | — | — | — | ✅ |

> **Access rules:** every tenant-scoped route resolves `tenant_id` from the JWT (never from the client body/query). Super Admin has `tenant_id = null` and only reaches tenant data through explicit admin/impersonation endpoints (§5.16).

**Surface model (final):**

```
PUBLIC        / , /login, /forgot-password, /accept-invite, /register?tenant=, /chat/[tenantId]
CUSTOMER      /portal/[tenantId] (+ /inbox)        ← login-gated, role=customer
STAFF         /dashboard/*                          ← owner/agent workspace
SUPER_ADMIN   /admin/*                              ← platform console only
```

Staff are **invite-only** (§5.2); customers **self-register** on `/register?tenant=`. A customer's guest chat history (captured at `/chat/[tenantId]` under their email) is bound to the account automatically when they sign up — tickets are keyed by email, so "My tickets" includes every pre-registration conversation.

### 1.1 Tech Stack (final — current versions, verified Aug 2026)

| Layer | Technology | Role |
| :--- | :--- | :--- |
| Frontend | Next.js 16 (App Router, TypeScript, React 19), Tailwind CSS v4 | Landing, super-admin console, business dashboard, customer portal, chat widget |
| Backend | FastAPI 0.141 (Python 3.11–3.13), Uvicorn | All APIs, auth, ingestion, orchestration |
| LLM | Groq API — chat model + `whisper-large-v3-turbo` (STT) | Inference, triage, summaries, tool calling |
| RAG framework | LangGraph + LangChain (`langgraph`, `langgraph-checkpoint-redis`, `langchain-groq` ≥1.1) | Agentic graph: retrieve → route → tools → generate, HITL interrupts |
| Vector DB | ChromaDB ≥1.5 (local) + `all-MiniLM-L6-v2` | Semantic retrieval, per-tenant collections |
| Relational DB | SQLite (dev) / PostgreSQL (prod), SQLAlchemy ≥2.0 | Tenants, users, customers, tickets, messages, subscriptions, audit logs |
| Cache/Limits | Redis | Rate-limit counters, refresh-token blacklist, agent presence |
| Email | SendGrid SMTP (mock fallback) | Ticket confirmations, password reset, agent alerts |
| Charts | Recharts | Analytics dashboards (tenant + platform) |
| Real-time | FastAPI WebSockets | Human handoff / live chat override / presence |
| API docs | FastAPI auto `/docs` | Built-in Swagger for thesis screenshots |

> ⚠️ **Version discipline:** Verify exact package versions at install time (`pip index versions <pkg>`, `npm view <pkg> version`). Do not hardcode model IDs — see §3 row 1. Groq now uses namespaced IDs (e.g. `meta-llama/llama-4-*`); confirm with `groq.models.list()`.

### 1.2 Repository Structure (corrected)

```
prestige/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app factory, routers, middleware
│   │   ├── config.py             # Settings from .env (pydantic-settings)
│   │   ├── database.py           # Engine + SessionLocal + Base
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── tenant.py
│   │   │   ├── user.py
│   │   │   ├── customer.py
│   │   │   ├── knowledge.py
│   │   │   ├── ticket.py
│   │   │   ├── message.py
│   │   │   ├── billing.py        # plans + subscriptions
│   │   │   ├── audit.py          # audit_logs
│   │   │   ├── invite.py         # invites (owner/agent)
│   │   │   └── notification.py
│   │   ├── schemas/              # Pydantic request/response models
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── admin.py          # super admin console
│   │   │   ├── agents.py         # agent management + assignment
│   │   │   ├── billing.py        # plans/subscriptions/quotas
│   │   │   ├── tenants.py
│   │   │   ├── escalation.py     # v3.1: rule CRUD + test console
│   │   │   ├── customers.py
│   │   │   ├── tickets.py
│   │   │   ├── knowledge.py
│   │   │   ├── chat.py
│   │   │   ├── analytics.py
│   │   │   ├── webhooks.py
│   │   │   ├── events.py         # v3.1: event history cursor for polling fallback
│   │   │   └── ws.py
│   │   ├── core/
│   │   │   ├── security.py       # JWT, hashing, RBAC dependencies
│   │   │   ├── errors.py         # Exception handlers + error envelope
│   │   │   ├── rate_limit.py     # Redis limiter
│   │   │   ├── pii.py            # PII redaction middleware
│   │   │   ├── audit.py          # audit wrapper (log admin/owner actions)
│   │   │   ├── presence.py       # agent online/offline (Redis)
│   │   │   ├── realtime.py       # v3.1: event bus hub + channel permissions
│   │   │   └── logging.py
│   │   └── services/
│   │       ├── embedding.py      # ChromaDB client + local embeddings
│   │       ├── ingestion.py      # scraper + pdf + text → chunks
│   │       ├── retriever.py      # RAG retrieval (fixed)
│   │       ├── agent_copilot.py  # tool-calling agent
│   │       ├── triage.py         # intent classification
│   │       ├── escalation.py     # v3.1: DB-driven rule engine + routing
│   │       ├── subscriptions.py  # plan/quota enforcement
│   │       ├── email_service.py
│   │       └── mock_tools/       # banking, logistics, utilities, telecom, kyc
│   ├── tests/
│   ├── scripts/
│   │   ├── db_setup.py           # create + seed
│   │   └── download_model.py     # pre-download embeddings
│   ├── chroma_data/              # generated (gitignored)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx                 # Landing
    │   │   ├── (auth)/login, register, forgot-password, accept-invite
    │   │   ├── admin/                   # SUPER ADMIN ONLY (protected)
    │   │   │   ├── page.tsx             # platform analytics + tenant table
    │   │   │   ├── tenants/page.tsx     # create/approve/suspend tenants
    │   │   │   ├── billing/page.tsx     # plan management (all tenants)
    │   │   │   └── audit/page.tsx       # audit log viewer
│   │   ├── dashboard/               # owner/agent (protected)
│   │   │   ├── page.tsx             # analytics
│   │   │   ├── upload/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   ├── escalation/page.tsx  # v3.1: rule builder + test console
│   │   │   ├── agents/page.tsx      # owner: invite/manage agents
│   │   │   ├── billing/page.tsx     # owner: plan + invoices
│   │   │   └── tickets/page.tsx
    │   │   ├── portal/[tenantId]/       # customer ticket form
    │   │   └── chat/[tenantId]/page.tsx # chat widget
    │   ├── components/
    │   │   └── ImpersonationBanner.tsx  # red "viewing as..." strip
    │   ├── hooks/               # useAuth, useStreamingChat, useWebSocketChat, usePresence
    │   ├── lib/                 # api client, types, utils, guards (requireRole)
    │   └── middleware.ts        # route guards (auth redirect, role checks)
    ├── .env.local.example
    └── package.json
```

---

## §2. Architecture & Data Flow

### 2.1 Corrected High-Level Flow

```
                 ┌───────────────────────────────┐
                 │         Next.js Frontend       │
                 │  Landing │ Admin │ Dashboard │ │
                 │  Portal  │ Chat Widget         │
                 └──────┬────────────────────────┘
                        │ HTTPS / SSE / WebSocket
                        ▼
              ┌───────────────────────┐
              │     FastAPI Backend    │
              │  Auth │ Rate Limit │ PII │
              │  RBAC │ Triage │ Escalation │
              │  Super Admin │ Billing │
              └──┬──────────┬──────────┘
                 │          │
        ┌────────▼──┐  ┌────▼──────────────┐
        │  SQLite/  │  │  ChromaDB (local) │
        │PostgreSQL │  │ tenant-{id} colls │
        │ + audit   │  └───────────────────┘
        └───────────┘
                 │
                 ▼
        ┌──────────────────┐
        │      Groq API    │  chat model (namespaced ID)
        │      + Redis     │  whisper-large-v3-turbo (voice)
        │      + SendGrid  │  rate-limits, presence, blacklist
        └──────────────────┘
```

### 2.2 The Fixed RAG Loop (the gap in the original design)

**SPEC — the chat endpoint MUST execute this exact sequence:**

1. **Authenticate** the request (public widget = anonymous customer with a session token; must still resolve/validate `tenant_id`).
2. **Persist** the customer message to `messages` table (tied to the ticket).
3. **Triage** the intent (`complaint` / `request` / `inquiry`) at low temperature.
4. **Escalation check** — if triggered, skip the LLM, return handoff message, bump ticket priority, notify agents via WebSocket.
5. **Retrieve** — embed the query, search the `tenant-{id}` ChromaDB collection, take top-K (3) chunks. ⚠️ This step was **missing** in the original `agent_copilot` flow.
6. **Augment** — build the system prompt = brand tone (`tenant.brand_tone`) + retrieved chunks + last N conversation turns from the `messages` table.
7. **Generate** — stream tokens via SSE to the frontend.
8. **Persist** the AI response to `messages`.

### 2.3 Multi-Tenant Isolation (non-negotiable)

| Store | Isolation mechanism |
| :--- | :--- |
| SQL | Every row carries `tenant_id`; every query filters on it. |
| Vector DB | One ChromaDB collection per tenant named `tenant-{tenant_id}` (sanitized ≤63 chars). |
| Auth | JWT subject = user id; role + tenant resolved from DB server-side, never trusted from client. |
| Webhooks | Phone-number → tenant mapping table before any message is routed. |

### 2.4 Streaming: SSE vs WebSocket — when to use which

| Channel | Use for | Why |
| :--- | :--- | :--- |
| **SSE** (`text/event-stream`) | AI token streaming in the chat widget | One-way server→client, HTTP-friendly, auto-reconnect friendly, works through proxies; ideal for LLM output. |
| **WebSocket — chat** (`WS /ws/chat/{ticket_id}`) | Live human handoff + agent↔customer live chat | Persistent duplex channel; only needed once a human joins the conversation. |
| **WebSocket — event bus** (`WS /ws/events` ⚠️**NEW v3.1**) | Realtime dashboard sync: settings, escalation rules, tenant status, tickets, presence, notifications, billing | One authenticated socket per logged-in user; server pushes typed events to the channels they may see (§5.9). |

⚠️ **FIX:** The original design mixed streaming designs (StreamingResponse + JSON fetch + WebSocket). Rule: **AI answers stream over SSE. Human conversations run over the chat WebSocket. Dashboard/state changes run over the event bus. They are separate channels.**

---

## §3. External Services & Connections

**SPEC — connect to exactly these services. Free-tier/local versions are sufficient.**

| # | Service | Purpose | Credential / Config | Free-tier notes |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Groq API** | Chat LLM + STT | `GROQ_API_KEY` | Generous free tier. ⚠️ **FIX:** Groq now exposes namespaced model IDs (e.g. `meta-llama/llama-4-*`). Set the model via `GROQ_CHAT_MODEL` and verify with `groq.models.list()`. STT: `whisper-large-v3-turbo` via `client.audio.transcriptions.create()`. |
| 2 | **ChromaDB ≥1.5** | Local vector store | none (local folder `chroma_data/`) | Fully offline. `chromadb.PersistentClient(path=...)`. |
| 3 | **all-MiniLM-L6-v2** | Embeddings | downloaded once via Hugging Face → local cache | Offline after first download. See `scripts/download_model.py`. |
| 4 | **SQLite** | Relational DB (dev) | file `backend/support_portal.db` | Zero setup. |
| 5 | **PostgreSQL** | Relational DB (prod/optional) | `DATABASE_URL` | Use only with Docker (§11). |
| 6 | **Redis** | Rate-limit counters, refresh-token blacklist, agent presence | `REDIS_URL` | Use `redis` (sync) or `redis.asyncio`. If unavailable locally, run via Docker or fall back to in-memory for dev — document the fallback. |
| 7 | **SendGrid / SMTP** | Transactional email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` | Mock fallback: log email to console when `EMAIL_MOCK=true`. |
| 8 | **WhatsApp (mock)** | Multi-channel demo | none | ⚠️ FIX: do NOT attempt live Meta API. Implement a mock webhook endpoint (§5.11). |

### 3.1 Environment Variables (`.env.example`)

```env
# --- Core ---
ENVIRONMENT=development
SECRET_KEY=change-me-strong-random-64-chars
DATABASE_URL=sqlite:///./support_portal.db
CORS_ORIGINS=http://localhost:3000

# --- Auth ---
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
ALGORITHM=HS256

# --- Groq ---
GROQ_API_KEY=your_groq_key
# Verify the exact namespaced model ID at build time: groq.models.list()
GROQ_CHAT_MODEL=meta-llama/llama-3.3-70b-versatile
GROQ_STT_MODEL=whisper-large-v3-turbo

# --- Vector DB ---
CHROMA_DATA_DIR=./chroma_data
EMBEDDING_MODEL=all-MiniLM-L6-v2
RAG_TOP_K=3

# --- Redis ---
REDIS_URL=redis://localhost:6379/0

# --- Email ---
EMAIL_MOCK=true
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@portal.ng

# --- Rate limiting ---
RATE_LIMIT_AUTH_PER_MIN=10
RATE_LIMIT_CHAT_PER_MIN=30
RATE_LIMIT_INGEST_PER_MIN=5
RATE_LIMIT_ADMIN_PER_MIN=30

# --- Super Admin bootstrap (first-run seed) ---
SUPER_ADMIN_EMAIL=root@portal.ng
SUPER_ADMIN_PASSWORD=change-me-now

# --- Invites ---
INVITE_EXPIRE_DAYS=3

# --- Impersonation ---
IMPERSONATION_EXPIRE_MINUTES=30
```

---

## §4. Database Schema (corrected)

**SPEC — SQLAlchemy 2.0 declarative. All PKs are `String(36)` UUIDs. All timestamps UTC.**

### 4.1 Enums

```python
# app/models/common.py
class Role(str, Enum):
    SUPER_ADMIN = "super_admin"   # tenant_id = None
    OWNER = "owner"
    AGENT = "agent"
class TicketStatus(str, Enum): OPEN = "open"; IN_PROGRESS = "in_progress"; RESOLVED = "resolved"; CLOSED = "closed"
class TicketPriority(str, Enum): LOW = "low"; MEDIUM = "medium"; HIGH = "high"
class TicketType(str, Enum): COMPLAINT = "complaint"; REQUEST = "request"; INQUIRY = "inquiry"; UNCLASSIFIED = "unclassified"
class MessageSender(str, Enum): CUSTOMER = "customer"; AI_BOT = "ai_bot"; HUMAN_AGENT = "human_agent"; SYSTEM = "system"
class KnowledgeType(str, Enum): PDF = "pdf"; LINK = "link"; RAW_TEXT = "raw_text"
class TenantStatus(str, Enum): PENDING = "pending"; ACTIVE = "active"; SUSPENDED = "suspended"; TERMINATED = "terminated"
class SubscriptionStatus(str, Enum): TRIAL = "trial"; ACTIVE = "active"; PAST_DUE = "past_due"; CANCELED = "canceled"
class InviteRole(str, Enum): OWNER = "owner"; AGENT = "agent"
class NotificationType(str, Enum): ESCALATION = "escalation"; TICKET_ASSIGNED = "ticket_assigned"; NEW_REPLY = "new_reply"; SUSPENSION = "suspension"; SYSTEM = "system"
```

### 4.2 Tables

| Table | Key columns | Relationships |
| :--- | :--- | :--- |
| `tenants` | `id` (UUID PK), `business_name`, `email` (unique), `bot_name`, `brand_tone`, `primary_color`, `secondary_color` ⚠️**NEW**, `logo_url` ⚠️**NEW**, `welcome_message`, `widget_launcher_text` ⚠️**NEW**, `widget_position` ⚠️**NEW**, `escalation_message` ⚠️**NEW**, `status` ⚠️**NEW** (pending/active/suspended/terminated), `plan_tier` ⚠️**NEW**, `max_agents` ⚠️**NEW**, `max_customers` ⚠️**NEW**, `kb_quota_mb` ⚠️**NEW**, `onboarded_at` ⚠️**NEW**, `suspended_at` ⚠️**NEW**, `created_at` | `users`, `customers`, `knowledge_sources`, `tickets`, `subscription` |
| `users` | `id`, `tenant_id` (FK, **nullable** ⚠️ — `null` for super admin), `email` (unique), `password_hash`, `full_name`, `role` (super_admin/owner/agent), `is_active`, `last_seen` ⚠️**NEW** (presence), `created_at` | `tenant`; used by auth |
| `customers` | `id`, `tenant_id` (FK), `email`, `phone_number`, `account_number`, `full_name`, `created_at` | `tenant`; `tickets` |
| `knowledge_sources` | `id`, `tenant_id` (FK), `source_type` (pdf/link/raw_text), `source_name`, `vector_collection_id`, `chunk_count`, `created_at` | `tenant` |
| `tickets` | `id`, `tenant_id` (FK), `customer_id` (FK) ⚠️**FIXED** (was missing), `assignee_id` ⚠️**NEW** (FK `users.id`, nullable), `escalated_at` ⚠️**NEW**, `subject`, `channel`, `status`, `priority`, `ticket_type`, `ai_summary`, `ai_sentiment`, `created_at`, `updated_at` | `tenant`, `customer`, `assignee`, `messages` |
| `messages` | `id`, `ticket_id` (FK), `sender_type`, `message_text`, `metadata_payload` (JSON), `timestamp` | `ticket` |
| `refresh_tokens` | `id` (UUID), `user_id` (FK), `token_hash`, `expires_at`, `revoked` (bool), `created_at` | `user`; enables logout + Redis blacklist |
| `plans` ⚠️**NEW** | `id` (UUID), `code` (unique: starter/pro/enterprise), `name`, `price_ngn`, `max_agents`, `max_customers`, `kb_quota_mb`, `features` (JSON), `created_at` | `subscriptions` |
| `subscriptions` ⚠️**NEW** | `id` (UUID), `tenant_id` (FK, unique), `plan_id` (FK), `status` (trial/active/past_due/canceled), `started_at`, `next_billing_at`, `payment_method` (mock: 'card_mock'), `canceled_at` | `tenant`, `plan` |
| `audit_logs` ⚠️**NEW** | `id` (UUID), `actor_id` (FK users, nullable), `actor_role`, `action` (create_tenant, suspend_tenant, impersonate, ...), `tenant_id` (FK, nullable), `target_type`, `target_id`, `before` (JSON), `after` (JSON), `ip`, `request_id`, `created_at` | — |
| `invites` ⚠️**NEW** | `id` (UUID), `tenant_id` (FK, nullable — null = owner invite), `email`, `role` (owner/agent), `token_hash`, `expires_at`, `used_at`, `created_by` (FK users), `created_at` | `tenant`, `creator` |
| `notifications` ⚠️**NEW** | `id` (UUID), `user_id` (FK), `type`, `payload` (JSON), `read_at`, `created_at` | `user` |
| `escalation_rules` ⚠️**NEW v3.1** | `id` (UUID), `tenant_id` (FK, nullable — null = platform preset), `name`, `description`, `condition` (JSON — condition builder, see §5.7), `action` (JSON — escalate/priority/route/notify/halt_ai), `enabled` (bool), `is_preset` (bool — seeded E1–E10, can be edited/disabled but re-seedable), `order` (int, evaluation priority), `trigger_count` (int, analytics), `created_at`, `updated_at` | `tenant`; evaluated by `services/escalation.py` |

### 4.3 Corrected `ticket.py` skeleton (shows the fixed customer relationship)

```python
class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    assignee_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    channel: Mapped[str] = mapped_column(String(50), default="widget")
    status: Mapped[TicketStatus] = mapped_column(Enum(TicketStatus), default=TicketStatus.OPEN)
    priority: Mapped[TicketPriority] = mapped_column(Enum(TicketPriority), default=TicketPriority.LOW)
    ticket_type: Mapped[TicketType] = mapped_column(Enum(TicketType), default=TicketType.UNCLASSIFIED)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_sentiment: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=..., onupdate=...)

    tenant: Mapped["Tenant"] = relationship(back_populates="tickets")
    customer: Mapped["Customer | None"] = relationship(back_populates="tickets")   # ⚠️ FIX
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assignee_id])
    messages: Mapped[list["Message"]] = relationship(back_populates="ticket", cascade="all, delete-orphan")
```

> Note for SQLite: store timestamps naive (`datetime.utcnow`) or convert on read; SQLite does not store tz info.

### 4.4 Seeding (`scripts/db_setup.py`)

Seed at minimum:
- **1 super admin** (from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`, role `super_admin`, `tenant_id = None`).
- **3 plans**: Starter / Pro / Enterprise (prices + quotas in `plans` table).
- **2 tenants**: `NairaWave Fintech` (empathetic/professional tone, status ACTIVE, Pro plan), `GidiExpress Logistics` (Pidgin tone, status ACTIVE, Starter plan) + 1 **pending** tenant (to demo approval).
- **1 owner + 1 agent user** per active tenant (bcrypt-hashed passwords).
- **2 customers** (e.g., `Tunde Bakare` / `0123456789`, `Amina Bello`).
- **2 knowledge sources** + **2 tickets** (one with `assignee_id` set, one escalated) with message history.
- A couple of `audit_logs` rows to prove the trail works.

**v3.2 seeding additions** (mirrored by `prototype/data.js`):
- **KB articles** (`kb_articles`): 7–10 per tenant with `views` + `helpful` % so the help-center list and "helpful?" reactions have data to render.
- **Canned responses** (`canned_responses`): `/refund`, `/transfer`, `/apology`, `/escalate`, `/close` — inserted via the `/` shortcut or the composer's `+` menu.
- **Past tickets** per customer email (`past_tickets`): resolved rows so the portal "My tickets" tracker can filter by the entered email and offer **Reopen**.
- **SLA + unread flags** on seeded tickets (e.g. `sla_seconds_left`, `unread`) so the queue shows SLA pills and unread dots on first open.
- **Agent 30-day stats** (`resolutions_30d`, `csat_avg`) and **tenant volume** (`tickets_30d`) for the leaderboard and super-admin volume rankings.

Verification: `python scripts/db_setup.py` then inspect tables via `sqlite3 support_portal.db ".tables"`.

---

## §5. Backend Implementation

### 5.1 Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**`requirements.txt`** (pin loosely; re-verify versions during implementation — see §1.1):

```
fastapi[standard]>=0.141
uvicorn[standard]
sqlalchemy>=2.0.51
pydantic>=2
pydantic-settings
python-multipart
bcrypt>=4
PyJWT
langchain
langchain-groq>=1.1
langchain-text-splitters
langgraph
langgraph-checkpoint
langgraph-checkpoint-redis
chromadb>=1.5
sentence-transformers
beautifulsoup4
requests
pypdf
redis
slowapi
httpx
python-dotenv
pytest
pytest-asyncio
```

**CODE — `app/main.py` (factory pattern, mounts everything later):**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.errors import install_exception_handlers
from app.core.rate_limit import install_rate_limiter
from app.core.logging import setup_logging

def create_app() -> FastAPI:
    app = FastAPI(title="Multi-Tenant AI Support Portal")
    app.add_middleware(CORSMiddleware,
        allow_origins=settings.cors_origins,   # ⚠️ FIX: not "*"
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"])
    setup_logging(app)
    install_rate_limiter(app)
    install_exception_handlers(app)
    # routers added in later phases
    return app

app = create_app()
```

---

### 5.2 Authentication & Authorization (Custom JWT + RBAC)

**SPEC — token model:**
- **Access token:** JWT HS256, 15 min expiry, claims: `sub` (user id), `tenant_id` (**nullable** — `null` for super admin), `role`, `type: "access"`, and optional `impersonator_id` (§5.16).
- **Refresh token:** random 64-char string, hashed (SHA-256) and stored in `refresh_tokens` table + Redis allow-list keyed by user; 7-day expiry. Rotated on every use.

**Endpoints**

| Method | Route | Body (Pydantic) | Returns |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/login` | `email, password` | `{access_token, refresh_token, user}` |
| POST | `/api/auth/refresh` | `{refresh_token}` | Rotated token pair. |
| POST | `/api/auth/logout` | `{refresh_token}` (auth) | Revokes refresh token. |
| POST | `/api/auth/forgot-password` | `{email}` | Sends reset email (mock fallback). |
| POST | `/api/auth/reset-password` | `{token, new_password}` | Sets new password. |
| POST | `/api/auth/accept-invite` ⚠️**NEW** | `{invite_token, password, full_name}` | Validates invite, creates owner or agent user, activates tenant, returns token pair. |

> ⚠️ **FIX:** No open **staff** self-registration. Owners/agents are **provisioned by the Super Admin** (§5.16) via an invite. **Customers DO self-register** on `POST /api/auth/register` (`{full_name, email, password, tenant_id}` → returns a token pair; auto-signs in; guest chat history binds by email). The old owner-facing `POST /api/auth/register` is replaced by invite-accept.

**CODE — `app/core/security.py`:**

```python
def create_access_token(user, tenant_id, impersonator_id=None) -> str:
    payload = {"sub": user.id, "tenant_id": tenant_id, "role": user.role.value,
               "type": "access", "exp": now + ACCESS_TOKEN_EXPIRE}
    if impersonator_id:
        payload["impersonator_id"] = impersonator_id
        payload["type"] = "impersonation"          # short-lived, audited
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")

def get_current_user(credentials=Depends(HTTPBearer())) -> User:
    # 1. decode JWT, verify type in ("access","impersonation"), check exp
    # 2. load user by sub, verify is_active
    # 3. return user (with .role and .tenant_id for authorization)

def require_roles(*roles: Role):
    def dep(user=Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(403, "Insufficient privileges")
        return user
    return dep

def require_super_admin(user=Depends(get_current_user)):
    if user.role != Role.SUPER_ADMIN:
        raise HTTPException(403, "Super admin only")
    return user
```

**Authorization matrix:**

| Action | Roles | Notes |
| :--- | :--- | :--- |
| Platform admin (tenants, plans, audit, impersonate) | **super_admin** | §5.16, `tenant_id = None` |
| View/manage analytics, settings, uploads | owner, agent | filtered by `user.tenant_id` |
| Invite/manage agents, assign tickets, billing | owner only | |
| View ticket queues, reply, resolve, internal notes | owner, agent | |
| Create tickets, chat | public (customer) | via `initialize-session`, no JWT needed |
| Webhooks (WhatsApp) | public (signature-checked) | §5.11 |

**⚠️ FIX — never hardcode `tenant_id` in the frontend.** The JWT carries it; the backend reads it from the token. Demo convenience constants are acceptable for the widget (public by design) but not for business routes.

---

### 5.3 Cross-Cutting Middleware

#### 5.3.1 Error Handling (envelope)

**SPEC — every error returns this JSON shape, and the frontend MUST parse it:**

```json
{ "error": { "code": "TICKET_NOT_FOUND", "message": "Ticket not found", "details": null } }
```

- 400 validation errors → `code: "VALIDATION_ERROR"` with field details.
- 401 → `"UNAUTHORIZED"`, 403 → `"FORBIDDEN"`, 404 → `"NOT_FOUND"`, 429 → `"RATE_LIMITED"`, 5xx → `"INTERNAL_ERROR"` (never leak internals/logs to client).
- Custom exceptions: `TenantNotFound`, `TicketNotFound`, `InsufficientPrivileges`, `InvalidCredentials`, `ResourceQuotaExceeded`, `InviteExpired`, `TenantNotActive`, `ImpersonationExpired`, `PlanDowngradeBlocked`.
- Install handlers for `RequestValidationError`, `HTTPException`, and a catch-all `Exception` (logs full trace, returns generic envelope).

#### 5.3.2 Rate Limiting (Redis-backed)

**SPEC — `slowapi` (or a custom Redis counter).**

| Scope | Limit | Endpoints |
| :--- | :--- | :--- |
| Per-IP | 10/min | auth login, register, refresh, forgot-password |
| Per-IP | 30/min | chat widget |
| Per-tenant | 5/min | knowledge ingestion (ingest-link, ingest-pdf) |
| Per-tenant | 120/min | ticket fetch/reply |

Return `Retry-After` header and `429` envelope. If Redis is down, fail-open in dev but log a warning (document this decision).

#### 5.3.3 PII Redaction (hooked into chat pipeline)

**CODE — `app/core/pii.py` (function exists in original but was NEVER wired in — ⚠️ FIX):**

```python
def redact_sensitive_pii(text: str) -> str:
    text = re.sub(r"\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b", "[CARD REDACTED]", text)
    text = re.sub(r"\b\d{11}\b", "[BVN REDACTED]", text)      # NIN/BVN are 11 digits
    text = re.sub(r"\b\d{10}\b", "[ACCOUNT REDACTED]", text)  # NUBAN
    text = re.sub(r"\b0(?:70|80|81|90|91)\d{8}\b", "[PHONE REDACTED]", text)
    return text
```

**Call it:** on every customer message *before* storing to `messages` and *before* sending to Groq. Keep the original? No — do not store raw PII in transcripts (§7).

#### 5.3.4 Logging & Request ID

- `structlog` or std `logging`; include `request_id` (UUID per request) in logs and in the error envelope `details.request_id` for support correlation.
- Never log passwords, tokens, or full card numbers.

---

### 5.4 Ingestion Pipeline

**Endpoints**

| Method | Route | Accepts | Behaviour |
| :--- | :--- | :--- | :--- |
| POST | `/api/knowledge/ingest-link` | `{tenant_id (auth), url}` | Scrape → clean → chunk → embed → ChromaDB `tenant-{id}` collection → insert `knowledge_sources` row. |
| POST | `/api/knowledge/ingest-pdf` ⚠️**NEW** | multipart `file` (PDF) | `pypdf`/LangChain `PyPDFLoader` → chunk → embed → store (same as above). |
| POST | `/api/knowledge/ingest-text` ⚠️**NEW** | `{content}` | Raw text chunking path. |
| GET | `/api/knowledge/sources` | — | List tenant's sources. |
| DELETE | `/api/knowledge/sources/{id}` | — | Delete source + its vectors. |

**CODE — chunking + vector storage (from original, kept correct):**

```python
text_splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=100)

def save_chunks_to_vector_db(tenant_id, source_id, chunks):
    collection = get_or_create_tenant_collection(tenant_id)   # name = tenant-{tenant_id}
    ids = [f"{source_id}-chunk-{i}" for i in range(len(chunks))]
    collection.add(documents=chunks,
                   metadatas=[{"tenant_id": tenant_id, "source_id": source_id}] * len(chunks),
                   ids=ids)
```

**Chunk metadata must include:** `tenant_id`, `source_id`, `chunk_index`, `source_type`, `source_name`.

**Verification:** run the offline test from `scripts/download_model.py` once, then ingest a small URL and confirm `chroma_data/` is populated.

---

### 5.5 RAG Chat Endpoint (the critical fix)

**Endpoint: POST `/api/chat`** (body: `{ticket_id, query}`) → **SSE** stream.

**CODE — retrieval + augmentation (was missing entirely):**

```python
# app/services/retriever.py
def retrieve_context(tenant_id, query, top_k=3) -> str:
    collection = chroma_client.get_collection(name=f"tenant-{tenant_id}",
                                              embedding_function=local_embedding_function)
    results = collection.query(query_texts=[query], n_results=top_k)
    docs = results.get("documents", [[]])[0]
    return "\n---\n".join(docs) if docs else ""

def build_memory_messages(ticket_id, db, limit=6) -> list[dict]:
    rows = db.query(Message).filter(Message.ticket_id == ticket_id)\
              .order_by(Message.timestamp.desc()).limit(limit).all()
    return [{"role": "user" if m.sender_type == MessageSender.CUSTOMER else "assistant",
             "content": m.message_text} for m in reversed(rows)]
```

**CODE — the chat router (streams over SSE):**

```python
@app.post("/api/chat")
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    ticket = get_ticket_or_404(request.ticket_id, db)
    # 1. persist + redact customer message
    customer_msg = Message(ticket_id=ticket.id, sender_type=CUSTOMER,
                           message_text=redact_sensitive_pii(request.query))
    db.add(customer_msg); db.commit()

    # 2. triage + escalation (see 5.7)
    ticket.ticket_type = triage_customer_intent(request.query)
    if evaluate_escalation_triggers(ticket, request.query, db):
        return JSONResponse({"response_by": "system_alert",
                             "message": "Transferring you to a human agent..."})

    # 3. RAG retrieval (the fix)
    context = retrieve_context(ticket.tenant_id, request.query)
    history = build_memory_messages(ticket.id, db)

    system_prompt = (
        f"You are {tenant.bot_name}. Tone: {tenant.brand_tone}. "
        "Answer ONLY using the context below. If unknown, say "
        "'Abeg, I don't have that information. Let me get an agent for you.'\n\n"
        f"CONTEXT:\n{context}"
    )

    llm = ChatGroq(model=settings.groq_chat_model, temperature=0.2)

    async def event_stream():
        async for chunk in llm.astream([{"role": "system", "content": system_prompt},
                                        *history,
                                        {"role": "user", "content": request.query}]):
            yield f"data: {json.dumps({'token': chunk.content})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

**SPEC — SSE contract for the frontend (§6):**
- Each frame: `data: {"token": "..."}\n\n`.
- Terminal frame: `data: {"done": true}\n\n` (may carry `"response_by": "ai"`).
- On error: `data: {"error": {"code": "...", "message": "..."}}\n\n`.
- **HITL frame:** when the LangGraph agent pauses for human approval, the stream ends with
  `data: {"done": true, "needs_approval": true, "approval_payload": {"type": "initiate_refund", "ticket_id", "tenant_id", "prompt", "customer_reply", "status": "pending"}}\n\n`.
  The `customer_reply` is streamed (and persisted) as the customer-facing "we're confirming" message.
- After stream ends, persist the full AI reply to `messages` server-side (aggregate tokens).
- Staff resume the paused graph via `POST /api/agent/assist/{ticket_id}/approve` `{"payload": {"approved": true}}` (RedisSaver checkpointer, `thread_id = ticket_id`).

**⚠️ FIX — conversation memory now works** because history is pulled from the `messages` table and injected into the prompt. Do not rely on a single-shot `[system, user]` call.

---

### 5.6 Agentic Tool Calling

**Tools (all read-only, all mocked):**

| Tool | Industry | Sample input |
| :--- | :--- | :--- |
| `verify_nuban_transaction_status(account_number)` | Fintech | `0123456789` |
| `check_interbank_transfer_status(session_id)` | Banking/NIBSS | 30-digit session ID |
| `resolve_atm_pos_dispense_error(card_pan_last4, tx_date)` | Banking | `4321` |
| `verify_account_tier_and_restrictions(account_number)` | Banking | `0123456789` |
| `track_nigerian_waybill_status(waybill_number)` | Logistics | `GIDI-992-ALERT` |
| `fetch_prepaid_electricity_token(meter_number)` | Utilities | `45012345678` |
| `re_verify_telecom_data_bundle(phone_number)` | Telecom | `08030001111` |
| `check_government_kyc_status(id_number, id_type)` | KYC | `22233344455`, `nin` |

**CODE — agent loop (kept from original, corrected):**

```python
@tool
def verify_nuban_transaction_status(account_number: str) -> str:
    """Queries the core ledger for a Nigerian 10-digit NUBAN account.
    Use whenever a customer complains about a missing transfer or failed POS debit."""
    return json.dumps(mock_ledger.get(str(account_number).strip(),
                      {"error": "Account not found in active transaction ledger."}))

def run_agentic_support_turn(ticket_id, user_query, tenant_id) -> str:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    llm = ChatGroq(model=settings.groq_chat_model, temperature=0.1)
    llm_with_tools = llm.bind_tools(ALL_TOOLS)
    ai_message = llm_with_tools.invoke([system_prompt, user_query])
    if ai_message.tool_calls:
        for call in ai_message.tool_calls:
            output = ALL_TOOLS_BY_NAME[call["name"]].invoke(call["args"])
            ai_message = llm_with_tools.invoke([... system_prompt, user_query,
                                                ai_message,
                                                {"role": "tool", "name": call["name"],
                                                 "tool_call_id": call["id"], "content": output}])
    return ai_message.content
```

**SPEC — the agent must be fused with RAG**, not replace it: retrieve context first, then let the agent decide whether a tool call is needed (e.g., a "where is my package?" query triggers retrieval AND `track_nigerian_waybill_status`).

---

### 5.7 Triage & Escalation (Dynamic Rule Engine) ⚠️ **v3.1 rewrite**

#### Triage (`app/services/triage.py`)
Zero-temperature Groq classification → `ticket_type`. Validate output against the three enums; fall back to `unclassified`. Wire into both ticket creation and chat.

#### Escalation (`app/services/escalation.py`) — DB-driven, not hardcoded

**SPEC — escalation is no longer a hardcoded keyword dict.** Rules live in the `escalation_rules` table. Every tenant is seeded with the E1–E10 presets below; the **owner** can reorder, edit, disable, delete, restore, or add rules from the dashboard (§6.2 `/dashboard/escalation`). The engine reads the DB on every message, so **a rule edit takes effect on the very next message** — no restart, no redeploy (this "live rule propagation" is a headline demo for the thesis).

**Default preset catalogue (seeded per tenant, `is_preset = true`):**

| # | Rule name | Condition | Action |
| :--- | :--- | :--- | :--- |
| E1 | Direct human request | `customer_request` | escalate |
| E2 | High-frustration phrases | `keywords`: "useless bot", "this bot is stupid", "wetin dey happen", "ole", "thief", "scam", "fraud" | escalate |
| E3 | Money/legal threat | `keywords`: "stole my money", "stolen", "sue", "lawyer", "CBN", "EFCC", "police", "report you" | escalate + `set_priority` HIGH |
| E4 | Refund / demands | `keywords`: "refund", "reverse my money", "give me my money back", "compensation" | escalate |
| E5 | Conversational loop | `conversation_loop` (last 2 customer messages identical, or ≥3 near-identical) | escalate |
| E6 | Repeated failed self-service | `repeat_failed_self_service` (same question ≥3× in session AND empty retrieval) | escalate + flag `kb_gap` |
| E7 | AI low confidence / "don't know" ×2 | `confidence_below` 0.5 (LLM refuses twice in a row) | escalate |
| E8 | Negative sentiment burst | `sentiment_negative` (2+ consecutive negative turns) | escalate |
| E9 | Security-sensitive content | `pii_security` (card / OTP / password mentioned, even redacted) | escalate + audit |
| E10 ⚠️**NEW v3.1** | SLA timeout | `sla_timeout` (open ticket, no reply in N minutes) | escalate + `notify` |

**SPEC — condition builder (what the owner configures):**

| Condition type | Payload | Notes |
| :--- | :--- | :--- |
| `customer_request` | — | "human / agent / manager / representative" family (LLM-backed phrase match). |
| `keywords` | `{match: "any"/"all", terms: ["...", "..."]}` | Substring match on customer text (lowercased). |
| `sentiment_negative` | `{turns: 2}` | Consecutive negative sentiment turns. |
| `confidence_below` | `{threshold: 0.5, consecutive: 2}` | LLM confidence floor. |
| `conversation_loop` | `{identical: 2, near_identical: 3}` | Repetition guard. |
| `repeat_failed_self_service` | `{times: 3, require_empty_context: true}` | KB gap detector. |
| `pii_security` | — | Redaction engine flag (§5.3.3) is reused as a trigger. |
| `sla_timeout` | `{minutes: 60}` | Time-based escalation (Zendesk-style automation). |

**SPEC — actions:**

| Action | Payload | Effect |
| :--- | :--- | :--- |
| `escalate` | — | `escalated_at = now`, notify assignee + broadcast. |
| `set_priority` | `{priority: "high"}` | Bump ticket priority. |
| `route_to` | `{role: "owner"}` | Optional explicit target (else §5.14 routing). |
| `notify` | `{user_ids: []}` | Create `notifications` rows + WS push. |
| `halt_ai` | — | Skip LLM, return handoff message (used by E1/E2/E3/E9). |

**Nullification rule (v3.1):** once a ticket has `escalated_at` set, rule evaluation short-circuits — a rule cannot re-fire the same ticket. This is the equivalent of Zendesk's nullification tag and prevents escalation loops. `trigger_count` still increments so analytics see every rule's activity.

**Endpoints (owner-managed, dynamic):**

| Method | Route | Notes |
| :--- | :--- | :--- |
| GET | `/api/tenants/me/escalation-rules` | Ordered list (enabled first, then `order`). |
| POST | `/api/tenants/me/escalation-rules` | Create custom rule. |
| PUT | `/api/tenants/me/escalation-rules/{id}` | Edit name/condition/action/`enabled`/`order`. Audited. |
| DELETE | `/api/tenants/me/escalation-rules/{id}` | Remove custom rule. Presets can be disabled but deletion prompts "Restore presets" instead. |
| POST | `/api/tenants/me/escalation-rules/{id}/toggle` | Enable/disable without full PUT. |
| POST | `/api/tenants/me/escalation-rules/test` | **Test console**: body `{text, ticket_context?}` → returns which rules fire + resulting actions. No DB write. |
| POST | `/api/tenants/me/escalation-rules/reset-presets` | Re-seed E1–E10 defaults (idempotent). Audited. |

**CODE — rule evaluation (DB-driven, no constants):**

```python
def evaluate_escalation_triggers(ticket, user_message, db) -> bool:
    if ticket.escalated_at:                      # nullification: already escalated
        return False
    rules = db.query(EscalationRule).filter(
        EscalationRule.tenant_id.in_([ticket.tenant_id, None]),  # None = platform default
        EscalationRule.enabled == True).order_by(EscalationRule.order).all()
    text = user_message.lower()
    recent = last_customer_messages(db, ticket.id, limit=5)
    context = build_rule_context(text, recent, ticket, db)        # sentiment, confidence, loop flags
    fired = []
    for rule in rules:                                            # evaluated in owner-set order
        if rule.condition.type == "keywords" and matches_keywords(text, rule.condition.terms, rule.condition.match):
            fired.append(rule)
        elif rule.condition.type == "conversation_loop" and detect_loop(context):
            fired.append(rule)
        elif rule.condition.type == "confidence_below" and context["confidence"] < rule.condition.threshold:
            fired.append(rule)
        elif rule.condition.type == "sentiment_negative" and context["neg_turns"] >= rule.condition.turns:
            fired.append(rule)
        # ... customer_request / repeat_failed_self_service / pii_security / sla_timeout
    if not fired:
        return False
    rule = max(fired, key=lambda r: r.order)                      # highest-priority fired rule
    rule.trigger_count += 1
    apply_action(ticket, rule.action, db)                         # escalate / priority / route / notify
    return True
```

**CODE — test console (owner pastes sample text, sees what fires):**

```python
@app.post("/api/tenants/me/escalation-rules/test")
def test_rule(payload: RuleTestIn, user=Depends(require_roles(Role.OWNER)), db=Depends(get_db)):
    rules = db.query(EscalationRule).filter(EscalationRule.tenant_id == user.tenant_id,
                                            EscalationRule.enabled == True).order_by(EscalationRule.order).all()
    fired = [r.name for r in rules if simulate_rule(r, payload.text)]
    return {"fired": fired, "message": "No rules fired" if not fired else f"{len(fired)} rule(s) triggered"}
```

**On escalation (unchanged pipeline):**
1. set `priority = HIGH`, `escalated_at = now` (unless action says otherwise).
2. **Route to an agent**: `route_to_agent(ticket, db)` → pick first *online* agent (Redis presence), else round-robin among active agents, else leave unassigned (dashboard queue shows red).
3. Emit WebSocket `ticket_updated` on the realtime event bus (§5.9) — customer's widget sees "transferring to human", agent dashboards update live.
4. Create a `notifications` row for the assignee + broadcast to agent dashboard.
5. Write an `audit_logs` entry with the fired rule name + reason (feeds §5.10 escalation-reason analytics).

**Agent presence (Redis):** agent sets `online/offline` on WS connect/disconnect + heartbeat; `users.last_seen` fallback. Routing prefers `online` agents.

**Why this beats Zendesk/Intercom for the demo:** Zendesk's rule tester is manual and has no bulk simulation; ours is a paste-the-text console. Rule edits propagate to the live chat engine instantly with no restart, and every escalation records *which rule fired* — that "escalation reason" becomes analytics Zendesk only added in its AI agents dashboard in 2026.

---

### 5.8 Ticketing & Sessions

**Endpoints**

| Method | Route | Notes |
| :--- | :--- | :--- |
| POST | `/api/tickets/initialize-session` ⚠️**NEW** | The missing identity endpoint. Accepts `{tenant_id, email, phone_number, account_number, full_name, subject}`. Upserts `customers` row (match by email OR phone/account), creates an OPEN ticket, returns `{ticket_id, customer_profile}`. |
| POST | `/api/tickets/create` | Manual portal ticket (with triage tagging). |
| GET | `/api/tickets?tenant_id=&assignee=&status=` | Queue, sorted by priority desc then created desc. Filters: `mine` (assignee=me), by status. Auth required (agent/owner). |
| GET | `/api/tickets/{id}/messages` | Transcript. Auth required, tenant-scoped. |
| POST | `/api/tickets/{id}/reply` | Human reply; sets status IN_PROGRESS. |
| PATCH | `/api/tickets/{id}` | Update status/priority/assignee (agent/owner). |
| POST | `/api/tickets/{id}/assign` ⚠️**NEW** | `{user_id}` — assign to agent (owner, or agent self-assign). Audited. |
| POST | `/api/tickets/{id}/notes` ⚠️**NEW** | Add internal note (`messages` with `sender_type=SYSTEM` + `metadata_payload={"internal": true}`) — not shown to customer. |
| GET | `/api/agents?tenant_id=` ⚠️**NEW** | List active agents for assignment dropdown (owner). |
| GET | `/api/agents/assignable` ⚠️**NEW** | Online + active agents only (used by auto-routing). |

**⚠️ FIX — implement `initialize-session` properly:**

```python
@app.post("/api/tickets/initialize-session")
def initialize_session(req: InitSessionRequest, db=Depends(get_db)):
    customer = db.query(Customer).filter(
        Customer.tenant_id == req.tenant_id,
        or_(Customer.email == req.email, Customer.phone_number == req.phone_number)).first()
    if not customer:
        customer = Customer(tenant_id=req.tenant_id, email=req.email,
                            phone_number=req.phone_number,
                            account_number=req.account_number, full_name=req.full_name)
        db.add(customer); db.commit(); db.refresh(customer)
    ticket = Ticket(tenant_id=req.tenant_id, customer_id=customer.id,
                    subject=req.subject, channel="widget", status=OPEN,
                    ticket_type=triage_customer_intent(req.subject))
    db.add(ticket); db.commit()
    return {"ticket_id": ticket.id, "customer_profile": {"id": customer.id, "full_name": customer.full_name, ...}}
```

---

### 5.9 Real-Time (WebSockets) ⚠️ **v3.1 rewrite — chat + event bus**

**SPEC — two WebSocket surfaces, clearly separated:**

#### A) Chat takeover channel — `WS /ws/chat/{ticket_id}` (unchanged)

- `ConnectionManager` groups sockets by `ticket_id` (as in original).
- Customer messages → persist + escalation check → broadcast to channel; if not escalated, do **not** call the LLM in the socket loop — respond with a prompt to use the SSE channel. **AI stays on SSE; WS is agent↔customer.**
- Agent messages → persist, set `IN_PROGRESS`, broadcast.
- On `WebSocketDisconnect` → cleanup.

#### B) Realtime event bus — `WS /ws/events` ⚠️**NEW v3.1**

One authenticated socket per logged-in user (owner/agent/super_admin). The server pushes typed events the user may see; the client subscribes to channels. Permission checks are enforced server-side on every channel (matches the ActiveManage/Chatwoot pattern).

**Channel model (permission-checked):**

| Channel | Subscribers | Events pushed |
| :--- | :--- | :--- |
| `user.{id}` | that user | own notifications, own ticket updates |
| `tenant.{tenant_id}` | owner + agents of that tenant | `ticket_updated`, `ticket_created`, `agent_presence`, `settings_changed`, `escalation_rules_changed`, `billing_changed`, `notification` |
| `admin` | super_admin only | `tenant_status_changed`, `tenant_created`, `plan_changed`, `audit_created`, platform-wide broadcast |
| `ticket.{id}` | assignee + tenant agents (see ticket) | conversation events (redundant with chat WS; used for queue badges) |

**Event envelope (all pushes):**

```json
{
  "type": "escalation_rules_changed",
  "channel": "tenant:9f2c...",
  "tenant_id": "9f2c...",
  "payload": {"rule_id": "ab12...", "enabled": false},
  "request_id": "req_8f4a...",
  "ts": 1760000000000
}
```

**Where the bus is emitted (every mutation broadcasts):**
- §5.7 escalation → `ticket_updated` (escalated) + `notification`.
- §5.15 settings PATCH → `settings_changed` → **all owner/agent dashboards + the live widget preview update instantly** (headline demo).
- §5.7 rule CRUD / toggle / reset → `escalation_rules_changed` → dashboards + test console stay in sync.
- §5.8 tickets → `ticket_created` / `ticket_updated` (queue + badge counts live).
- §5.16 admin actions → `tenant_status_changed` (approve/suspend reflects live in the owner's dashboard), `plan_changed`, `audit_created`.
- §5.13 presence → `agent_presence` (dots update without refresh).
- §5.17 billing → `billing_changed` (plan/usage bars live).

**CODE — event bus hub (`app/core/realtime.py`):**

```python
class EventBus:
    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}   # channel -> sockets

    async def subscribe(self, ws: WebSocket, channel: str, user, db):
        if not can_view_channel(channel, user, db):         # server-side permission check
            await ws.close(code=4403); return
        self.connections.setdefault(channel, []).append(ws)

    async def publish(self, channel: str, event: dict):
        for ws in self.connections.get(channel, []):
            await ws.send_json(event)

    async def publish_to_user(self, user_id, event):
        await self.publish(f"user:{user_id}", event)
    async def publish_to_tenant(self, tenant_id, event):
        await self.publish(f"tenant:{tenant_id}", event)
    async def publish_to_admin(self, event):
        await self.publish("admin", event)

bus = EventBus()

@app.websocket("/ws/events")
async def ws_events(websocket: WebSocket, token: str):
    await websocket.accept()
    user = verify_token(token)                      # query-param token, validated like a header
    channels = [f"user:{user.id}"] + (["admin"] if user.role == Role.SUPER_ADMIN
                                      else [f"tenant:{user.tenant_id}"])
    for ch in channels:
        await bus.subscribe(websocket, ch, user, db)
    try:
        while True:
            await websocket.receive_text()          # heartbeat ping (client sends "ping" every 20s)
    except WebSocketDisconnect:
        for ch in channels:
            bus.connections[ch].remove(websocket)
```

**Fallback:** if a client's WebSocket cannot connect (corporate proxy), the `useRealtime` hook polls `GET /api/events?since=<cursor>` every 10s. This mirrors how production systems (ActiveManage) degrade gracefully.

---

### 5.10 Analytics API

**Endpoint: GET `/api/dashboard/analytics?tenant_id=` (auth, owner/agent).**

Returns:
- `total_tickets`, `open_tickets`, `resolved_tickets`
- `deflection_rate` = (non-high-priority tickets / total) × 100 ⚠️ **FIX** the string-vs-enum comparison: filter on `Ticket.priority != TicketPriority.HIGH` (compare enum to enum, not to string).
- `estimated_savings_ngn` = deflected × 2500 (document the assumption).
- `sentiment_data` (group by `ai_sentiment`), `triage_data` (group by `ticket_type`).
- Optional time-series `tickets_per_day(last 7 days)`.

**v3.2 KPI additions (owner dashboard, competitor-informed bands):**
- `first_response_time_min` (human replies after handoff) — **target < 5 min** (chat norm 1–5 min).
- `first_contact_resolution_pct` — **band 70–80%** (78% seeded in the prototype).
- `escalation_rate_pct` — **healthy band 8–15%** (11.2% seeded).
- `agent_leaderboard` — `resolutions_30d` + personal `csat_avg` per active agent, sorted desc (drives the 30d leaderboard bar list).
- `kb_gaps` — queries where retrieval returned zero chunks (feeds the "recommended new KB article" feed item and the E6 `kb_gap` action).

These mirror the **analytics norms** table in §6.8 so the prototype's numbers and the spec's targets always agree.

---

### 5.11 Webhooks (Mock WhatsApp)

**Endpoint: POST `/api/webhooks/whatsapp`** (no Meta required).

**Behaviour (as proposed in original, now specced):**
1. Validate a simple shared-secret header (`X-Webhook-Secret`) to prove security awareness.
2. Resolve sender phone → tenant via a mapping table (`phone → tenant_id`); if unknown, create a "lead" customer + ticket under a configured fallback tenant.
3. Persist the message, triage it, run escalation, generate AI reply (reuse the chat service), persist reply.
4. Return `200 OK` immediately (webhook contract) — processing may be synchronous for demo clarity.
5. Send a `system_alert`/new-ticket WebSocket push so the agent dashboard updates live.

**Demo:** use Postman/`curl` to POST a fake WhatsApp JSON payload, show it appearing in the dashboard as a real ticket.

---

### 5.12 Email Service

**Service** `app/services/email_service.py`:
- `EMAIL_MOCK=true` → log the email body to console (perfect for offline demos + tests).
- Real mode → `smtplib`/SendGrid wrapper.

**Triggered emails:**
- Ticket created (customer gets `ticket_id` reference).
- Human reply (customer notified).
- Password reset (token link).
- Invite to become owner/agent (invite link, expires in `INVITE_EXPIRE_DAYS`).
- Escalation alert to assignee / owner (aggregated, throttled).

---

### 5.13 Agent Management & Live Takeover

**Who:** owners create/manage agents; agents log in and work the queue; escalated tickets auto-route to them.

**Endpoints**

| Method | Route | Roles | Notes |
| :--- | :--- | :--- | :--- |
| POST | `/api/agents/invite` | owner | Creates `invites` row (role=agent), emails invite link. Quota check on `tenant.max_agents` → `QUOTA_EXCEEDED`. |
| POST | `/api/auth/accept-invite` | public (token) | Sets password, creates agent user. |
| GET | `/api/agents` | owner, agent | List tenant agents + status. |
| PATCH | `/api/agents/{user_id}` | owner | Toggle `is_active`, change role agent→owner? (no — agent stays agent), set display name. |
| DELETE | `/api/agents/{user_id}` | owner | Deactivate agent (reassign open tickets). |
| POST | `/api/agents/{user_id}/presence` | agent | `{status: "online"/"offline"}` → Redis presence + `users.last_seen`. |
| GET | `/api/agents/presence` | owner, agent | Who is online (drives routing + dashboard dots). |

**Live takeover flow (the case the user cares about):**
1. Customer escalates (any of E1–E10) → `route_to_agent` assigns an online agent.
2. Agent gets a WS push + `notifications` row → opens `/dashboard/tickets/{id}`.
3. Agent sees the AI-generated summary/sentiment + full redacted transcript.
4. Agent replies over **WebSocket** `/ws/chat/{ticket_id}` (status → IN_PROGRESS).
5. Customer's widget flips to the WS channel; AI stays quiet while a human is engaged.
6. Agent resolves → `PATCH /api/tickets/{id}` status=RESOLVED (audited).

---

### 5.14 Escalation Routing & Agent Queues

**SPEC — routing policy (deterministic, documented for the thesis):**
1. **Online-only preference:** pick from agents whose Redis presence is `online`; fall back to any `is_active` agent.
2. **Workload balancing:** choose the online agent with the fewest OPEN/IN_PROGRESS tickets (round-robin tie-break).
3. **No agent available:** leave `assignee_id = None`; ticket sits at top of the dashboard queue (priority HIGH, red), notification to all agents.
4. Queue ordering (server-side): `priority DESC, escalated_at DESC, created_at DESC`.

Dashboard queue filters: `All`, `Mine`, `Unassigned`, `Escalated`, `Resolved`.

---

### 5.15 Tenant Settings & Widget Customization

**Endpoints**

| Method | Route | Roles | Notes |
| :--- | :--- | :--- | :--- |
| GET | `/api/tenants/me/settings` | owner, agent | Full settings (owner-only write). |
| PATCH | `/api/tenants/me/settings` | owner | Update `bot_name`, `brand_tone`, `primary_color`, `secondary_color`, `logo_url`, `welcome_message`, `proactive_teaser`, `mobile_fullscreen`, `widget_launcher_text`, `widget_position`, `escalation_message`. Pydantic validates hex colors + lengths. Audited. |
| GET | `/api/tenants/{id}/public` | public | **Minimal public widget config**: `bot_name`, `welcome_message`, `primary_color`, `secondary_color`, `logo_url`, `widget_launcher_text`, `widget_position`, `proactive_teaser`, `mobile_fullscreen`. NO internal data. Widget self-styles from this. |

**v3.2 fields:**
- `proactive_teaser` (str ≤ 200): the Intercom-style teaser text shown once per session 1.2s after the widget loads (above the launcher). Empty string disables it.
- `mobile_fullscreen` (bool): under 700px the widget covers the whole viewport (launcher + teaser hidden) — matches Conferbot/mobile chat norms.

**CODE — settings update:**

```python
class TenantSettingsUpdate(BaseModel):
    bot_name: str = Field(max_length=100)
    brand_tone: Literal["professional", "casual", "pidgin", "formal"] | str = "professional"
    primary_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    secondary_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    welcome_message: str = Field(max_length=500)
    proactive_teaser: str = Field(max_length=200)
    mobile_fullscreen: bool = False
    widget_launcher_text: str = Field(max_length=40)
    widget_position: Literal["bottom-right", "bottom-left"]
    escalation_message: str = Field(max_length=300)

@app.patch("/api/tenants/me/settings")
def update_settings(payload: TenantSettingsUpdate, user=Depends(require_roles(Role.OWNER)), db=Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    old = {c: getattr(tenant, c) for c in payload.model_fields}
    for field, value in payload.model_dump().items():
        setattr(tenant, field, value)
    db.commit()
    write_audit(user, "update_tenant_settings", tenant.id, before=old, after=payload.model_dump())
    return tenant
```

**Widget reads `/api/tenants/{id}/public` on mount** and applies colors/name/launcher before the pre-chat form renders.

---

### 5.16 Super Admin Console

**Who:** `require_super_admin`. All actions are audited (`write_audit`). Never return another tenant's PII in list views unless a single-tenant detail view is explicitly opened.

**Endpoints**

| Method | Route | Notes |
| :--- | :--- | :--- |
| POST | `/api/admin/tenants` | Create tenant + owner + invite. Body: `{business_name, email, owner_name, plan_code, quota_overrides?}`. Emails invite to owner. |
| GET | `/api/admin/tenants?status=` | List all tenants (id, name, email, status, plan, agent/customer counts). |
| GET | `/api/admin/tenants/{id}` | Detail incl. subscription + recent KPIs. |
| PATCH | `/api/admin/tenants/{id}` | Approve (pending→active), suspend, activate, terminate, change plan/quota. Audited with before/after. |
| DELETE | `/api/admin/tenants/{id}` | Soft-delete (status=TERMINATED) — never hard-delete. |
| GET | `/api/admin/analytics` | Platform KPIs: total/active/suspended tenants, total tickets, total customers, overall deflection, revenue-run-rate (Σ plan price), top tenants by volume. |
| GET | `/api/admin/audit-logs?tenant_id=&actor_id=` | Filterable audit trail. |
| POST | `/api/admin/impersonate/{tenant_id}` | Issues a **short-lived impersonation token** (30 min, claim `impersonator_id` + `type: "impersonation"`, role owner). Audited. |
| POST | `/api/admin/impersonate/end` | Revokes active impersonation (Redis). Audited. |

**Impersonation rules (security):**
- Token expiry `IMPERSONATION_EXPIRE_MINUTES` (30). No refresh-token issuance for impersonation.
- JWT carries `impersonator_id` so audit records show both the actor and the effective owner session.
- Frontend shows the red **ImpersonationBanner** whenever `impersonator_id` is present; "Exit view" calls `/impersonate/end`.
- Impersonation never reveals the owner's password (no password change, no token reuse).
- Every tenant-mutating action taken during impersonation is audited with `actor_id` = impersonator.

**CODE — impersonate:**

```python
@app.post("/api/admin/impersonate/{tenant_id}")
def impersonate(tenant_id: str, admin=Depends(require_super_admin), db=Depends(get_db)):
    owner = db.query(User).filter(User.tenant_id == tenant_id, User.role == Role.OWNER).first()
    if not owner: raise HTTPException(404, "Owner not found")
    if owner.tenant.status != TenantStatus.ACTIVE: raise HTTPException(409, "Tenant not active")
    token = create_access_token(owner, tenant_id, impersonator_id=admin.id)  # type=impersonation, 30min
    write_audit(admin, "impersonate_start", tenant_id, target_type="tenant", after={"target_user": owner.id})
    return {"access_token": token, "expires_in": settings.impersonation_expire_minutes * 60}
```

---

### 5.17 Subscription & Billing (mock — no real payment)

**SPEC — billing is simulated end-to-end but looks real in the UI.**

| Method | Route | Roles | Notes |
| :--- | :--- | :--- | :--- |
| GET | `/api/billing/plan` | owner | Current plan + usage vs quota (agents used, KB MB used, customers). |
| GET | `/api/billing/plans` | owner | All plans (Starter/Pro/Enterprise) for upgrade UI. |
| PATCH | `/api/billing/plan` | owner | `{plan_code}` — upgrade/downgrade, sets `next_billing_at`, writes invoice row. Audited. |
| GET | `/api/billing/invoices` | owner | Mock invoices (id, period, amount, status). |
| GET | `/api/billing/invoices/{id}` | owner | "Download PDF" → returns a generated placeholder PDF (thesis bonus: reportlab). |

**Quota enforcement (the "must add" the user asked for):**
- `invite agent` → check `max_agents`; `ingest` → check `kb_quota_mb` (sum chunk bytes); `initialize-session` → check `max_customers`.
- Exceed → `QUOTA_EXCEEDED` error code (§8) + notification + suggest upgrade.
- Override allowed only by super admin (`PATCH /api/admin/tenants/{id}`).

**Upgrade/Downgrade rule:** downgrade below current usage is **blocked** with a clear message (cannot shrink below existing agents/KB) — shows real product thinking.

---

## §6. Frontend Implementation

### 6.1 App Router Structure & Guards

- `src/proxy.ts` (Next 16 proxy; formerly `middleware.ts`) — redirects unauthenticated users away from `/admin/*` and `/dashboard/*`; role-based redirect (`/admin` → super admin only; `/dashboard` → owner/agent). `/portal/*`, `/chat/[tenantId]`, and `/register` are **not** server-guarded — customer gating happens in `(auth)/layout.tsx` (staff bounce) and the portal route.
- `src/lib/guards.ts` — `requireRole(role)` helper + `isImpersonating()` from token claim.
- `src/lib/api.ts` — fetch wrapper that: attaches `Authorization: Bearer`, parses the **error envelope** (§8), refreshes the access token on `401` (except for impersonation tokens), and retries once.
- `src/lib/auth.tsx` (context) — holds `{user, accessToken, impersonator}`, calls `/refresh` on boot, exposes `login/logout`.
- `src/lib/realtime.ts` — `useRealtime(events)` hook (v3.1): opens `WS /ws/events` with the access token, dispatches typed events to subscribed handlers, and **falls back to polling** `GET /api/events?since=` when the socket fails (corporate proxies).

### 6.2 Pages

> **Access model (final, implemented):** the **entire customer portal is login-gated** — customers see no KB, no help center, and no "My tickets" until signed in as a `customer`. Staff surfaces live under `/dashboard/*` (owner/agent); the super-admin console is the only `/admin/*` user. Public = landing + `/login` + `/forgot-password` + `/accept-invite` + `/register?tenant=` + `/chat/[tenantId]`. Guest chats are bound to an account by email the moment the customer registers.

| Route | Access | Content |
| :--- | :--- | :--- |
| `/` | public | Landing: hero, platform KPIs, "Open console" → `/login`, and the **live embedded widget** (`WidgetChat`, bottom-right) for the demo tenant. |
| `/login`, `/forgot-password` | public | Auth flows. Login redirects by role: customer → `/portal/{tenantId}`, owner/agent → `/dashboard`, super_admin → `/admin`. |
| `/accept-invite?token=` | public | Invite preview + password set → activates owner/agent (§5.2). |
| `/register?tenant=` ⚠️**NEW** | public | **Customer self-signup** (staff stays invite-only). Validates, checks dup-email, auto-signs in, redirects to `/portal/{tenantId}`. Guest history binds by email. |
| `/chat/[tenantId]` ⚠️**v3.2** | public | Pre-chat identity form (name + email) → **SSE-streamed AI chat** with teaser/typing/chips/CSAT/fullscreen; escalations hand off to the chat WebSocket. |
| `/admin` | super_admin | Platform analytics (KPIs, volume-ranked tenant table with status filter pills + KB usage meters, approve/suspend/impersonate), tenant create form. |
| `/admin/tenants` | super_admin | Tenant directory + provisioning (§5.16). |
| `/admin/users` | super_admin | User/agent directory with active toggles. |
| `/admin/billing` | super_admin | Platform MRR / subscriptions + plan template editor (realtime via `billing_changed`). |
| `/admin/audit` | super_admin | Filterable + searchable audit log viewer. |
| `/admin/settings` | super_admin | Platform settings. |
| `/dashboard` | owner/agent | Analytics hub (KPI cards, channel mix, agent leaderboard, activity feed). Live-refreshes on `ticket_*`. |
| `/dashboard/tickets` ⚠️**v3.2** | owner/agent | **3-pane inbox** (queue | conversation | context rail): SLA pills, unread dots, filters, AI handover banner, composer with canned `/` menu, customer card, KB search, agent-assist, private notes. `?email=` deep-link opens a customer's conversation. Live queue via `ticket_created`/`ticket_updated`. |
| `/dashboard/reports` | owner | Analytics reports hub (FRT/deflection charts, FCR & escalation-rate KPIs, agent leaderboard, escalation reasons). |
| `/dashboard/escalation` ⚠️**v3.1** | owner | Rule builder: E1–E10 presets + customs, enable toggles, reorder, condition/action editor, test console. Live propagation via `escalation_rules_changed`. |
| `/dashboard/agents` | owner | Agent list + invite form (quota indicator), active/presence toggles. |
| `/dashboard/canned` | owner | Shared canned replies. |
| `/dashboard/billing` | owner | Current plan + usage-vs-quota bars, upgrade/downgrade cards, invoice list, saved card. |
| `/dashboard/settings` | owner | Brand & widget customization (§5.15) with live preview + `settings_changed` realtime. |
| `/dashboard/upload` | owner/agent | Link + PDF + raw-text ingestion tabs. |
| `/dashboard/profile` | all staff | Profile + presence + notification prefs; persists via mock, pushes `agent_presence`. |
| `/portal/[tenantId]` ⚠️**v3.2** | **customer only** | Signed-in customer home: searchable knowledge base, manual ticket form, live tracker. No public KB browsing. |
| `/portal/[tenantId]/inbox` ⚠️**v3.2** | **customer only** | "My tickets" tracker keyed by the account email — guest chats sent before registration surface here (identity binding). |

**Impersonation banner:** when `isImpersonating()`, render `<ImpersonationBanner />` at the very top of the layout (red strip: "Viewing as NairaWave as {owner_name} · Exit") — calls `/api/admin/impersonate/end`.

### 6.3 The SSE Streaming Hook (replaces broken JSON fetch)

**CODE — `src/hooks/useStreamingChat.ts`:**

```ts
export function useStreamingChat() {
  async function send(ticketId: string, query: string, onToken: (t: string) => void) {
    const res = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, query }),
    });
    if (!res.ok || !res.body) { const err = await res.json(); throw new Error(err?.error?.message); }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n"); buffer = frames.pop()!;
      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const data = JSON.parse(frame.slice(6));
        if (data.token) onToken(data.token);
        if (data.done || data.error) return data;
      }
    }
  }
  return { send };
}
```

**Status (frontend implemented):** `src/hooks/useStreamingChat.ts` ships this exact reader plus `useWebSocketChat.ts` (`ws://…/ws/chat/{ticket_id}`). In mock mode (`NEXT_PUBLIC_API_MOCK=true`) the transport swaps to the in-process token generator (`streamWidgetReply` in `src/lib/mock/index.ts`) so streaming is demonstrable without a backend; the real SSE fetch path is retained behind the same hook API. The widget streams the AI reply into a live bubble, persists the aggregated reply on done (`POST /widget/persist`), and hands off to the WebSocket on escalation.

### 6.4 Chat Widget Flow (corrected)

1. On mount, fetch `/api/tenants/{id}/public` → apply brand styling (colors, bot name, launcher text).
2. If `proactive_teaser` is set and this session hasn't seen it (`teaserShown` flag), show the **teaser card** above the launcher ~1.2s after load; buttons: **Chat** (opens) / **Dismiss** (removes, stays dismissed). Once per session only.
3. Read `localStorage[customer_{tenantId}]`.
4. No profile → show pre-chat form → POST `/api/tickets/initialize-session` → store profile + ticket id.
5. Chat loop: append user bubble → show a **typing indicator** (3 dots) → `useStreamingChat` streams tokens → final message persisted server-side. On deflect replies, the typing indicator is shown for ~900ms before the AI text lands (feels human, matches Conferbot norms).
6. On `response_by === "system_alert"` → render handoff bubble ("transferring to a human…") + open `useWebSocketChat(ticketId)`.
7. While a human is engaged (WS active), AI input is disabled; agent replies stream in over the socket.
8. When the ticket resolves, append the **CSAT rating prompt** (1–5 stars); on rating, POST it and replace the prompt with a thank-you (feeds `csat_avg` analytics).
9. Under **700px** (`mobile_fullscreen` or viewport), the widget fills the screen; launcher + teaser are hidden while open (standard mobile chat UX).

**v3.2 widget anatomy (matches `previewWidget` in the prototype):** teaser-card → widget-bubble (head with bot name + online state, body with welcome + quick-reply chips, input row) → launcher pill.

**Status (frontend implemented):** `src/components/widget/widget-chat.tsx` covers steps 1–9 — teaser once/session, identity from `localStorage[prestige_customer_{tenantId}]`, streaming AI, WS handoff (mock agent Amaka joins on escalation), CSAT 1–5 stars (shown after a deflected exchange or when the agent resolves the handoff; rating POSTs and swaps to a thank-you), and full-screen mobile < 700px. The widget is embedded on the landing page (`/`) and on `/chat/[tenantId]` behind the pre-chat form.

### 6.5 Error Boundaries & Toasts

- React `ErrorBoundary` per route.
- Central toast component reading error envelopes: show `error.message`, log `error.code + request_id`.
- Loading states (spinners, disabled buttons) on every async action.

### 6.6 The Realtime Hook ⚠️ **NEW v3.1**

**CODE — `src/hooks/useRealtime.ts` (event-bus client with polling fallback):**

```ts
type Handler = (event: any) => void;

export function useRealtime(handlers: Record<string, Handler>) {
  const [connected, setConnected] = useState(false);
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const dispatch = (ev: any) => {
      cursorRef.current = ev.request_id;
      handlers[ev.type]?.(ev);
    };

    const connect = () => {
      ws = new WebSocket(`${WS_BASE}/ws/events?token=${encodeURIComponent(accessToken)}`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (m) => dispatch(JSON.parse(m.data));
      ws.onclose = () => {                      // fallback → polling
        setConnected(false);
        poll = setInterval(async () => {
          const res = await fetch(`${API}/api/events?since=${cursorRef.current ?? ""}`);
          for (const ev of await res.json()) dispatch(ev);
        }, 10_000);
      };
    };

    connect();
    const hb = setInterval(() => ws?.send("ping"), 20_000);   // heartbeat
    return () => { ws?.close(); clearInterval(hb); if (poll) clearInterval(poll); };
  }, []);
  return { connected };
}
```

**Usage:** dashboards subscribe once and update state on push — no refetch. Example: the settings page listens for `settings_changed`; the queue listens for `ticket_created`/`ticket_updated`; the escalation builder listens for `escalation_rules_changed` (so a change made in another tab/session shows instantly).

**Status (frontend implemented):** `src/lib/realtime.ts` exposes `useRealtime`. In mock mode it binds the in-process bus in `src/lib/mock/index.ts` (`emitEvent` → `subscribeEvents`, envelope history capped at 100, `GET /events` polling fallback returns the log). Wired subscribers: ticket queue + overview (`ticket_created`, `ticket_updated`), tenant settings (`settings_changed`), escalation builder (`escalation_rules_changed`), subscriptions (`billing_changed`), platform overview (`tenant_status_changed`), reports (`ticket_*`). Emitters cover ticket create/update/reopen, rule CRUD/toggle/reset, settings, tenant approve/suspend/reactivate/create, plan overrides, presence, and CSAT ratings (`csat_rated`). Real WS + polling paths are kept behind the same hook.

### 6.7 Agent-Assist Panel ⚠️ **NEW v3.1** (competitor-informed — Forethought/Decagon pattern)

**SPEC — the AI does not stop working when a human takes over.** On an escalated ticket, the conversation view shows a right-hand panel:

1. **Transcript summary** (one paragraph from `ticket.ai_summary`).
2. **KB chunks surfaced** — reuse §5.5 retrieval on the ticket's latest customer message, top-3 chunks.
3. **Suggested reply** — a one-shot Groq completion using brand tone + chunks + latest message; agent taps "Use" to fill the reply box.
4. **Next actions** — buttons: `Resolve`, `Escalate to owner`, `Send refund link`, `Close`.

Backend: `GET /api/tickets/{id}/assist` (owner/agent, tenant-scoped) returns `{summary, chunks, suggested_reply, next_actions}`. Cache `suggested_reply` for 60s to avoid re-billing Groq on every open. This directly answers the competitor gap "agent must scroll the whole transcript to catch up" (usefini 2026).

### 6.8 Competitor Layout Standards ⚠️ **NEW v3.2** (design reference for the frontend)

Research basis for the v3.2 prototype. When building the real UI, match these patterns — they are what reviewers expect from a "serious" support product.

| Area | Competitor | Standard to match (prototype ref) |
| :--- | :--- | :--- |
| Inbox | Zendesk, Chatwoot | **3-pane**: left ticket queue (filters + SLA) · centre conversation · right context rail (customer, past tickets, KB, notes). Prototype: `.grid.inbox3` + `contextPanel`. |
| Handover | Gorgias | In-thread yellow **AI handover summary** banner (reason + one-paragraph recap) at the top of the conversation. Prototype: `.handover` banner. |
| Queue meta | Zendesk | SLA pills (info/overdue), **unread dots**, priority/status pills, preview + age per row. Prototype: `slaTag`, `unread-dot`, `queueRow`. |
| Composer | Zendesk, Intercom | **Canned responses** via `+` menu and `/` shortcut; private internal notes kept out of the customer thread. Prototype: `cannedBox`, `addNote`. |
| Help center | Freshdesk, Intercom | Public page = KB search + article list → article modal with **helpful?** reactions + **related articles** · manual ticket form · **"My tickets"** tracker filtered by email with **Reopen**. Prototype: `kbListHTML`/`openArticle`/`renderMyTickets`. |
| Widget teaser | Intercom | Proactive message card above the launcher, **once per session**, Dismiss + Chat actions. Prototype: `startTeaser`/`teaserGo`/`dismissTeaser`. |
| Widget typing | Intercom, Conferbot | **Typing indicator** (~900ms) before every AI reply so responses feel human and not teleported. Prototype: `.w-typing`. |
| Widget quick replies | Intercom | **Choice chips** ("Track my ticket", "Transfer status", "Refund help", "Talk to a human"). Prototype: `.w-chips`. |
| CSAT | Zendesk, Intercom | End-of-chat **1–5 star rating** after resolution; thank-you state after rating. Prototype: `wRate`, `.w-csat`. |
| Mobile widget | Conferbot norms | Widget **full-screen under 700px**; launcher + teaser hidden while open. Prototype: `@media (max-width:700px)`. |
| Analytics norms | industry benchmarks | **Deflection 30–50% = healthy KB**; **CSAT 85–92%** (4.5–4.6/5); **FRT chat 1–5 min**; **FCR 70–80%**; **escalation 8–15%**. Seed numbers (§5.10) sit inside these bands. |

---

## §7. Security Checklist (final)

**SPEC — verify all before defense:**

- [ ] All passwords hashed with bcrypt (≥12 rounds). Never store plaintext.
- [ ] JWT access tokens short-lived (15 min); refresh tokens hashed, rotated, revocable.
- [ ] RBAC enforced server-side on every route: super_admin / owner / agent, tenant derived from token (never from client body/query).
- [ ] Super admin has `tenant_id = None`; tenant data only reachable via admin/impersonation endpoints.
- [ ] Every ticket/message/knowledge query filtered by tenant (add a `tenant_id` guard utility).
- [ ] UUIDv4 keys everywhere — no enumerable IDs.
- [ ] CORS restricted to real frontend origin(s).
- [ ] Rate limiting on auth + ingestion + chat + admin.
- [ ] PII redaction runs before persistence and before any LLM call.
- [ ] Input validation via Pydantic on every endpoint (no raw dicts).
- [ ] Error envelope never leaks stack traces or SQL details.
- [ ] Webhook endpoints use a shared-secret header check.
- [ ] **Audit every admin + destructive owner action** (create/suspend/terminate tenant, role change, impersonate, plan change) via `audit_logs`.
- [ ] **Impersonation is scoped, short-lived (30 min), non-refreshable, and revocable**; banner always visible.
- [ ] Quota enforcement on invites/uploads/session-creation (`QUOTA_EXCEEDED`).
- [ ] **Realtime event-bus channels are permission-checked server-side** (§5.9): a super admin can never subscribe to `tenant.{id}`, a tenant user can never subscribe to `admin`, and WS tokens are validated exactly like HTTP tokens.
- [ ] `.env` gitignored; `.env.example` committed; secrets rotated before demo.
- [ ] No API keys in frontend bundle (Groq calls go through FastAPI only).
- [ ] NDPA section in thesis: data minimization, consent gate (pre-chat form), right to erasure (cascade delete customer row).

---

## §8. Error Handling Reference

**Envelope:**

```json
{ "error": { "code": "RATE_LIMITED", "message": "Too many requests. Try again in 30s.", "details": { "request_id": "..." } } }
```

**Error codes table:**

| Code | HTTP | Typical cause |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Pydantic validation failed |
| `UNAUTHORIZED` | 401 | Missing/expired/invalid token |
| `FORBIDDEN` | 403 | Role not permitted |
| `NOT_FOUND` | 404 | Tenant/ticket/source missing |
| `TENANT_CONFLICT` | 409 | Email already registered |
| `INVITE_EXPIRED` | 410 | Invite token expired/already used ⚠️**NEW** |
| `RATE_LIMITED` | 429 | Limit exceeded (send `Retry-After`) |
| `QUOTA_EXCEEDED` | 422 | Plan quota (agents/KB/customers) exceeded ⚠️**NEW** |
| `PLAN_DOWNGRADE_BLOCKED` | 422 | Downgrade below current usage ⚠️**NEW** |
| `TENANT_NOT_ACTIVE` | 409 | Pending/suspended tenant action attempted ⚠️**NEW** |
| `IMPERSONATION_EXPIRED` | 401 | Impersonation token expired ⚠️**NEW** |
| `GROQ_ERROR` | 502 | Upstream LLM failure (log, retry once) |
| `INTERNAL_ERROR` | 500 | Unknown — log trace + request_id |

**Frontend contract:** `api.ts` unwraps `error.message` for toasts; keeps `request_id` for support; never assumes a string body.

---

## §9. Rate Limiting Reference

- Implement with `slowapi` + Redis storage; in-memory fallback when Redis is off (flag in logs).
- Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on 429.
- Auth endpoints: aggressive (e.g. 10/min) to blunt brute force; ingestion + chat: moderate (e.g. 60/min); **admin + impersonation endpoints: strictest** (`RATE_LIMIT_ADMIN_PER_MIN`, default 30/min).
- Exempt the WebSocket handshake from the generic limiter but add a per-connection message budget.

---

## §10. Testing

**SPEC — never claim PASS in the thesis without runnable tests.**

### 10.1 Pytest layout

```
backend/tests/
├── conftest.py            # test DB (SQLite in-memory), seeded fixtures, TestClient, role helpers
├── test_auth.py           # login/refresh/logout/forgot/reset/accept-invite
├── test_rbac.py           # super admin / owner / agent isolation matrix
├── test_admin.py          # create/approve/suspend tenant, audit written, impersonation expiry
├── test_billing.py        # quota enforcement, upgrade/downgrade block, invoices
├── test_agents.py         # invite flow, presence, assignment, live takeover
├── test_tenancy.py        # tenant B cannot read tenant A tickets/vectors
├── test_triage.py         # complaint/request/inquiry samples incl. Pidgin
├── test_escalation_rules.py  # v3.1: CRUD, test console, live propagation, nullification
├── test_realtime.py       # v3.1: channel auth, broadcast fan-out, polling fallback
├── test_escalation.py     # all cases E1–E10 + routing to online agent
├── test_ingestion.py      # link + pdf + text → chunks → collection isolation
├── test_rag.py            # retrieval returns tenant-scoped chunks; history injected
├── test_tools.py          # each mock tool returns correct JSON + read-only guarantees
├── test_chat.py           # SSE stream shape, error frames, PII redaction on stored msg
├── test_websocket.py      # broadcast to ticket channel, handoff alert, presence
├── test_analytics.py      # deflection/triage/sentiment aggregation (tenant + platform)
└── test_audit.py          # every admin action produces an audit_logs row
```

### 10.2 Ragas evaluation (the missing "A" pillar)

Build a small eval dataset (20–30 Q&A pairs from the seeded knowledge base) and measure **faithfulness** and **answer relevance** using **Ragas** against the RAG endpoint. Save the metrics (`rapidfire` CLI or notebook) — these charts go straight into the thesis.

### 10.3 Sample test

```python
def test_tenant_isolation(client, seeded_db):
    a = client.get("/api/tickets", params={"tenant_id": TENANT_A})
    assert all(t["tenant_id"] == TENANT_A for t in a.json())
```

### 10.4 v3.1 sample tests

```python
def test_rule_test_console(client, owner_a):
    res = client.post("/api/tenants/me/escalation-rules/test",
                      json={"text": "I want to speak to a human now!"},
                      headers=owner_a_headers(owner_a))
    assert "Direct human request" in res.json()["fired"]   # E1 fires

def test_rule_edit_propagates_live(client, owner_a, seeded_db):
    e2 = rule_by_name(seeded_db, owner_a, "High-frustration phrases")
    client.put(f"/api/tenants/me/escalation-rules/{e2.id}",
               json={**rule_payload(e2), "enabled": False}, headers=owner_a_headers(owner_a))
    # next message with an E2 keyword must NOT escalate
    assert not evaluate_escalation_triggers(ticket, "this bot is useless", seeded_db)

def test_nullification_prevents_refire(client, seeded_db):
    escalated = make_escalated_ticket(seeded_db)            # escalated_at set
    assert evaluate_escalation_triggers(escalated, "thief thief thief", seeded_db) is False

def test_event_bus_channel_auth(seeded_db):
    assert can_view_channel("admin", super_admin, seeded_db)
    assert not can_view_channel("admin", owner_user, seeded_db)
    assert not can_view_channel(f"tenant:{OTHER}", owner_user, seeded_db)

def test_billing_change_broadcasts(client, owner_a, fake_ws):
    client.patch("/api/billing/plan", json={"plan_code": "enterprise"}, headers=owner_a_headers(owner_a))
    assert any(e["type"] == "billing_changed" for e in fake_ws.sent_to(f"tenant:{owner_a.tenant_id}"))
```

---

## §11. Deployment

### 11.1 Local dev (default)

```bash
# Backend
cd backend
python scripts/download_model.py   # once, for offline embeddings
python scripts/db_setup.py
uvicorn app.main:app --reload --port 8000
# Frontend
cd ../frontend
npm install
npm run dev
```

### 11.2 Optional Docker Compose

`docker-compose.yml` at repo root: services `backend` (uvicorn), `frontend` (next build), `postgres`, `redis`. Swap `DATABASE_URL` and `REDIS_URL` via env. ChromaDB stays local volume-mounted (`chroma_data`).

### 11.3 Production notes (documented, not required to run)

- Terminate TLS at a reverse proxy; CORS pinned to the real domain.
- Set `ENVIRONMENT=production` (disables debug, tightens rate limits).
- Store secrets in env/secret manager; rotate keys.

---

## §12. Thesis Mapping & Defense

| Thesis chapter | Where it comes from |
| :--- | :--- |
| Chapter 1–3 (Intro/Literature/Design) | §1–§4 of this guide + your literature review |
| Chapter 4 (System Implementation & Testing) | §5–§10 + actual test output + Ragas charts |
| Chapter 5 (Security/Compliance) | §7 + NDPA framing |
| Chapter 6 (Evaluation) | §10 Ragas metrics, latency data, test matrices |
| Chapter 7 (Conclusion & Future Work) | Draft new: gaps (live WhatsApp, real banking APIs, fine-tuning, multi-language voice) |

**Defense talking points (ready-made):** data sovereignty (local embeddings), deterministic triage + escalation (E1–E10 catalogue + agent routing), **DB-driven escalation rules with live propagation** (owner edits a rule → next message honours it, no restart — a demo competitor tools can't trivially match), **realtime event bus** (settings/rule/tenant/ticket changes push to every dashboard instantly), 4-tier RBAC (super admin → owner → agent → customer), read-only agentic safety, per-tenant vector isolation, mock subscription & quota enforcement, full audit trail + scoped impersonation, cost modelling (deflection × 2500 NGN), and **v3.2 competitor parity** (3-pane inbox, help-center KB + My tickets, proactive teaser, typing indicator, CSAT, usage-vs-quota meters, FCR/escalation KPIs inside industry bands).

---

## §13. Phased Build Order

| Phase | Scope | Exit criteria |
| :--- | :--- | :--- |
| **0** | Repo structure, `requirements.txt`, `.env.example`, app factory | `uvicorn` boots at `/docs` |
| **1** | DB models + seeding (incl. super admin, plans, audit) + `download_model.py` | `db_setup.py` runs; tables populated |
| **2** | Auth: login/refresh/logout/reset/accept-invite + RBAC deps (incl. `require_super_admin`) | pytest `test_auth.py` + `test_rbac.py` green |
| **3** | Middleware: errors, rate limiting, PII, logging, CORS, audit wrapper | envelope on all errors; 429 works |
| **4** | Ingestion: link + pdf + text → ChromaDB isolation | `test_ingestion.py` green; collections isolated |
| **5** | RAG chat endpoint (SSE) + memory injection | `test_rag.py` + `test_chat.py` green |
| **6** | Agentic tools + triage + escalation rules (DB-driven, E1–E10) + routing | `test_tools`, `test_triage`, `test_escalation`, `test_escalation_rules` green |
| **7** | Ticketing incl. `initialize-session`, assignment, notes + chat WebSocket + presence | `test_websocket.py` green; handoff demo works |
| **8** | Agent management (invite/accept/toggle) | `test_agents.py` green |
| **9** | **Realtime event bus** (`/ws/events`, channels, permissions, polling fallback) + escalation-rule endpoints & test console | `test_realtime.py` green; edit rule → dashboard updates live |
| **10** | Analytics API (tenant + platform) + frontend dashboard/charts | `test_analytics.py` green |
| **11** | Super Admin console: tenants, approve/suspend, impersonation, audit viewer | `test_admin.py` + `test_audit.py` green |
| **12** | Billing & quotas (mock) + plan management UI | `test_billing.py` green; upgrade/downgrade works |
| **13** | Frontend: landing, auth, admin console, dashboard, upload, settings (brand + preview), **escalation builder page**, agents, billing, portal, chat widget | Full UI walkthrough passes |
| **13a** ⚠️**v3.2** | Prototype parity pass: 3-pane inbox (SLA/unread/handover/context rail/canned/notes), help-center KB + My tickets + reopen, widget teaser/typing/chips/CSAT/mobile-fullscreen, dashboards FCR/escalation/leaderboard, usage meters, audit/tenant filters | `node --check` green on `prototype/*.js`; smoke suite (temp harness) all PASS; browser walkthrough of every page |
| **14** | Webhooks (WhatsApp mock) + email service | Postman demo creates a dashboard ticket |
| **15** | Hardening pass (§7 checklist) + load smoke test | No `*` CORS, no leaked secrets, no hardcoded tenant in business routes |
| **16** | Ragas eval + thesis screenshots + defense slides + prototype walkthrough | Metrics charts saved |

---

## Appendix A. Fixes vs Original Document

| # | Original problem | This guide |
| :--- | :--- | :--- |
| 1 | RAG retrieval never wired into chat | §2.2 / §5.5 explicit retrieve→augment→generate loop |
| 2 | `/api/tickets/initialize-session` referenced, never built | §5.8 fully specced with code |
| 3 | No `Customer` table; `ticket.customer` crashed | §4.2 customers table + `customer_id` FK |
| 4 | `escalation.py` imported but never created | §5.7 own module |
| 5 | `status_error=500` typo | §5 error handlers use `status_code` |
| 6 | Invalid Groq model `llama-3.3-70b-specdec` | §3 uses `llama-3.3-70b-versatile` |
| 7 | Streaming designs contradicted each other | §2.4 SSE (AI) vs WebSocket (humans) |
| 8 | No conversation memory in LLM prompt | §5.5 history injection |
| 9 | No auth/authorization at all | §5.2 JWT + RBAC |
| 10 | No PDF ingestion, settings UI, WhatsApp webhook, email | §5.4 / §5.11 / §5.12 / §6.2 |
| 11 | PII redaction written but never called | §5.3.3 wired into chat pipeline |
| 12 | No `requirements.txt` / reproducible setup | §5.1 |
| 13 | Chapter 4 claimed PASS with no tests | §10 runnable pytest + Ragas |
| 14 | Analytics compared Enum to string | §5.10 enum-to-enum fix |
| 15 | CORS `"*"` | §5.1 restricted origins |
| 16 | No super admin / platform tier | §1.0 / §5.16 4-role RBAC + admin console |
| 17 | No way to create/manage agents or assign tickets | §5.13 agent management + assignment |
| 18 | Escalation only covered 2 trigger cases | §5.7 full E1–E10 catalogue + routing |
| 19 | No subscription/quotas | §5.17 plans + quota enforcement |
| 20 | No audit trail | §5.16 / `audit_logs` + `write_audit` wrapper |
| 21 | No impersonation for support | §5.16 scoped, audited impersonation |
| 22 | Stale framework versions (Next 14, chromadb 0.4, langchain-groq 0.x) | §1.1 / §5.1 current versions (Aug 2026) |
| 23 | Groq model ID hardcoded & invalid | §3 verify via `groq.models.list()`, env-driven |
| 24 | Settings UI promised but undefined | §5.15 / §6.2 full brand customization + public widget config |
| 25 | Open self-registration | §5.2 replaced by super-admin provisioning + invite-accept |
| 26 | Escalation rules hardcoded in Python dict (owner couldn't change them) | §5.7 DB-driven rule engine + owner CRUD + test console (v3.1) |
| 27 | Dashboards only updated on manual refresh | §5.9 realtime event bus (`/ws/events`) + `useRealtime` hook with polling fallback (v3.1) |
| 28 | Escalations only triggered on text, never on time | §5.7 E10 SLA-timeout rule (Zendesk-style automation) (v3.1) |
| 29 | Agent had no help after handoff (re-reads whole transcript) | §5.8/§6.7 agent-assist panel surfaces KB chunks + suggested reply (v3.1, prototype) |
| 30 | Inbox was a flat list — agents had no customer context while replying | §6.2 3-pane inbox + context rail (customer card, past tickets, KB search, private notes) (v3.2) |
| 31 | No SLA visibility in the queue | §6.2 SLA pills (info/overdue) + unread dots per ticket row (v3.2) |
| 32 | Agent got no handover summary in the thread itself | §6.2 Gorgias-style in-thread AI handover banner (v3.2) |
| 33 | Public portal was a bare ticket form | §6.2/§6.8 help center: KB search + reactions + related articles + "My tickets" tracker with reopen (v3.2) |
| 34 | Widget was passive — no engagement or closure | §6.4 proactive teaser (once/session), typing indicator, choice chips, CSAT stars, full-screen mobile (v3.2) |
| 35 | Dashboards had no industry-comparable KPIs | §5.10 FCR (70–80%), escalation rate (8–15%), FRT, leaderboard, KB gaps (v3.2) |
| 36 | Quota usage was abstract | §6.2 usage-vs-quota bars with warn/over states + payment card in billing (v3.2) |
| 37 | Super-admin tenant/audit lists were unfiltered | §5.16/§6.2 status filter pills + KB meters + searchable audit log (v3.2) |
| 38 | Settings UI was toast-only stubs — no automations/SLA/webhooks/API keys anywhere | §5.15/§6.2 full tabbed owner + admin settings hubs; runtime automations & SLA engines, channels, webhooks (deliveries + test), API keys (one-time secret), persisted notification prefs (v3.3) |
| 39 | Agent "Resend"/"Manage" and invoice download were toast-only | §5.13 resend invite returns updated `AgentUser`; Manage modal with pause/activate; §5.17 invoices download as files (v3.3) |
| 40 | Escalation presets had no history or rollback | §5.7 immutable preset version snapshots (create/restore, audit-recorded) surfaced on the admin hub + escalation-rules page (v3.3) |
| 41 | Composers were scroll-while-typing single-line inputs; no attachments or emoji anywhere | §6.4/§4.2 shared auto-growing `AutosizeTextarea` (grows to `maxRows`, then scrolls) + paperclip attachments (image thumbs/file chips) + emoji popover in widget and agent composers; mock transport persists attachments on the ticket (v3.4) |
| 42 | Internal notes were append-only and untraceable | §4.2 notes are stable by message `id`, editable inline with an "Edited" marker + author, and deletable via ConfirmModal — in the thread and the context-rail Notes tab (v3.4) |
| 43 | AI→human handoff was silent and attachments died on the WS leg | §6.4 widget shows a connecting banner/status and disables the composer until the agent joins; the WS transport carries attachments end-to-end (v3.4) |
