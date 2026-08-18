"""Mocked Nigerian-service tools (guide §5.6). All read-only, all deterministic
mock data. The LangGraph agent binds these to the LLM so the model *chooses*
when to call them; a keyword fallback runs when GROQ_API_KEY is absent.

Each tool returns a JSON string so the output can be fed straight back to the
model as a tool message.
"""

import json

from langchain_core.tools import tool

# ---------------------------------------------------------------------------
# Mock datasets (deterministic; keyed by the sample inputs from guide §5.6)
# ---------------------------------------------------------------------------

MOCK_LEDGER = {
    "0123456789": {
        "account_number": "0123456789", "account_name": "Bisi Adewale",
        "status": "settled", "amount": "NGN 25,000", "direction": "inbound",
        "reference": "NW-88412", "settled_at": "2026-08-08 14:32:11",
        "trace": "Credited to account, posted and confirmed by NIBSS.",
    },
}

MOCK_TRANSFER_SESSIONS = {
    "20260728123456789012345678901234567890": {
        "session_id": "20260728123456789012345678901234567890",
        "status": "processing", "amount": "NGN 120,000", "destination": "GTBank",
        "reference": "NIP-77801", "last_update": "2026-08-08 10:05:00",
        "trace": "Received by NIBSS, awaiting destination bank response.",
    },
}

MOCK_POS_ERRORS = {
    "4321": {
        "card_pan_last4": "4321", "tx_date": "2026-08-08",
        "status": "dispensed", "merchant": "Ebeano Supermarket, Lekki",
        "amount": "NGN 8,000", "resolution": "Cash dispensed; funds not re-debited.",
    },
}

MOCK_ACCOUNT_TIERS = {
    "0123456789": {
        "account_number": "0123456789", "tier": "tier_2",
        "daily_send_limit": "NGN 1,000,000", "daily_receive_limit": "NGN 5,000,000",
        "restrictions": "None", "verification_level": "BVN verified",
    },
}

MOCK_WAYBILLS = {
    "GIDI-992-ALERT": {
        "waybill_number": "GIDI-992-ALERT", "status": "in_transit",
        "route": "Lagos hub -> Ibadan depot", "eta": "2026-08-10 18:00",
        "current_location": "Ojoo sort facility, Ibadan",
        "timeline": ["Collected", "At hub", "In transit"],
    },
    "GIDI-000-000": {
        "waybill_number": "GIDI-000-000", "status": "delivered",
        "route": "Lagos hub -> Ikeja", "delivered_at": "2026-08-07 12:30",
        "recipient": "Signed for (B. Adewale)",
    },
}

MOCK_METERS = {
    "45012345678": {
        "meter_number": "45012345678", "status": "paid",
        "token": "4474-5678-1234-9012-3456", "units": "40.12 kWh",
        "amount": "NGN 15,000", "issued_at": "2026-08-08 09:00:00",
        "vendor": "IBEDC",
    },
}

MOCK_DATA_BUNDLES = {
    "08030001111": {
        "phone_number": "08030001111", "status": "reverified",
        "data_balance": "4.8 GB", "validity": "expires 2026-08-20",
        "plan": "MTN Pulse 5 GB", "note": "Bundle refreshed on the network.",
    },
}

MOCK_KYC = {
    "22233344455": {
        "id_number": "22233344455", "id_type": "nin", "status": "valid",
        "full_name": "Bisi Adewale", "date_of_birth": "1992-04-11",
        "verification": "NIN matched to bank record (BVN linked).",
    },
}


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@tool
def verify_nuban_transaction_status(account_number: str) -> str:
    """Queries the core ledger for a Nigerian 10-digit NUBAN account. Use whenever a
    customer complains about a missing transfer, failed POS debit, or settlement."""
    row = MOCK_LEDGER.get(str(account_number).strip(), {
        "account_number": account_number,
        "error": "Account not found in active transaction ledger.",
    })
    return json.dumps(row)


@tool
def check_interbank_transfer_status(session_id: str) -> str:
    """Checks the NIBSS interbank (NIP) transfer session for a 30-digit session ID.
    Use when an outbound transfer is stuck, rejected, or 'processing' too long."""
    row = MOCK_TRANSFER_SESSIONS.get(str(session_id).strip(), {
        "session_id": session_id,
        "error": "Session not found on the NIBSS rails.",
    })
    return json.dumps(row)


@tool
def resolve_atm_pos_dispense_error(card_pan_last4: str, tx_date: str) -> str:
    """Checks whether an ATM/POS cash dispense error was reconciled. Use when a
    customer says money was deducted but the ATM/POS did not dispense cash."""
    row = MOCK_POS_ERRORS.get(str(card_pan_last4).strip(), {
        "card_pan_last4": card_pan_last4, "tx_date": tx_date,
        "error": "No dispense error found for this card on this date.",
    })
    return json.dumps(row)


@tool
def verify_account_tier_and_restrictions(account_number: str) -> str:
    """Returns the account tier, daily limits, and any active restrictions for a
    NUBAN account. Use when a transfer fails or a customer asks about limits."""
    row = MOCK_ACCOUNT_TIERS.get(str(account_number).strip(), {
        "account_number": account_number,
        "error": "Account not found.",
    })
    return json.dumps(row)


@tool
def track_nigerian_waybill_status(waybill_number: str) -> str:
    """Tracks a Nigerian logistics waybill (e.g. GIDI-992-ALERT). Use when a
    customer asks where their package is or wants delivery status."""
    key = str(waybill_number).strip()
    row = MOCK_WAYBILLS.get(key, {
        "waybill_number": key,
        "error": "Waybill not found. Check the number and try again.",
    })
    return json.dumps(row)


@tool
def fetch_prepaid_electricity_token(meter_number: str) -> str:
    """Fetches the latest prepaid electricity token for a meter number. Use when a
    customer buys units or asks for a vending token/receipt."""
    row = MOCK_METERS.get(str(meter_number).strip(), {
        "meter_number": meter_number,
        "error": "Meter not found in the vending records.",
    })
    return json.dumps(row)


@tool
def re_verify_telecom_data_bundle(phone_number: str) -> str:
    """Re-verifies a telecom data bundle on a Nigerian phone number. Use when a
    customer bought data but it has not reflected on their line."""
    row = MOCK_DATA_BUNDLES.get(str(phone_number).strip(), {
        "phone_number": phone_number,
        "error": "Number not found in the bundle records.",
    })
    return json.dumps(row)


@tool
def check_government_kyc_status(id_number: str, id_type: str) -> str:
    """Checks a government KYC record (NIN/BVN) for a Nigerian ID number. Use when a
    customer asks about account verification or a failed KYC check."""
    row = MOCK_KYC.get(str(id_number).strip(), {
        "id_number": id_number, "id_type": id_type,
        "error": "ID not found in the verification registry.",
    })
    return json.dumps(row)


ALL_TOOLS = [
    verify_nuban_transaction_status,
    check_interbank_transfer_status,
    resolve_atm_pos_dispense_error,
    verify_account_tier_and_restrictions,
    track_nigerian_waybill_status,
    fetch_prepaid_electricity_token,
    re_verify_telecom_data_bundle,
    check_government_kyc_status,
]

ALL_TOOLS_BY_NAME = {t.name: t for t in ALL_TOOLS}


# ---------------------------------------------------------------------------
# Keyword fallback (deterministic) used when no LLM is configured.
# Mirrors the sample inputs from the guide so the demo is predictable.
# ---------------------------------------------------------------------------

_HEURISTIC_TRIGGERS: list[tuple[tuple[str, ...], str, dict]] = [
    (("waybill", "package", "parcel", "shipment", "delivery", "tracking", "where is my item", "gidi"), "track_nigerian_waybill_status", {"waybill_number": "GIDI-992-ALERT"}),
    (("meter", "electricity", "prepaid", "phcn", "units", "token"), "fetch_prepaid_electricity_token", {"meter_number": "45012345678"}),
    (("data bundle", "data plan", "airtime", "bundle", "mtn", "glo", "airtel", "9mobile", "data not reflecting"), "re_verify_telecom_data_bundle", {"phone_number": "08030001111"}),
    (("nin", "bvn", "kyc", "verify my account", "verification"), "check_government_kyc_status", {"id_number": "22233344455", "id_type": "nin"}),
    (("pos", "atm", "dispense", "card was declined", "machine did not dispense"), "resolve_atm_pos_dispense_error", {"card_pan_last4": "4321", "tx_date": "2026-08-08"}),
    (("transfer failed", "transfer stuck", "session id", "nibss", "interbank", "settlement"), "check_interbank_transfer_status", {"session_id": "20260728123456789012345678901234567890"}),
    (("account tier", "send limit", "daily limit", "restriction", "transaction limit"), "verify_account_tier_and_restrictions", {"account_number": "0123456789"}),
    (("nuban", "debit", "missing transfer", "failed debit", "money deducted", "account was debited"), "verify_nuban_transaction_status", {"account_number": "0123456789"}),
]


def heuristic_tool_results(query: str) -> list[str]:
    """Deterministic keyword → tool mapping for the no-LLM fallback path."""
    q = query.lower()
    for keywords, tool_name, args in _HEURISTIC_TRIGGERS:
        if any(k in q for k in keywords):
            output = ALL_TOOLS_BY_NAME[tool_name].invoke(args)
            return [f"{tool_name}: {output}"]
    return []
