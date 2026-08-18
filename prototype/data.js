/* =====================================================================
   Mock database — drives every screen of the prototype.
   All mutations happen here so state stays consistent across views.
   ===================================================================== */

const MOCK = {
  user: null, // { role, name, email, initials, color }
  impersonating: null, // { tenantId, label }

  tenants: [
    { id: "t1", name: "NairaWave Fintech", slug: "nairawave", email: "support@nairawave.ng", status: "active", plan: "pro", agents: 3, customers: 1842, kbMb: 320, volume30d: 3412, color: "#00a86b", tone: "professional", city: "Lagos" },
    { id: "t2", name: "GidiExpress Logistics", slug: "gidiexpress", email: "help@gidiexpress.ng", status: "active", plan: "starter", agents: 1, customers: 631, kbMb: 88, volume30d: 1403, color: "#f59e0b", tone: "pidgin", city: "Lagos" },
    { id: "t3", name: "BoltPay Microfinance", slug: "boltpay", email: "care@boltpay.ng", status: "pending", plan: "starter", agents: 0, customers: 0, kbMb: 0, volume30d: 0, color: "#2563eb", tone: "professional", city: "Abuja" },
    { id: "t4", name: "SolarHub Nigeria", slug: "solarhub", email: "support@solarhub.ng", status: "suspended", plan: "starter", agents: 1, customers: 98, kbMb: 41, volume30d: 402, color: "#7c3aed", tone: "casual", city: "Port Harcourt" },
    { id: "t5", name: "MediQuick Pharmacy", slug: "mediquick", email: "hello@mediquick.ng", status: "active", plan: "pro", agents: 4, customers: 2105, kbMb: 402, volume30d: 2108, color: "#e11d48", tone: "formal", city: "Ibadan" },
  ],

  agents: [
    { id: "u1", name: "Bisi Adeyemi", role: "owner", online: true, email: "bisi@nairawave.ng", tickets: 1, initials: "B", color: "green", resolutions30d: 118, csat: 4.6 },
    { id: "u2", name: "Amaka Okafor", role: "agent", online: true, email: "amaka@nairawave.ng", tickets: 3, initials: "A", color: "blue", resolutions30d: 142, csat: 4.7 },
    { id: "u3", name: "Chidi Eze", role: "agent", online: true, email: "chidi@nairawave.ng", tickets: 2, initials: "C", color: "amber", resolutions30d: 96, csat: 4.4 },
    { id: "u4", name: "Yusuf Ibrahim", role: "agent", online: false, email: "yusuf@nairawave.ng", tickets: 0, initials: "Y", color: "slate", resolutions30d: 0, csat: null },
  ],

  tickets: [
    {
      id: "TK-1042", subject: "Debit without transaction alert", cust: "Tunde Bakare", phone: "0803 114 2271",
      channel: "chat", status: "escalated", priority: "high", type: "Complaint", sentiment: "Negative", time: "2m",
      unread: true, sla: "overdue",
      assignee: "Amaka Okafor", preview: "I was debited N25,000 and no alert came — second time this month",
      msgs: [
        { who: "c", text: "Good morning. I was debited N25,000 at 8:41am but no alert came. This is the second time this month." },
        { who: "ai", text: "I'm sorry about that, Tunde. Let me check your transaction history and alert settings right away." },
        { who: "c", text: "This is really frustrating. It happened last month too and nobody did anything. I want to speak to a human right now!" },
        { who: "sys", text: "Escalated · E2 frustration + E3 money threat · priority HIGH · routed to Amaka" },
        { who: "a", text: "Tunde, this is Amaka. I've flagged the account for immediate refund review and added a chargeback note. You'll get a call within 30 minutes — I'm staying on this ticket with you." },
      ],
      assist: {
        reason: "E2 High-frustration + E3 Money/legal threat",
        summary: "Customer debited N25,000 with no transaction alert (second occurrence this month). Refund review initiated, chargeback note added. SLA: call-back within 30 min.",
        chunks: ["Alert-Delivery-Failures v2", "Transaction-Disputes Policy §4"],
        suggest: "Tunde, I've confirmed the second debit and escalated it to payments for an urgent refund review. You'll receive an SMS confirmation within 30 minutes and a refund in 24–48 hours.",
      },
    },
    {
      id: "TK-1041", subject: "Transfer stuck on 'Processing'", cust: "Amina Bello", phone: "0905 660 3318",
      channel: "chat", status: "in_progress", priority: "high", type: "Request", sentiment: "Negative", time: "18m",
      unread: true, sla: "12m left",
      assignee: "Chidi Eze", preview: "My N120,000 transfer to GTBank has been on Processing for 3 hours",
      msgs: [
        { who: "c", text: "My transfer of N120,000 to GTBank has been on 'Processing' for 3 hours. What is happening?" },
        { who: "ai", text: "Let me check the transfer status for you, Amina." },
        { who: "c", text: "Please, I need to pay school fees today. This is embarrassing." },
        { who: "sys", text: "Escalated · E3 money + E8 negative sentiment · priority HIGH" },
        { who: "a", text: "Amina, good news — your transfer actually settled at 1:12pm. The status was a display lag on the sending side. I've shared the receipt." },
      ],
      assist: {
        reason: "E3 Money/legal + E8 Negative sentiment",
        summary: "Customer's N120,000 transfer showed 'Processing' for 3h though it had settled. Receipt shared, sender-side status lag explained.",
        chunks: ["Transfer-Settlement Times v1", "USSD / Failed-Alert FAQ"],
        suggest: "Good news Amina — your N120,000 transfer settled at 1:12pm. The 'Processing' status was a display lag. Please find your receipt attached.",
      },
    },
    {
      id: "TK-1040", subject: "How do I change my transfer PIN?", cust: "Segun Osinachi", phone: "0812 992 4410",
      channel: "chat", status: "open", priority: "low", type: "Inquiry", sentiment: "Neutral", time: "41m",
      unread: true, sla: "1h left",
      assignee: null, preview: "I want to change my transfer PIN, how do I do that?",
      msgs: [
        { who: "c", text: "I want to change my transfer PIN, how do I do that?" },
        { who: "ai", text: "You can reset your transfer PIN under Settings → Security → Transfer PIN, or dial *737*1# on the number linked to your account. Do you want me to walk you through it?" },
      ],
      assist: null,
    },
    {
      id: "TK-1039", subject: "USSD code not working", cust: "Kemi Alade", phone: "0703 884 5520",
      channel: "whatsapp", status: "open", priority: "medium", type: "Complaint", sentiment: "Neutral", time: "1h",
      unread: false, sla: "30m left",
      assignee: null, preview: "*737*100# keeps returning 'invalid option', I used it yesterday fine",
      msgs: [
        { who: "c", text: "*737*100# keeps returning 'invalid option' since this morning. I used it yesterday and it was fine." },
        { who: "ai", text: "Let me check for any scheduled USSD maintenance on your network and account. One moment." },
      ],
      assist: null,
    },
    {
      id: "TK-1037", subject: "Refund for failed utility payment", cust: "Hassan Danladi", phone: "0806 221 9087",
      channel: "portal", status: "open", priority: "high", type: "Request", sentiment: "Neutral", time: "2h",
      unread: false, sla: "45m left",
      assignee: "Amaka Okafor", preview: "Paid PHCN via app, payment failed but money was debited twice",
      msgs: [
        { who: "c", text: "I paid my PHCN bill via the app. It said failed, but I was debited twice. Please refund." },
        { who: "sys", text: "Escalated · E4 refund + E3 money threat · priority HIGH" },
      ],
      assist: {
        reason: "E4 Refund demand",
        summary: "Duplicate debit for a failed PHCN bill payment. Refund request awaiting approval. Requires owner sign-off per policy.",
        chunks: ["Bill-Payments Dispute §2", "Refund Escalation Matrix"],
        suggest: "Hassan, I can confirm both debits went through. I've initiated a refund for the duplicate and it will reflect within 24–48 hours. Reference REF-88931.",
      },
    },
    {
      id: "TK-1036", subject: "Change account display name", cust: "Ngozi Chukwu", phone: "0814 773 2285",
      channel: "chat", status: "open", priority: "low", type: "Request", sentiment: "Neutral", time: "2h",
      assignee: null, preview: "Please change my display name on the app to Ngozi Eze",
      msgs: [
        { who: "c", text: "Please change my display name on the app to 'Ngozi Eze'." },
        { who: "ai", text: "You can update your display name in Profile → Edit. Would you like me to do it for you?" },
      ],
      assist: null,
    },
    {
      id: "TK-1035", subject: "Package delayed at Lagos hub", cust: "Ngozi C.", phone: "0908 331 6670",
      channel: "whatsapp", status: "resolved", priority: "medium", type: "Complaint", sentiment: "Neutral", time: "2h",
      assignee: "Chidi Eze", preview: "Package hasn't moved in 2 days after leaving Lagos hub",
      msgs: [
        { who: "c", text: "My package has been at the Lagos hub for 2 days without moving. What's going on?" },
        { who: "a", text: "Checked the manifest — your package was misrouted and is being re-dispatched. It will be delivered tomorrow morning." },
        { who: "c", text: "Okay, thank you." },
        { who: "sys", text: "Resolved by Chidi" },
      ],
      assist: null,
    },
    {
      id: "TK-1034", subject: "Statement export broken", cust: "Ibrahim Musa", phone: "0802 116 3391",
      channel: "email", status: "open", priority: "low", type: "Complaint", sentiment: "Neutral", time: "3h",
      assignee: null, preview: "PDF statement download fails on mobile with 'network error'",
      msgs: [
        { who: "c", text: "PDF statement download keeps failing on my phone with a network error." },
        { who: "ai", text: "Try the CSV export or switch to a Wi-Fi connection. If it persists, our team can email the statement to you." },
      ],
      assist: null,
    },
    {
      id: "TK-1033", subject: "Card declined but balance deducted", cust: "Fatima Bala", phone: "0701 220 8846",
      channel: "chat", status: "open", priority: "high", type: "Complaint", sentiment: "Negative", time: "4h",
      assignee: null, preview: "Paid for groceries, card declined but N8,000 was deducted",
      msgs: [
        { who: "c", text: "My card was declined at a store but N8,000 was still deducted. This is ridiculous." },
        { who: "ai", text: "I'm sorry for that experience. That's usually a pre-authorization hold that auto-releases in 48 hours. Let me confirm the merchant hold on your account." },
      ],
      assist: {
        reason: "E8 Negative sentiment · card dispute",
        summary: "Card declined at POS yet N8,000 pre-authorization held. Auto-release in 48h expected; verifying merchant hold.",
        chunks: ["Card Pre-Auth Release Policy"],
        suggest: "Fatima, the N8,000 is a pre-authorization hold that auto-releases within 48 hours. I've also filed a merchant dispute so it can be expedited.",
      },
    },
    {
      id: "TK-1030", subject: "Interest rate explanation", cust: "David Onyeka", phone: "0816 440 7719",
      channel: "chat", status: "resolved", priority: "low", type: "Inquiry", sentiment: "Positive", time: "6h",
      assignee: "Amaka Okafor", preview: "Why is my savings interest lower this month?",
      msgs: [
        { who: "c", text: "Why is my savings interest lower this month?" },
        { who: "ai", text: "Your tier changed from 4% to 3.2% because your average monthly balance fell below the N500,000 threshold." },
        { who: "c", text: "Got it, thanks!" },
        { who: "sys", text: "Resolved by Amaka" },
      ],
      assist: null,
    },
  ],

  // knowledge base (deflection engine — portal + agent KB search)
  articles: [
    { id: "A1", tenantId: "t1", title: "How to reset your transfer PIN", snippet: "Change your transfer PIN under Settings → Security, or dial *737*1# on your linked number.", body: "You can reset your transfer PIN in two ways. In the app: go to Settings → Security → Transfer PIN and follow the prompts — you'll need your account password and an OTP. By USSD: dial *737*1# and follow the voice/SMS menu on the number linked to your account. Your new PIN becomes active immediately.", views: 1240, helpful: 92 },
    { id: "A2", tenantId: "t1", title: "Transfer settlement times & stuck payments", snippet: "Most transfers settle in minutes; anything stuck past 2 hours should be escalated to us.", body: "Transfers between NairaWave accounts settle instantly. Outbound transfers to other banks typically settle within 2–10 minutes, but can take up to 2 hours during bank network downtime. If a transfer shows 'Processing' for more than 2 hours, start a chat and we'll trace it end-to-end and confirm the receiving bank's status.", views: 2100, helpful: 95 },
    { id: "A3", tenantId: "t1", title: "Refund timelines & how reversals work", snippet: "Approved refunds reflect within 24–48 hours; disputed charges can take up to 7 days.", body: "When a refund is approved, the money is returned to your account within 24–48 hours. Pre-authorization holds on declined card payments auto-release within 48 hours. Duplicate debits from failed bills are investigated and refunded once confirmed — you'll get an SMS with a reference number for tracking.", views: 980, helpful: 88 },
    { id: "A4", tenantId: "t1", title: "Why was my card declined?", snippet: "Declines are usually card freezes, insufficient balance or pre-auth limits — here's how to check.", body: "Common reasons: the card is frozen (unfreeze under Cards), the account is below the transaction balance, or a daily/online-spend limit was hit. Some declines are also pre-authorization holds that auto-release within 48 hours. Check Cards → Details to confirm the card state before retrying.", views: 1540, helpful: 76 },
    { id: "A5", tenantId: "t1", title: "Understanding transaction alerts (SMS & push)", snippet: "Missing an alert? Check alert settings, network routing and your registered phone number.", body: "Transaction alerts are sent by SMS and push for every debit. If you didn't get one, first confirm your registered phone number under Profile → Contact. Then check that SMS alerts are enabled under Settings → Notifications. Some networks delay SMS during congestion — push notifications are usually faster.", views: 860, helpful: 91 },
    { id: "A6", tenantId: "t1", title: "Blocking and unblocking your virtual card", snippet: "Freeze or unfreeze your virtual card instantly from Cards in the app — no chat needed.", body: "Open Cards in the app, select the virtual card and tap Freeze to block all new transactions. The card can be unfrozen the same way. If the card was lost or compromised, report it and we'll issue a replacement card within 48 hours.", views: 1120, helpful: 90 },
    { id: "A7", tenantId: "t1", title: "Fees & charges explained", snippet: "Transfers between NairaWave accounts are free; outbound and POS charges are listed here.", body: "Transfers between NairaWave accounts are free and unlimited. Outbound transfers attract a small flat fee shown before you confirm. ATM and POS usage is free up to a monthly limit, after which a nominal charge applies. The full schedule is on our pricing page.", views: 700, helpful: 84 },
    { id: "A8", tenantId: "t2", title: "How to track your package", snippet: "Use your tracking number on the website or WhatsApp bot for live delivery updates.", body: "With your tracking number, you can follow your package live on our website or by sending the number to our WhatsApp bot. You'll see pickup, in-transit and delivery milestones, plus the assigned dispatcher's contact at the final-mile stage.", views: 1730, helpful: 94 },
    { id: "A9", tenantId: "t2", title: "Delivery times within Lagos", snippet: "Same-day within Lagos for orders before 2pm, next-day for all others.", body: "Orders confirmed before 2pm are delivered same-day within Lagos. All other orders are delivered the next working day. Delivery is confirmed by phone before dispatch — make sure your contact number is active.", views: 690, helpful: 89 },
    { id: "A10", tenantId: "t2", title: "What to do if your package is delayed", snippet: "Packages held past their window are re-dispatched immediately — message us to fast-track.", body: "If your package hasn't moved within its delivery window, it may have been misrouted at a hub. Message our assistant and we'll check the manifest, re-dispatch it and give you a revised delivery time — usually the next morning.", views: 540, helpful: 78 },
  ],

  // canned responses for the agent composer (slash menu)
  canned: [
    { label: "/refund", text: "I've started a refund review for you. Approved refunds reflect within 24–48 hours, and you'll get an SMS with the reference number." },
    { label: "/transfer", text: "Could you share the transaction reference? I'll trace the settlement and confirm the receiving bank's status right away." },
    { label: "/apology", text: "I'm really sorry about this experience. I've taken ownership of your ticket and I'm resolving it now." },
    { label: "/escalate", text: "I understand — let me loop in a specialist who can take ownership of this for you immediately." },
    { label: "/close", text: "Is there anything else I can help with? Otherwise I'll mark this resolved and you'll get a quick CSAT prompt." },
  ],

  // past tickets shown in the portal "My tickets" list (keyed by email)
  pastTickets: [
    { email: "adaeze@example.com", id: "TK-1025", subject: "Charged twice for one transfer", status: "resolved", date: "Jul 22" },
    { email: "adaeze@example.com", id: "TK-1021", subject: "How do I block my card?", status: "resolved", date: "Jun 30" },
    { email: "adaeze@example.com", id: "TK-1018", subject: "No alert on ATM withdrawal", status: "resolved", date: "May 14" },
    { email: "segun@yahoo.com", id: "TK-1016", subject: "Update phone number for alerts", status: "resolved", date: "Apr 8" },
  ],

  // escalation rules (DB-backed in real app)
  rules: [
    { id: "E1", name: "Direct human request", desc: "Customer asks to speak to a person", preset: true, enabled: true, cond: "customer_request", action: "escalate", terms: ["human", "agent", "manager", "representative", "speak to someone", "talk to a person"] },
    { id: "E2", name: "High-frustration phrases", desc: "Abusive / frustration keywords incl. Pidgin", preset: true, enabled: true, cond: "keywords", action: "escalate", terms: ["useless bot", "this bot is stupid", "wetin dey happen", "ole", "thief", "scam", "fraud", "stupid"] },
    { id: "E3", name: "Money / legal threat", desc: "Stolen money, lawsuit, CBN, EFCC, police", preset: true, enabled: true, cond: "keywords", action: "escalate + priority HIGH", terms: ["stole my money", "stolen", "sue", "lawyer", "cbn", "efcc", "police", "report you", "complaint"] },
    { id: "E4", name: "Refund / demands", desc: "Refund, compensation, money back", preset: true, enabled: true, cond: "keywords", action: "escalate", terms: ["refund", "reverse my money", "give me my money back", "compensation", "reversal"] },
    { id: "E5", name: "Conversational loop", desc: "Repeated identical customer messages", preset: true, enabled: true, cond: "conversation_loop", action: "escalate", terms: ["identical ≥2", "near-identical ≥3"] },
    { id: "E6", name: "Repeated failed self-service", desc: "Same question 3× with empty retrieval", preset: true, enabled: true, cond: "repeat_failed_self_service", action: "escalate + kb_gap", terms: ["same question ≥3×", "empty retrieval"] },
    { id: "E7", name: "AI low confidence ×2", desc: "LLM refuses twice with low confidence", preset: true, enabled: true, cond: "confidence_below", action: "escalate", terms: ["confidence < 0.5", "consecutive ≥2"] },
    { id: "E8", name: "Negative sentiment burst", desc: "2+ consecutive negative turns", preset: true, enabled: true, cond: "sentiment_negative", action: "escalate", terms: ["negative turns ≥2"] },
    { id: "E9", name: "Security-sensitive content", desc: "Card number, OTP or password in text", preset: true, enabled: true, cond: "pii_security", action: "escalate + audit", terms: ["card number", "otp", "password"] },
    { id: "E10", name: "SLA timeout", desc: "Open ticket, no reply in 60 min", preset: true, enabled: false, cond: "sla_timeout", action: "escalate + notify", terms: ["open > 60 min", "no agent reply"] },
    { id: "C1", name: "VIP customers always to human", desc: "Customers tagged VIP bypass the AI", preset: false, enabled: true, cond: "customer_segment", action: "escalate + route owner", terms: ["segment = VIP"] },
  ],

  plans: [
    { code: "starter", name: "Starter", price: "₦0", priceNum: 0, agents: 1, customers: 500, kb: "2 GB", tag: "Free" },
    { code: "pro", name: "Pro", price: "₦45,000", priceNum: 45000, agents: 5, customers: 5000, kb: "20 GB", tag: "Popular" },
    { code: "enterprise", name: "Enterprise", price: "₦180,000", priceNum: 180000, agents: 50, customers: 100000, kb: "200 GB", tag: "Scale" },
  ],

  invoices: [
    { id: "INV-0021", period: "Jul 28 – Aug 28", amount: "₦45,000", status: "paid", method: "Visa ···· 4821" },
    { id: "INV-0020", period: "Jun 28 – Jul 28", amount: "₦45,000", status: "paid", method: "Visa ···· 4821" },
    { id: "INV-0019", period: "May 28 – Jun 28", amount: "₦45,000", status: "paid", method: "Visa ···· 4821" },
    { id: "INV-0018", period: "Apr 28 – May 28", amount: "₦0", status: "waived", method: "Starter promo" },
  ],

  audit: [
    { time: "2m", actor: "super_admin", action: "impersonate_start", target: "NairaWave", detail: "30-min scoped token · audited" },
    { time: "24m", actor: "super_admin", action: "impersonate_end", target: "NairaWave", detail: "12 min duration · token revoked" },
    { time: "1h", actor: "system", action: "suspend_tenant", target: "SolarHub Nigeria", detail: "quota overage × 3 days" },
    { time: "3h", actor: "super_admin", action: "change_plan", target: "NairaWave", detail: "starter → pro" },
    { time: "5h", actor: "owner", action: "update_escalation_rule", target: "NairaWave", detail: "E2 terms edited" },
    { time: "1d", actor: "owner", action: "update_tenant_settings", target: "NairaWave", detail: "brand_tone: professional" },
    { time: "1d", actor: "agent", action: "resolve_ticket", target: "TK-1030", detail: "resolved · csat pending" },
    { time: "2d", actor: "owner", action: "invite_agent", target: "NairaWave", detail: "yusuf@nairawave.ng invited" },
  ],

  // seeded per-role activity feeds
  feed: {
    super: [
      { ic: "building", color: "#7c3aed", title: "BoltPay Microfinance submitted for approval", meta: "2m ago · status: pending → review" },
      { ic: "zap", color: "#2563eb", title: "Platform deflection hits 68.4% this week", meta: "9m ago · ~₦2,500 saved per deflection" },
      { ic: "eye", color: "#00a86b", title: "Impersonation session ended (admin → NairaWave)", meta: "24m ago · audited · 12 min" },
      { ic: "warning", color: "#d93636", title: "SolarHub Nigeria auto-suspended", meta: "1h ago · quota overage × 3 days" },
      { ic: "card", color: "#00a86b", title: "NairaWave upgraded Starter → Pro", meta: "3h ago · +2 agents · +10 GB KB" },
    ],
    owner: [
      { ic: "alert", color: "#d93636", title: "Ticket TK-1042 escalated (E2/E3)", meta: "2m ago · routed to Amaka · HIGH" },
      { ic: "bot", color: "#2563eb", title: "AI deflected 14 chats this hour", meta: "18m ago · 95.2% deflection" },
      { ic: "edit", color: "#00a86b", title: "Rule edited: E2 terms + 'wetin dey happen'", meta: "1h ago · live on next message" },
      { ic: "users", color: "#7c3aed", title: "Presence: Amaka went online", meta: "2h ago" },
    ],
    agent: [
      { ic: "alert", color: "#d93636", title: "Escalation assigned to you · TK-1042", meta: "2m ago · priority HIGH" },
      { ic: "checkcircle", color: "#00a86b", title: "TK-1030 resolved · CSAT pending", meta: "1h ago" },
      { ic: "ticket", color: "#2563eb", title: "New chat from Kemi · TK-1039", meta: "1h ago · WhatsApp" },
      { ic: "users", color: "#7c3aed", title: "Chidi went online", meta: "3h ago" },
    ],
  },

  notifications: [
    { ic: "alert", color: "#d93636", title: "Escalation assigned to you — TK-1042", meta: "2m ago", unread: true },
    { ic: "checkcircle", color: "#00a86b", title: "TK-1030 resolved by Amaka", meta: "1h ago", unread: true },
    { ic: "card", color: "#2563eb", title: "Invoice INV-0021 paid", meta: "3h ago", unread: true },
    { ic: "users", color: "#7c3aed", title: "Chidi invited you to a shift", meta: "1d ago", unread: false },
  ],

  // pools the realtime simulator draws from
  sim: {
    super: [
      { ic: "building", color: "#7c3aed", title: "New tenant signup received", meta: "· waiting for review" },
      { ic: "card", color: "#00a86b", title: "MediQuick upgraded to Enterprise", meta: "· MRR +₦135,000" },
      { ic: "warning", color: "#d93636", title: "GidiExpress near KB quota", meta: "· 88 / 200 MB" },
      { ic: "eye", color: "#2563eb", title: "Super admin impersonation started", meta: "· 30-min token issued" },
      { ic: "zap", color: "#2563eb", title: "Platform deflection up to 69.1%", meta: "· new daily record" },
    ],
    owner: [
      { ic: "alert", color: "#d93636", title: "New escalation · TK-" + (1043 + Math.floor(Math.random() * 40)) + " (E8)", meta: "· routed to online agent" },
      { ic: "bot", color: "#2563eb", title: "AI deflected " + (10 + Math.floor(Math.random() * 30)) + " chats this hour", meta: "· deflection steady" },
      { ic: "smile", color: "#00a86b", title: "CSAT response: 5 stars", meta: "· from recent resolved ticket" },
      { ic: "users", color: "#7c3aed", title: "Agent presence changed", meta: "· check Agents tab" },
      { ic: "book", color: "#2563eb", title: "New KB article recommended", meta: "· 'Alert delays explained'" },
    ],
    agent: [
      { ic: "alert", color: "#d93636", title: "New escalation routed to you", meta: "· priority HIGH · opens queue" },
      { ic: "message", color: "#2563eb", title: "Customer replied · " + ("TK-10" + (30 + Math.floor(Math.random() * 8))), meta: "· you're assigned" },
      { ic: "checkcircle", color: "#00a86b", title: "Your ticket resolved by customer", meta: "· CSAT pending" },
    ],
  },
};
