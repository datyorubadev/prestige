"""Provider registry — resolves a channel key to its provider implementation."""

from app.services.channels import email, simulator, telegram, twilio, whatsapp

_PROVIDERS = {
    provider.key: provider
    for provider in (
        whatsapp.PROVIDER,
        telegram.PROVIDER,
        twilio.PROVIDER,
        email.PROVIDER,
        simulator.PROVIDER,
    )
}

# Channels that can actually send out through a provider. `chat`/`portal` are
# handled by the in-app widget + portal and are never dispatched.
EXTERNAL_CHANNELS = {"whatsapp", "telegram", "sms", "email"}
# Channels that have no external credentials (widget / portal toggles).
BUILTIN_CHANNELS = {"chat", "portal"}


def get_provider(channel: str):
    return _PROVIDERS.get(channel) or simulator.PROVIDER


def mask_config(config: dict) -> dict:
    """Return a config preview with secret values blanked (never sent to UI)."""
    return {
        k: ("••••••••" if v and any(secret in k.lower() for secret in ("token", "pass", "secret", "key", "sid"))
            else v)
        for k, v in config.items()
    }
