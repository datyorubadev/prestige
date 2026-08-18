/* =====================================================================
   Prestige Portal — clickable UI prototype (static, no backend)
   Simulates: super admin / owner / agent surfaces, escalation rule
   builder, realtime event bus, agent-assist. Open index.html directly.
   ===================================================================== */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ----------------------------- data ----------------------------- */
const tenants = [
  { id: "t1", name: "NairaWave Fintech", email: "support@nairawave.ng", status: "active", plan: "pro", agents: 3, customers: 1842, color: "#00a86b", tone: "professional" },
  { id: "t2", name: "GidiExpress Logistics", email: "help@gidiexpress.com", status: "active", plan: "starter", agents: 1, customers: 631, color: "#f59e0b", tone: "pidgin" },
  { id: "t3", name: "BoltPay Microfinance", email: "care@boltpay.ng", status: "pending", plan: "starter", agents: 0, customers: 0, color: "#2563eb", tone: "professional" },
  { id: "t4", name: "SolarHub Nigeria", email: "support@solarhub.ng", status: "suspended", plan: "starter", agents: 1, customers: 98, color: "#7c3aed", tone: "casual" },
];

const agents = [
  { id: "u1", name: "Amaka Okafor", role: "agent", online: true, tickets: 3, email: "amaka@nairawave.ng" },
  { id: "u2", name: "Chidi Eze", role: "agent", online: true, tickets: 2, email: "chidi@nairawave.ng" },
  { id: "u3", name: "Bisi Adeyemi", role: "owner", online: true, tickets: 1, email: "bisi@nairawave.ng" },
  { id: "u4", name: "Yusuf Ibrahim", role: "agent", online: false, tickets: 0, email: "yusuf@nairawave.ng" },
];

const tickets = [
  { id: "TK-1042", subject: "Debit without transaction alert", cust: "Tunde Bakare", channel: "chat", status: "escalated", priority: "high", type: "Complaint", sent: "Negative", time: "2m ago", preview: "I was debited N25,000 and no alert came...", msg: [
      ["c", "Good morning. I was debited N25,000 at 8:41am but no alert came. This is the second time this month."],
      ["a", "I'm sorry about that, Tunde. I can see the transaction — let me confirm the settlement status and alert settings on your account."],
      ["c", "This is really frustrating. It happened last month too and you people did nothing. I want to speak to a human right now."],
      ["sys", "Escalated to agent — rule E2/E3 (frustration + money) · priority HIGH · routed to Amaka"],
      ["a", "Tunde, this is Amaka. I've flagged the account for an immediate refund review and added a chargeback note. You'll get a call within 30 minutes. I'm staying on this ticket with you."],
    ], assist: { reason: "E2 High-frustration + E3 Money/legal threat", summary: "Customer was debited N25,000 without a transaction alert (second occurrence this month). Refund review requested, chargeback note added.", chunks: ["Alert-Delivery-Failures v2 · last updated Mar 2026", "Transaction-Disputes Policy §4 · refund window 72h"], suggest: "Tunde, I've confirmed the second debit and escalated it to our payments team for an urgent refund review. You'll receive an SMS confirmation within 30 minutes and a refund within 24–48 hours." },
  },
  { id: "TK-1041", subject: "Funds transfer stuck 'Processing'", cust: "Amina Bello", channel: "chat", status: "in_progress", priority: "high", type: "Request", sent: "Negative", time: "18m ago", preview: "My transfer has been on 'Processing' for 3 hours...", msg: [
      ["c", "My transfer of N120,000 to GTBank has been on 'Processing' for 3 hours. What is happening?"],
      ["a", "Let me check the transfer status for you, Amina."],
      ["c", "Please, I need to pay school fees today. This is embarrassing."],
      ["sys", "Escalated to agent — rule E3/E8 (money + negative sentiment) · priority HIGH"],
      ["a", "Amina, your transfer was actually settled at 1:12pm — the sender-side status lagged. I've shared the receipt. Sorry for the scare!"],
    ], assist: { reason: "E3 Money/legal + E8 Negative sentiment", summary: "Customer's N120,000 transfer showed 'Processing' for 3h though it had actually settled. Receipt shared, sender-side status lag explained.", chunks: ["Transfer-Settlement Times v1", "USSD/Failed Alert FAQ"], suggest: "Good news Amina — your transfer of N120,000 settled at 1:12pm. The 'Processing' status was a display lag on the sending side. Please find your receipt attached." },
  },
  { id: "TK-1038", subject: "How do I change my PIN?", cust: "Segun O.", channel: "chat", status: "open", priority: "low", type: "Inquiry", sent: "Neutral", time: "41m ago", preview: "I want to change my transfer PIN, how do I do that?", msg: [], assist: { reason: null, summary: null, chunks: [], suggest: "" } },
  { id: "TK-1035", subject: "Delivery delayed — GidiExpress", cust: "Ngozi C.", channel: "whatsapp", status: "resolved", priority: "medium", type: "Complaint", sent: "Neutral", time: "2h ago", preview: "Package hasn't moved in 2 days after leaving Lagos hub.", msg: [], assist: { reason: null, summary: null, chunks: [], suggest: "" } },
];

const platformEvents = [
  { ic: "🏢", bg: "#f1eafe", title: "BoltPay Microfinance submitted for approval", meta: "2m ago · action: pending → review" },
  { ic: "📊", bg: "#e8effd", title: "Platform deflection hits 68.4% this week", meta: "9m ago · avg 2,500 NGN saved per deflection" },
  { ic: "🛡️", bg: "#e6f7ef", title: "Impersonation session ended (admin → NairaWave)", meta: "24m ago · audited, 12 min duration" },
  { ic: "⚠️", bg: "#fdecec", title: "SolarHub Nigeria auto-suspended", meta: "1h ago · quota overage × 3 days" },
  { ic: "💳", bg: "#e6f7ef", title: "NairaWave upgraded Starter → Pro", meta: "3h ago · +2 agents, +10GB KB" },
];

const ownerFeed = [
  { ic: "🔴", bg: "#fdecec", title: "Ticket TK-1042 escalated (E2/E3)", meta: "2m ago · routed to Amaka · priority HIGH" },
  { ic: "🤖", bg: "#e8effd", title: "AI deflected 14 chats this hour", meta: "18m ago · 95.2% deflection rate" },
  { ic: "🧠", bg: "#e6f7ef", title: "Rule edited: E2 terms + 'wetin dey happen'", meta: "1h ago · live on next message" },
  { ic: "⚡", bg: "#f1eafe", title: "Presence: Amaka online", meta: "2h ago" },
];

const plans = [
  { code: "starter", name: "Starter", price: "₦0", agents: 1, customers: 500, kb: "2 GB", current: false },
  { code: "pro", name: "Pro", price: "₦45,000", agents: 5, customers: 5000, kb: "20 GB", current: true },
  { code: "enterprise", name: "Enterprise", price: "₦180,000", agents: 50, customers: 100000, kb: "200 GB", current: false },
];

const E_RULES = [
  { id: "E1", name: "Direct human request", desc: "Customer asks for a person: human, agent, manager, speak to someone", preset: true, enabled: true, cond: "customer_request", action: "escalate" },
  { id: "E2", name: "High-frustration phrases", desc: "useless bot · this bot is stupid · wetin dey happen · ole · thief · scam · fraud", preset: true, enabled: true, cond: "keywords", action: "escalate" },
  { id: "E3", name: "Money / legal threat", desc: "stole my money · stolen · sue · lawyer · CBN · EFCC · police · report you", preset: true, enabled: true, cond: "keywords", action: "escalate + priority HIGH" },
  { id: "E4", name: "Refund / demands", desc: "refund · reverse my money · give me my money back · compensation", preset: true, enabled: true, cond: "keywords", action: "escalate" },
  { id: "E5", name: "Conversational loop", desc: "last 2 customer messages identical (or ≥3 near-identical)", preset: true, enabled: true, cond: "conversation_loop", action: "escalate" },
  { id: "E6", name: "Repeated failed self-service", desc: "same question ≥3× in session AND empty retrieval → KB gap", preset: true, enabled: true, cond: "repeat_failed_self_service", action: "escalate + kb_gap" },
  { id: "E7", name: "AI low confidence ×2", desc: "LLM refuses twice in a row (confidence < 0.5)", preset: true, enabled: true, cond: "confidence_below", action: "escalate" },
  { id: "E8", name: "Negative sentiment burst", desc: "2+ consecutive negative sentiment turns", preset: true, enabled: true, cond: "sentiment_negative", action: "escalate" },
  { id: "E9", name: "Security-sensitive content", desc: "card number / OTP / password mentioned (even redacted)", preset: true, enabled: true, cond: "pii_security", action: "escalate + audit" },
  { id: "E10", name: "SLA timeout", desc: "open ticket, no agent reply in 60 min", preset: true, enabled: false, cond: "sla_timeout", action: "escalate + notify" },
  { id: "C1", name: "Custom: VIP customers", desc: "customers tagged VIP → always human", preset: false, enabled: true, cond: "customer_segment", action: "escalate + route_to owner" },
];

/* ----------------------------- state ----------------------------- */
let role = "owner";              // super | owner | agent
let section = "dashboard";       // varies per role
let settingsTab = "brand";
let queueFilter = "All";
let selectedTicket = "TK-1042";
let realtimeOn = true;
let impersonating = false;
const toasts = [];

/* ----------------------------- render shell ----------------------------- */
const NAV = {
  super: [
    { id: "dashboard", ic: "📊", label: "Platform Overview" },
    { id: "tenants", ic: "🏢", label: "Tenants" },
    { id: "audit", ic: "🛡️", label: "Audit Log" },
    { id: "settings", ic: "⚙️", label: "Platform Settings" },
  ],
  owner: [
    { id: "dashboard", ic: "📊", label: "Analytics" },
    { id: "settings", ic: "⚙️", label: "Settings" },
    { id: "billing", ic: "💳", label: "Billing" },
    { id: "agents", ic: "👥", label: "Agents" },
  ],
  agent: [
    { id: "tickets", ic: "🎫", label: "Tickets", count: 3 },
    { id: "settings", ic: "⚙️", label: "Profile" },
  ],
};

function roleName(r) {
  return { super: ["Super Admin", "super"], owner: ["NairaWave · Owner", "owner"], agent: ["NairaWave · Agent", "agent"] }[r];
}

function sidebar() {
  return NAV[role].map((n) => `
    <button class="nav ${section === n.id ? "active" : ""}" data-nav="${n.id}">
      <span class="ic">${n.ic}</span> ${n.label}
      ${n.count ? `<span class="count">${n.count}</span>` : ""}
    </button>`).join("");
}

function shell() {
  const [rname, cls] = roleName(role);
  const sections = { super: "Platform Console", owner: "Owner Workspace", agent: "Agent Workspace" }[role];
  $("#topbar").innerHTML = `
    <div class="brand"><span class="dot">P</span> Prestige Portal</div>
    <span class="role-badge ${cls}">${rname}</span>
    <span style="color:var(--text-2);font-size:12.5px">${sections}</span>
    <div class="spacer"></div>
    <div class="realtime-pill ${realtimeOn ? "on" : ""}" id="rtPill">
      <span class="led"></span> ${realtimeOn ? "Realtime: connected" : "Realtime: off"}
    </div>
    <div class="role-switch">
      <button data-role="super" class="${role === "super" ? "active" : ""}">Super Admin</button>
      <button data-role="owner" class="${role === "owner" ? "active" : ""}">Owner</button>
      <button data-role="agent" class="${role === "agent" ? "active" : ""}">Agent</button>
    </div>
    <div class="avatar ${role === "super" ? "violet" : "green"}">${role === "super" ? "SO" : role === "owner" ? "BI" : "AO"}</div>`;
  $("#sidebar").innerHTML = sidebar();
  $("#main").innerHTML = view(role, section);
  $(".banner").style.display = impersonating ? "flex" : "none";
  $("#bannerName").textContent = "NairaWave as Bisi Adeyemi";
}

function view(r, s) {
  if (r === "super") return superViews[s] || superViews.dashboard;
  if (r === "owner") {
    if (s === "settings") return ownerSettings();
    return ownerViews[s] || ownerViews.dashboard;
  }
  if (r === "agent") return agentViews[s] || agentViews.tickets;
}

/* ----------------------------- super admin ----------------------------- */
const superViews = {
  dashboard: () => `
    <div class="page-head"><div><h1>Platform Overview</h1><div class="sub">All tenants · live activity across the platform</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="toast('New tenant','Provision flow opens in full build')">+ Provision tenant</button></div>
    <div class="grid kpis">
      <div class="kpi"><div class="k-label">Total tenants</div><div class="k-value">${tenants.length}</div><div class="k-note">2 active · 1 pending · 1 suspended</div></div>
      <div class="kpi"><div class="k-label">Total tickets (30d)</div><div class="k-value">8,412</div><div class="k-note">+12% vs last month</div></div>
      <div class="kpi"><div class="k-label">Platform deflection</div><div class="k-value good">68.4%</div><div class="k-note">~4,000 NGN saved per deflected chat</div></div>
      <div class="kpi"><div class="k-label">MRR (mock)</div><div class="k-value">₦90,000</div><div class="k-note">2 active subscriptions</div></div>
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card"><h3>Tenants</h3><div class="hint">Approve, suspend or impersonate from here</div><table style="margin-top:10px">
        <tr><th>Business</th><th>Plan</th><th>Status</th><th>Agents</th><th></th></tr>
        ${tenants.map((t) => `<tr>
          <td><b>${esc(t.name)}</b><div style="font-size:11.5px;color:var(--text-2)">${esc(t.email)}</div></td>
          <td style="text-transform:capitalize">${t.plan}</td>
          <td><span class="pill ${t.status}">${t.status}</span></td>
          <td>${t.agents}</td>
          <td>${t.status === "pending" ? `<button class="btn primary sm" onclick="toast('Approved','${esc(t.name)} is now active — owner notified')">Approve</button>` : `<button class="btn sm" onclick="impersonate()">👁 Impersonate</button> ${t.status === "active" ? `<button class="btn sm danger" onclick="toast('Suspended','${esc(t.name)} suspended — live banner pushed to owner')">Suspend</button>` : ""}`}</td>
        </tr>`).join("")}
      </table></div>
      <div class="card"><h3>Live activity feed</h3><div class="hint">Powered by the realtime event bus (WS /ws/events)</div>
        <div class="feed" id="feed" style="margin-top:10px">${platformEvents.map(feedItem).join("")}</div></div>
    </div>`,

  tenants: () => `
    <div class="page-head"><div><h1>Tenants</h1><div class="sub">Provisioning, status and quota management</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="toast('Provision','Tenant create form in full build')">+ New tenant</button></div>
    <div class="card"><table>
      <tr><th>Business</th><th>Plan</th><th>Status</th><th>Agents</th><th>Customers</th><th>KB used</th><th>Actions</th></tr>
      ${tenants.map((t) => `<tr>
        <td><b>${esc(t.name)}</b></td>
        <td style="text-transform:capitalize">${t.plan}</td>
        <td><span class="pill ${t.status}">${t.status}</span></td>
        <td>${t.agents} / ${t.plan === "pro" ? 5 : 1}</td>
        <td>${t.customers.toLocaleString()}</td>
        <td>${(t.customers / 100).toFixed(1)} GB</td>
        <td><button class="btn sm" onclick="impersonate()">Impersonate</button></td>
      </tr>`).join("")}
    </table></div>`,

  audit: () => `
    <div class="page-head"><div><h1>Audit Log</h1><div class="sub">Every admin + destructive owner action is recorded</div></div></div>
    <div class="card"><table>
      <tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Target</th><th>Details</th></tr>
      ${[
        ["2m ago", "super_admin", "super", "impersonate_start", "NairaWave", "30-min scoped token · audited"],
        ["24m ago", "super_admin", "super", "impersonate_end", "NairaWave", "12 min duration · token revoked"],
        ["1h ago", "system", "super", "suspend_tenant", "SolarHub Nigeria", "quota overage × 3 days"],
        ["3h ago", "super_admin", "super", "change_plan", "NairaWave", "starter → pro"],
        ["1d ago", "owner", "owner", "update_tenant_settings", "NairaWave", "brand_tone: professional"],
        ["1d ago", "owner", "owner", "update_escalation_rule", "NairaWave", "E2 terms edited"],
      ].map((r) => `<tr><td>${r[0]}</td><td><code>${r[1]}</code></td><td><span class="pill neutral">${r[2]}</span></td><td><b>${r[3]}</b></td><td>${r[4]}</td><td style="color:var(--text-2)">${r[5]}</td></tr>`).join("")}
    </table></div>`,

  settings: () => `
    <div class="page-head"><div><h1>Platform Settings</h1><div class="sub">Global defaults inherited by every tenant</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="toast('Saved','Platform defaults saved & broadcast live')">Save changes</button></div>
    <div class="grid two">
      <div class="card"><h3>Plan & quota templates</h3><div class="hint">Editable by super admin only</div>
        ${plans.map((p) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
          <div><b>${p.name}</b> · ${p.price}/mo<div style="font-size:12px;color:var(--text-2)">${p.agents} agents · ${p.customers.toLocaleString()} customers · ${p.kb} KB</div></div>
          <button class="btn sm" onclick="toast('Edit plan','${p.name} editor in full build')">Edit</button></div>`).join("")}
      </div>
      <div>
        <div class="card"><h3>Escalation presets (global)</h3><div class="hint">Seeded into every new tenant as E1–E10</div>
          <table style="margin-top:10px">
            <tr><th>Rule</th><th>Condition</th><th>Action</th><th></th></tr>
            ${E_RULES.filter((r) => r.preset).slice(0, 5).map((r) => `<tr><td><b>${r.id}</b> ${esc(r.name)}</td><td style="font-family:var(--mono);font-size:12px">${r.cond}</td><td style="font-family:var(--mono);font-size:12px">${r.action}</td><td><span class="pill active">seeded</span></td></tr>`).join("")}
          </table>
          <div style="margin-top:10px"><button class="btn sm" onclick="toast('Presets','Reset/version presets in full build')">Manage presets</button></div></div>
        <div class="card" style="margin-top:18px"><h3>Platform defaults</h3>
          <div class="field"><label>Default escalation message</label><textarea class="input" rows="2">Please hold on — a member of our team is joining to help you now.</textarea></div>
          <div class="field"><label>Default brand tone</label><select class="input"><option>professional</option><option>casual</option><option>pidgin</option><option>formal</option></select></div>
        </div>
      </div>
    </div>`,
};

/* ----------------------------- owner ----------------------------- */
const ownerViews = {
  dashboard: () => `
    <div class="page-head"><div><h1>NairaWave · Analytics</h1><div class="sub">Live metrics for your support operation</div></div><div class="spacer"></div>
      <span class="realtime-pill ${realtimeOn ? "on" : ""}"><span class="led"></span> ${realtimeOn ? "live" : "off"}</span></div>
    <div class="grid kpis">
      <div class="kpi"><div class="k-label">Tickets this week</div><div class="k-value">1,284</div><div class="k-note">+8.2% vs last week</div></div>
      <div class="kpi"><div class="k-label">Deflection rate</div><div class="k-value good">95.2%</div><div class="k-note">≈ ₦3.2M saved / week</div></div>
      <div class="kpi"><div class="k-label">Avg first response</div><div class="k-value">0.4s</div><div class="k-note">AI · human handoff 3.1 min</div></div>
      <div class="kpi"><div class="k-label">CSAT</div><div class="k-value good">4.6 / 5</div><div class="k-note">+0.2 this month</div></div>
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card"><h3>Deflection vs escalation (14d)</h3><div class="hint">AI resolves 95% before a human is needed</div>
        <div style="display:flex;align-items:flex-end;gap:10px;height:180px;padding-top:16px">
          ${[72, 78, 75, 82, 88, 90, 87, 92, 94, 95, 93, 96, 95, 96].map((v, i) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="width:100%;background:${i % 7 === 3 ? "var(--danger)" : "var(--primary)"};border-radius:6px 6px 0 0;height:${v * 1.7}px;opacity:.9" title="${v}%"></div>
              <span style="font-size:9.5px;color:var(--text-2)">${i % 2 ? "" : (i * 2 + 1) + "d"}</span></div>`).join("")}
        </div></div>
      <div class="card"><h3>Live activity feed</h3><div class="hint">Event bus pushes — no page refresh</div>
        <div class="feed" id="feed" style="margin-top:10px">${ownerFeed.map(feedItem).join("")}</div></div>
    </div>
    <div class="grid two" style="margin-top:18px">
      <div class="card"><h3>Triage breakdown</h3><div class="hint">How tickets are classified</div>
        <div class="meter" style="margin-top:10px;height:14px"><i style="width:62%;background:var(--primary)"></i></div>
        <div style="font-size:12.5px;color:var(--text-2)">62% inquiries · 26% requests · 12% complaints</div>
        <div class="meter" style="height:14px"><i style="width:26%;background:var(--warning)"></i></div>
        <div class="meter" style="height:14px"><i style="width:12%;background:var(--danger)"></i></div></div>
      <div class="card"><h3>Escalation reasons (30d)</h3><div class="hint">Which rule fired — fed by trigger_count</div>
        ${E_RULES.slice(0, 6).map((r, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px dashed var(--border)">
          <span style="font-size:12.5px"><b>${r.id}</b> ${esc(r.name)}</span><b style="color:${i < 2 ? "var(--danger)" : "var(--text)"}">${[38, 22, 14, 9, 6, 4][i]}%</b></div>`).join("")}
      </div>
    </div>`,

  billing: () => `
    <div class="page-head"><div><h1>Billing & Plan</h1><div class="sub">Mock subscription — full end-to-end flow</div></div></div>
    <div class="grid kpis">
      <div class="kpi"><div class="k-label">Current plan</div><div class="k-value">Pro</div><div class="k-note">₦45,000 / month</div></div>
      <div class="kpi"><div class="k-label">Agents used</div><div class="k-value">3 / 5</div><div class="k-note">Quota ok</div></div>
      <div class="kpi"><div class="k-label">Customers</div><div class="k-value">1842 / 5,000</div><div class="k-note">36.8% of quota</div></div>
      <div class="kpi"><div class="k-label">Next billing</div><div class="k-value">Aug 28</div><div class="k-note">card_mock · will renew</div></div>
    </div>
    <div class="grid three" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:18px">
      ${plans.map((p) => `<div class="plan-box ${p.current ? "current" : ""}">
        <div class="p-name">${p.name} ${p.current ? "· current" : ""}</div>
        <div class="p-price">${p.price}<span style="font-size:12px;color:var(--text-2)">/mo</span></div>
        <ul><li>${p.agents} agents</li><li>${p.customers.toLocaleString()} customers</li><li>${p.kb} KB</li></ul>
        ${p.current ? `<button class="btn" disabled>Current plan</button>` : `<button class="btn ${p.code === "enterprise" ? "primary" : ""}" onclick="toast('Plan change','${p.name} requested — invoice generated, live broadcast')">${p.code === "starter" ? "Downgrade" : "Upgrade"}</button>`}
      </div>`).join("")}
    </div>
    <div class="card" style="margin-top:18px"><h3>Invoices</h3><table style="margin-top:8px">
      <tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th><th></th></tr>
      ${[["INV-0021", "Jul 28 – Aug 28", "₦45,000", "Paid"], ["INV-0020", "Jun 28 – Jul 28", "₦45,000", "Paid"], ["INV-0019", "May 28 – Jun 28", "₦45,000", "Paid"]]
        .map((i) => `<tr><td><code>${i[0]}</code></td><td>${i[1]}</td><td><b>${i[2]}</b></td><td><span class="pill active">${i[3]}</span></td><td><button class="btn sm" onclick="toast('Invoice','PDF download (reportlab placeholder)')">PDF</button></td></tr>`).join("")}
    </table></div>`,

  agents: () => `
    <div class="page-head"><div><h1>Agents</h1><div class="sub">Invite, manage presence and workload</div></div><div class="spacer"></div>
      <button class="btn primary" onclick="toast('Invite sent','Invite email sent to new agent — link expires in 7 days')">+ Invite agent</button></div>
    <div class="grid kpis">
      <div class="kpi"><div class="k-label">Active agents</div><div class="k-value">3 / 5</div></div>
      <div class="kpi"><div class="k-label">Online now</div><div class="k-value good">3</div></div>
      <div class="kpi"><div class="k-label">Open tickets</div><div class="k-value">7</div><div class="k-note">2 escalated</div></div>
    </div>
    <div class="card" style="margin-top:18px"><table>
      <tr><th>Agent</th><th>Presence</th><th>Open tickets</th><th>Status</th><th></th></tr>
      ${agents.map((a) => `<tr>
        <td><b>${esc(a.name)}</b><div style="font-size:11.5px;color:var(--text-2)">${a.role} · ${a.email}</div></td>
        <td><span class="pill ${a.online ? "online" : "offline"}">${a.online ? "● online" : "○ offline"}</span></td>
        <td>${a.tickets}</td>
        <td><span class="pill active">active</span></td>
        <td><button class="btn sm" onclick="toast('Agent','${esc(a.name)} settings in full build')">Manage</button></td>
      </tr>`).join("")}
    </table></div>`,

  settings: () => ownerSettings(),
};

function ownerSettings() {
  const tabs = [["brand", "Brand & Widget"], ["escalation", "Escalation Rules"], ["agents", "Agents"], ["billing", "Billing"], ["profile", "Profile"]];
  return `
    <div class="page-head"><div><h1>Settings</h1><div class="sub">Everything the owner controls — changes push live via the event bus</div></div><div class="spacer"></div>
      <span class="realtime-pill ${realtimeOn ? "on" : ""}"><span class="led"></span> live broadcast on</span></div>
    <div class="tabs">${tabs.map(([id, label]) => `<button class="${settingsTab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}</div>
    ${settingsContent[settingsTab]()}`;
}

const settingsContent = {
  brand: () => `
    <div class="grid two">
      <div class="card"><h3>Brand & chat widget</h3><div class="hint">Saved instantly · widget preview updates live</div>
        <div class="field"><label>Bot name</label><input class="input" id="wBotName" value="NairaWave Assistant" oninput="previewWidget()"></div>
        <div class="row">
          <div class="field"><label>Primary color</label><input class="input" id="wPrimary" type="color" value="#00a86b" style="height:38px" oninput="previewWidget()"></div>
          <div class="field"><label>Widget position</label><select class="input" id="wPos"><option>bottom-right</option><option>bottom-left</option></select></div>
        </div>
        <div class="field"><label>Brand tone</label><select class="input"><option>professional</option><option>casual</option><option selected>pidgin</option><option>formal</option></select></div>
        <div class="field"><label>Welcome message</label><textarea class="input" id="wWelcome" rows="2" oninput="previewWidget()">Hello! I'm NairaWave Assistant. How can I help you today?</textarea></div>
        <div class="field"><label>Escalation message</label><textarea class="input" rows="2">Please hold on — a member of our team is joining to help you now.</textarea></div>
        <div class="field"><label>Launcher text</label><input class="input" id="wLauncher" value="Chat with us" oninput="previewWidget()"></div>
        <button class="btn primary" onclick="rtEvent('settings_changed','Brand settings saved & pushed to all dashboards')">Save & broadcast</button>
      </div>
      <div>
        <div class="widget-preview">
          <div class="site">Yourwebsite.ng — customer view</div>
          <div id="widgetWrap" style="display:flex;flex-direction:column;align-items:flex-end"></div>
        </div>
        <div class="hint" style="margin-top:8px;color:var(--text-2)">Widget self-styles from <code style="font-family:var(--mono)">GET /api/tenants/{id}/public</code> — no internal data exposed.</div>
      </div>
    </div>`,

  escalation: () => `
    <div class="grid builder">
      <div>
        <div class="page-head" style="margin-bottom:14px"><div><h3>Escalation rules</h3><div class="hint">DB-driven · evaluated on every message · edit → live on next message</div></div><div class="spacer"></div>
          <button class="btn primary" onclick="toast('Rule created','Custom rule added — active immediately')">+ New rule</button></div>
        ${E_RULES.map((r) => ruleCard(r)).join("")}
      </div>
      <div>
        <div class="card"><h3>Test console</h3><div class="hint">Paste a customer message — see which rules fire (no DB write)</div>
          <div class="field" style="margin-top:10px"><textarea class="input" id="testText" rows="3">You people are thieves! You stole my money and nobody is answering me. I want to speak to a manager NOW!</textarea></div>
          <button class="btn primary" onclick="runTest()">Run test</button>
          <div class="console" id="testOut" style="margin-top:12px"><div class="line muted">$ POST /api/tenants/me/escalation-rules/test</div></div>
        </div>
        <div class="card" style="margin-top:18px"><h3>Why this matters</h3>
          <ul style="font-size:12.5px;color:var(--text-2);padding-left:18px;display:grid;gap:6px">
            <li>Rules live in <code style="font-family:var(--mono)">escalation_rules</code>, not hardcoded dicts.</li>
            <li>Edits propagate with no restart (Zendesk needs an add-on + manual tester).</li>
            <li>E10 SLA timeout = Zendesk-style automation built in.</li>
            <li>Every escalation records <b>which rule fired</b> → reason analytics.</li>
          </ul></div>
      </div>
    </div>`,

  agents: () => `<div class="card"><h3>Agent management</h3><div class="hint">Invites, quotas and presence (shortcut of the Agents page)</div></div>
    <div class="card" style="margin-top:0"><table>${agents.map((a) => `<tr><td><b>${esc(a.name)}</b><div style="font-size:11.5px;color:var(--text-2)">${a.email}</div></td><td><span class="pill ${a.online ? "online" : "offline"}">${a.online ? "● online" : "○ offline"}</span></td><td style="text-align:right"><label class="switch"><input type="checkbox" checked><span class="slider"></span></label></td></tr>`).join("")}</table></div>`,

  billing: () => `<div class="card"><h3>Billing summary</h3><div class="hint">Plan: <b>Pro</b> · ₦45,000/mo · next billing Aug 28 · <a style="color:var(--primary)" onclick="navigate('billing')">Manage →</a></div></div>`,
  profile: () => `<div class="card"><h3>Owner profile</h3><div class="hint">Bisi Adeyemi · bisi@nairawave.ng · role: owner</div></div>`,
};

function ruleCard(r) {
  return `
  <div class="rule-card" data-rule="${r.id}">
    <div class="rule-head" onclick="this.parentElement.classList.toggle('open')">
      <label class="switch" onclick="event.stopPropagation()"><input type="checkbox" ${r.enabled ? "checked" : ""} onchange="toggleRule('${r.id}', this.checked)"><span class="slider"></span></label>
      <div><div class="rule-name">${r.id} · ${esc(r.name)}</div><div class="rule-desc">${esc(r.desc)}</div></div>
      <span class="rule-tag ${r.preset ? "preset" : "neutral"}">${r.preset ? "preset E1–E10" : "custom"}</span>
      <div class="rule-actions">
        <button class="btn sm" onclick="event.stopPropagation();editRule('${r.id}')">Edit</button>
        <button class="btn sm danger" onclick="event.stopPropagation();${r.preset ? "resetRule('" + r.id + "')" : "deleteRule('" + r.id + "')"}">${r.preset ? "Reset" : "Delete"}</button>
      </div>
    </div>
    <div class="rule-body"><div class="inner">
      <div class="kv">
        <div class="cell"><b>Condition</b><code>${r.cond}</code></div>
        <div class="cell"><b>Action</b><code>${r.action}</code></div>
      </div>
      <div class="tags" style="margin-top:10px">${termsFor(r).map((t) => `<span class="tag ${r.enabled ? "" : "off"}">${esc(t)}</span>`).join("")}</div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn sm primary" onclick="toast('Rule saved','${r.id} updated — live on next message')">Save</button>
        <button class="btn sm" onclick="toast('Test','Rule-level test in full build')">Test this rule</button>
      </div>
    </div></div>
  </div>`;
}
function termsFor(r) {
  return { customer_request: ["human", "agent", "manager", "representative", "speak to someone"],
    keywords: r.id === "E2" ? ["useless bot", "this bot is stupid", "wetin dey happen", "ole", "thief", "scam", "fraud"] : ["stole my money", "stolen", "sue", "lawyer", "CBN", "EFCC", "police", "report you", "refund", "reverse my money", "compensation"],
    conversation_loop: ["identical ≥2", "near-identical ≥3"],
    repeat_failed_self_service: ["same question ≥3×", "empty retrieval"],
    confidence_below: ["confidence < 0.5", "consecutive ≥2"],
    sentiment_negative: ["negative turns ≥2"],
    pii_security: ["card number", "OTP", "password"],
    sla_timeout: ["open > 60 min", "no agent reply"],
    customer_segment: ["segment = VIP"] }[r.cond] || [];
}

/* ----------------------------- agent ----------------------------- */
const agentViews = {
  tickets: () => `
    <div class="page-head"><div><h1>Ticket Queue</h1><div class="sub">Live queue — new tickets & escalations push in realtime</div></div><div class="spacer"></div>
      <span class="realtime-pill ${realtimeOn ? "on" : ""}"><span class="led"></span> connected</span></div>
    <div class="sec-filter">${["All", "Mine", "Unassigned", "Escalated", "Resolved"].map((f) => `<button class="${queueFilter === f ? "active" : ""}" data-filter="${f}" onclick="setFilter('${f}')">${f}</button>`).join("")}</div>
    <div class="grid two" style="grid-template-columns: 1.1fr 1fr">
      <div class="card" style="padding:0">
        <div class="queue-row head"><span>Ticket</span><span>Customer / preview</span><span>Priority</span><span>Status</span><span>Time</span></div>
        ${tickets.map((t) => queueRow(t)).join("")}
      </div>
      <div class="card">${convView(tickets.find((t) => t.id === selectedTicket))}
        ${selectedTicket === "TK-1042" ? `<div class="assist" style="margin-top:16px;position:static">${assistPanel(tickets[0].assist)}</div>` : ""}
      </div>
    </div>`,

  settings: () => `
    <div class="page-head"><div><h1>Profile</h1><div class="sub">Agent preferences</div></div></div>
    <div class="grid two">
      <div class="card"><h3>Profile</h3>
        <div class="field"><label>Display name</label><input class="input" value="Amaka Okafor"></div>
        <div class="field"><label>Email</label><input class="input" value="amaka@nairawave.ng"></div>
        <div class="field"><label>Presence</label><div><span class="pill online">● online</span> <button class="btn sm" style="margin-left:6px" onclick="toast('Presence','Status pushed to dashboards via agent_presence event')">Go offline</button></div></div>
      </div>
      <div class="card"><h3>Notifications</h3>
        <div class="field"><label class="switch" style="width:auto;display:flex;gap:10px;align-items:center">New escalation assigned<input type="checkbox" checked><span class="slider"></span></label></div>
        <div class="field"><label class="switch" style="width:auto;display:flex;gap:10px;align-items:center">Ticket resolved by me<input type="checkbox" checked><span class="slider"></span></label></div>
        <div class="field"><label class="switch" style="width:auto;display:flex;gap:10px;align-items:center">Email digest<input type="checkbox"><span class="slider"></span></label></div>
      </div>
    </div>`,
};

function queueRow(t) {
  const sel = t.id === selectedTicket ? " selected" : "";
  return `<div class="queue-row${sel}" onclick="selectTicket('${t.id}')">
    <span class="q-title">${t.id}</span>
    <span class="q-preview"><b>${esc(t.cust)}</b> · ${esc(t.preview)}</span>
    <span><span class="pill ${t.priority}">${t.priority}</span></span>
    <span><span class="pill ${t.status === "escalated" ? "escalated" : t.status === "resolved" ? "neutral" : t.status === "in_progress" ? "active" : "low"}">${t.status.replace("_", " ")}</span></span>
    <span style="color:var(--text-2)">${t.time}</span>
  </div>`;
}

function convView(t) {
  if (!t.msg.length) return `<div class="empty">Select a ticket to open the conversation.</div>`;
  return `
    <div class="page-head" style="margin-bottom:12px"><div><h3>${t.id} · ${esc(t.subject)}</h3><div class="sub">${esc(t.cust)} · ${t.channel} · sentiment ${t.sent} · type ${t.type}</div></div><div class="spacer"></div>
      ${t.status === "escalated" ? `<span class="pill escalated">escalated</span>` : `<span class="pill active">${t.status}</span>`}</div>
    <div class="conv">
      ${t.msg.map(([who, text]) => who === "sys" ? `<div class="msg system">${esc(text)}</div>` : `<div class="msg ${who === "a" ? "from-agent" : "from-cust"}"><div class="who">${who === "a" ? "Agent · Amaka" : t.cust}</div>${esc(text)}</div>`).join("")}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <input class="input" placeholder="Type your reply…">
      <button class="btn primary" onclick="sendReply()">Send</button>
    </div>`;
}

function assistPanel(a) {
  if (!a.reason) return "";
  return `
    <h4>🤖 Agent assist <span class="ai-chip">AI working with you</span></h4>
    <div class="kv" style="grid-template-columns:1fr">
      <div class="cell"><b>Escalation reason</b><code>${esc(a.reason)}</code></div>
    </div>
    <div style="margin-top:10px;font-size:12.5px"><b>Summary</b><p style="color:var(--text-2);margin-top:3px">${esc(a.summary)}</p></div>
    <div style="margin-top:12px"><b style="font-size:12.5px">Relevant knowledge</b>
      ${a.chunks.map((c) => `<div class="kb" style="margin-top:6px">📄 <b>${esc(c.split(" · ")[0])}</b><div style="color:var(--text-2)">${esc(c.split(" · ").slice(1).join(" · "))}</div></div>`).join("")}
    </div>
    <div style="margin-top:12px"><b style="font-size:12.5px">Suggested reply</b>
      <div class="suggest" style="margin-top:6px">${esc(a.suggest)}</div></div>
    <div class="next-actions">
      <button class="btn primary sm" onclick="toast('Sent','Suggested reply copied into the box')">Use reply</button>
      <button class="btn sm" onclick="toast('Resolved','Ticket TK-1042 resolved — audited')">Resolve</button>
      <button class="btn sm" onclick="toast('Escalated','To owner for refund sign-off')">Escalate to owner</button>
    </div>`;
}

/* ----------------------------- interactions ----------------------------- */
function navigate(s) { section = s; shell(); }
function setFilter(f) { queueFilter = f; shell(); }
function selectTicket(id) { selectedTicket = id; shell(); }

function toggleRule(id, on) {
  const r = E_RULES.find((x) => x.id === id);
  r.enabled = on;
  rtEvent("escalation_rules_changed", `${r.id} ${on ? "enabled" : "disabled"} — live on next message`);
}
function editRule(id) {
  const r = E_RULES.find((x) => x.id === id);
  toast("Edit rule", `${r.id} · condition: ${r.cond} · action: ${r.action}`);
}
function resetRule(id) { const r = E_RULES.find((x) => x.id === id); r.enabled = true; toast("Preset restored", `${r.id} reset to default`); shell(); }
function deleteRule(id) { E_RULES.splice(E_RULES.findIndex((x) => x.id === id), 1); toast("Rule deleted", `${id} removed`); shell(); }

function runTest() {
  const text = ($("#testText")?.value || "").toLowerCase();
  const hits = E_RULES.filter((r) => r.enabled && testHit(r, text));
  const out = $("#testOut");
  let html = `<div class="line muted">$ POST /api/tenants/me/escalation-rules/test</div>`;
  html += `<div class="line muted">→ sample: "${esc(text.slice(0, 60))}${text.length > 60 ? "…" : ""}"</div>`;
  if (!hits.length) html += `<div class="line ok">✓ no rules fired</div>`;
  else hits.forEach((h) => { html += `<div class="line hit">⚡ ${h.id} ${esc(h.name)} → ${h.action}</div>`; });
  if (hits.some((h) => ["E2", "E3"].includes(h.id))) html += `<div class="line ok">→ escalated_at set · routed to online agent · audit written</div>`;
  out.innerHTML = html;
  out.style.border = "1px solid #1d2f3d";
  if (realtimeOn) rtEvent("rule_test", "Test console: 3 rules fired for sample text");
}
function testHit(r, text) {
  if (r.cond === "customer_request") return /human|agent|manager|representative|speak to (someone|a person)/.test(text);
  if (r.cond === "keywords") return ["useless bot", "stupid", "wetin dey happen", "ole", "thief", "scam", "fraud", "stole my money", "stolen", "sue", "lawyer", "cbn", "efcc", "police", "report you", "refund", "reverse my money", "compensation"].some((k) => text.includes(k));
  if (r.cond === "sentiment_negative") return /frustrat|thiev|stole|angry|embarrass/.test(text);
  if (r.cond === "pii_security") return /\d{16}|otp|password/.test(text);
  if (r.cond === "customer_segment") return text.includes("vip");
  return false;
}

function previewWidget() {
  const name = $("#wBotName")?.value || "NairaWave Assistant";
  const col = $("#wPrimary")?.value || "#00a86b";
  const welcome = $("#wWelcome")?.value || "";
  const launcher = $("#wLauncher")?.value || "Chat with us";
  const w = $("#widgetWrap");
  w.innerHTML = `
    <div class="widget-bubble">
      <div class="w-head" style="background:${col}">
        <div class="w-ava">${name.charAt(0)}</div><b>${esc(name)}</b><span style="margin-left:auto;font-size:11px">● online</span>
      </div>
      <div class="w-body"><div class="w-chat">
        <div class="w-bot">${esc(welcome)}</div>
        <div class="w-mine">My transfer is stuck on "Processing".</div>
        <div class="w-bot">Let me check that right away.</div>
      </div>
      <div class="w-input"><input class="inp" placeholder="Type a message…"><button class="w-send" style="background:${col}">➤</button></div></div>
    </div>
    <div class="launcher"><span class="lb" style="background:${col}">💬</span> ${esc(launcher)}</div>`;
}

function sendReply() { toast("Sent", "Reply delivered to customer over WS chat"); rtEvent("ticket_updated", "Agent reply sent to TK-1042"); }

function impersonate() {
  impersonating = true;
  toast("Impersonation started", "30-min scoped token · audited · red banner active");
  shell();
}
function endImpersonate() {
  impersonating = false;
  toast("Impersonation ended", "Token revoked · duration audited");
  shell();
}

/* ----------------------------- realtime ----------------------------- */
function feedItem(e) {
  return `<div class="item"><div class="ev-ic" style="background:${e.bg}">${e.ic}</div>
    <div><div class="ev-title">${esc(e.title)}</div><div class="ev-msg">${e.meta}</div></div></div>`;
}
function rtEvent(type, msg) {
  if (!realtimeOn) return;
  const feed = $("#feed");
  if (!feed) return;
  const ev = { ic: "⚡", bg: "#e6f7ef", title: msg, meta: "just now · event bus · " + type };
  const el = document.createElement("div");
  el.className = "item fresh";
  el.innerHTML = feedItem(ev);
  feed.prepend(el);
  toast(type.replace(/_/g, " "), msg);
}

function toast(title, body) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="t-title">${esc(title)}</div><div class="t-body">${esc(body)}</div>`;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ----------------------------- boot ----------------------------- */
function bind() {
  document.addEventListener("click", (e) => {
    const roleBtn = e.target.closest("[data-role]");
    if (roleBtn) { role = roleBtn.dataset.role; section = role === "super" ? "dashboard" : role === "owner" ? "dashboard" : "tickets"; shell(); return; }
    const navBtn = e.target.closest("[data-nav]");
    if (navBtn) { section = navBtn.dataset.nav; shell(); return; }
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) { settingsTab = tabBtn.dataset.tab; shell(); return; }
  });
  $("#rtPill")?.addEventListener("click", () => {
    realtimeOn = !realtimeOn;
    shell();
    toast("Realtime", realtimeOn ? "event bus connected" : "realtime disabled");
  });
  window.addEventListener("load", () => { shell(); previewWidget(); });
}
bind();
