"""Webhook delivery logs.

The canonical model lives in `app.models.webhook` (its schema matches the
`webhook_deliveries` table and every consumer in the API/serializer layer).
This module exists so `app.services.webhooks.outbound` can keep importing
`WebhookDelivery` from here without re-registering the table.
"""

from app.models.webhook import WebhookDelivery

__all__ = ["WebhookDelivery"]
