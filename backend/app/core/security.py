import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.config import settings
from app.core.errors import InvalidCredentials


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _encode(payload: dict[str, Any], expires_delta: timedelta) -> str:
    payload = dict(payload)
    payload["iat"] = _now()
    payload["exp"] = _now() + expires_delta
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(user_id: str, role: str, tenant_id: str | None,
                        impersonation: bool = False) -> str:
    ttl = timedelta(minutes=settings.impersonation_expire_minutes if impersonation
                    else settings.access_token_expire_minutes)
    return _encode(
        {"sub": user_id, "role": role, "tenant_id": tenant_id, "type": "access",
         "imp": impersonation, "jti": str(uuid.uuid4())},
        ttl,
    )


def create_refresh_token(user_id: str) -> str:
    return _encode(
        {"sub": user_id, "type": "refresh", "jti": str(uuid.uuid4())},
        timedelta(days=settings.refresh_token_expire_days),
    )


def refresh_token_expiry() -> datetime:
    return _now().replace(tzinfo=None) + timedelta(days=settings.refresh_token_expire_days)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.ExpiredSignatureError:
        raise InvalidCredentials("Session expired — please sign in again")
    except jwt.InvalidTokenError:
        raise InvalidCredentials("Invalid token")


def get_token_payload(token: str) -> dict[str, Any]:
    """Decode without raising for optional-token contexts (e.g. public widget)."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.PyJWTError:
        return {}
