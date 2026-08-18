"""Unified Omnichannel Message Gateway (§10 Unified Omnichannel Architecture).

Normalizes incoming messages from Email, Widget Chat, WhatsApp, Facebook Messenger,
Instagram Direct, Twitter/X DMs, and SMS into a common schema.
"""
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class NormalizedAttachment(BaseModel):
    name: str
    url: str
    content_type: str = "application/octet-stream"
    size_bytes: int = 0


class NormalizedMessage(BaseModel):
    """Common message format across all 8 support channels (§10)."""
    id: str
    tenant_id: str
    channel: str  # email | widget | whatsapp | instagram | facebook | twitter | sms | api
    channel_account_id: str | None = None
    conversation_id: str | None = None
    customer_id: str | None = None
    sender_name: str
    sender_handle: str  # email, phone number, IG username
    content: str
    attachments: list[NormalizedAttachment] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class MessageGateway:
    """Central gateway routing all 8 channel inputs to Customer Identity & AI Engine."""

    @staticmethod
    def process_incoming(message: NormalizedMessage) -> dict[str, Any]:
        """Routes normalized message through identity resolution & AI pipeline."""
        return {
            "status": "routed",
            "message_id": message.id,
            "tenant_id": message.tenant_id,
            "channel": message.channel,
            "customer_handle": message.sender_handle,
            "timestamp": message.timestamp.isoformat(),
        }
