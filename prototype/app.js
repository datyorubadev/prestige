/* =====================================================================
   Prestige Portal — clickable UI prototype (no backend)
   Drives the shell in index.html using MOCK (data.js) + ICONS (icons.js).
   Simulates: 3 roles, escalation rule builder + test console, realtime
   event bus, agent-assist, billing, widget preview, impersonation.
   v3.2: 3-pane inbox, help-center KB + My-tickets, widget teaser/CSAT.
   ===================================================================== */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ----------------------------- identities ----------------------------- */
const IDENTITIES = {
  super: { name: "Platform Admin", email: "admin@prestige.io", role: "super", roleLabel: "Super Admin", initials: "S", color: "violet", tenant: "Platform Console" },
  owner: { name: "Bisi Adeyemi", email: "bisi@nairawave.ng", role: "owner", roleLabel: "Owner", initials: "B", color: "green", tenant: "NairaWave Fintech" },
  agent: { name: "Amaka Okafor", email: "amaka@nairawave.ng", role: "agent", roleLabel: "Agent", initials: "A", color: "blue", tenant: "NairaWave Fintech" },
};

/* ----------------------------- state ----------------------------- */
const state = {
  user: IDENTITIES.owner,
  role: "owner",
  view: "dashboard",
  settingsTab: "brand",
  queueFilter: "All",
  tenantFilter: "All",
  auditFilter: "All",
  auditQuery: "",
  selectedTicket: "TK-1042",
  impersonating: null,
};
let realtimeOn = true;

/* snapshot of seeded preset rules for "Reset" */
const RULE_DEFAULTS = MOCK.rules.map((r) => ({ ...r, terms: [...(r.terms || [])] }));

const CONDITIONS = ["customer_request", "keywords", "sentiment_negative", "confidence_below", "conversation_loop", "repeat_failed_self_service", "pii_security", "sla_timeout", "customer_segment"];
const ACTIONS = ["escalate", "escalate + priority HIGH", "set_priority", "route_to", "notify", "halt_ai"];
const SAMPLES = {
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
const AI_REPLIES = [
  "Let me check that for you now, one moment.",
  "I can help with that. Give me a moment to look.",
  "That one is common — here's how to fix it.",
  "No wahala, I go sort this out for you.",
  "Let me route this to a human on our team, hold on.",
  "You can do this under Settings → Security. Want me to walk you through?",
];

/* ----------------------------- nav ----------------------------- */
const NAVS = {
  super: [
    { id: "dashboard", ic: "chart", label: "Platform Overview" },
    { id: "tenants", ic: "building", label: "Tenants" },
    { id: "audit", ic: "shield", label: "Audit Log" },
    { id: "settings", ic: "settings", label: "Platform Settings" },
  ],
  owner: [
    { id: "dashboard", ic: "chart", label: "Analytics" },
    { id: "tickets", ic: "ticket", label: "Ticket queue", count: "open" },
    { id: "escalation", ic: "zap", label: "Escalation rules" },
    { id: "agents", ic: "users", label: "Agents" },
    { id: "billing", ic: "card", label: "Billing & plan" },
    { id: "brand", ic: "sparkles", label: "Brand & widget" },
    { id: "profile", ic: "user", label: "Profile" },
  ],
  agent: [
    { id: "dashboard", ic: "chart", label: "My stats" },
    { id: "tickets", ic: "ticket", label: "Ticket queue", count: "open" },
    { id: "profile", ic: "user", label: "Profile" },
  ],
};

const openCount = () => MOCK.tickets.filter((t) => t.status !== "resolved").length;

function sidebarHTML() {
  const items = NAVS[state.role] || [];
  let html = items.map((n) => {
    const badge = n.count === "open" && openCount() > 0 ? `<span class="count">${openCount()}</span>` : "";
    return `<button class="nav ${state.view === n.id ? "active" : ""}" data-nav="${n.id}">${icon(n.ic)} ${n.label}${badge}</button>`;
  }).join("");
  html += sideCard();
  return html;
}

function sideCard() {
  if (state.role === "super") {
    const active = MOCK.tenants.filter((t) => t.status === "active").length;
    return `<div class="side-card"><b>${MOCK.tenants.length} tenants</b>${active} active · 1 pending · 1 suspended</div>`;
  }
  if (state.role === "owner") {
    const t = MOCK.tenants[0];
    return `<div class="side-card"><b>${esc(t.name)} · ${cap(t.plan)}</b>${t.agents} / ${t.customers.toLocaleString()} customers · ${openCount()} open tickets</div>`;
  }
  return `<div class="side-card"><b>NairaWave Fintech</b>3 assigned to you · 2 escalated</div>`;
}

/* ----------------------------- shell ----------------------------- */
function renderShell() {
  const u = state.user;
  $("#userAvatar").textContent = u.initials;
  $("#userAvatar").className = "avatar " + u.color;
  $("#userName").textContent = u.name;
  $("#userRole").textContent = u.role === "super" ? "Platform Console" : u.roleLabel + " · " + u.tenant;
  $$(".rs-btn").forEach((b) => b.classList.toggle("active", b.dataset.role === u.role));
  $("#sidebar").innerHTML = sidebarHTML();
  $("#main").innerHTML = viewHTML();
  const banner = $("#impBanner");
  banner.classList.toggle("hidden", !state.impersonating);
  $("#impText").textContent = state.impersonating ? `Viewing ${state.impersonating.label} as ${u.name} · 30-min scoped token · audited` : "";
  updateNotifBadge();
}

function viewHTML() {
  const v = state.view;
  if (state.role === "super") return (superViews[v] || superViews.dashboard)();
  if (state.role === "owner") return (ownerViews[v] || ownerViews.dashboard)();
  return (agentViews[v] || agentViews.tickets)();
}

function navigate(v) { state.view = v; renderShell(); }

/* ----------------------------- helpers ----------------------------- */
const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

function pill(status, label) {
  return `<span class="pill ${status}">${label || status.replace("_", " ")}</span>`;
}

function kpi(label, icn, value, note, cls = "") {
  return `<div class="kpi"><div class="k-label">${icon(icn)} ${label}</div><div class="k-value ${cls}">${value}</div><div class="k-note">${note}</div></div>`;
}

function feedHTML(items) {
  return `<div class="feed" id="feed">${items.map((it) => feedItem(it)).join("")}</div>`;
}
function feedItem(it) {
  return `<div class="item"><div class="ev-ic" style="background:${it.color}">${icon(it.ic)}</div><div><div class="ev-title">${esc(it.title)}</div><div class="ev-meta">${esc(it.meta)}</div></div></div>`;
}

function donut(pct, label) {
  return `<div class="donut" style="background:conic-gradient(var(--primary) 0 ${pct}%, var(--surface-3) ${pct}% 100%)"><div class="donut-center"><b>${pct}%</b><small>${label}</small></div></div>`;
}

function barChart(values, colorFn) {
  return `<div class="bars">${values.map((v, i) => `
    <div class="bar-col"><div class="bar" style="height:${v}%;background:${colorFn ? colorFn(i, v) : "var(--primary)"}" data-v="${v}%"></div>
    <div class="bar-x">${i % 2 ? "" : (i + 1) + "d"}</div></div>`).join("")}</div>`;
}

function usageBar(label, used, max, unit = "") {
  const pct = Math.min(100, Math.round((used / max) * 100));
  const cls = pct >= 90 ? "over" : pct >= 60 ? "warn" : "";
  return `<div class="reason-row"><span style="display:flex;gap:8px;align-items:center">${label}</span>
    <b>${used.toLocaleString()}${unit ? " " + unit : ""} / ${max.toLocaleString()}${unit ? " " + unit : ""}</b>
    <div class="meter"><i class="${cls}" style="width:${pct}%"></i></div></div>`;
}

/* =====================================================================
   SUPER ADMIN VIEWS
   ===================================================================== */
const superViews = {
  dashboard: () => {
    const active = MOCK.tenants.filter((t) => t.status === "active").length;
    const pending = MOCK.tenants.filter((t) => t.status === "pending").length;
    const suspended = MOCK.tenants.filter((t) => t.status === "suspended").length;
    return `
      <div class="page-head"><div><h1>Platform Overview</h1><div class="sub">All tenants · live activity across the platform</div></div><div class="spacer"></div>
        <button class="btn primary" onclick="toast('Provision tenant','Tenant create flow opens in the full build')">${icon("plus")} Provision tenant</button></div>
      <div class="grid kpis">
        ${kpi("Total tenants", "building", MOCK.tenants.length, `${active} active · ${pending} pending · ${suspended} suspended`)}
        ${kpi("Tickets (30d)", "ticket", "8,412", "+12% vs last month")}
        ${kpi("Platform deflection", "zap", "68.4%", "~₦2,500 saved per deflected chat", "good")}
        ${kpi("MRR (mock)", "card", "₦90,000", "2 active paid subscriptions")}
      </div>
      <div class="grid two" style="margin-top:18px">
        <div class="card pad0"><div style="padding:16px 18px 0"><h3>Tenants</h3><div class="hint">Approve, suspend or impersonate from here</div></div>
          <table class="table" style="margin-top:8px"><thead><tr><th>Business</th><th>Plan</th><th>Status</th><th>Agents</th><th></th></tr></thead><tbody>
          ${MOCK.tenants.map((t) => `<tr>
            <td><div class="cell-main">${esc(t.name)}</div><div class="cell-sub">${esc(t.email)}</div></td>
            <td style="text-transform:capitalize">${t.plan}</td>
            <td>${pill(t.status)}</td>
            <td>${t.agents}</td>
            <td style="text-align:right">${t.status === "pending"
              ? `<button class="btn sm primary" onclick="approveTenant('${t.id}')">${icon("check")} Approve</button>`
              : t.status === "active"
                ? `<button class="btn sm" onclick="impersonate('${t.id}')">${icon("eye")} Impersonate</button>
                   <button class="btn sm danger" onclick="suspendTenant('${t.id}')">${icon("x")} Suspend</button>`
                : `<button class="btn sm" onclick="reactivateTenant('${t.id}')">${icon("refresh")} Reactivate</button>`}</td>
          </tr>`).join("")}
        </tbody></table></div>
        <div class="card"><h3>Live activity feed</h3><div class="hint">Powered by the realtime event bus (WS /ws/events)</div>
          <div style="margin-top:10px">${feedHTML(MOCK.feed.super)}</div></div>
      </div>
    <div class="card" style="margin-top:18px"><h3>Top tenants by ticket volume (30d)</h3><div class="hint">Where support load is heaviest</div>
      ${MOCK.tenants.filter((t) => (t.volume30d || 0) > 0).slice().sort((a, b) => b.volume30d - a.volume30d).map((t) => `
        <div class="reason-row"><span style="display:flex;gap:8px;align-items:center"><span class="swatch" style="background:${t.color}"></span> ${esc(t.name)}</span>
          <b>${t.volume30d.toLocaleString()}</b><div class="meter"><i style="width:${Math.round((t.volume30d / 3412) * 100)}%"></i></div></div>`).join("")}
    </div>`;
  },

  tenants: () => {
    const list = MOCK.tenants.filter((t) => state.tenantFilter === "All" || cap(t.status) === state.tenantFilter);
    return `
    <div class="page-head"><div><h1>Tenants</h1><div class="sub">Provisioning, status and quota management</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="toast('New tenant','Tenant create form in full build')">${icon("plus")} New tenant</button></div>
    <div class="sec-filter">${["All", "Active", "Pending", "Suspended"].map((f) =>
      `<button class="${state.tenantFilter === f ? "active" : ""}" onclick="setTenantFilter('${f}')">${f}</button>`).join("")}</div>
    <div class="card pad0"><table class="table"><thead><tr><th>Business</th><th>Plan</th><th>Status</th><th>Agents</th><th>Customers</th><th>KB usage</th><th>Actions</th></tr></thead><tbody>
      ${list.map((t) => {
        const pct = Math.min(100, Math.round((t.kbMb / 200) * 100));
        const cls = pct >= 90 ? "over" : pct >= 60 ? "warn" : "";
        return `<tr>
        <td><div class="cell-main">${esc(t.name)}</div><div class="cell-sub">${esc(t.email)} · ${esc(t.city)}</div></td>
        <td style="text-transform:capitalize">${t.plan}</td>
        <td>${pill(t.status)}</td>
        <td>${t.agents} / ${t.plan === "pro" ? 5 : 1}</td>
        <td>${t.customers.toLocaleString()}</td>
        <td style="min-width:130px"><div class="meter"><i class="${cls}" style="width:${pct}%"></i></div><div class="cell-sub">${t.kbMb} MB</div></td>
        <td>${t.status === "pending"
          ? `<button class="btn sm primary" onclick="approveTenant('${t.id}')">Approve</button>`
          : `<button class="btn sm" onclick="impersonate('${t.id}')">${icon("eye")} Impersonate</button>${t.status === "active" ? ` <button class="btn sm danger" onclick="suspendTenant('${t.id}')">Suspend</button>` : ""}`}</td>
      </tr>`;
      }).join("")}
    </tbody></table></div>`;
  },

  audit: () => {
    const q = state.auditQuery.toLowerCase();
    const list = MOCK.audit.filter((a) =>
      (state.auditFilter === "All" || a.actor === state.auditFilter) &&
      (!q || (a.actor + " " + a.action + " " + a.target + " " + a.detail).toLowerCase().includes(q)));
    return `
    <div class="page-head"><div><h1>Audit Log</h1><div class="sub">Every admin + destructive owner action is recorded</div></div><div class="spacer"></div>
      <div class="input-wrap" style="width:240px"><span class="input-ic" data-ic="search"></span><input class="input" id="auditQ" placeholder="Search audit…" value="${esc(state.auditQuery)}" oninput="auditSearch()"></div></div>
    <div class="sec-filter">${["All", "super_admin", "owner", "agent", "customer", "system"].map((f) =>
      `<button class="${state.auditFilter === f ? "active" : ""}" onclick="setAuditFilter('${f}')">${f === "All" ? "All" : f.replace("_", " ")}</button>`).join("")}</div>
    <div class="card pad0"><table class="table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>
      ${list.map((a) => `<tr>
        <td style="white-space:nowrap">${esc(a.time)}</td>
        <td><code>${esc(a.actor)}</code></td>
        <td><b>${esc(a.action)}</b></td>
        <td>${esc(a.target)}</td>
        <td style="color:var(--text-2)">${esc(a.detail)}</td>
      </tr>`).join("")}
    </tbody></table></div>`;
  },

  settings: () => `
    <div class="page-head"><div><h1>Platform Settings</h1><div class="sub">Global defaults inherited by every tenant</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="rtEvent('platform_settings', 'Platform defaults saved & broadcast live');toast('Saved','Platform defaults saved & broadcast live')">${icon("check")} Save changes</button></div>
    <div class="grid two">
      <div class="card"><h3>Plan & quota templates</h3><div class="hint">Editable by super admin only</div>
        ${MOCK.plans.map((p) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
          <div><b>${p.name}</b> · ${p.price}/mo<div style="font-size:12px;color:var(--text-2)">${p.agents} agents · ${p.customers.toLocaleString()} customers · ${p.kb} KB</div></div>
          <button class="btn sm" onclick="toast('Edit plan','${p.name} editor in full build')">Edit</button></div>`).join("")}
      </div>
      <div>
        <div class="card"><h3>Escalation presets (global)</h3><div class="hint">Seeded into every new tenant as E1–E10</div>
          <table class="table" style="margin-top:8px"><thead><tr><th>Rule</th><th>Condition</th><th>Action</th><th></th></tr></thead><tbody>
            ${MOCK.rules.filter((r) => r.preset).slice(0, 6).map((r) => `<tr><td><b>${r.id}</b> ${esc(r.name)}</td><td><code>${r.cond}</code></td><td><code>${r.action}</code></td><td>${pill("active", "seeded")}</td></tr>`).join("")}
          </tbody></table>
          <div style="margin-top:10px"><button class="btn sm" onclick="toast('Presets','Preset versioning in full build')">Manage presets</button></div></div>
        <div class="card" style="margin-top:18px"><h3>Platform defaults</h3>
          <div class="field"><label>Default escalation message</label><textarea class="input" rows="2">Please hold on — a member of our team is joining to help you now.</textarea></div>
          <div class="field"><label>Default brand tone</label><select class="input"><option>professional</option><option selected>casual</option><option>pidgin</option><option>formal</option></select></div>
        </div>
      </div>
    </div>`,
};

/* =====================================================================
   OWNER VIEWS
   ===================================================================== */
const ownerViews = {
  dashboard: () => `
    <div class="page-head"><div><h1>NairaWave · Analytics</h1><div class="sub">Live metrics for your support operation</div></div><div class="spacer"></div>
      <span class="rt-wrap" style="cursor:pointer" onclick="toggleRealtime()"><span class="rt-dot" style="background:${realtimeOn ? "var(--primary)" : "var(--warning)"}"></span><span id="rtLabel2">${realtimeOn ? "live" : "paused"}</span></span></div>
    <div class="grid kpis">
      ${kpi("Tickets this week", "ticket", "1,284", "+8.2% vs last week")}
      ${kpi("Deflection rate", "zap", "95.2%", "≈ ₦3.2M saved / week", "good")}
      ${kpi("Avg first response", "clock", "0.4s", "human handoff 3.1 min")}
      ${kpi("CSAT", "smile", "4.6 / 5", "+0.2 this month", "good")}
      ${kpi("First-contact resolution", "checkcircle", "78%", "industry band 70–80%")}
      ${kpi("Escalation rate", "arrowRight", "11.2%", "healthy band 8–15%", "good")}
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card"><h3>First response time (min)</h3><div class="hint">Human replies after handoff — target under 5 min</div>
        <div style="margin-top:8px">${barChart([4.2, 3.8, 3.1, 2.9, 3.3, 2.7, 2.5, 2.8, 2.4, 2.2, 2.0, 1.9, 2.1, 1.8].map((v) => +(v * 24).toFixed(1)), (i) => (i === 13 ? "var(--primary)" : "var(--info)"))}</div></div>
      <div class="card"><h3>Agent leaderboard (30d)</h3><div class="hint">Resolutions & personal CSAT</div>
        ${MOCK.agents.filter((a) => !a.invited && (a.resolutions30d || 0) > 0).slice().sort((a, b) => b.resolutions30d - a.resolutions30d).map((a, i) => `
          <div class="reason-row"><span style="display:flex;gap:8px;align-items:center">
            <b style="width:16px">${i + 1}</b><span class="avatar sm ${a.color}">${a.initials}</span> ${esc(a.name)}
            <small style="color:var(--text-3)">CSAT ${a.csat ?? "—"}</small></span>
            <b>${a.resolutions30d}</b><div class="meter"><i style="width:${Math.round((a.resolutions30d / 142) * 100)}%"></i></div></div>`).join("")}</div>
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card"><h3>Deflection vs escalation (14d)</h3><div class="hint">AI resolves 95% before a human is needed</div>
        <div style="margin-top:8px">${barChart([72, 78, 75, 82, 88, 90, 87, 92, 94, 95, 93, 96, 95, 96], (i) => (i === 5 ? "var(--danger)" : "var(--primary)"))}</div></div>
      <div class="card"><h3>Live activity feed</h3><div class="hint">Event bus pushes — no page refresh</div>
        <div style="margin-top:10px">${feedHTML(MOCK.feed.owner)}</div></div>
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card"><h3>Triage breakdown</h3><div class="hint">How incoming chats are classified</div>
        <div style="margin-top:10px" class="reason-row"><span style="display:flex;gap:8px;align-items:center"><span class="swatch" style="background:var(--primary)"></span> Inquiries</span><b>62%</b><div class="meter"><i style="width:62%"></i></div></div>
        <div class="reason-row"><span style="display:flex;gap:8px;align-items:center"><span class="swatch" style="background:var(--warning)"></span> Requests</span><b>26%</b><div class="meter"><i class="warn" style="width:26%"></i></div></div>
        <div class="reason-row"><span style="display:flex;gap:8px;align-items:center"><span class="swatch" style="background:var(--danger)"></span> Complaints</span><b>12%</b><div class="meter"><i class="over" style="width:12%"></i></div></div></div>
      <div class="card"><h3>Escalation reasons (30d)</h3><div class="hint">Which rule fired — fed by trigger_count</div>
        <div style="margin-top:6px">${[
          ["E3", "Money / legal threat", 31, "danger"],
          ["E2", "High-frustration phrases", 24, "danger"],
          ["E8", "Negative sentiment burst", 14, "warn"],
          ["E4", "Refund / demands", 11, "warn"],
          ["E9", "Security-sensitive content", 8, "info"],
          ["E1", "Direct human request", 6, "neutral"],
        ].map(([id, name, pct, cls]) => `
          <div class="reason-row"><span style="display:flex;gap:8px;align-items:center"><code>${id}</code> <b>${name}</b></span><b>${pct}%</b><div class="meter"><i class="${cls === "info" ? "warn" : cls === "danger" ? "over" : cls === "warn" ? "warn" : ""}" style="width:${pct * 2.6}%;${cls === "info" ? "background:var(--info)" : ""}"></i></div></div>`).join("")}
      </div>
    </div>`,

  tickets: () => ticketsView(),

  escalation: () => `
    <div class="page-head"><div><h1>Escalation rules</h1><div class="sub">DB-driven · evaluated on every message · edits go live without a restart</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="newRule()">${icon("plus")} New rule</button>
      <button class="btn" onclick="resetPresets()">${icon("refresh")} Reset presets</button></div>
    <div class="grid builder">
      <div>${MOCK.rules.map(ruleCard).join("")}</div>
      <div>
        <div class="card"><h3>Test console</h3><div class="hint">Paste a customer message — see which rules fire. No DB write.</div>
          <div class="field" style="margin-top:10px"><textarea class="input" id="testText" rows="3">You people are thieves! You stole my money and nobody is answering me. I want to speak to a manager NOW!</textarea></div>
          <div class="row"><button class="btn primary" onclick="runTest()">${icon("play")} Run test</button><button class="btn ghost" onclick="fillTest()">${icon("refresh")} Load sample</button></div>
          <div class="console" id="testOut" style="margin-top:12px">
            <div class="line muted">$ POST /api/tenants/me/escalation-rules/test</div>
            <div class="line muted">→ ready. paste a message and run.</div></div>
        </div>
        <div class="card" style="margin-top:18px"><h3>Why this matters</h3>
          <ul style="font-size:12.5px;color:var(--text-2);padding-left:18px;display:grid;gap:6px">
            <li>Rules live in <code>escalation_rules</code>, not hardcoded dicts.</li>
            <li>Edits propagate with no restart (Zendesk needs an add-on + manual tester).</li>
            <li>E10 SLA timeout = Zendesk-style automation built in.</li>
            <li>Every escalation records <b>which rule fired</b> → reason analytics.</li>
          </ul></div>
      </div>
    </div>`,

  agents: () => `
    <div class="page-head"><div><h1>Agents</h1><div class="sub">Invite, manage presence and workload</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="inviteAgent()">${icon("plus")} Invite agent</button></div>
    <div class="grid kpis">
      ${kpi("Active agents", "users", MOCK.agents.filter((a) => !a.invited).length + " / 5", "plan limit: 5")}
      ${kpi("Online now", "activity", MOCK.agents.filter((a) => a.online).length, "presence heartbeat 30s", "good")}
      ${kpi("Open tickets", "ticket", openCount(), "2 escalated", "warn")}
    </div>
    <div class="card pad0" style="margin-top:18px"><table class="table"><thead><tr><th>Agent</th><th>Presence</th><th>Open tickets</th><th>Status</th><th></th></tr></thead><tbody>
      ${MOCK.agents.map((a) => `<tr>
        <td><div class="cell-main">${esc(a.name)}</div><div class="cell-sub">${a.role} · ${esc(a.email)}</div></td>
        <td>${pill(a.online ? "online" : "offline", (a.online ? "● online" : "○ offline"))}</td>
        <td>${a.tickets}</td>
        <td>${a.invited ? pill("pending", "invited") : pill("active", "active")}</td>
        <td style="text-align:right">${a.invited ? `<button class="btn sm" onclick="resendInvite('${a.id}')">${icon("refresh")} Resend</button>` : `<button class="btn sm" onclick="toast('Manage agent','${esc(a.name)} settings in full build')">Manage</button>`}</td>
      </tr>`).join("")}
    </tbody></table></div>`,

  billing: () => {
    const cur = MOCK.tenants[0].plan;
    return `
    <div class="page-head"><div><h1>Billing & Plan</h1><div class="sub">Mock subscription — full end-to-end flow</div></div></div>
    <div class="grid kpis">
      ${kpi("Current plan", "card", cap(cur), `${MOCK.plans.find((p) => p.code === cur).price} / month`)}
      ${kpi("Agents used", "users", "3 / 5", "quota ok")}
      ${kpi("Customers", "globe", "1,842 / 5,000", "36.8% of quota")}
      ${kpi("Next billing", "calendar", "Aug 28", "Visa ···· 4821 · will renew")}
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card"><h3>Usage vs quota</h3><div class="hint">Resets Aug 28 on renewal</div>
        <div style="margin-top:8px">${usageBar("Agents", 3, 5)}${usageBar("Customers", 1842, 5000)}${usageBar("Knowledge base", 320, 20480, "MB")}</div></div>
      <div class="card"><h3>Payment method</h3><div class="hint">Auto-charged on renewal</div>
        <div class="cx-cust" style="margin-top:8px"><span class="avatar sm slate">V</span>
          <div><b>Visa ···· 4821</b><small>expires 08/28 · billing@nairawave.ng</small></div></div>
        <div class="kv" style="grid-template-columns:1fr 1fr;margin-top:12px">
          <div class="cell"><b>Next invoice</b><code>INV-0022 · ₦45,000</code></div>
          <div class="cell"><b>Due</b><code>Aug 28, 2026</code></div></div>
        <button class="btn sm" style="margin-top:12px" onclick="toast('Payment method','Card editor in full build')">${icon("card")} Change card</button></div>
    </div>
    <div class="grid three" style="margin-top:18px">
      ${MOCK.plans.map((p) => {
        const isCur = p.code === cur;
        const dir = MOCK.plans.findIndex((x) => x.code === p.code) > MOCK.plans.findIndex((x) => x.code === cur) ? "Upgrade" : "Downgrade";
        return `<div class="plan-box ${isCur ? "current" : ""}">
          ${p.tag ? `<span class="p-tag">${p.tag}</span>` : ""}
          <div class="p-name">${p.name}</div>
          <div class="p-price">${p.price}<small>/mo</small></div>
          <ul><li>${icon("users")} ${p.agents} agents</li><li>${icon("globe")} ${p.customers.toLocaleString()} customers</li><li>${icon("book")} ${p.kb} KB</li></ul>
          ${isCur ? `<button class="btn" disabled>Current plan</button>` : `<button class="btn ${dir === "Upgrade" ? "primary" : ""}" onclick="choosePlan('${p.code}')">${dir}</button>`}
        </div>`;
      }).join("")}
    </div>
    <div class="card pad0" style="margin-top:18px"><div style="padding:16px 18px 0"><h3>Invoices</h3><div class="hint">Generated monthly · PDF via reportlab in full build</div></div>
      <table class="table" style="margin-top:8px"><thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${MOCK.invoices.map((i) => `<tr>
          <td><code>${i.id}</code></td><td>${i.period}</td><td><b>${i.amount}</b></td>
          <td>${pill(i.status)}</td>
          <td style="text-align:right"><button class="btn sm" onclick="toast('Invoice','PDF download (reportlab placeholder)')">${icon("download")} PDF</button></td>
        </tr>`).join("")}
      </tbody></table></div>`;
  },

  brand: () => `
    <div class="page-head"><div><h1>Brand & widget</h1><div class="sub">Self-styled widget served from GET /api/tenants/me/public — no internal data exposed</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="rtEvent('settings_changed','Brand settings saved & pushed to all dashboards');toast('Saved','Brand settings saved & broadcast live')">${icon("check")} Save & broadcast</button></div>
    <div class="grid two">
      <div class="card"><h3>Widget appearance</h3><div class="hint">Preview updates as you type</div>
        <div class="field"><label>Bot name</label><input class="input" id="wBotName" value="NairaWave Assistant" oninput="previewWidget()"></div>
        <div class="row">
          <div class="field"><label>Primary color</label><input class="input" id="wPrimary" type="color" value="#00a86b" style="height:38px;padding:4px" oninput="previewWidget()"></div>
          <div class="field"><label>Secondary color</label><input class="input" id="wSecondary" type="color" value="#2563eb" style="height:38px;padding:4px" oninput="previewWidget()"></div>
        </div>
        <div class="row">
          <div class="field"><label>Widget position</label><select class="input" id="wPos" onchange="previewWidget()"><option>bottom-right</option><option>bottom-left</option></select></div>
          <div class="field"><label>Logo</label><button class="btn" style="width:100%;justify-content:center" onclick="toast('Logo','File upload in full build')">${icon("upload")} Upload</button></div>
        </div>
        <div class="field"><label>Brand tone</label><select class="input"><option>professional</option><option>casual</option><option selected>pidgin</option><option>formal</option></select></div>
        <div class="field"><label>Welcome message</label><textarea class="input" id="wWelcome" rows="2" oninput="previewWidget()">Hello! I'm NairaWave Assistant. How can I help you today?</textarea></div>
        <div class="field"><label>Proactive teaser</label><textarea class="input" id="wProactive" rows="2" oninput="previewWidget()">Need help with transfers or your PIN? Chat with us — usually replies instantly.</textarea>
          <div class="field-hint">Shown once per session after 1.2s above the launcher.</div></div>
        <div class="field"><label>Escalation message</label><textarea class="input" rows="2">Please hold on — a member of our team is joining to help you now.</textarea></div>
        <div class="field"><label>Launcher text</label><input class="input" id="wLauncher" value="Chat with us" oninput="previewWidget()"></div>
        <div class="switch-row"><div><b>Mobile fullscreen preview</b><small>Widget covers the whole screen under 700px</small></div><label class="switch"><input type="checkbox" id="wMobile" onchange="previewWidget()"><span class="slider"></span></label></div>
      </div>
      <div>
        <div class="card"><h3>Live preview</h3><div class="hint">Try typing into the chat below</div>
          <div class="widget-stage" style="margin-top:10px">
            <div class="site-tab">${icon("globe")} nairawave.ng — customer view</div>
            <div class="widget-dock" id="widgetWrap"></div>
          </div>
        </div>
      </div>
    </div>`,
};

const agentViews = {
  dashboard: () => {
    const mine = MOCK.tickets.filter((t) => t.assignee === state.user.name);
    return `
    <div class="page-head"><div><h1>My stats</h1><div class="sub">Amaka Okafor · NairaWave Fintech</div></div></div>
    <div class="grid kpis">
      ${kpi("Assigned to me", "ticket", mine.length, `${mine.filter((t) => t.status !== "resolved").length} active`)}
      ${kpi("Open queue", "users", openCount(), "across all agents")}
      ${kpi("Resolved (30d)", "checkcircle", "142", "+6 this week", "good")}
      ${kpi("My CSAT", "smile", "4.7 / 5", "above team avg 4.5", "good")}
      ${kpi("My FRT", "clock", "1.8 min", "target < 5 min", "good")}
      ${kpi("Avg resolution", "timer", "4h 20m", "target < 8h")}
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card pad0"><div style="padding:16px 18px 0"><h3>My tickets</h3><div class="hint">Click to open in the queue</div></div>
        ${mine.length ? mine.map((t) => `<div class="queue-row" style="grid-template-columns:110px 1fr auto;border-bottom:1px solid var(--border);cursor:pointer" onclick="selectTicket('${t.id}')">
          <span class="q-id">${t.id}</span><span class="q-subj">${esc(t.subject)} <span class="q-cust">· ${esc(t.cust)}</span></span>
          <span>${pill(t.status === "escalated" ? "escalated" : t.status)}</span></div>`).join("") : `<div class="empty">Nothing assigned right now.</div>`}
      </div>
      <div class="card"><h3>Live activity feed</h3><div class="hint">Event bus pushes — no page refresh</div>
        <div style="margin-top:10px">${feedHTML(MOCK.feed.agent)}</div></div>
    </div>`;
  },

  tickets: () => ticketsView(),

  profile: () => `
    <div class="page-head"><div><h1>Profile</h1><div class="sub">Agent preferences</div></div></div>
    <div class="grid two">
      <div class="card"><h3>Profile</h3>
        <div class="field"><label>Display name</label><input class="input" value="${state.user.name}"></div>
        <div class="field"><label>Email</label><input class="input" value="${state.user.email}"></div>
        <div class="field"><label>Presence</label><div>${pill("online", "● online")} <button class="btn sm" style="margin-left:6px" onclick="toast('Presence','Status pushed to dashboards via agent_presence event')">Go offline</button></div></div>
      </div>
      <div class="card"><h3>Notifications</h3>
        <div class="switch-row"><div><b>New escalation assigned</b><small>Push + toast on the bus</small></div><label class="switch"><input type="checkbox" checked><span class="slider"></span></label></div>
        <div class="switch-row"><div><b>Ticket resolved by me</b><small>Confirmation</small></div><label class="switch"><input type="checkbox" checked><span class="slider"></span></label></div>
        <div class="switch-row"><div><b>Email digest</b><small>Daily summary</small></div><label class="switch"><input type="checkbox"><span class="slider"></span></label></div>
      </div>
    </div>`,
};

/* =====================================================================
   TICKET QUEUE (owner + agent) — v3.2 3-pane inbox
   ===================================================================== */
function ticketsView() {
  return `
    <div class="page-head"><div><h1>Ticket Queue</h1><div class="sub">Live queue — new tickets & escalations push in realtime</div></div><div class="spacer"></div>
      ${pill("online", "● connected")}</div>
    <div class="sec-filter">${["All", "Mine", "Unassigned", "Escalated", "Resolved"].map((f) =>
      `<button class="${state.queueFilter === f ? "active" : ""}" onclick="setFilter('${f}')">${f}</button>`).join("")}</div>
    <div class="grid inbox3">
      <div class="card pad0">
        <div class="queue-list">
          <div class="qhead"><span>Ticket</span><span>Subject / customer</span><span>Priority</span><span>Status</span><span>SLA</span><span>Preview</span><span>Age</span></div>
          ${filteredTickets().map(queueRow).join("")}
          ${filteredTickets().length ? "" : `<div class="empty">No tickets match this filter.</div>`}
        </div>
      </div>
      <div>${convView()}</div>
      <div>${contextPanel()}</div>
    </div>`;
}

function filteredTickets() {
  const f = state.queueFilter;
  let list = [...MOCK.tickets];
  if (f === "Mine") list = list.filter((t) => (state.role === "agent" ? t.assignee === state.user.name : t.assignee));
  if (f === "Unassigned") list = list.filter((t) => !t.assignee && t.status !== "resolved");
  if (f === "Escalated") list = list.filter((t) => t.status === "escalated");
  if (f === "Resolved") list = list.filter((t) => t.status === "resolved");
  return list;
}

function queueRow(t) {
  return `<div class="queue-row ${t.id === state.selectedTicket ? "selected" : ""}" onclick="selectTicket('${t.id}')">
    <span class="q-id">${t.unread ? `<i class="unread-dot" title="unread"></i>` : ""}${t.id}</span>
    <span><span class="q-subj">${esc(t.subject)}</span><span class="q-cust">${icon("user")} ${esc(t.cust)} · ${cap(t.channel)}</span></span>
    <span>${pill(t.priority)}</span>
    <span>${pill(t.status === "escalated" ? "escalated" : t.status === "in_progress" ? "info" : t.status)}</span>
    <span>${slaTag(t)}</span>
    <span class="q-prev">${esc(t.preview)}</span>
    <span style="color:var(--text-2);font-size:12px">${t.time}</span>
  </div>`;
}

function slaTag(t) {
  if (!t.sla) return `<span class="pill neutral">—</span>`;
  const overdue = String(t.sla).includes("overdue");
  return `<span class="pill ${overdue ? "overdue" : "info"}">${overdue ? "SLA overdue" : "SLA " + t.sla}</span>`;
}

function convView() {
  const t = MOCK.tickets.find((x) => x.id === state.selectedTicket);
  if (!t) return `<div class="card"><div class="empty">Select a ticket to open the conversation.</div></div>`;
  const resolved = t.status === "resolved";
  return `
    <div class="card">
      ${t.assist && !resolved ? handoverBanner(t) : ""}
      <div class="card-head"><div><h3>${t.id} · ${esc(t.subject)}</h3><div class="hint">${esc(t.cust)} · ${cap(t.channel)} · ${t.type} · sentiment ${t.sentiment}</div></div>
        <div class="spacer"></div>
        ${pill(t.status === "escalated" ? "escalated" : t.status === "in_progress" ? "info" : t.status)}
        ${!resolved ? `<select class="input" style="width:150px;font-size:12px" onchange="assignTicket('${t.id}', this.value)">
          <option value="">Assign to…</option>${MOCK.agents.filter((a) => !a.invited).map((a) => `<option ${t.assignee === a.name ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
          <button class="btn primary sm" onclick="resolveTicket('${t.id}')">${icon("check")} Resolve</button>` : ""}
      </div>
      <div class="conv">
        ${t.msgs.map((m) => m.who === "sys"
          ? `<div class="msg system">${esc(m.text)}</div>`
          : m.who === "note"
            ? `<div class="msg note">${icon("lock")} <span><b>Private note</b>${esc(m.text)}</span></div>`
            : `<div class="msg ${m.who === "a" ? "from-agent" : m.who === "ai" ? "from-ai" : "from-cust"}">
                <div class="who">${m.who === "a" ? icon("user") + " " + esc(t.assignee || "Agent") : m.who === "ai" ? icon("bot") + " AI assistant" : icon("user") + " " + esc(t.cust)}</div>
                ${esc(m.text)}</div>`).join("")}
      </div>
      ${resolved ? `<div style="margin-top:14px;text-align:center">${pill("resolved", "resolved — CSAT pending")}</div>` : `
      <div class="composer-wrap">
        <div class="canned hidden" id="cannedBox">${MOCK.canned.map((c, i) => `<button class="canned-row" onclick="useCanned(${i})"><b>${esc(c.label)}</b><small>${esc(c.text)}</small></button>`).join("")}</div>
        <div class="composer">
          <button class="btn sm" onclick="toggleCanned()" title="Canned responses">${icon("plus")}</button>
          <textarea class="input" id="composerInput" rows="2" placeholder="Type your reply…  ( / for canned )"></textarea>
          <button class="btn primary" onclick="sendReply()">${icon("send")} Send</button>
        </div>
      </div>`}
    </div>`;
}

function handoverBanner(t) {
  return `<div class="handover">${icon("zap")}<div><b>AI handover summary</b><span>${esc(t.assist.reason)}</span><p>${esc(t.assist.summary)}</p></div></div>`;
}

/* ---------------- context panel (Zendesk/Chatwoot-style right rail) ---------------- */
function contextPanel() {
  const t = MOCK.tickets.find((x) => x.id === state.selectedTicket);
  if (!t) return `<div class="card"><div class="empty">No ticket selected.</div></div>`;
  const past = MOCK.pastTickets.filter((p) => (p.cust && p.cust === t.cust) || (p.email && p.email === t.email));
  const seg = t.sentiment === "Positive" ? "VIP · high-value" : t.priority === "high" ? "Priority segment" : "Standard";
  return `
    <div class="card cx-panel">
      <div class="cx-block">
        <div class="card-head"><h3>Customer</h3></div>
        <div class="cx-cust">
          <span class="avatar sm ${t.priority === "high" ? "amber" : "slate"}">${esc((t.cust || "?").charAt(0))}</span>
          <div><b>${esc(t.cust)}</b><small>${esc(t.phone || "—")} · ${cap(t.channel)}</small></div>
        </div>
        <div class="kv" style="grid-template-columns:1fr 1fr">
          <div class="cell"><b>Segment</b><code>${seg}</code></div>
          <div class="cell"><b>Language</b><code>en-NG</code></div>
          <div class="cell"><b>Sentiment</b><code>${esc(t.sentiment)}</code></div>
          <div class="cell"><b>Opened</b><code>${esc(t.time)}</code></div>
        </div>
      </div>
      <div class="cx-block">
        <div class="card-head"><h3>Past tickets</h3>${past.length ? `<span class="pill neutral">${past.length}</span>` : ""}</div>
        ${past.length ? past.slice(0, 4).map((p) => `<div class="pt-row"><div><b>${esc(p.id)}</b><small>${esc(p.subject)}</small></div>${pill(p.status)}</div>`).join("")
          : `<div class="empty" style="padding:14px 0">No past tickets.</div>`}
      </div>
      <div class="cx-block">
        <div class="card-head"><h3>Knowledge base</h3></div>
        <input class="input" id="cxKb" placeholder="Search articles…" oninput="cxKbSearch()">
        <div id="cxKbList" style="margin-top:8px">${kbResults("", "t1")}</div>
      </div>
      ${t.assist && t.status !== "resolved" ? `<div class="cx-block">${assistPanel(t)}</div>` : ""}
      <div class="cx-block">
        <div class="card-head"><h3>Private note</h3><span class="pill neutral">team only</span></div>
        <textarea class="input" id="noteInput" rows="2" placeholder="Add an internal note… (use @name to mention)"></textarea>
        <button class="btn sm" style="margin-top:8px" onclick="addNote('${t.id}')">${icon("lock")} Add note</button>
      </div>
    </div>`;
}

function kbResults(q, tenantId) {
  const qq = (q || "").toLowerCase();
  const list = MOCK.articles.filter((a) => (!tenantId || a.tenantId === tenantId) && (!qq || (a.title + " " + a.snippet).toLowerCase().includes(qq))).slice(0, 5);
  return list.map((a) => `<button class="cx-kb" onclick="openArticle('${a.id}')"><b>${esc(a.title)}</b><small>${esc(a.snippet.slice(0, 54))}…</small></button>`).join("")
    || `<div class="empty" style="padding:14px 0">No articles found.</div>`;
}
function cxKbSearch() {
  const el = $("#cxKbList");
  if (el) el.innerHTML = kbResults($("#cxKb")?.value || "", "t1");
}
function addNote(id) {
  const t = MOCK.tickets.find((x) => x.id === id);
  const inp = $("#noteInput");
  const text = inp?.value.trim();
  if (!text) return toast("Empty note", "Write a note first", "error");
  t.msgs.push({ who: "note", text: text + "  ·  @" + state.user.name });
  inp.value = "";
  rtEvent("ticket_updated", `Private note added to ${id}`);
  toast("Note added", "Visible to your team only — not the customer");
  renderShell();
}
function toggleCanned() {
  const b = $("#cannedBox");
  if (b) b.classList.toggle("hidden");
}
function useCanned(i) {
  const c = MOCK.canned[i];
  const inp = $("#composerInput");
  if (inp) inp.value = inp.value ? inp.value + " " + c.text : c.text;
  toggleCanned();
  toast("Canned", c.label + " inserted — review before sending");
}

function assistPanel(t) {
  const a = t.assist;
  return `
    <h4>${icon("sparkles")} Agent assist <span class="ai-chip">AI working with you</span></h4>
    <div class="kv" style="grid-template-columns:1fr"><div class="cell"><b>Escalation reason</b><code>${esc(a.reason)}</code></div></div>
    <div style="margin-top:10px;font-size:12.5px"><b>Summary</b><p style="color:var(--text-2);margin-top:3px">${esc(a.summary)}</p></div>
    <div style="margin-top:12px"><b style="font-size:12.5px">Relevant knowledge</b>
      ${a.chunks.map((c) => `<div class="kb">${icon("file")}<div><b>${esc(c)}</b><small>matched via RAG · confidence 0.92</small></div></div>`).join("")}
    </div>
    <div style="margin-top:12px"><b style="font-size:12.5px">Suggested reply</b>
      <div class="suggest" style="margin-top:6px">${esc(a.suggest)}</div></div>
    <div class="next-actions">
      <button class="btn primary sm" onclick="useSuggest('${t.id}')">${icon("copy")} Use reply</button>
      <button class="btn sm" onclick="resolveTicket('${t.id}')">${icon("check")} Resolve</button>
      <button class="btn sm" onclick="toast('Escalated','Sent to owner for refund sign-off')">${icon("arrowRight")} Escalate to owner</button>
    </div>`;
}

/* =====================================================================
   RULE BUILDER
   ===================================================================== */
function ruleCard(r) {
  return `
  <div class="rule-card ${r.enabled ? "" : "disabled"}" data-rule="${r.id}">
    <div class="rule-head" onclick="this.parentElement.classList.toggle('open')">
      <label class="switch" onclick="event.stopPropagation()"><input type="checkbox" ${r.enabled ? "checked" : ""} onchange="toggleRule('${r.id}', this.checked)"><span class="slider"></span></label>
      <div><div class="rule-name">${r.id} · ${esc(r.name)}</div><div class="rule-desc">${esc(r.desc)}</div></div>
      <span class="rule-tag ${r.preset ? "preset" : "neutral"}">${r.preset ? "preset E1–E10" : "custom"}</span>
      <div class="rule-actions">
        <button class="btn sm" onclick="event.stopPropagation();openRule('${r.id}')">${icon("edit")} Edit</button>
        <button class="btn sm danger" onclick="event.stopPropagation();${r.preset ? `resetRule('${r.id}')` : `deleteRule('${r.id}')`}">${r.preset ? `${icon("refresh")} Reset` : `${icon("trash")} Delete`}</button>
      </div>
    </div>
    <div class="rule-body"><div class="inner">
      <div class="kv">
        <div class="cell"><b>Condition</b><code>${r.cond}</code></div>
        <div class="cell"><b>Action</b><code>${r.action}</code></div>
        <div class="cell"><b>Last fired</b><code>${r.lastFired || "—"}</code></div>
        <div class="cell"><b>Trigger count (30d)</b><code>${r.trigger || 0}</code></div>
      </div>
      <div class="tags" style="margin-top:10px">${(r.terms || []).map((t) => `<span class="tag ${r.enabled ? "" : "off"}">${esc(t)}</span>`).join("")}</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn sm primary" onclick="testRule('${r.id}')">${icon("play")} Test against sample text</button>
      </div>
    </div></div>
  </div>`;
}

function openRule(id) {
  const r = MOCK.rules.find((x) => x.id === id);
  openModal(`
    <div class="modal-head"><h3>${icon("zap")} Edit rule ${r.id}</h3><div class="spacer"></div><button class="btn ghost" onclick="closeModal()">${icon("x")}</button></div>
    <div class="modal-body">
      <div class="field"><label>Name</label><input class="input" id="mName" value="${esc(r.name)}"></div>
      <div class="field"><label>Description</label><input class="input" id="mDesc" value="${esc(r.desc)}"></div>
      <div class="row">
        <div class="field"><label>Condition type</label><select class="input" id="mCond">${CONDITIONS.map((c) => `<option ${c === r.cond ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="field"><label>Action</label><select class="input" id="mAction">${ACTIONS.map((a) => `<option ${a === r.action ? "selected" : ""}>${a}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Trigger terms (comma separated)</label>
        <textarea class="input" id="mTerms" rows="3">${esc((r.terms || []).join(", "))}</textarea>
        <div class="field-hint">Used for keyword / segment conditions — lowercase, comma separated. E.g. wetin dey happen, ole, scam</div></div>
      <div class="switch-row"><div><b>Enabled</b><small>Evaluated on every incoming message</small></div><label class="switch"><input type="checkbox" id="mEnabled" ${r.enabled ? "checked" : ""}><span class="slider"></span></label></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveRule('${r.id}')">${icon("check")} Save rule</button></div>`);
}

function newRule() {
  openModal(`
    <div class="modal-head"><h3>${icon("plus")} New escalation rule</h3><div class="spacer"></div><button class="btn ghost" onclick="closeModal()">${icon("x")}</button></div>
    <div class="modal-body">
      <div class="field"><label>Name</label><input class="input" id="mName" placeholder="e.g. VIP complaint about delivery"></div>
      <div class="field"><label>Description</label><input class="input" id="mDesc" placeholder="Short description of when this fires"></div>
      <div class="row">
        <div class="field"><label>Condition type</label><select class="input" id="mCond">${CONDITIONS.map((c) => `<option>${c}</option>`).join("")}</select></div>
        <div class="field"><label>Action</label><select class="input" id="mAction">${ACTIONS.map((a) => `<option>${a}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Trigger terms (comma separated)</label>
        <textarea class="input" id="mTerms" rows="3" placeholder="delayed package, lost, where my package"></textarea>
        <div class="field-hint">Custom rules are stored in the escalation_rules table just like presets.</div></div>
      <div class="switch-row"><div><b>Enabled</b><small>Active immediately after creation</small></div><label class="switch"><input type="checkbox" id="mEnabled" checked><span class="slider"></span></label></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveNewRule()">${icon("check")} Create rule</button></div>`);
}

function saveRule(id) {
  const r = MOCK.rules.find((x) => x.id === id);
  r.name = $("#mName").value || r.name;
  r.desc = $("#mDesc").value || r.desc;
  r.cond = $("#mCond").value;
  r.action = $("#mAction").value;
  r.terms = $("#mTerms").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  r.enabled = $("#mEnabled").checked;
  closeModal();
  rtEvent("escalation_rules_changed", `${r.id} updated — live on next message`);
  toast("Rule saved", `${r.id} updated · live on next message`);
  renderShell();
}

function saveNewRule() {
  const name = $("#mName").value.trim();
  if (!name) return toast("Name required", "Give your rule a name", "error");
  const next = "C" + (MOCK.rules.filter((r) => !r.preset).length + 1);
  MOCK.rules.push({
    id: next, name, desc: $("#mDesc").value.trim() || "Custom rule",
    preset: false, enabled: $("#mEnabled").checked, cond: $("#mCond").value, action: $("#mAction").value,
    terms: $("#mTerms").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
  });
  closeModal();
  rtEvent("escalation_rules_changed", `${next} created by owner`);
  toast("Rule created", `${next} · active immediately`);
  renderShell();
}

function toggleRule(id, on) {
  const r = MOCK.rules.find((x) => x.id === id);
  r.enabled = on;
  rtEvent("escalation_rules_changed", `${r.id} ${on ? "enabled" : "disabled"} — live on next message`);
  toast("Rule updated", `${r.id} ${on ? "enabled" : "disabled"}`);
}

function resetRule(id) {
  const d = RULE_DEFAULTS.find((x) => x.id === id);
  const r = MOCK.rules.find((x) => x.id === id);
  Object.assign(r, { ...d, terms: [...d.terms] });
  toast("Preset restored", `${id} reset to default`);
  renderShell();
}

function resetPresets() {
  RULE_DEFAULTS.forEach((d) => {
    const r = MOCK.rules.find((x) => x.id === d.id);
    if (r) Object.assign(r, { ...d, terms: [...d.terms] });
  });
  rtEvent("escalation_rules_changed", "E1–E10 restored to presets");
  toast("Presets reset", "E1–E10 restored · live on next message");
  renderShell();
}

function deleteRule(id) {
  MOCK.rules = MOCK.rules.filter((r) => r.id !== id);
  toast("Rule deleted", `${id} removed from escalation_rules`);
  renderShell();
}

function testRule(id) {
  const r = MOCK.rules.find((x) => x.id === id);
  const txt = $("#testText");
  if (txt) txt.value = SAMPLES[r.cond] || "Sample customer message…";
  runTest();
  toast("Tested", `${r.id} evaluated against sample text`);
}

function fillTest() {
  $("#testText").value = "You people are thieves! You stole my money and nobody is answering me. I want to speak to a manager NOW!";
  runTest();
}

function runTest() {
  const text = ($("#testText")?.value || "").toLowerCase();
  const hits = MOCK.rules.filter((r) => r.enabled && testHit(r, text));
  const out = $("#testOut");
  let html = `<div class="line muted">$ POST /api/tenants/me/escalation-rules/test</div>`;
  html += `<div class="line muted">→ "${esc(text.slice(0, 58))}${text.length > 58 ? "…" : ""}" · enabled rules: ${MOCK.rules.filter((r) => r.enabled).length}</div>`;
  if (!hits.length) html += `<div class="line ok">✓ no rules fired — AI replies directly</div>`;
  hits.forEach((h) => { html += `<div class="line hit">⚡ ${h.id} ${esc(h.name)} → ${h.action}</div>`; });
  if (hits.some((h) => h.action.startsWith("escalate"))) html += `<div class="line ok">→ escalated_at set · routed to online agent · audit written</div>`;
  out.innerHTML = html;
  if (hits.length) rtEvent("rule_test", `Test console: ${hits.map((h) => h.id).join(", ")} fired`);
}

function testHit(r, text) {
  switch (r.cond) {
    case "customer_request": return /human|agent|manager|representative|speak to (someone|a person)/.test(text);
    case "keywords": {
      const terms = (r.terms || []).concat(["thie", "stole"]);
      return terms.some((k) => text.includes(String(k)));
    }
    case "sentiment_negative": return /frustrat|angry|thiev|stole|embarrass|ridiculous|annoyed/.test(text);
    case "confidence_below": return /(don't understand|not helping|what do you mean)/.test(text);
    case "conversation_loop": return /(why aren't you answering|are you there|hello\?)/.test(text);
    case "repeat_failed_self_service": return /(asked three times|same question|still the same)/.test(text);
    case "pii_security": return /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b|otp|password|card number/.test(text);
    case "sla_timeout": return /(waiting for hours|no reply)/.test(text);
    case "customer_segment": return /vip/.test(text);
    default: return false;
  }
}

/* =====================================================================
   TICKET INTERACTIONS
   ===================================================================== */
function setFilter(f) { state.queueFilter = f; renderShell(); }
function setTenantFilter(f) { state.tenantFilter = f; renderShell(); }
function setAuditFilter(f) { state.auditFilter = f; renderShell(); }
function auditSearch() { state.auditQuery = $("#auditQ")?.value || ""; renderShell(); }
function selectTicket(id) { state.selectedTicket = id; renderShell(); }

function assignTicket(id, name) {
  const t = MOCK.tickets.find((x) => x.id === id);
  t.assignee = name;
  if (name && t.status === "open") t.status = "in_progress";
  toast("Assigned", `${t.id} → ${name || "unassigned"}`);
  renderShell();
}

function resolveTicket(id) {
  const t = MOCK.tickets.find((x) => x.id === id);
  if (t.status === "resolved") return;
  t.status = "resolved";
  t.msgs.push({ who: "sys", text: `Resolved by ${state.user.name}` });
  rtEvent("ticket_updated", `${t.id} resolved by ${state.user.name}`);
  toast("Resolved", `${t.id} closed · CSAT request queued`);
  renderShell();
}

function useSuggest(id) {
  const t = MOCK.tickets.find((x) => x.id === id);
  const c = $("#composerInput");
  if (c && t.assist) c.value = t.assist.suggest;
  toast("Reply loaded", "Suggested reply copied into the box — review before sending");
}

function sendReply() {
  const t = MOCK.tickets.find((x) => x.id === state.selectedTicket);
  const inp = $("#composerInput");
  const text = inp?.value.trim();
  if (!text) return toast("Nothing to send", "Type a reply first", "error");
  t.msgs.push({ who: "a", text });
  if (t.status === "open") t.status = "in_progress";
  if (!t.assignee) t.assignee = state.user.name;
  rtEvent("ticket_updated", `Agent reply sent to ${t.id}`);
  toast("Sent", `Reply delivered to customer over chat WS`);
  renderShell();
}

/* =====================================================================
   TENANT ACTIONS (super)
   ===================================================================== */
function approveTenant(id) {
  const t = MOCK.tenants.find((x) => x.id === id);
  t.status = "active";
  MOCK.audit.unshift({ time: "just now", actor: "super_admin", action: "approve_tenant", target: t.name, detail: "provisioning completed" });
  rtEvent("tenant_approved", `${t.name} approved — owner notified`);
  toast("Approved", `${t.name} is now active`);
  renderShell();
}
function suspendTenant(id) {
  const t = MOCK.tenants.find((x) => x.id === id);
  t.status = "suspended";
  MOCK.audit.unshift({ time: "just now", actor: "super_admin", action: "suspend_tenant", target: t.name, detail: "manual suspension" });
  rtEvent("tenant_suspended", `${t.name} suspended — live banner pushed to owner`);
  toast("Suspended", `${t.name} suspended — live banner pushed`);
  renderShell();
}
function reactivateTenant(id) {
  const t = MOCK.tenants.find((x) => x.id === id);
  t.status = "active";
  MOCK.audit.unshift({ time: "just now", actor: "super_admin", action: "reactivate_tenant", target: t.name, detail: "after review" });
  toast("Reactivated", `${t.name} is active again`);
  renderShell();
}

/* =====================================================================
   AGENT INVITE / BILLING / WIDGET
   ===================================================================== */
function inviteAgent() {
  openModal(`
    <div class="modal-head"><h3>${icon("users")} Invite agent</h3><div class="spacer"></div><button class="btn ghost" onclick="closeModal()">${icon("x")}</button></div>
    <div class="modal-body">
      <div class="field"><label>Work email</label><div class="input-wrap"><span class="input-ic" data-ic="mail"></span><input class="input" id="invEmail" placeholder="agent@nairawave.ng"></div><div class="field-hint">Invite link expires in 7 days (INVITE_EXPIRED)</div></div>
      <div class="field"><label>Role</label><select class="input" id="invRole"><option>agent</option><option>owner</option></select></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="sendInvite()">${icon("send")} Send invite</button></div>`);
  hydrateIcons();
}
function sendInvite() {
  const email = $("#invEmail").value.trim();
  if (!email || !email.includes("@")) return toast("Invalid email", "Enter a valid work email", "error");
  const local = email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const n = MOCK.agents.length + 1;
  MOCK.agents.push({ id: "u" + n, name: local, role: $("#invRole").value, online: false, email, tickets: 0, initials: local[0], color: "slate", invited: true });
  MOCK.audit.unshift({ time: "just now", actor: "owner", action: "invite_agent", target: "NairaWave", detail: email + " invited" });
  closeModal();
  rtEvent("agent_invited", `${email} invited to NairaWave`);
  toast("Invite sent", `${email} · link expires in 7 days`);
  renderShell();
}
function resendInvite(id) {
  const a = MOCK.agents.find((x) => x.id === id);
  toast("Invite resent", `Fresh link sent to ${a.email}`);
}

function choosePlan(code) {
  const cur = MOCK.tenants[0].plan;
  if (code === cur) return toast("Already on this plan", cap(code) + " is your current plan");
  const p = MOCK.plans.find((x) => x.code === code);
  const dir = MOCK.plans.findIndex((x) => x.code === code) > MOCK.plans.findIndex((x) => x.code === cur) ? "Upgrade" : "Downgrade";
  const risk = dir === "Downgrade" && MOCK.agents.filter((a) => !a.invited).length > p.agents ? `<div class="note" style="margin-top:10px">${icon("warning")} You have ${MOCK.agents.filter((a) => !a.invited).length} agents but ${p.name} allows ${p.agents} — over-quota agents will be blocked (QUOTA_EXCEEDED).</div>` : "";
  openModal(`
    <div class="modal-head"><h3>${icon("card")} Confirm ${dir} → ${p.name}</h3><div class="spacer"></div><button class="btn ghost" onclick="closeModal()">${icon("x")}</button></div>
    <div class="modal-body">
      <div class="kv"><div class="cell"><b>Current plan</b><code>${cap(cur)} · ${MOCK.plans.find((x) => x.code === cur).price}/mo</code></div>
        <div class="cell"><b>New plan</b><code>${p.name} · ${p.price}/mo</code></div></div>
      <div style="margin-top:12px;font-size:12.5px;color:var(--text-2)">Effective immediately · ${dir === "Upgrade" ? "prorated to next cycle" : "invoice generated for current cycle"} · audited.</div>
      ${risk}
    </div>
    <div class="modal-foot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="confirmPlan('${code}')">${icon("check")} Confirm ${dir}</button></div>`);
}
function confirmPlan(code) {
  const t = MOCK.tenants[0];
  t.plan = code;
  const p = MOCK.plans.find((x) => x.code === code);
  MOCK.invoices.unshift({ id: "INV-0022", period: "Aug 28 – Sep 28", amount: p.price, status: "pending", method: "Visa ···· 4821" });
  MOCK.audit.unshift({ time: "just now", actor: "owner", action: "change_plan", target: "NairaWave", detail: `${cap(code)} plan` });
  closeModal();
  rtEvent("billing_changed", `${t.name} moved to ${p.name} plan`);
  toast("Plan changed", `${p.name} · ${p.price}/mo · invoice INV-0022 pending`);
  renderShell();
}

function previewWidget() {
  const col = $("#wPrimary")?.value || "#00a86b";
  const sec = $("#wSecondary")?.value || "#2563eb";
  const name = $("#wBotName")?.value || "NairaWave Assistant";
  const welcome = $("#wWelcome")?.value || "Hello! How can I help you today?";
  const proactive = $("#wProactive")?.value || "";
  const launcher = $("#wLauncher")?.value || "Chat with us";
  const mobile = !!$("#wMobile")?.checked;
  const stage = document.querySelector(".widget-stage");
  if (stage) stage.classList.toggle("mobile", mobile);
  const w = $("#widgetWrap");
  if (!w) return;
  w.innerHTML = `
    ${proactive ? `<div class="teaser-card">${icon("sparkles")} <span>${esc(proactive)}</span></div>` : ""}
    <div class="widget-bubble">
      <div class="w-head" style="background:${col}"><div class="w-ava">${esc(name.charAt(0))}</div><b>${esc(name)}</b><span class="w-state" style="color:rgba(255,255,255,.9)">● online</span></div>
      <div class="w-body">
        <div class="w-chat"><div class="w-bot">${esc(welcome)}</div>
          <div class="w-chips"><button class="w-chip">Track my ticket</button><button class="w-chip">Transfer status</button><button class="w-chip">Refund help</button></div></div>
        <div class="w-input"><input class="inp" id="widgetInp" placeholder="Type a message…" onkeydown="if(event.key==='Enter')widgetSend()">
          <button class="w-send" style="background:${col}" onclick="widgetSend()">${icon("send")}</button></div>
      </div>
    </div>
    <div class="launcher"><span class="lb" style="background:${col}">${icon("bot")}</span> ${esc(launcher)}</div>`;
}

function widgetSend() {
  const inp = $("#widgetInp");
  const text = inp?.value.trim();
  if (!text) return;
  const chat = document.querySelector("#widgetWrap .w-chat");
  chat.innerHTML += `<div class="w-mine">${esc(text)}</div>`;
  inp.value = "";
  const typing = document.createElement("div");
  typing.className = "w-typing";
  typing.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(typing);
  setTimeout(() => {
    typing.remove();
    chat.innerHTML += `<div class="w-bot">${esc(AI_REPLIES[Math.floor(Math.random() * AI_REPLIES.length)])}</div>`;
    chat.parentElement.scrollTop = chat.parentElement.scrollHeight;
  }, 1300);
}

/* =====================================================================
   CUSTOMER PORTAL + CHATBOT (public demo)
   Runs the SAME rule engine as the test console — escalations create
   real tickets that flow straight into the agent queue.
   ===================================================================== */
const CUST_SUBS = {
  "Complaint": ["Card & account", "Charge / debit", "Failed alert", "Refund / reversal", "Other"],
  "Request": ["Transfer / settlement", "PIN reset", "Statement / document", "Account update", "Other"],
  "Inquiry": ["Product / fees", "Working hours", "Transaction status", "Security", "Other"],
};
const CUST_TYPES = Object.keys(CUST_SUBS);
const custState = { mode: "portal", tenantId: "t1", fromApp: false, session: null, deflections: 0, poll: null, teaserShown: false, csatRated: false };
let teaserTimer = null;
const custActiveEl = () => (custState.mode === "widget"
  ? { inp: $("#custInp"), chat: $("#custChat") }
  : { inp: $("#portalInp"), chat: $("#portalChat") });

const toneOf = (t) => t.tone || "professional";
const welcomeFor = (t) => ({
  professional: `Hello! I'm the ${t.name} assistant. How can I help you today?`,
  casual: "Hey there! What can I help you with?",
  pidgin: `How far! Na me be ${t.name} bot. Wetin you need?`,
  formal: `Good day. This is the ${t.name} support assistant. How may we assist you?`,
})[toneOf(t)] || `Hello! I'm the ${t.name} assistant. How can I help you today?`;

function nextTicketId() {
  const n = Math.max(...MOCK.tickets.map((t) => parseInt(t.id.replace("TK-", ""), 10)));
  return "TK-" + (n + 1);
}
function detectSentiment(text) {
  const t = String(text).toLowerCase();
  if (/(thief|stole|angry|frustrat|useless|stupid|scam|fraud|ridiculous|embarrass|rip)/.test(t)) return "Negative";
  if (/(thank|great|awesome|perfect|love)/.test(t)) return "Positive";
  return "Neutral";
}
const firstWords = (s, n) => String(s).split(/\s+/).slice(0, n).join(" ");

function openCustomerDemo() {
  const prevMode = custState.mode;
  custState.mode = "portal";
  if (prevMode !== "portal") { custState.session = null; custState.csatRated = false; }
  custState.fromApp = !$("#app").classList.contains("hidden");
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#widgetScreen").classList.add("hidden");
  $("#customerScreen").classList.remove("hidden");
  renderCustomerPage();
  custCloseChat();
  hydrateIcons();
  startCustPoll();
}
function closeCustomerDemo() {
  stopCustPoll();
  $("#customerScreen").classList.add("hidden");
  if (custState.fromApp) { $("#app").classList.remove("hidden"); renderShell(); }
  else $("#loginScreen").classList.remove("hidden");
}
function openWidgetDemo() {
  const prevMode = custState.mode;
  custState.mode = "widget";
  if (prevMode !== "widget") { custState.session = null; custState.csatRated = false; }
  custState.fromApp = !$("#app").classList.contains("hidden");
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#customerScreen").classList.add("hidden");
  $("#widgetScreen").classList.remove("hidden");
  renderWidgetPage();
  hydrateIcons();
  startCustPoll();
  startTeaser();
}
function closeWidgetDemo() {
  stopCustPoll();
  dismissTeaser();
  clearTimeout(teaserTimer);
  $("#widgetScreen").classList.add("hidden");
  if (custState.fromApp) { $("#app").classList.remove("hidden"); renderShell(); }
  else $("#loginScreen").classList.remove("hidden");
}

function renderCustomerPage() {
  const t = MOCK.tenants.find((x) => x.id === custState.tenantId) || MOCK.tenants[0];
  $("#custTenant").innerHTML = MOCK.tenants.filter((x) => x.status === "active")
    .map((x) => `<option value="${x.id}" ${x.id === t.id ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  $("#custBrand").innerHTML = `<span class="brand-mark" style="background:${t.color}">${esc(t.name.charAt(0))}</span><div><b>${esc(t.name)}</b><small>help center</small></div>`;
  $("#custHero").textContent = `Ask ${t.name} Assistant anything, or open a ticket and our team will follow up by email.`;
  $("#custType").innerHTML = CUST_TYPES.map((c) => `<option>${c}</option>`).join("");
  custTypeChanged();
  const sid = custState.session && custState.session.ticketId;
  const ticket = sid ? MOCK.tickets.find((x) => x.id === sid) : null;
  custRenderChat(ticket);
  if (ticket) renderCustTrack(ticket.id);
  else { const tr = $("#custTrack"); if (tr) tr.classList.add("hidden"); }
  const kb = $("#kbList");
  if (kb) kb.innerHTML = kbListHTML($("#kbSearch")?.value || "", custState.tenantId);
  renderMyTickets();
}

function renderWidgetPage() {
  const t = MOCK.tenants.find((x) => x.id === custState.tenantId) || MOCK.tenants[0];
  $("#wlyTenant").innerHTML = MOCK.tenants.filter((x) => x.status === "active")
    .map((x) => `<option value="${x.id}" ${x.id === t.id ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  $("#wlyBrand").innerHTML = `<span class="brand-mark" style="background:${t.color}">${esc(t.name.charAt(0))}</span><div><b>${esc(t.name)}</b><small>digital bank</small></div>`;
  $("#custBotHead").style.background = t.color;
  $("#custBotAva").textContent = t.name.charAt(0);
  $("#custBotName").textContent = t.name + " Assistant";
  const launcher = $("#czLauncher");
  if (launcher) { launcher.style.background = t.color; launcher.innerHTML = icon("bot"); }
  const sid = custState.session && custState.session.ticketId;
  const ticket = sid ? MOCK.tickets.find((x) => x.id === sid) : null;
  custRenderChat(ticket);
  custCloseChat();
}
function selectCustTenant() {
  custState.tenantId = $("#custTenant").value;
  custState.session = null;
  renderCustomerPage();
}
function selectWidgetTenant() {
  custState.tenantId = $("#wlyTenant").value;
  custState.session = null;
  custState.csatRated = false;
  dismissTeaser();
  clearTimeout(teaserTimer);
  custState.teaserShown = false;
  renderWidgetPage();
  startTeaser();
}
function custTypeChanged() {
  const type = $("#custType").value || "Complaint";
  $("#custSub").innerHTML = (CUST_SUBS[type] || CUST_SUBS.Complaint).map((s) => `<option>${s}</option>`).join("");
}

/* ---------------- help center: knowledge base + My tickets ---------------- */
function kbListHTML(q, tenantId) {
  const qq = (q || "").toLowerCase();
  const list = MOCK.articles.filter((a) => a.tenantId === tenantId && (!qq || (a.title + " " + a.snippet).toLowerCase().includes(qq)));
  return list.map((a) => `
    <button class="kb-row" onclick="openArticle('${a.id}')">
      <span class="kb-ic">${icon("file")}</span>
      <span><b>${esc(a.title)}</b><small>${esc(a.snippet.slice(0, 78))}…</small><em>${a.views.toLocaleString()} views</em></span>
    </button>`).join("") || `<div class="empty" style="padding:16px 0">No articles match "${esc(q)}" — chat with us on the right instead.</div>`;
}
function custKbSearch() {
  const el = $("#kbList");
  if (el) el.innerHTML = kbListHTML($("#kbSearch")?.value || "", custState.tenantId);
}
function openArticle(id) {
  const a = MOCK.articles.find((x) => x.id === id);
  if (!a) return;
  const related = MOCK.articles.filter((x) => x.tenantId === a.tenantId && x.id !== id).slice(0, 3);
  openModal(`
    <div class="modal-head"><h3>${icon("file")} ${esc(a.title)}</h3><div class="spacer"></div><button class="btn ghost" onclick="closeModal()">${icon("x")}</button></div>
    <div class="modal-body">
      <div style="font-size:12px;color:var(--text-3)">${a.views.toLocaleString()} views · ${a.helpful}% helpful</div>
      <p style="margin-top:12px;color:var(--text-2);font-size:13.5px;line-height:1.65">${esc(a.body)}</p>
      <div style="margin-top:18px"><b style="font-size:12.5px">Was this helpful?</b>
        <div class="row" style="margin-top:8px">
          <button class="btn sm" onclick="kbHelpful('${a.id}', true)">${icon("check")} Yes</button>
          <button class="btn sm" onclick="kbHelpful('${a.id}', false)">${icon("x")} No</button>
        </div></div>
      ${related.length ? `<div style="margin-top:18px"><b style="font-size:12.5px">Related articles</b>
        <div class="kb-list" style="margin-top:8px">${related.map((r) => `<button class="kb-row" onclick="openArticle('${r.id}')"><span class="kb-ic">${icon("file")}</span><span><b>${esc(r.title)}</b></span></button>`).join("")}</div></div>` : ""}
    </div>`);
}
function kbHelpful(id, yes) {
  const a = MOCK.articles.find((x) => x.id === id);
  if (a) a.helpful = Math.min(100, a.helpful + (yes ? 1 : -1));
  toast(yes ? "Thanks for the feedback" : "Noted", yes ? "We'll rank this article higher." : "A human will review this article.");
}
function renderMyTickets() {
  const box = $("#custMyTickets");
  if (!box) return;
  const email = ($("#custEmail")?.value || "").trim().toLowerCase();
  if (!email) { box.classList.add("hidden"); return; }
  const list = MOCK.pastTickets.filter((p) => p.email === email);
  box.classList.remove("hidden");
  const el = $("#custMyTicketsList");
  el.innerHTML = list.length ? list.map((p) => `
    <div class="pt-row">
      <div><b>${esc(p.id)}</b><small>${esc(p.subject)} · ${esc(p.date)}</small></div>
      ${p.status === "resolved" || p.status === "closed"
        ? `<button class="btn sm ghost" onclick="reopenPastTicket('${esc(p.id)}')">${icon("refresh")} Reopen</button>`
        : pill(p.status)}
    </div>`).join("") : `<div class="empty" style="padding:14px 0">No past tickets for this email.</div>`;
}
function reopenPastTicket(id) {
  const p = MOCK.pastTickets.find((x) => x.id === id);
  if (!p) return;
  p.status = "open";
  toast("Reopened", `${id} moved back to our queue — we'll follow up by email`);
  renderMyTickets();
}

function custOpenChat() {
  const w = $("#czWindow");
  if (!w) return;
  w.classList.remove("hidden");
  const l = $("#czLauncher");
  if (l) l.innerHTML = icon("x");
  const sid = custState.session && custState.session.ticketId;
  const t = sid ? MOCK.tickets.find((x) => x.id === sid) : null;
  custRenderChat(t);
  if (t) renderCustTrack(t.id);
  const inp = $("#custInp");
  if (inp) setTimeout(() => { inp.focus(); }, 60);
}
function custCloseChat() {
  const w = $("#czWindow");
  if (w) w.classList.add("hidden");
  const l = $("#czLauncher");
  if (l) l.innerHTML = icon("bot");
}
function custToggleChat() {
  const w = $("#czWindow");
  if (!w) return;
  if (w.classList.contains("hidden")) custOpenChat();
  else custCloseChat();
}

/* ---------------- widget proactive teaser (Intercom-style, once/session) ---------------- */
function startTeaser() {
  if (custState.teaserShown || custState.mode !== "widget") return;
  clearTimeout(teaserTimer);
  teaserTimer = setTimeout(() => {
    if (custState.mode !== "widget") return;
    const scr = $("#widgetScreen");
    if (!scr || scr.classList.contains("hidden")) return;
    const f = $("#czFloat");
    const win = $("#czWindow");
    if (!f || !win || f.querySelector(".cz-teaser")) return;
    const t = MOCK.tenants.find((x) => x.id === custState.tenantId) || MOCK.tenants[0];
    const msg = {
      professional: "Need help with transfers or your PIN? Chat with us.",
      casual: "Hey! Need a hand? I'm here to help.",
      pidgin: "How far! Need help? I dey here.",
      formal: "Good day. How may we assist you today?",
    }[toneOf(t)] || "Need help? Chat with us.";
    const b = document.createElement("div");
    b.className = "cz-teaser";
    b.innerHTML = `<div class="cz-teaser-card">
      <div class="cz-teaser-txt">${icon("sparkles")} <span>${esc(msg)}</span></div>
      <div class="cz-teaser-acts">
        <button class="btn sm primary" onclick="teaserGo()">${icon("message")} Chat</button>
        <button class="btn sm ghost" onclick="dismissTeaser()">${icon("x")} Dismiss</button>
      </div></div>`;
    f.insertBefore(b, win);
    custState.teaserShown = true;
  }, 1200);
}
function dismissTeaser() { const b = document.querySelector(".cz-teaser"); if (b) b.remove(); }
function teaserGo() { dismissTeaser(); custOpenChat(); }

/* ---------------- CSAT rating (shown after a ticket is resolved) ---------------- */
function wRate(n) {
  custState.csatRated = true;
  toast("Thanks!", n + "-star rating recorded · feeds CSAT analytics");
  const sid = custState.session && custState.session.ticketId;
  custRenderChat(sid ? MOCK.tickets.find((x) => x.id === sid) : null);
}

function submitPortalTicket() {
  const name = $("#custName").value.trim();
  const email = $("#custEmail").value.trim();
  const subject = $("#custSubject").value.trim();
  const msg = $("#custMsg").value.trim();
  if (!name || !email || !subject || !msg) return toast("Missing details", "Fill in your name, email, subject and message", "error");
  const type = $("#custType").value;
  const sub = $("#custSub").value;
  const id = nextTicketId();
  const prio = type === "Complaint" ? "high" : type === "Request" ? "medium" : "low";
  const t = MOCK.tenants.find((x) => x.id === custState.tenantId) || MOCK.tenants[0];
  MOCK.tickets.unshift({
    id, subject, cust: name, phone: "—", channel: "portal", status: "open", priority: prio,
    type: type + (sub ? " · " + sub : ""), sentiment: detectSentiment(msg), time: "just now", assignee: null,
    preview: msg.slice(0, 60) + (msg.length > 60 ? "…" : ""),
    msgs: [
      { who: "c", text: msg },
      { who: "ai", text: portalAck(name, id, t) },
    ],
    assist: null,
  });
  MOCK.audit.unshift({ time: "just now", actor: "customer", action: "ticket_created", target: id, detail: `${subject} via portal (${type}${sub ? " / " + sub : ""})` });
  rtEvent("ticket_created", `${id} opened via portal by ${name}`);
  toast("Ticket created", `${id} · follow up in the chat panel on the right`);
  custState.session = { name, email, type, sub, subject, ticketId: id };
  renderCustTrack(id);
  custRenderChat(MOCK.tickets.find((x) => x.id === id));
  renderMyTickets();
}

function portalAck(name, id, t) {
  const first = firstWords(name, 1);
  const tone = toneOf(t);
  const line = {
    professional: `Thanks, ${first} — your ticket ${id} is open and our team has been notified. While you wait, tell me what's happening and I'll either sort it out now or fast-track it for you.`,
    casual: `Thanks ${first}! Ticket ${id} is open. Tell me the gist while you're here — I'll fix it now or get a human on it.`,
    pidgin: `Thanks ${first}! Your ticket ${id} don open. Tell me wetin happen — I go try solve am now or pass you to a human.`,
    formal: `Thank you, ${first}. Your ticket ${id} has been created and our team has been notified. Please describe the issue further and I will resolve it or escalate it promptly.`,
  }[tone] || `Thanks, ${first} — your ticket ${id} is open. What's happening? I can help now or fast-track it for you.`;
  return line;
}

function custSend() {
  const el = custActiveEl();
  const inp = el.inp;
  const text = inp?.value.trim();
  if (!text) return;
  inp.value = "";
  const inPortal = custState.mode === "portal";
  const name = inPortal ? ($("#custName").value.trim() || "Guest") : "Guest";
  const email = inPortal ? ($("#custEmail").value.trim() || "guest@example.com") : "guest@example.com";
  const type = inPortal ? $("#custType").value : "Inquiry";
  const sub = inPortal ? $("#custSub").value : "";
  let ticket = custState.session && MOCK.tickets.find((x) => x.id === custState.session.ticketId);
  if (!ticket) {
    const subject = inPortal ? ($("#custSubject").value.trim() || firstWords(text, 6) + "…") : firstWords(text, 6) + "…";
    const id = nextTicketId();
    ticket = {
      id, subject, cust: name, phone: "—", channel: "chat", status: "open",
      priority: type === "Complaint" ? "high" : type === "Request" ? "medium" : "low",
      type: type + (sub ? " · " + sub : ""), sentiment: detectSentiment(text), time: "just now", assignee: null,
      preview: subject, msgs: [], assist: null,
    };
    MOCK.tickets.unshift(ticket);
    custState.session = { name, email, type, sub, subject, ticketId: id };
  }
  ticket.msgs.push({ who: "c", text });
  const fired = MOCK.rules.filter((r) => r.enabled && testHit(r, text.toLowerCase()));
  if (fired.length) {
    ticket.status = "escalated";
    if (fired.some((r) => r.action.includes("HIGH"))) ticket.priority = "high";
    const ids = fired.map((r) => r.id).join(" + ");
    ticket.msgs.push({ who: "sys", text: `Escalated · ${ids} · priority ${ticket.priority.toUpperCase()} · routed to online agent` });
    ticket.msgs.push({ who: "ai", text: "Please hold on — a member of our team is joining to help you now." });
    ticket.assist = {
      reason: ids, summary: `Auto-routed from the ${type.toLowerCase()} widget — "${firstWords(text, 10)}${text.length > 60 ? "…" : ""}"`,
      chunks: ["Generated live from customer chat", "Rule engine: " + ids],
      suggest: "Acknowledge the issue, confirm the account detail, and take ownership of this ticket.",
    };
    rtEvent("ticket_escalated", `${ticket.id} escalated (${fired.map((r) => r.id).join(", ")}) from customer widget`);
    pushNotif({ ic: "alert", color: "#d93636", title: `New escalation · ${ticket.id} (${fired.map((r) => r.id).join("/")})`, meta: "· from customer widget · priority " + ticket.priority.toUpperCase() });
    toast("New escalation", `${ticket.id} routed to queue — ${fired.map((r) => r.id).join(", ")}`);
  } else {
    custState.deflections++;
    const reply = botReply(text);
    const chat = custActiveEl().chat;
    if (chat) {
      const ty = document.createElement("div");
      ty.className = "w-typing";
      ty.innerHTML = "<span></span><span></span><span></span>";
      chat.appendChild(ty);
    }
    setTimeout(() => {
      ticket.msgs.push({ who: "ai", text: reply });
      custRenderChat(ticket);
      if (inPortal) renderCustTrack(ticket.id);
    }, 900);
    return;
  }
  custRenderChat(ticket);
  if (inPortal) renderCustTrack(ticket.id);
}

function botReply(text) {
  const t = text.toLowerCase();
  const tone = toneOf(MOCK.tenants.find((x) => x.id === custState.tenantId));
  const R = {
    transfer: { professional: "Transfers can take a few minutes to settle. Track it under Transactions, and if it's stuck past 2 hours I'll escalate it for you.", casual: "Transfers usually settle in minutes — check Transactions for live status.", pidgin: "Abeg check under Transactions. If e still dey Processing after 2 hours, make you tell me now.", formal: "Transfers typically settle within a few minutes; you may verify the status under Transactions." },
    pin: { professional: "You can reset your PIN under Settings → Security → Transfer PIN, or dial *737*1# on your linked number.", casual: "Reset it in Settings → Security → Transfer PIN, or dial *737*1#.", pidgin: "Reset am for Settings → Security → Transfer PIN, or dial *737*1#.", formal: "You may reset your PIN under Settings → Security → Transfer PIN or via *737*1#." },
    refund: { professional: "Refund requests are reviewed within 24–48 hours. I've started the check — if it needs a human I'll hand it over.", casual: "Refunds are usually reviewed within 24–48h. On it!", pidgin: "Refund dey review for 24–48 hours. I don start am.", formal: "Refund requests are processed within 24–48 hours and I have initiated the review." },
    card: { professional: "For card issues, you can instantly block the card under Cards in the app. I can walk you through it.", casual: "You can block your card instantly under Cards in the app.", pidgin: "You fit block your card for Cards section right now.", formal: "You may block the card immediately under Cards in the application." },
    security: { professional: "Security issues are taken seriously. Please never share an OTP or password — I'm flagging this for review.", casual: "Never share OTPs or passwords. I've flagged this for a secure review.", pidgin: "No share your OTP or password for anybody. I don flag am.", formal: "We treat security matters with the highest priority; I have flagged this for a secure review." },
    fee: { professional: "All fees are listed on our pricing page. Want me to look up a specific charge on your account?", casual: "Fees are on the pricing page — want me to check a charge for you?", pidgin: "Fees dey for pricing page. You wan make I check one charge for you?", formal: "Our fee schedule is available on the pricing page; I can review a specific charge if you wish." },
    fallback: { professional: "Let me check that for you now, one moment.", casual: "No wahala, I go sort this out for you.", pidgin: "Let me check that for you now, one moment.", formal: "Allow me a moment to check that for you." },
  };
  const intent = /(transfer|send money|settlement|gtbank|bank)/.test(t) ? "transfer"
    : /(pin|password|login)/.test(t) ? "pin"
    : /(refund|money back|reversal|reverse)/.test(t) ? "refund"
    : /(card|block|charge)/.test(t) ? "card"
    : /(otp|security|fraud|hack)/.test(t) ? "security"
    : /(fee|price|cost)/.test(t) ? "fee" : "fallback";
  return (R[intent][tone] || R[intent].professional);
}

function custRenderChat(ticket) {
  const t = MOCK.tenants.find((x) => x.id === custState.tenantId) || MOCK.tenants[0];
  const chat = custActiveEl().chat;
  if (!chat) return;
  let html = `<div class="w-bot">${esc(welcomeFor(t))}</div>`;
  if (!ticket) html += `<div class="w-chips">${["Track my ticket", "Transfer status", "Refund help", "Talk to a human"].map((q) => `<button class="w-chip" onclick="custQuick('${q}')">${esc(q)}</button>`).join("")}</div>`;
  if (ticket) html += ticket.msgs.map((m) => {
    if (m.who === "sys") return `<div class="w-sys">${icon("zap")} ${esc(m.text)}</div>`;
    if (m.who === "a") return `<div class="w-bot agent">${icon("user")} <span>${esc(m.text)}</span></div>`;
    return m.who === "ai" ? `<div class="w-bot">${esc(m.text)}</div>` : `<div class="w-mine">${esc(m.text)}</div>`;
  }).join("");
  if (ticket && ticket.status === "resolved") {
    html += custState.csatRated
      ? `<div class="w-csat done">${icon("checkcircle")} Thanks — your feedback is in.</div>`
      : `<div class="w-csat"><b>How was this support?</b><div class="w-stars">${[1, 2, 3, 4, 5].map((n) => `<button class="w-star" onclick="wRate(${n})" aria-label="${n} star">★</button>`).join("")}</div></div>`;
  }
  chat.innerHTML = html;
  chat.scrollTop = chat.scrollHeight;
}
function custQuick(q) { const inp = custActiveEl().inp; if (inp) inp.value = q; custSend(); }
function renderCustTrack(id) {
  const ticket = MOCK.tickets.find((x) => x.id === id);
  if (!ticket) return;
  const el = $("#custTrack");
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="card-head"><h3>Your ticket</h3><div class="spacer"></div>${pill(ticket.status === "escalated" ? "escalated" : ticket.status === "in_progress" ? "info" : ticket.status)}</div>
    <div class="kv"><div class="cell"><b>Ticket</b><code>${ticket.id}</code></div><div class="cell"><b>Channel</b><code>${cap(ticket.channel)}</code></div></div>
    <div style="margin-top:10px;font-size:12.5px"><b>${esc(ticket.subject)}</b></div>
    <div style="margin-top:4px;color:var(--text-2);font-size:12.5px">${esc(ticket.preview)}</div>
    <div style="margin-top:12px;color:var(--text-3);font-size:12px">We reply by email — this is your live tracker.</div>`;
}
function startCustPoll() {
  stopCustPoll();
  custState.poll = setInterval(() => {
    const scr = custState.mode === "widget" ? $("#widgetScreen") : $("#customerScreen");
    if (!scr || scr.classList.contains("hidden")) return;
    const sid = custState.session && custState.session.ticketId;
    if (!sid) return;
    const ticket = MOCK.tickets.find((x) => x.id === sid);
    if (ticket) {
      custRenderChat(ticket);
      if (custState.mode !== "widget") renderCustTrack(ticket.id);
    }
  }, 1500);
}
function stopCustPoll() { if (custState.poll) { clearInterval(custState.poll); custState.poll = null; } }

/* =====================================================================
   IMPERSONATION
   ===================================================================== */
function impersonate(tenantId) {
  const t = MOCK.tenants.find((x) => x.id === tenantId);
  state.impersonating = { tenantId, label: t.name };
  state.user = IDENTITIES.owner;
  state.role = "owner";
  state.view = "dashboard";
  MOCK.audit.unshift({ time: "just now", actor: "super_admin", action: "impersonate_start", target: t.name, detail: "30-min scoped token · audited" });
  rtEvent("impersonate_start", `Super admin impersonating ${t.name}`);
  toast("Impersonation started", `${t.name} · 30-min scoped token · audited`);
  renderShell();
}
function endImpersonate() {
  if (state.impersonating) MOCK.audit.unshift({ time: "just now", actor: "super_admin", action: "impersonate_end", target: state.impersonating.label, detail: "token revoked · duration audited" });
  state.impersonating = null;
  state.user = IDENTITIES.super;
  state.role = "super";
  state.view = "dashboard";
  rtEvent("impersonate_end", "Impersonation session ended");
  toast("Impersonation ended", "Token revoked · duration audited");
  renderShell();
}

/* =====================================================================
   REALTIME SIMULATOR
   ===================================================================== */
function pushFeed(ev) {
  const feed = $("#feed");
  if (!feed) return;
  const el = document.createElement("div");
  el.className = "item fresh";
  el.innerHTML = feedItem(ev);
  feed.prepend(el);
  while (feed.children.length > 7) feed.lastElementChild.remove();
}
function pushNotif(ev) {
  MOCK.notifications.unshift({ ic: ev.ic, color: ev.color, title: ev.title, meta: ev.meta.replace(/^\s*·\s*/, "· just now"), unread: true });
  updateNotifBadge();
}
function simLoop() {
  if (!realtimeOn || !state.role) return;
  const pool = MOCK.sim[state.role];
  if (!pool || !pool.length) return;
  const ev = pool[Math.floor(Math.random() * pool.length)];
  pushFeed(ev);
  pushNotif(ev);
  toast(ev.title, ev.meta.replace(/^\s*·\s*/, ""));
}
function rtEvent(type, msg) {
  if (!realtimeOn) return;
  pushFeed({ ic: "zap", color: "#2563eb", title: msg, meta: "just now · event bus · " + type });
  pushNotif({ ic: "zap", color: "#2563eb", title: msg, meta: "· event bus · " + type });
}
function toggleRealtime() {
  realtimeOn = !realtimeOn;
  const dot = $(".rt-dot");
  const labels = $$("#rtLabel, #rtLabel2");
  if (dot) dot.style.background = realtimeOn ? "var(--primary)" : "var(--warning)";
  labels.forEach((l) => (l.textContent = realtimeOn ? "live" : "paused"));
  toast("Realtime", realtimeOn ? "Event bus connected" : "Realtime paused");
}

/* =====================================================================
   NOTIFICATIONS
   ===================================================================== */
function toggleNotif() {
  const pop = $("#notifPop");
  if (!pop.classList.contains("hidden")) { pop.classList.add("hidden"); return; }
  pop.innerHTML = `<div class="n-head"><span>Notifications</span><button class="btn sm ghost" onclick="event.stopPropagation();markAllRead()">Mark all read</button></div>
    ${MOCK.notifications.map((n) => `<div class="notif-item ${n.unread ? "unread" : ""}">
      <div class="n-ic" style="background:${n.color}1f;color:${n.color}">${icon(n.ic)}</div>
      <div><div class="n-title">${esc(n.title)}</div><div class="n-meta">${esc(n.meta)}</div></div></div>`).join("")}`;
  pop.classList.remove("hidden");
}
function markAllRead() {
  MOCK.notifications.forEach((n) => (n.unread = false));
  updateNotifBadge();
  toggleNotif();
}
function updateNotifBadge() {
  const c = MOCK.notifications.filter((n) => n.unread).length;
  const b = $("#notifBadge");
  if (!b) return;
  b.textContent = c;
  b.classList.toggle("hidden", c === 0);
}

/* =====================================================================
   SEARCH
   ===================================================================== */
function bindSearch() {
  const box = $("#globalSearch");
  if (!box) return;
  box.addEventListener("input", () => {
    const q = box.value.trim().toLowerCase();
    let dd = $(".search-results");
    if (!q) { dd?.remove(); return; }
    if (!dd) { dd = document.createElement("div"); dd.className = "search-results"; box.closest(".search-box").appendChild(dd); }
    const hits = [];
    MOCK.tickets.forEach((t) => { if ((t.id + t.subject + t.cust).toLowerCase().includes(q)) hits.push({ k: "ticket", label: t.id + " · " + t.subject }); });
    MOCK.tenants.forEach((t) => { if (t.name.toLowerCase().includes(q)) hits.push({ k: "tenant", label: t.name }); });
    MOCK.agents.forEach((a) => { if (a.name.toLowerCase().includes(q)) hits.push({ k: "agent", label: a.name + " · " + a.email }); });
    dd.innerHTML = hits.length
      ? hits.slice(0, 8).map((h) => `<button class="s-hit" onclick="goSearch('${h.k}','${esc(h.label)}')"><span class="k">${h.k}</span>${esc(h.label)}</button>`).join("")
      : `<div class="s-hit empty">No matches for "${esc(q)}"</div>`;
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-box")) $(".search-results")?.remove(); });
}
function goSearch(kind, label) {
  $(".search-results")?.remove();
  $("#globalSearch").value = "";
  if (kind === "ticket") {
    state.user = IDENTITIES.agent; state.role = "agent"; state.view = "tickets";
    state.selectedTicket = label.split(" ")[0];
  } else if (kind === "tenant") {
    state.user = IDENTITIES.super; state.role = "super"; state.view = "tenants";
  } else {
    state.user = IDENTITIES.owner; state.role = "owner"; state.view = "agents";
  }
  renderShell();
}

/* =====================================================================
   LOGIN / BOOT
   ===================================================================== */
function applyIdentity(u) { state.user = u; state.role = u.role; }

function doLogin() {
  const email = ($("#loginEmail").value || "").trim().toLowerCase();
  let key;
  if (email.includes("@prestige") || email.includes("admin")) key = "super";
  else if (email.startsWith("bisi") || email.includes("nairawave")) key = "owner";
  else if (email.startsWith("amaka")) key = "agent";
  else { key = "owner"; toast("Demo login", "No account for that email — signed in as Bisi (owner)"); }
  applyIdentity(IDENTITIES[key]);
  state.view = key === "agent" ? "tickets" : "dashboard";
  enterApp();
}
function quickLogin(key) {
  applyIdentity(IDENTITIES[key] || IDENTITIES.owner);
  state.view = key === "agent" ? "tickets" : "dashboard";
  enterApp();
}

function showLogin() {
  $("#loginScreen").classList.remove("hidden");
  $("#app").classList.add("hidden");
}
function enterApp() {
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  renderShell();
  previewWidget();
  toast(`Signed in as ${state.user.roleLabel}`, `${state.user.tenant} · realtime event bus connected`);
}

/* =====================================================================
   MODAL / TOAST
   ===================================================================== */
function openModal(html) {
  $("#modalBox").innerHTML = html;
  $("#modalOverlay").classList.remove("hidden");
  hydrateIcons();
}
function closeModal() { $("#modalOverlay").classList.add("hidden"); }

function toast(title, body, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = `<div class="t-title">${icon(type === "error" ? "xcircle" : "checkcircle")} ${esc(title)}</div><div class="t-body">${esc(body)}</div>`;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* =====================================================================
   HYDRATION + BINDING
   ===================================================================== */
function hydrateIcons() {
  $$("[data-ic]").forEach((el) => { if (el.dataset.ic) el.innerHTML = icon(el.dataset.ic); });
}

function bind() {
  $$(".rs-btn").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.role;
    if (!IDENTITIES[key]) return;
    applyIdentity(IDENTITIES[key]);
    state.view = key === "agent" ? "tickets" : "dashboard";
    renderShell();
    toast("Switched role", `${IDENTITIES[key].roleLabel} view · ${IDENTITIES[key].tenant}`);
  }));

  document.addEventListener("click", (e) => {
    const navBtn = e.target.closest("[data-nav]");
    if (navBtn) { state.view = navBtn.dataset.nav; renderShell(); return; }
  });

  $("#notifBtn")?.addEventListener("click", (e) => { e.stopPropagation(); toggleNotif(); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".notif-wrap")) $("#notifPop")?.classList.add("hidden"); });
  $(".rt-wrap")?.addEventListener("click", toggleRealtime);
  $("#modalOverlay")?.addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement && document.activeElement.id === "composerInput") { toggleCanned(); e.preventDefault(); }
  });
  bindSearch();
  setInterval(simLoop, 9000);
}

(function boot() {
  hydrateIcons();
  bind();
  showLogin();
})();
