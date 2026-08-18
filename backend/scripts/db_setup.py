"""Seed the Prestige backend database with demo data mirroring frontend/src/lib/mock/dataset.js.

Usage (from backend/):
    .venv\\Scripts\\python.exe scripts\\db_setup.py            # seed if empty
    .venv\\Scripts\\python.exe scripts\\db_setup.py --reset    # drop all + reseed
"""

import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bcrypt

from app.database import Base, SessionLocal, engine
from app.database import _ensure_teams
from app.services.serializers import ensure_ticket_number
from app.models import (
    ApiKey,
    AuditLog,
    AutomationRule,
    CannedResponse,
    ChannelSetting,
    Customer,
    EscalationRule,
    FeatureFlag,
    Invite,
    Invoice,
    KbArticle,
    KnowledgeSource,
    Label,
    Message,
    Notification,
    NotificationPreference,
    Plan,
    PresetVersion,
    SlaPolicy,
    SlaSchedule,
    Subscription,
    Team,
    Tenant,
    TenantMember,
    Ticket,
    User,
    WebhookDelivery,
    WebhookEndpoint,
)
from app.models.common import (
    InviteRole,
    MessageSender,
    NotificationType,
    Role,
    TenantStatus,
)

DEMO_PASSWORD = "password123"

# Chatwoot-style label library seeded per tenant (mirrors the mock seed so the
# real backend renders the same colored chips as the prototype).
SEED_LABELS = {
    "refund": "#0d8f63",
    "transfers": "#2563eb",
    "alerts": "#0891b2",
    "high-value": "#7c3aed",
    "urgent": "#d93636",
    "how-to": "#b98800",
    "security": "#2563eb",
    "card": "#7c3aed",
    "app": "#0d8f63",
    "bug": "#d93636",
    "bills": "#0891b2",
    "profile": "#b98800",
    "savings": "#2563eb",
    "delivery": "#0d8f63",
    "atm": "#0891b2",
    "ussd": "#b98800",
    "resolved": "#0d8f63",
}

# ticket id -> label names applied at seed time
TICKET_LABELS = {
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
    "TK-1025": ["refund", "transfers"],
    "TK-1021": ["card", "security"],
    "TK-1018": ["alerts", "atm"],
    "TK-1016": ["profile", "alerts"],
}

TENANT_DATA = [
    {
        "id": "t1", "name": "NairaWave Fintech", "slug": "nairawave",
        "email": "support@nairawave.ng", "status": "active", "plan": "pro",
        "color": "#00a86b", "tone": "professional", "city": "Lagos",
        "botName": "Naira", "welcomeMessage": "Hi there! 👋 How can we help you today?",
        "launcherText": "Chat with NairaWave", "widgetPosition": "bottom-right",
        "escalationMessage": "You're now chatting with a human agent.",
        "mobileFullscreen": True, "secondaryColor": "#2563eb",
        "proactiveTeaser": "Need help with transfers or your PIN? Chat with us — usually replies instantly.",
    },
    {
        "id": "t2", "name": "GidiExpress Logistics", "slug": "gidiexpress",
        "email": "help@gidiexpress.ng", "status": "active", "plan": "starter",
        "color": "#f59e0b", "tone": "pidgin", "city": "Lagos",
    },
    {
        "id": "t3", "name": "BoltPay Microfinance", "slug": "boltpay",
        "email": "care@boltpay.ng", "status": "pending", "plan": "starter",
        "color": "#2563eb", "tone": "professional", "city": "Abuja",
    },
    {
        "id": "t4", "name": "SolarHub Nigeria", "slug": "solarhub",
        "email": "support@solarhub.ng", "status": "suspended", "plan": "starter",
        "color": "#7c3aed", "tone": "casual", "city": "Port Harcourt",
    },
    {
        "id": "t5", "name": "MediQuick Pharmacy", "slug": "mediquick",
        "email": "hello@mediquick.ng", "status": "active", "plan": "pro",
        "color": "#e11d48", "tone": "formal", "city": "Ibadan",
    },
]

AGENT_DATA = [
    {"id": "u1", "name": "Bisi Adeyemi", "role": "owner", "email": "bisi@nairawave.ng", "color": "green", "tenant": "t1"},
    {"id": "u2", "name": "Amaka Okafor", "role": "agent", "email": "amaka@nairawave.ng", "color": "blue", "tenant": "t1"},
    {"id": "u3", "name": "Chidi Eze", "role": "agent", "email": "chidi@nairawave.ng", "color": "amber", "tenant": "t1"},
    {"id": "u4", "name": "Yusuf Ibrahim", "role": "agent", "email": "yusuf@nairawave.ng", "color": "slate", "tenant": "t1"},
    {"id": "u5", "name": "Emeka Obi", "role": "owner", "email": "emeka@gidiexpress.ng", "color": "amber", "tenant": "t2"},
    {"id": "u6", "name": "Ngozi Balogun", "role": "owner", "email": "ngozi@boltpay.ng", "color": "blue", "tenant": "t3"},
    {"id": "u7", "name": "Ada Obi", "role": "owner", "email": "ada@solarhub.ng", "color": "violet", "tenant": "t4"},
    {"id": "u8", "name": "Dr Femi Adeleke", "role": "owner", "email": "femi@mediquick.ng", "color": "rose", "tenant": "t5"},
]

TICKET_DATA = [
    {
        "id": "TK-1042", "subject": "Debit without transaction alert", "cust": "Tunde Bakare",
        "email": "tunde.bakare@example.com", "phone": "0803 114 2271", "channel": "chat",
        "status": "escalated", "priority": "high", "type": "Complaint", "sentiment": "Negative",
        "ago": 2, "unit": "m", "sla": "overdue", "assignee": "u2",
        "msgs": [
            ("customer", "Good morning. I was debited N25,000 at 8:41am but no alert came. This is the second time this month.", "u1", 2),
            ("ai_bot", "I'm sorry about that, Tunde. Let me check your transaction history and alert settings right away.", None, 1),
            ("customer", "This is really frustrating. It happened last month too and nobody did anything. I want to speak to a human right now!", "u1", 0),
            ("system", "Escalated · E2 frustration + E3 money threat · priority HIGH · routed to Amaka", None, 0),
            ("human_agent", "Tunde, this is Amaka. I've flagged the account for immediate refund review and added a chargeback note. You'll get a call within 30 minutes — I'm staying on this ticket with you.", "u2", 0),
        ],
    },
    {
        "id": "TK-1041", "subject": "Transfer stuck on 'Processing'", "cust": "Amina Bello",
        "email": "amina.bello@example.com", "phone": "0905 660 3318", "channel": "chat",
        "status": "in_progress", "priority": "high", "type": "Request", "sentiment": "Negative",
        "ago": 18, "unit": "m", "sla": "12m left", "assignee": "u3",
        "msgs": [
            ("customer", "My transfer of N120,000 to GTBank has been on 'Processing' for 3 hours. What is happening?", "u1", 18),
            ("ai_bot", "Let me check the transfer status for you, Amina.", None, 17),
            ("customer", "Please, I need to pay school fees today. This is embarrassing.", "u1", 16),
            ("system", "Escalated · E3 money + E8 negative sentiment · priority HIGH", None, 15),
            ("human_agent", "Amina, good news — your transfer actually settled at 1:12pm. The status was a display lag on the sending side. I've shared the receipt.", "u3", 14),
        ],
    },
    {
        "id": "TK-1040", "subject": "How do I change my transfer PIN?", "cust": "Segun Osinachi",
        "email": "segun.osinachi@example.com", "phone": "0812 992 4410", "channel": "chat",
        "status": "open", "priority": "low", "type": "Inquiry", "sentiment": "Neutral",
        "ago": 41, "unit": "m", "sla": "1h left", "assignee": None,
        "msgs": [
            ("customer", "I want to change my transfer PIN, how do I do that?", "u1", 41),
            ("ai_bot", "You can reset your transfer PIN under Settings → Security → Transfer PIN, or dial *737*1# on the number linked to your account. Do you want me to walk you through it?", None, 40),
        ],
    },
    {
        "id": "TK-1039", "subject": "USSD code not working", "cust": "Kemi Alade",
        "email": "kemi.alade@example.com", "phone": "0703 884 5520", "channel": "whatsapp",
        "status": "open", "priority": "medium", "type": "Complaint", "sentiment": "Neutral",
        "ago": 60, "unit": "m", "sla": "30m left", "assignee": None, "unread": False,
        "msgs": [
            ("customer", "*737*100# keeps returning 'invalid option' since this morning. I used it yesterday and it was fine.", "u1", 60),
            ("ai_bot", "Let me check for any scheduled USSD maintenance on your network and account. One moment.", None, 59),
        ],
    },
    {
        "id": "TK-1037", "subject": "Refund for failed utility payment", "cust": "Hassan Danladi",
        "email": "hassan.danladi@example.com", "phone": "0806 221 9087", "channel": "portal",
        "status": "open", "priority": "high", "type": "Request", "sentiment": "Neutral",
        "ago": 120, "unit": "m", "sla": "45m left", "assignee": "u2", "unread": False,
        "msgs": [
            ("customer", "I paid my PHCN bill via the app. It said failed, but I was debited twice. Please refund.", "u1", 120),
            ("system", "Escalated · E4 refund + E3 money threat · priority HIGH", None, 119),
        ],
    },
    {
        "id": "TK-1036", "subject": "Change account display name", "cust": "Ngozi Chukwu",
        "email": "ngozi.chukwu@example.com", "phone": "0814 773 2285", "channel": "chat",
        "status": "open", "priority": "low", "type": "Request", "sentiment": "Neutral",
        "ago": 120, "unit": "m", "sla": "1h left", "assignee": None, "unread": False,
        "msgs": [
            ("customer", "Please change my display name on the app to 'Ngozi Eze'.", "u1", 120),
            ("ai_bot", "You can update your display name in Profile → Edit. Would you like me to do it for you?", None, 119),
        ],
    },
    {
        "id": "TK-1035", "subject": "Package delayed at Lagos hub", "cust": "Ngozi C.",
        "email": "ngozi.c@example.com", "phone": "0908 331 6670", "channel": "whatsapp",
        "status": "resolved", "priority": "medium", "type": "Complaint", "sentiment": "Neutral",
        "ago": 120, "unit": "m", "sla": None, "assignee": "u3", "unread": False, "tenant": "t2",
        "msgs": [
            ("customer", "My package has been at the Lagos hub for 2 days without moving. What's going on?", "u1", 120),
            ("human_agent", "Checked the manifest — your package was misrouted and is being re-dispatched. It will be delivered tomorrow morning.", "u3", 119),
            ("customer", "Okay, thank you.", "u1", 118),
            ("system", "Resolved by Chidi", None, 117),
        ],
    },
    {
        "id": "TK-1034", "subject": "Statement export broken", "cust": "Ibrahim Musa",
        "email": "ibrahim.musa@example.com", "phone": "0802 116 3391", "channel": "email",
        "status": "open", "priority": "low", "type": "Complaint", "sentiment": "Neutral",
        "ago": 180, "unit": "m", "sla": "1h left", "assignee": None, "unread": False,
        "msgs": [
            ("customer", "PDF statement download keeps failing on my phone with a network error.", "u1", 180),
            ("ai_bot", "Try the CSV export or switch to a Wi-Fi connection. If it persists, our team can email the statement to you.", None, 179),
        ],
    },
    {
        "id": "TK-1033", "subject": "Card declined but balance deducted", "cust": "Fatima Bala",
        "email": "fatima.bala@example.com", "phone": "0701 220 8846", "channel": "chat",
        "status": "open", "priority": "high", "type": "Complaint", "sentiment": "Negative",
        "ago": 240, "unit": "m", "sla": "45m left", "assignee": None,
        "msgs": [
            ("customer", "My card was declined at a store but N8,000 was still deducted. This is ridiculous.", "u1", 240),
            ("ai_bot", "I'm sorry for that experience. That's usually a pre-authorization hold that auto-releases in 48 hours. Let me confirm the merchant hold on your account.", None, 239),
        ],
    },
    {
        "id": "TK-1030", "subject": "Interest rate explanation", "cust": "David Onyeka",
        "email": "david.onyeka@example.com", "phone": "0816 440 7719", "channel": "chat",
        "status": "resolved", "priority": "low", "type": "Inquiry", "sentiment": "Positive",
        "ago": 360, "unit": "m", "sla": None, "assignee": "u2", "unread": False,
        "msgs": [
            ("customer", "Why is my savings interest lower this month?", "u1", 360),
            ("ai_bot", "Your tier changed from 4% to 3.2% because your average monthly balance fell below the N500,000 threshold.", None, 359),
            ("customer", "Got it, thanks!", "u1", 358),
            ("system", "Resolved by Amaka", None, 357),
        ],
    },
]

PAST_TICKETS = [
    {"id": "TK-1022", "subject": "Blocked card after failed OTP", "email": "tunde.bakare@example.com", "date": "Jul 12"},
    {"id": "TK-1011", "subject": "Enquiry: savings interest rate", "email": "tunde.bakare@example.com", "date": "Jun 2"},
    {"id": "TK-1025", "subject": "Charged twice for one transfer", "email": "adaeze@example.com", "date": "Jul 22"},
    {"id": "TK-1021", "subject": "How do I block my card?", "email": "adaeze@example.com", "date": "Jun 30"},
    {"id": "TK-1018", "subject": "No alert on ATM withdrawal", "email": "adaeze@example.com", "date": "May 14"},
    {"id": "TK-1016", "subject": "Update phone number for alerts", "email": "segun@yahoo.com", "date": "Apr 8"},
]

ARTICLE_DATA = [
    {"id": "A1", "tenantId": "t1", "title": "How to reset your transfer PIN", "snippet": "Change your transfer PIN under Settings → Security, or dial *737*1# on your linked number.", "body": "You can reset your transfer PIN in two ways. In the app: go to Settings → Security → Transfer PIN and follow the prompts — you'll need your account password and an OTP. By USSD: dial *737*1# and follow the voice/SMS menu on the number linked to your account. Your new PIN becomes active immediately.", "cat": "Security"},
    {"id": "A2", "tenantId": "t1", "title": "Transfer settlement times & stuck payments", "snippet": "Most transfers settle in minutes; anything stuck past 2 hours should be escalated to us.", "body": "Transfers between NairaWave accounts settle instantly. Outbound transfers to other banks typically settle within 2–10 minutes, but can take up to 2 hours during bank network downtime. If a transfer shows 'Processing' for more than 2 hours, start a chat and we'll trace it end-to-end and confirm the receiving bank's status.", "cat": "Transfers"},
    {"id": "A3", "tenantId": "t1", "title": "Refund timelines & how reversals work", "snippet": "Approved refunds reflect within 24–48 hours; disputed charges can take up to 7 days.", "body": "When a refund is approved, the money is returned to your account within 24–48 hours. Pre-authorization holds on declined card payments auto-release within 48 hours. Duplicate debits from failed bills are investigated and refunded once confirmed — you'll get an SMS with a reference number for tracking.", "cat": "Payments"},
    {"id": "A4", "tenantId": "t1", "title": "Why was my card declined?", "snippet": "Declines are usually card freezes, insufficient balance or pre-auth limits — here's how to check.", "body": "Common reasons: the card is frozen (unfreeze under Cards), the account is below the transaction balance, or a daily/online-spend limit was hit. Some declines are also pre-authorization holds that auto-release within 48 hours. Check Cards → Details to confirm the card state before retrying.", "cat": "Cards"},
    {"id": "A5", "tenantId": "t1", "title": "Understanding transaction alerts (SMS & push)", "snippet": "Missing an alert? Check alert settings, network routing and your registered phone number.", "body": "Transaction alerts are sent by SMS and push for every debit. If you didn't get one, first confirm your registered phone number under Profile → Contact. Then check that SMS alerts are enabled under Settings → Notifications. Some networks delay SMS during congestion — push notifications are usually faster.", "cat": "Alerts"},
    {"id": "A6", "tenantId": "t1", "title": "Blocking and unblocking your virtual card", "snippet": "Freeze or unfreeze your virtual card instantly from Cards in the app — no chat needed.", "body": "Open Cards in the app, select the virtual card and tap Freeze to block all new transactions. The card can be unfrozen the same way. If the card was lost or compromised, report it and we'll issue a replacement card within 48 hours.", "cat": "Cards"},
    {"id": "A7", "tenantId": "t1", "title": "Fees & charges explained", "snippet": "Transfers between NairaWave accounts are free; outbound and POS charges are listed here.", "body": "Transfers between NairaWave accounts are free and unlimited. Outbound transfers attract a small flat fee shown before you confirm. ATM and POS usage is free up to a monthly limit, after which a nominal charge applies. The full schedule is on our pricing page.", "cat": "Fees"},
    {"id": "A8", "tenantId": "t2", "title": "How to track your package", "snippet": "Use your tracking number on the website or WhatsApp bot for live delivery updates.", "body": "With your tracking number, you can follow your package live on our website or by sending the number to our WhatsApp bot. You'll see pickup, in-transit and delivery milestones, plus the assigned dispatcher's contact at the final-mile stage.", "cat": "Tracking"},
    {"id": "A9", "tenantId": "t2", "title": "Delivery times within Lagos", "snippet": "Same-day within Lagos for orders before 2pm, next-day for all others.", "body": "Orders confirmed before 2pm are delivered same-day within Lagos. All other orders are delivered the next working day. Delivery is confirmed by phone before dispatch — make sure your contact number is active.", "cat": "Delivery"},
    {"id": "A10", "tenantId": "t2", "title": "What to do if your package is delayed", "snippet": "Packages held past their window are re-dispatched immediately — message us to fast-track.", "body": "If your package hasn't moved within its delivery window, it may have been misrouted at a hub. Message our assistant and we'll check the manifest, re-dispatch it and give you a revised delivery time — usually the next morning.", "cat": "Delivery"},
]

CANNED_DATA = [
    {"id": "can1", "label": "/refund", "text": "I've started a refund review for you. Approved refunds reflect within 24–48 hours, and you'll get an SMS with the reference number."},
    {"id": "can2", "label": "/transfer", "text": "Could you share the transaction reference? I'll trace the settlement and confirm the receiving bank's status right away."},
    {"id": "can3", "label": "/apology", "text": "I'm really sorry about this experience. I've taken ownership of your ticket and I'm resolving it now."},
    {"id": "can4", "label": "/escalate", "text": "I understand — let me loop in a specialist who can take ownership of this for you immediately."},
    {"id": "can5", "label": "/close", "text": "Is there anything else I can help with? Otherwise I'll mark this resolved and you'll get a quick CSAT prompt."},
]

RULE_DATA = [
    {"id": "E1", "name": "Direct human request", "desc": "Customer asks to speak to a person", "cond": "customer_request", "action": "escalate", "terms": ["human", "agent", "manager", "representative", "speak to someone", "talk to a person"]},
    {"id": "E2", "name": "High-frustration phrases", "desc": "Abusive / frustration keywords incl. Pidgin", "cond": "keywords", "action": "escalate", "terms": ["useless bot", "this bot is stupid", "wetin dey happen", "ole", "thief", "scam", "fraud", "stupid"]},
    {"id": "E3", "name": "Money / legal threat", "desc": "Stolen money, lawsuit, CBN, EFCC, police", "cond": "keywords", "action": "escalate + priority HIGH", "terms": ["stole my money", "stolen", "sue", "lawyer", "cbn", "efcc", "police", "report you", "complaint"]},
    {"id": "E4", "name": "Refund / demands", "desc": "Refund, compensation, money back", "cond": "keywords", "action": "escalate", "terms": ["refund", "reverse my money", "give me my money back", "compensation", "reversal"]},
    {"id": "E5", "name": "Conversational loop", "desc": "Repeated identical customer messages", "cond": "conversation_loop", "action": "escalate", "terms": ["identical ≥2", "near-identical ≥3"]},
    {"id": "E6", "name": "Repeated failed self-service", "desc": "Same question 3× with empty retrieval", "cond": "repeat_failed_self_service", "action": "escalate + kb_gap", "terms": ["same question ≥3×", "empty retrieval"]},
    {"id": "E7", "name": "AI low confidence ×2", "desc": "LLM refuses twice with low confidence", "cond": "confidence_below", "action": "escalate", "terms": ["confidence < 0.5", "consecutive ≥2"]},
    {"id": "E8", "name": "Negative sentiment burst", "desc": "2+ consecutive negative turns", "cond": "sentiment_negative", "action": "escalate", "terms": ["negative turns ≥2"]},
    {"id": "E9", "name": "Security-sensitive content", "desc": "Card number, OTP or password in text", "cond": "pii_security", "action": "escalate + audit", "terms": ["card number", "otp", "password"]},
    {"id": "E10", "name": "SLA timeout", "desc": "Open ticket, no reply in 60 min", "cond": "sla_timeout", "action": "escalate + notify", "terms": ["open > 60 min", "no agent reply"], "enabled": False},
    {"id": "C1", "name": "VIP customers always to human", "desc": "Customers tagged VIP bypass the AI", "cond": "customer_segment", "action": "escalate + route owner", "terms": ["segment = VIP"], "preset": False},
]

PLAN_DATA = [
    {"code": "starter", "name": "Starter", "price": 0, "agents": 1, "customers": 500, "kb": 2048, "tag": "Free"},
    {"code": "pro", "name": "Pro", "price": 45000, "agents": 5, "customers": 5000, "kb": 20480, "tag": "Popular"},
    {"code": "enterprise", "name": "Enterprise", "price": 180000, "agents": 50, "customers": 100000, "kb": 204800, "tag": "Scale"},
]

KB_SOURCE_DATA = [
    {"id": "ks1", "tenant": "t1", "type": "link", "title": "NairaWave help docs", "url": "https://docs.nairawave.ng", "status": "ready", "ago": 4, "unit": "d",
     "text": ("NairaWave help centre\n\n"
              "Transfers between NairaWave accounts settle instantly, 24/7. Outbound transfers to other "
              "banks take 2-10 minutes on the NIBSS rails; anything still showing 'Processing' after 2 hours "
              "should be reported with the transfer reference so our team can trace it end-to-end.\n\n"
              "If your card was declined but money was deducted, that is usually a pre-authorisation hold: the "
              "merchant freezes the amount while the network validates it, and it auto-releases within 48 hours "
              "if the charge is not settled.\n\n"
              "Missing debit alerts are almost always an alert-settings issue or an outdated phone number on "
              "file. Push notifications are faster than SMS; check Profile -> Contact and Settings -> Notifications.\n\n"
              "To reset your transfer PIN, go to Settings -> Security -> Transfer PIN or dial *737*1# from your "
              "registered line. NairaWave never asks for your PIN or card details by chat.")},
    {"id": "ks2", "tenant": "t1", "type": "pdf", "title": "Fee schedule 2026.pdf", "size": 182, "status": "ready", "ago": 7, "unit": "d",
     "text": ("NairaWave fee schedule 2026\n\n"
              "Instant transfers within NairaWave: free. Outbound transfers to other banks: NGN 15 flat per "
              "transaction below NGN 10,000 and NGN 25 above. Bill payments: NGN 0 for PHCN, LCC and selected "
              "municipal bills. Airtime and data: no service fee.\n\n"
              "Card withdrawals at NairaWave agents: free up to NGN 20,000 per day, NGN 100 per withdrawal "
              "thereafter. ATM withdrawals at partner banks: NGN 45 per withdrawal. POS and web card payments "
              "are free for customers.\n\n"
              "Account maintenance: free on all tiers. Duplicate statement reprint: NGN 200. Card replacement "
              "after loss or theft: NGN 1,500; standard delivery 3-5 business days.")},
    {"id": "ks3", "tenant": "t1", "type": "raw_text", "title": "Transfer SLA notes", "status": "ready", "ago": 12, "unit": "d",
     "text": ("Transfer SLA notes\n\n"
              "Inbound (NairaWave to NairaWave): instant, credited in real time, 99.9% within 5 seconds.\n"
              "Outbound (NairaWave to other banks, NIBSS NIP): SLA 2-10 minutes during business hours; up to "
              "30 minutes after hours. If a transfer is stuck beyond the SLA, agents escalate with the "
              "reference and session ID to the settlement desk (E8 rule, priority high).\n"
              "Refunds on failed debits: reviewed within 2 business hours; approved refunds settle within "
              "24-48 hours and the customer receives an SMS with a reference.\n"
              "VIP customers are queued first and always offered a human agent on money-related tickets.")},
    {"id": "ks4", "tenant": "t2", "type": "link", "title": "GidiExpress tracking help", "url": "https://help.gidiexpress.ng", "status": "ready", "ago": 5, "unit": "d",
     "text": ("GidiExpress tracking help\n\n"
              "Every parcel leaves our Lagos hub with a waybill number (format GIDI-000-000). You can track it "
              "on the app or by replying with the waybill number. Statuses: Collected, At hub, In transit, Out "
              "for delivery, Delivered.\n\n"
              "If a parcel has not moved for more than 48 hours, request a live trace with the waybill number. "
              "Delivery takes 1-2 business days within Lagos and 2-4 business days to other states. Proof of "
              "delivery photos are uploaded at drop-off.\n\n"
              "For undelivered parcels, GidiExpress contacts the recipient by SMS; if there is no response in "
              "72 hours the parcel is returned to the nearest hub.")},
]

AUTOMATION_DATA = [
    {
        "id": "AT-1", "name": "High-priority to best agent",
        "desc": "High priority tickets route to the highest-resolution online agent",
        "enabled": True, "trigger": "ticket_created", "conditionMatch": "all",
        "conditions": [{"field": "priority", "op": "eq", "value": "high"}],
        "actions": [
            {"type": "assign_agent", "config": {"agent": "u2"}},
            {"type": "set_status", "config": {"status": "in_progress"}},
            {"type": "add_note", "config": {"note": "Auto-assigned by priority automation"}},
        ],
        "order": 1, "runCount": 18, "lastRunMin": 2, "createdDay": 18,
    },
    {
        "id": "AT-2", "name": "Escalation alert to Slack",
        "desc": "Any escalation posts a #urgent-tickets alert",
        "enabled": True, "trigger": "status_changed", "conditionMatch": "all",
        "conditions": [{"field": "status", "op": "eq", "value": "escalated"}],
        "actions": [
            {"type": "send_slack", "config": {"channel": "#urgent-tickets"}},
            {"type": "set_priority", "config": {"priority": "high"}},
        ],
        "order": 2, "runCount": 31, "lastRunMin": 12, "createdDay": 18,
    },
    {
        "id": "AT-3", "name": "Negative sentiment → owner",
        "desc": "Complaints with negative sentiment notify the owner and add a review note",
        "enabled": True, "trigger": "message_received", "conditionMatch": "any",
        "conditions": [
            {"field": "sentiment", "op": "eq", "value": "Negative"},
            {"field": "type", "op": "eq", "value": "complaint"},
        ],
        "actions": [
            {"type": "send_email", "config": {"to": "owner@nairawave.ng", "subject": "Complaint flagged for review"}},
            {"type": "add_note", "config": {"note": "Owner review requested — negative sentiment"}},
        ],
        "order": 3, "runCount": 9, "lastRunMin": 60, "createdDay": 20,
    },
    {
        "id": "AT-4", "name": "Unassigned for 4h",
        "desc": "Re-open tickets left unassigned past 4 hours escalate to the team",
        "enabled": False, "trigger": "interval", "conditionMatch": "all",
        "conditions": [
            {"field": "assignee", "op": "eq", "value": None},
            {"field": "status", "op": "in", "value": ["open", "in_progress"]},
            {"field": "time", "op": "older_than", "value": "4h"},
        ],
        "actions": [
            {"type": "escalate", "config": {"note": "Unassigned past 4h — team escalation"}},
            {"type": "send_slack", "config": {"channel": "#assignments"}},
        ],
        "interval": {"unit": "hours", "value": 1},
        "order": 4, "runCount": 4, "lastRunMin": 180, "createdDay": 22,
    },
    {
        "id": "AT-5", "name": "VIP route + note",
        "desc": "VIP segment tickets always go to the owner with a VIP banner",
        "enabled": True, "trigger": "ticket_created", "conditionMatch": "all",
        "conditions": [{"field": "segment", "op": "eq", "value": "vip"}],
        "actions": [
            {"type": "assign_agent", "config": {"agent": "u1"}},
            {"type": "add_note", "config": {"note": "VIP customer — prioritize"}},
        ],
        "order": 5, "runCount": 2, "lastRunMin": 1440, "createdDay": 25,
    },
]

SLA_DATA = [
    {
        "id": "SL-1", "name": "Standard support", "desc": "Baseline SLA for all chats and portal tickets",
        "enabled": True, "match": [{"field": "channel", "op": "in", "value": ["chat", "portal"]}],
        "targets": [
            {"priority": "low", "firstResponseMin": 240, "resolutionMin": 1440},
            {"priority": "medium", "firstResponseMin": 120, "resolutionMin": 720},
            {"priority": "high", "firstResponseMin": 30, "resolutionMin": 360},
        ],
        "scheduleId": "sched1",
        "escalations": [
            {"id": "sle1", "level": 1, "afterMin": 25, "target": "first_response", "action": "notify_owner", "message": "High priority first response due in 5m"},
            {"id": "sle2", "level": 2, "afterMin": 30, "target": "first_response", "action": "escalate_agent", "message": "First response overdue — assigning senior agent"},
        ],
        "breaches": 3, "createdDay": 12,
    },
    {
        "id": "SL-2", "name": "Escalated tickets", "desc": "Escalations resolve within the hour, 24/7",
        "enabled": True, "match": [{"field": "status", "op": "eq", "value": "escalated"}],
        "targets": [
            {"priority": "low", "firstResponseMin": 60, "resolutionMin": 300},
            {"priority": "medium", "firstResponseMin": 30, "resolutionMin": 180},
            {"priority": "high", "firstResponseMin": 15, "resolutionMin": 120},
        ],
        "scheduleId": "sched2",
        "escalations": [
            {"id": "sle3", "level": 1, "afterMin": 12, "target": "first_response", "action": "notify_team", "message": "Escalated ticket awaiting response"},
            {"id": "sle4", "level": 2, "afterMin": 15, "target": "first_response", "action": "send_slack", "message": "ESCALATION UNRESPONDED — #urgent-tickets"},
        ],
        "breaches": 1, "createdDay": 15,
    },
    {
        "id": "SL-3", "name": "Email & WhatsApp", "desc": "Async channels get longer windows",
        "enabled": False, "match": [{"field": "channel", "op": "in", "value": ["email", "whatsapp"]}],
        "targets": [
            {"priority": "low", "firstResponseMin": 720, "resolutionMin": 2880},
            {"priority": "medium", "firstResponseMin": 480, "resolutionMin": 1440},
            {"priority": "high", "firstResponseMin": 120, "resolutionMin": 720},
        ],
        "scheduleId": "sched1",
        "escalations": [],
        "breaches": 0, "createdDay": 18,
    },
]


def ago_offset(amount: int, unit: str) -> datetime:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if unit == "m":
        return now - timedelta(minutes=amount)
    if unit == "h":
        return now - timedelta(hours=amount)
    if unit == "d":
        return now - timedelta(days=amount)
    return now


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def customer_id(email: str) -> str:
    return "c-" + hashlib.md5(email.lower().encode("utf-8")).hexdigest()[:10]


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        if db.query(Tenant).count() > 0:
            print("Database already seeded (tenants exist). Use --reset to reseed.")
            return

        password_hash = hash_password(DEMO_PASSWORD)

        plans = {}
        for p in PLAN_DATA:
            plan = Plan(code=p["code"], name=p["name"], price_mo=p["price"], max_agents=p["agents"],
                        max_customers=p["customers"], kb_quota_mb=p["kb"], tag=p["tag"])
            db.add(plan)
            plans[p["code"]] = plan
        db.flush()

        tenants = {}
        for t in TENANT_DATA:
            tenant = Tenant(
                id=t["id"], business_name=t["name"], slug=t["slug"], email=t["email"],
                status=t["status"], plan_code=t["plan"],
                bot_name=t.get("botName", "AI Assistant"), brand_tone=t.get("tone", "professional"),
                primary_color=t.get("color", "#00a86b"), secondary_color=t.get("secondaryColor", "#2563eb"),
                welcome_message=t.get("welcomeMessage", "Hi there! How can we help you today?"),
                widget_launcher_text=t.get("launcherText", "Chat with us"),
                widget_position=t.get("widgetPosition", "bottom-right"),
                proactive_teaser=t.get("proactiveTeaser", ""),
                mobile_fullscreen=t.get("mobileFullscreen", True),
                escalation_message=t.get("escalationMessage", "You're now chatting with a human agent."),
                city=t.get("city", "Lagos"),
            )
            if t["status"] == "active":
                tenant.onboarded_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=60)
            if t["status"] == "suspended":
                tenant.suspended_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
            db.add(tenant)
            tenants[t["id"]] = tenant
        db.flush()

        # super admin (platform-wide, no tenant)
        db.add(User(email="admin@prestige.io", password_hash=password_hash, full_name="Platform Admin",
                    role=Role.SUPER_ADMIN, tenant_id=None))
        for a in AGENT_DATA:
            db.add(User(id=a["id"], tenant_id=a["tenant"], email=a["email"], password_hash=password_hash,
                        full_name=a["name"], role=a["role"], color=a["color"]))
        # demo customer (login-page "customer" role + portal sign-in)
        db.add(User(tenant_id="t1", email="tunde.bakare@example.com", password_hash=password_hash,
                    full_name="Tunde Bakare", role=Role.CUSTOMER, color="slate"))
        db.flush()

        # team memberships: every owner/agent belongs to their tenant through a
        # tenant_members row (the authoritative multi-tenant membership table).
        for a in AGENT_DATA:
            db.add(TenantMember(
                tenant_id=a["tenant"], user_id=a["id"],
                role=a["role"], status="active", inbox_scope="all",
            ))
        db.flush()

        # subscriptions + quota synced to dataset tenant stats
        quota_by_tenant = {"t1": (3, 1842, 320), "t2": (1, 631, 88), "t3": (0, 0, 0), "t4": (1, 98, 41), "t5": (4, 2105, 402)}
        for tid, (agents, customers, kb_mb) in quota_by_tenant.items():
            tenant = tenants[tid]
            tenant.max_agents = agents
            tenant.max_customers = max(customers, 1)
            tenant.kb_used_mb = kb_mb
            db.add(Subscription(tenant_id=tid, plan_id=plans[tenant.plan_code].id, status="active"))

        # customers (from tickets + portal demo emails)
        customers_by_email = {}
        for t in TICKET_DATA:
            email = t["email"]
            if email not in customers_by_email:
                c = Customer(id=customer_id(email), tenant_id=t.get("tenant", "t1"),
                             email=email, phone_number=t["phone"], full_name=t["cust"])
                db.add(c)
                customers_by_email[email] = c
        for pt in PAST_TICKETS:
            email = pt["email"]
            if email not in customers_by_email:
                c = Customer(id=customer_id(email), tenant_id="t1", email=email,
                             full_name=email.split("@")[0].title())
                db.add(c)
                customers_by_email[email] = c
        # portal demo user (exists across pastTickets but never in tickets table)
        if "adaeze@example.com" not in customers_by_email:
            db.add(Customer(id=customer_id("adaeze@example.com"), tenant_id="t1",
                            email="adaeze@example.com", full_name="Adaeze Eze"))
        if "segun@yahoo.com" not in customers_by_email:
            db.add(Customer(id=customer_id("segun@yahoo.com"), tenant_id="t1",
                            email="segun@yahoo.com", full_name="Segun Ade"))
        db.flush()

        # tickets + messages
        ASSIST = {
            "TK-1042": ("E2 High-frustration + E3 Money/legal threat",
                        "Customer debited N25,000 with no transaction alert (second occurrence this month). Refund review initiated, chargeback note added. SLA: call-back within 30 min."),
            "TK-1041": ("E3 Money/legal + E8 Negative sentiment",
                        "Customer's N120,000 transfer showed 'Processing' for 3h though it had settled. Receipt shared, sender-side status lag explained."),
            "TK-1037": ("E4 Refund demand",
                        "Duplicate debit for a failed PHCN bill payment. Refund request awaiting approval. Requires owner sign-off per policy."),
            "TK-1033": ("E8 Negative sentiment · card dispute",
                        "Card declined at POS yet N8,000 pre-authorization held. Auto-release in 48h expected; verifying merchant hold."),
        }
        ticket_objs = {}
        for t in TICKET_DATA:
            created = ago_offset(t["ago"], t["unit"])
            tenant_id = t.get("tenant", "t1")
            customer = customers_by_email.get(t["email"])
            status = t["status"]
            resolved_at = None
            if status in ("resolved", "closed"):
                resolved_at = created + timedelta(minutes=30)
            ai_reason, ai_summary = ASSIST.get(t["id"], (None, None))
            ticket = Ticket(
                id=t["id"], tenant_id=tenant_id,
                customer_id=customer.id if customer else None,
                assignee_id=t.get("assignee"),
                subject=t["subject"], channel=t["channel"], status=status,
                priority=t["priority"], ticket_type=t["type"].upper(),
                sentiment=t["sentiment"], unread=t.get("unread", True),
                sla_seconds_left=None if t.get("sla") in (None, "overdue") else 3600,
                resolved_at=resolved_at, created_at=created,
                ai_summary=ai_summary, ai_sentiment=ai_reason,
            )
            db.add(ticket)
            ticket_objs[t["id"]] = ticket
            for i, (sender, body, sender_id, ago_min) in enumerate(t["msgs"]):
                db.add(Message(
                    ticket_id=t["id"], sender_id=sender_id, sender_type=sender.upper(),
                    sender_name="Customer" if sender == "customer" else body.split(" ")[0] if sender_id else "AI Assistant",
                    body=body, is_bot=(sender == "ai_bot"), is_read=False,
                    timestamp=created + timedelta(minutes=ago_min),
                ))
        for pt in PAST_TICKETS:
            created = ago_offset(8 + int(pt["id"].split("-")[1]) % 20, "d")
            customer = customers_by_email.get(pt["email"])
            db.add(Ticket(
                id=pt["id"], tenant_id="t1", customer_id=customer.id if customer else None,
                assignee_id="u2", subject=pt["subject"], channel="chat", status="resolved",
                priority="low", ticket_type="REQUEST", sentiment="Neutral", unread=False,
                sla_seconds_left=None, resolved_at=created + timedelta(hours=1),
                created_at=created,
            ))
        db.flush()

        # assign display numbers ({prefix}{YYYYMMDD}{6 digits}) to seeded tickets
        used_numbers: set[str] = set()
        for ticket in db.query(Ticket).filter(Ticket.display_number.is_(None)).all():
            used_numbers.add(ensure_ticket_number(db, ticket, used_numbers))
        db.flush()

        # label library + ticket labels (per tenant, Chatwoot-style)
        label_by_name = {}
        for name, color in SEED_LABELS.items():
            for tenant_id in ("t1", "t2", "t3", "t4", "t5"):
                label = Label(id=f"LB-{tenant_id}-{name}", tenant_id=tenant_id,
                              name=name, color=color)
                db.add(label)
                label_by_name[(tenant_id, name)] = label
        db.flush()
        for ticket_id, names in TICKET_LABELS.items():
            ticket = ticket_objs.get(ticket_id)
            if ticket:
                ticket.labels = [label_by_name[(ticket.tenant_id, n)] for n in names
                                 if (ticket.tenant_id, n) in label_by_name]
        db.flush()

        for a in ARTICLE_DATA:
            db.add(KbArticle(id=a["id"], tenant_id=a["tenantId"], title=a["title"], content=a["body"],
                             category=a.get("cat", "General"), status=a.get("status", "published")))
        for c in CANNED_DATA:
            db.add(CannedResponse(id=c["id"], tenant_id="t1", title=c["label"], body=c["text"]))
        for i, r in enumerate(RULE_DATA):
            db.add(EscalationRule(
                id=r["id"], tenant_id="t1", name=r["name"], desc=r.get("desc", ""),
                condition_field=r["cond"], condition_value=r["action"], action=r["action"],
                target_role="agent",                 delay_minutes=0, terms=json.dumps(r["terms"]),
                is_active=r.get("enabled", True),
                preset=r.get("preset", r["id"].startswith("E")),
                trigger_count=r.get("triggers", 0),
                last_fired_ticket_id=r.get("lastFired"),
            ))
        from app.services import vector_store
        for k in KB_SOURCE_DATA:
            source = KnowledgeSource(
                id=k["id"], tenant_id=k["tenant"], source_type=k["type"].upper(),
                source_name=k["title"], title=k["title"], url=k.get("url"),
                size_kb=k.get("size", 0), text=k.get("text"), chunk_count=0,
                status=k["status"],
                vector_collection_id=vector_store.collection_name(k["tenant"]),
                created_at=ago_offset(k["ago"], k["unit"]),
            )
            db.add(source)
            db.flush()
            # Real chunking + embedding: stored text is split, embedded into the
            # tenant Chroma collection and chunk_count reflects actual chunks
            # (not a hard-coded number).
            if source.text:
                try:
                    from app.services.ingestion import embed_source
                    embed_source(db, source)
                except Exception:
                    print(f"  ! could not embed KB source {k['id']} ({k['title']})")
        # invite token for Yusuf (u4) so /accept-invite?token=invite-7x1k works
        db.add(Invite(tenant_id="t1", email="yusuf@nairawave.ng", role=InviteRole.AGENT,
                      token="invite-7x1k", expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7)))
        # notifications for Amaka (u2)
        db.add(Notification(tenant_id="t1", user_id="u2", type=NotificationType.ESCALATION,
                            title="Escalation assigned to you — TK-1042",
                            body="Priority HIGH · routed from AI", ticket_id="TK-1042",
                            created_at=ago_offset(2, "m")))
        db.add(Notification(tenant_id="t1", user_id="u2", type=NotificationType.TICKET_ASSIGNED,
                            title="TK-1030 resolved by Amaka", body="CSAT pending",
                            created_at=ago_offset(60, "m")))
        # invoices + audit trail for the super-admin / billing screens
        for i, inv in enumerate([
            ("INV-0021", "Jul 28 – Aug 28", 45000, "paid", "Visa ···· 4821"),
            ("INV-0020", "Jun 28 – Jul 28", 45000, "paid", "Visa ···· 4821"),
            ("INV-0019", "May 28 – Jun 28", 45000, "paid", "Visa ···· 4821"),
            ("INV-0018", "Apr 28 – May 28", 0, "waived", "Starter promo"),
        ]):
            db.add(Invoice(id=inv[0], tenant_id="t1", period=inv[1], amount=inv[2], status=inv[3],
                           method=inv[4], issued_at=ago_offset(4 * i, "d")))
        for ev in [
            ("impersonate_start", "NairaWave", "30-min scoped token · audited"),
            ("suspend_tenant", "SolarHub Nigeria", "quota overage × 3 days"),
            ("change_plan", "NairaWave", "starter → pro"),
            ("invite_agent", "NairaWave", "yusuf@nairawave.ng invited"),
        ]:
            db.add(AuditLog(tenant_id="t1", user_id="u1", action=ev[0], entity_type="tenant",
                            entity_id="t1", detail=ev[1]))

        # ---- Phase 7: owner settings hub + super-admin platform data ----
        for wh in [
            ("wh1", "Slack #tickets", "https://hooks.slack.com/services/T0/BD/slack-secret",
             ["ticket.created", "ticket.escalated", "ticket.resolved"], True, 5),
            ("wh2", "CRM sync (HubSpot)", "https://api.hubspot.com/crm/v3/objects/tickets",
             ["ticket.created"], True, 12),
            ("wh3", "BI export (Metabase)", "https://analytics.example.com/webhook/tickets",
             ["ticket.resolved"], False, 30),
        ]:
            db.add(WebhookEndpoint(id=wh[0], tenant_id="t1", name=wh[1], url=wh[2],
                                   secret="sk_" + wh[0] + "dd2f", events=json.dumps(wh[3]),
                                   is_active=wh[4], created_at=ago_offset(wh[5], "d")))
        db.flush()
        for wd in [
            ("wd1", "wh1", "ticket.escalated", "success", 200, 142, 2),
            ("wd2", "wh2", "ticket.created", "success", 201, 208, 18),
            ("wd3", "wh1", "ticket.created", "success", 200, 131, 60),
            ("wd4", "wh3", "ticket.resolved", "failed", None, 4021, 300),
            ("wd5", "wh2", "ticket.escalated", "retrying", None, 890, 360),
        ]:
            db.add(WebhookDelivery(id=wd[0], endpoint_id=wd[1], event=wd[2], status=wd[3],
                                   http_status=wd[4], duration_ms=wd[5],
                                   created_at=ago_offset(wd[6], "m")))

        for ak in [
            ("ak1", "Production", "pre_ab12f6c9", ["tickets:read", "tickets:write"], 2),
            ("ak2", "Staging", "pre_91cdde0a", ["tickets:read"], 60),
            ("ak3", "Analytics export", "pre_33fa80b2", ["tickets:read", "reports:read"], 180),
        ]:
            db.add(ApiKey(id=ak[0], tenant_id="t1", name=ak[1], prefix=ak[2],
                          key_hash="x", scopes=json.dumps(ak[3]),
                          created_at=ago_offset(ak[4], "d")))

        for ch in [
            ("chat", "Website chat", True, True, "Embeddable widget on your site", None, "nairawave.ng/#chat"),
            ("whatsapp", "WhatsApp", True, False, "Meta Business API", "+234 800 000 1002", None),
            ("portal", "Support portal", True, True, "Self-serve help center + tickets", None, "help.nairawave.ng"),
            ("email", "Email", False, False, "Forward to a shared inbox", None, "support@nairawave.ng"),
            ("telegram", "Telegram", False, False, "Telegram Bot API", None, "@NairaWaveSupportBot"),
            ("sms", "SMS", False, False, "Twilio Programmable SMS", "+234 800 000 1003", None),
        ]:
            db.add(ChannelSetting(tenant_id="t1", channel=ch[0], label=ch[1], enabled=ch[2],
                                  connected=ch[3], detail=ch[4], phone=ch[5], address=ch[6],
                                  provider_status="connected" if ch[3] else "disconnected"))

        db.add(NotificationPreference(user_id="u1",
            email=json.dumps({"escalation": True, "assigned": True, "replies": True,
                              "weekly": True, "billing": True, "product": False}),
            push=json.dumps({"escalation": True, "assigned": True, "replies": True, "mentions": True}),
            quiet_hours=json.dumps({"enabled": False, "start": "21:00", "end": "07:00"})))
        db.add(NotificationPreference(user_id="u2",
            email=json.dumps({"escalation": True, "assigned": True, "replies": True,
                              "weekly": False, "billing": True, "product": False}),
            push=json.dumps({"escalation": True, "assigned": True, "replies": False, "mentions": True}),
            quiet_hours=json.dumps({"enabled": True, "start": "22:00", "end": "06:00"})))

        for pv in [
            ("pv1", "v1.2", "Refund & money-threat hardening", 12,
             [{"id": "E1", "name": "Direct human request", "cond": "customer_request", "terms": ["human", "agent", "manager"]},
              {"id": "E3", "name": "Money / legal threat", "cond": "keywords", "terms": ["stole my money", "efcc", "police"]}]),
            ("pv2", "v1.1", "PII & security expansion", 19,
             [{"id": "E1", "name": "Direct human request", "cond": "customer_request", "terms": ["human", "agent", "manager"]},
              {"id": "E9", "name": "Security-sensitive content", "cond": "pii_security", "terms": ["card number", "otp", "password"]}]),
        ]:
            db.add(PresetVersion(id=pv[0], version=pv[1], label=pv[2], created_by="Glory Super",
                                 note=None, rules=json.dumps(pv[4]),
                                 created_at=ago_offset(pv[3], "d")))

        for ff in [
            ("ff_widget_proactive", "Proactive widget teaser", "Show the teaser bubble before the customer opens chat", True, "platform"),
            ("ff_voice_handoff", "Voice handoff", "Escalations can offer a phone call-back", False, "platform"),
            ("ff_automations", "Automations engine", "Trigger/condition/action workflow rules", True, "platform"),
            ("ff_sla_policies", "SLA policies", "Per-priority targets with business hours", True, "platform"),
            ("ff_import_zendesk", "Zendesk importer", "Migrate rules + KB from a Zendesk export", False, "platform"),
            ("ff_email_channel", "Email channel", "Per-tenant email inbox integration", True, "tenant"),
        ]:
            db.add(FeatureFlag(key=ff[0], label=ff[1], desc=ff[2], enabled=ff[3], scope=ff[4]))

        for at in AUTOMATION_DATA:
            db.add(AutomationRule(
                id=at["id"], tenant_id="t1", name=at["name"], desc=at.get("desc", ""),
                is_active=at["enabled"], trigger=at["trigger"], condition_match=at["conditionMatch"],
                conditions=json.dumps(at["conditions"]), actions=json.dumps(at["actions"]),
                interval=json.dumps(at["interval"]) if at.get("interval") else "null",
                order=at["order"], run_count=at["runCount"],
                last_run_at=ago_offset(at.get("lastRunMin", 12), "m"),
                created_at=ago_offset(at.get("createdDay", 18), "d"),
            ))
        for al in [
            ("Escalation alert to Slack", "send_slack → #urgent-tickets", "TK-1042", "success", 2),
            ("High-priority to best agent", "assign_agent → Amaka Okafor", "TK-1041", "success", 18),
            ("Negative sentiment → owner", "send_email → owner@nairawave.ng", "TK-1033", "success", 240),
            ("Unassigned for 4h", "escalate — unassigned past 4h", "TK-1039", "skipped", 300),
            ("Escalation alert to Slack", "send_slack → #urgent-tickets", "TK-1037", "error", 360),
        ]:
            db.add(Notification(tenant_id="t1", user_id=None, type=NotificationType.SYSTEM,
                                title=f"{al[0]} · {al[3]}", body=al[1], ticket_id=al[2],
                                created_at=ago_offset(al[4], "m")))

        for sched in [
            ("sched1", "Weekdays 9–6", [0, 1, 2, 3, 4], "09:00", "18:00"),
            ("sched2", "24/7 critical", [0, 1, 2, 3, 4, 5, 6], "00:00", "23:59"),
        ]:
            db.add(SlaSchedule(id=sched[0], tenant_id="t1", name=sched[1], days=json.dumps(sched[2]),
                               start=sched[3], end=sched[4]))
        for sl in SLA_DATA:
            db.add(SlaPolicy(
                id=sl["id"], tenant_id="t1", name=sl["name"], desc=sl.get("desc", ""),
                is_active=sl["enabled"], match=json.dumps(sl["match"]),
                targets=json.dumps(sl["targets"]), schedule_id=sl.get("scheduleId"),
                escalations=json.dumps(sl["escalations"]), breaches=sl.get("breaches", 0),
                created_at=ago_offset(sl.get("createdDay", 12), "d")))

        db.commit()

        # P4 routing teams (same idempotent backfill that runs on app start)
        _ensure_teams()

        # embed seeded KB articles into the per-tenant vector store (Phase 5 RAG)
        try:
            from app.services import vector_store

            for a in db.query(KbArticle).all():
                chunks = [a.content] if a.content else []
                if chunks:
                    vector_store.add_docs(
                        a.tenant_id,
                        [f"art:{a.id}:0"],
                        chunks,
                        [{"source_id": f"article-{a.id}", "title": a.title,
                          "source_type": "article", "url": "", "chunk": 0}],
                    )
        except Exception:
            pass

        print(f"Seeded: {db.query(Tenant).count()} tenants, {db.query(User).count()} users, "
              f"{db.query(Ticket).count()} tickets, {db.query(KbArticle).count()} articles, "
              f"{db.query(EscalationRule).count()} rules.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    if "--reset" in sys.argv:
        Base.metadata.drop_all(bind=engine)
        print("Dropped all tables.")
    seed()
