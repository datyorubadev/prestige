"""Seed the PostgreSQL database with the initial super admin and a demo tenant.

Run once after the first migration:
    python seed_db.py
"""
import sys
import os
import uuid

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, SessionLocal, _is_sqlite
from app.models import Tenant, User, TenantMember, ChannelSetting
from app.models.common import Role, TenantStatus
from app.models.tenant import utcnow
from app.core.security import hash_password


def seed():
    db = SessionLocal()
    try:
        # Skip if already seeded
        if db.query(User).first():
            print("Database already has users — skipping seed.")
            return

        # 1. Create super admin
        super_admin = User(
            id="u_superadmin",
            tenant_id=None,
            email=settings.super_admin_email,
            password_hash=hash_password(os.getenv("SUPER_ADMIN_PASSWORD", "change-me-now")),
            full_name="Platform Admin",
            role=Role.SUPER_ADMIN,
            is_active=True,
        )
        db.add(super_admin)
        print(f"Created super admin: {super_admin.email}")

        # 2. Create demo tenant
        tenant = Tenant(
            id="t1",
            business_name="NairaWave",
            slug="nairawave",
            email="info@nairawave.ng",
            status=TenantStatus.ACTIVE,
            primary_color="#00a86b",
            secondary_color="#059669",
        )
        db.add(tenant)
        db.flush()
        tenant.ai_enabled = True
        tenant.ai_tokens_used = 0
        tenant.ai_tokens_limit = 1_000_000
        print(f"Created tenant: {tenant.business_name} ({tenant.id})")

        # 3. Create tenant owner
        owner = User(
            id="u_owner",
            tenant_id=tenant.id,
            email="amaeka@nairawave.ng",
            password_hash=hash_password("password123"),
            full_name="Amaka Eka",
            role=Role.OWNER,
            is_active=True,
        )
        db.add(owner)
        db.flush()
        print(f"Created owner: {owner.email}")

        # 4. Create tenant members
        agents = [
            ("u_agent1", "Chidi Okoro", "chidi@nairawave.ng", Role.AGENT),
            ("u_agent2", "Blessing Nwosu", "blessing@nairawave.ng", Role.AGENT),
        ]
        for uid, name, email, role in agents:
            u = User(id=uid, tenant_id=tenant.id, email=email,
                     password_hash=hash_password("password123"),
                     full_name=name, role=role, is_active=True)
            db.add(u)
            db.add(TenantMember(tenant_id=tenant.id, user_id=uid, role=role, status="active"))

        # Owner membership
        db.add(TenantMember(tenant_id=tenant.id, user_id=owner.id, role=Role.OWNER, status="active"))
        print("Created agents and memberships")

        # 5. Default channels
        channels = [
            ("chat", "Website chat", "Embeddable widget on your site"),
            ("whatsapp", "WhatsApp", "Meta Business API"),
            ("portal", "Support portal", "Self-serve help center + tickets"),
            ("email", "Email", "Forward to a shared inbox"),
            ("telegram", "Telegram", "Telegram Bot API"),
            ("sms", "SMS", "Twilio Programmable SMS"),
        ]
        for key, label, detail in channels:
            db.add(ChannelSetting(
                tenant_id=tenant.id, channel=key, label=label,
                enabled=True, connected=False, detail=detail,
                provider_status="disconnected",
            ))
        print("Created default channels")

        db.commit()
        print("\nSeed complete!")
        print(f"  Super Admin: {settings.super_admin_email} / {os.getenv('SUPER_ADMIN_PASSWORD', 'change-me-now')}")
        print(f"  Owner: amaeka@nairawave.ng / password123")
        print(f"  Tenant: {tenant.business_name} ({tenant.slug})")

    except Exception as e:
        db.rollback()
        print(f"Seed FAILED: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
