"""Shared pytest fixtures: fresh seeded DB + TestClient + auth helpers."""

import os

os.environ["GRAPH_CHECKPOINTER"] = "memory"
os.environ["DATABASE_URL"] = "sqlite:///./test_support_portal.db"
os.environ["CHROMA_DATA_DIR"] = "./test_chroma_data"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine, SessionLocal
from app.main import app

DEMO_PASSWORD = "password123"
ROLES = {
    "super_admin": "admin@prestige.io",
    "owner": "bisi@nairawave.ng",
    "owner2": "emeka@gidiexpress.ng",
    "agent": "amaka@nairawave.ng",
}


@pytest.fixture(scope="session")
def client():
    Base.metadata.drop_all(bind=engine)
    from scripts.db_setup import seed

    seed()
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth(client):
    def _auth(role: str) -> dict:
        email = ROLES[role]
        r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        return {"Authorization": f"Bearer {token}"}

    return _auth


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
