"""2FA/TOTP and SSO/OIDC endpoints.

2FA (Two-Factor Authentication):
  TOTP-based (Google Authenticator, Authy, etc.).  Users enable 2FA by
  scanning a QR code; subsequent logins require a 6-digit code.

SSO (Single Sign-On):
  OpenID Connect flow for enterprise identity providers (Google Workspace,
  Azure AD, Okta, etc.).  Users link their SSO identity once; subsequent
  logins can use the IdP instead of a password.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import secrets
import urllib.parse
from datetime import datetime, timezone

import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import Db, get_current_user
from app.config import settings
from app.core.security import create_access_token, decode_token, hash_password
from app.models import RefreshToken, User

logger = logging.getLogger("prestige.auth")

router = APIRouter(prefix="/auth", tags=["auth-2fa-sso"])


# ── 2FA / TOTP ──────────────────────────────────────────────────────


class TotpVerifyRequest(BaseModel):
    code: str  # 6-digit TOTP code


class TotpEnableRequest(BaseModel):
    code: str  # Confirm code to finalize enablement


@router.get("/2fa/status")
def totp_status(user: User = Depends(get_current_user)) -> dict:
    """Return 2FA status for the current user."""
    return {
        "enabled": bool(user.totp_enabled),
        "configured": bool(user.totp_secret),
    }


@router.post("/2fa/setup")
def totp_setup(user: User = Depends(get_current_user)) -> dict:
    """Generate a new TOTP secret and QR code for the user.

    Returns:
      - secret: the TOTP secret (for manual entry)
      - qrDataUrl: base64-encoded QR code PNG
      - otpauthUrl: the otpauth:// URI for authenticator apps
    """
    secret = pyotp.random_base32()
    user.totp_secret = secret
    user.totp_enabled = False  # Not enabled until confirmed

    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(
        name=user.email,
        issuer_name="Prestige Helpdesk",
    )

    # Generate QR code as base64 PNG
    qr = qrcode.make(otpauth_url, box_size=6, border=2)
    buf = io.BytesIO()
    qr.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        u = db.get(User, user.id)
        if u:
            u.totp_secret = secret
            db.commit()
    finally:
        db.close()

    return {
        "secret": secret,
        "qrDataUrl": f"data:image/png;base64,{qr_b64}",
        "otpauthUrl": otpauth_url,
    }


@router.post("/2fa/enable")
def totp_enable(body: TotpEnableRequest, user: User = Depends(get_current_user)) -> dict:
    """Confirm TOTP setup by verifying a code. Enables 2FA for the user."""
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="No TOTP secret configured — run /2fa/setup first")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        u = db.get(User, user.id)
        if u:
            u.totp_enabled = True
            db.commit()
    finally:
        db.close()

    logger.info("2FA enabled for user %s", user.id)
    return {"enabled": True}


@router.post("/2fa/disable")
def totp_disable(body: TotpVerifyRequest, user: User = Depends(get_current_user)) -> dict:
    """Disable 2FA after verifying current TOTP code."""
    if not user.totp_secret or not user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled")

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        u = db.get(User, user.id)
        if u:
            u.totp_enabled = False
            u.totp_secret = None
            db.commit()
    finally:
        db.close()

    logger.info("2FA disabled for user %s", user.id)
    return {"enabled": False}


@router.post("/2fa/verify")
def totp_verify(body: TotpVerifyRequest, token: str = Query(...)) -> dict:
    """Verify a TOTP code during login (after password).

    The `token` query param is a short-lived pre-auth token issued by the
    login endpoint when 2FA is enabled.  On success, returns full auth tokens.
    """
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired pre-auth token")

    if payload.get("type") != "pre_auth":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Account disabled")
        if not user.totp_secret or not user.totp_enabled:
            raise HTTPException(status_code=400, detail="2FA is not enabled on this account")

        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(body.code, valid_window=1):
            raise HTTPException(status_code=400, detail="Invalid TOTP code")

        # Issue full auth tokens
        access = create_access_token(user.id, user.role, user.tenant_id)

        # Create refresh token
        refresh_token_str = secrets.token_urlsafe(64)
        rt = RefreshToken(
            token=refresh_token_str,
            user_id=user.id,
            tenant_id=user.tenant_id,
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(rt)
        db.commit()

        return {
            "access_token": access,
            "refresh_token": refresh_token_str,
            "user": {
                "id": user.id,
                "email": user.email,
                "fullName": user.full_name,
                "role": user.role,
                "tenantId": user.tenant_id,
            },
        }
    finally:
        db.close()


# ── SSO / OpenID Connect ────────────────────────────────────────────


class SsoLoginRequest(BaseModel):
    provider: str  # "google" | "azure" | "okta" | custom
    code: str
    redirectUri: str
    state: str | None = None


class SsoConfigRequest(BaseModel):
    provider: str
    clientId: str
    clientSecret: str
    issuer: str
    redirectUri: str | None = None


# In-memory SSO provider configs (in production, store in DB per-tenant)
_sso_providers: dict[str, dict] = {}


@router.get("/sso/providers")
def sso_list_providers(user: User = Depends(get_current_user)) -> dict:
    """List configured SSO providers for the tenant."""
    providers = {}
    for name, cfg in _sso_providers.items():
        providers[name] = {
            "name": name,
            "issuer": cfg.get("issuer", ""),
            "clientId": cfg.get("clientId", ""),
            "configured": True,
        }
    return {"providers": providers}


@router.post("/sso/configure")
def sso_configure(body: SsoConfigRequest, user: User = Depends(get_current_user)) -> dict:
    """Configure an SSO provider (owner only)."""
    if user.role not in ("owner", "super_admin"):
        raise HTTPException(status_code=403, detail="Only owners can configure SSO")

    _sso_providers[body.provider] = {
        "clientId": body.clientId,
        "clientSecret": body.clientSecret,
        "issuer": body.issuer,
        "redirectUri": body.redirectUri or f"{settings.frontend_url}/auth/sso/callback",
    }
    logger.info("SSO provider %s configured by user %s", body.provider, user.id)
    return {"configured": True, "provider": body.provider}


@router.get("/sso/authorize")
def sso_authorize(provider: str = Query(...), user: User = Depends(get_current_user)) -> dict:
    """Generate the authorization URL for SSO login."""
    cfg = _sso_providers.get(provider)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"SSO provider '{provider}' not configured")

    state = secrets.token_urlsafe(32)
    redirect_uri = cfg["redirectUri"]

    # Build authorization URL (generic OIDC)
    params = urllib.parse.urlencode({
        "client_id": cfg["clientId"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
    })
    issuer = cfg["issuer"].rstrip("/")
    auth_url = f"{issuer}/authorize?{params}"

    return {"authorizationUrl": auth_url, "state": state}


@router.post("/sso/callback")
def sso_callback(body: SsoLoginRequest) -> dict:
    """Handle SSO callback — exchange code for tokens, find/create user."""
    cfg = _sso_providers.get(body.provider)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"SSO provider '{body.provider}' not configured")

    # Exchange authorization code for tokens
    import requests
    token_url = f"{cfg['issuer'].rstrip('/')}/token"
    try:
        resp = requests.post(token_url, data={
            "grant_type": "authorization_code",
            "code": body.code,
            "redirect_uri": body.redirectUri or cfg["redirectUri"],
            "client_id": cfg["clientId"],
            "client_secret": cfg["clientSecret"],
        }, timeout=15)
        resp.raise_for_status()
        token_data = resp.json()
    except Exception as exc:
        logger.error("SSO token exchange failed: %s", exc)
        raise HTTPException(status_code=502, detail="SSO token exchange failed")

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="No access token from SSO provider")

    # Fetch user info
    userinfo_url = f"{cfg['issuer'].rstrip('/')}/userinfo"
    try:
        resp = requests.get(userinfo_url, headers={
            "Authorization": f"Bearer {access_token}",
        }, timeout=15)
        resp.raise_for_status()
        userinfo = resp.json()
    except Exception as exc:
        logger.error("SSO userinfo fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not fetch user info from SSO")

    email = userinfo.get("email", "")
    if not email:
        raise HTTPException(status_code=400, detail="SSO provider did not return an email")

    sso_subject = userinfo.get("sub", "")

    # Find or create user
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link SSO identity
            user.sso_provider = body.provider
            user.sso_subject = sso_subject
        else:
            # Create new user as customer in the first active tenant
            from app.models import Tenant
            tenant = db.query(Tenant).filter(Tenant.status == "active").first()
            user = User(
                email=email,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                full_name=userinfo.get("name", email.split("@")[0]),
                role="customer",
                tenant_id=tenant.id if tenant else None,
                sso_provider=body.provider,
                sso_subject=sso_subject,
            )
            db.add(user)
        db.commit()
        db.refresh(user)

        access = create_access_token(user.id, user.role, user.tenant_id)
        return {
            "access_token": access,
            "user": {
                "id": user.id,
                "email": user.email,
                "fullName": user.full_name,
                "role": user.role,
                "tenantId": user.tenant_id,
            },
        }
    finally:
        db.close()
