"""Health check system.

Provides /health and /ready endpoints for container orchestration
(Kubernetes, ECS, Cloud Run) and load balancer health checks.

Endpoints:
  GET /health        Liveness — is the process alive?
  GET /ready         Readiness — can it accept traffic?
  GET /health/deep   Deep check — all dependencies reachable?

Response codes:
  200 = healthy
  503 = unhealthy (one or more checks failed)

Env vars:
  HEALTH_CHECK_SECRET  Optional secret to protect deep checks (default: none)
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse

logger = logging.getLogger("prestige.health")

router = APIRouter(tags=["health"])

# ── Check functions ─────────────────────────────────────────────────

def _check_database() -> dict:
    """Verify database connectivity."""
    start = time.monotonic()
    try:
        from app.database import engine
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        ms = (time.monotonic() - start) * 1000
        return {"status": "ok", "ms": round(ms, 1)}
    except Exception as e:
        ms = (time.monotonic() - start) * 1000
        return {"status": "error", "error": str(e), "ms": round(ms, 1)}


def _check_redis() -> dict:
    """Verify Redis connectivity."""
    start = time.monotonic()
    try:
        from app.core.redis import get_redis
        r = get_redis()
        if r is None:
            return {"status": "skipped", "reason": "not configured"}
        r.ping()
        ms = (time.monotonic() - start) * 1000
        return {"status": "ok", "ms": round(ms, 1)}
    except Exception as e:
        ms = (time.monotonic() - start) * 1000
        return {"status": "error", "error": str(e), "ms": round(ms, 1)}


def _check_vector_store() -> dict:
    """Verify vector store connectivity."""
    start = time.monotonic()
    try:
        from app.infra.vector_store import get_vector_store
        vs = get_vector_store()
        ok = vs.health()
        ms = (time.monotonic() - start) * 1000
        return {"status": "ok" if ok else "error", "ms": round(ms, 1)}
    except Exception as e:
        ms = (time.monotonic() - start) * 1000
        return {"status": "error", "error": str(e), "ms": round(ms, 1)}


def _check_task_queue() -> dict:
    """Check task queue depth."""
    try:
        from app.infra.tasks import queue_stats
        stats = queue_stats()
        pending = stats.get("pending", 0)
        if pending > 1000:
            return {"status": "warning", "pending": pending, "reason": "queue depth high"}
        return {"status": "ok", "pending": pending}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def _check_memory() -> dict:
    """Check process memory usage."""
    try:
        import os
        pid = os.getpid()
        # On Linux, read /proc/self/status
        with open(f"/proc/{pid}/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    rss_kb = int(line.split()[1])
                    rss_mb = rss_kb / 1024
                    if rss_mb > 1024:
                        return {"status": "warning", "rss_mb": round(rss_mb, 1),
                                "reason": "high memory usage"}
                    return {"status": "ok", "rss_mb": round(rss_mb, 1)}
        return {"status": "ok"}
    except (FileNotFoundError, ValueError):
        return {"status": "skipped", "reason": "not on Linux"}


# ── Endpoints ───────────────────────────────────────────────────────

@router.get("/health")
async def liveness() -> JSONResponse:
    """Liveness probe — is the process alive?"""
    return JSONResponse({"status": "ok"}, status_code=200)


@router.get("/ready")
async def readiness() -> JSONResponse:
    """Readiness probe — can it accept traffic?

    Checks only the database (most critical). If the DB is down,
    no requests can be served.
    """
    db = _check_database()
    if db["status"] == "error":
        return JSONResponse(
            {"status": "not_ready", "checks": {"database": db}},
            status_code=503,
        )
    return JSONResponse({"status": "ready"}, status_code=200)


@router.get("/health/deep")
async def deep_health(x_health_secret: str | None = Header(None)) -> JSONResponse:
    """Deep health check — all dependencies.

    Optionally protected by HEALTH_CHECK_SECRET env var.
    """
    import os
    expected_secret = os.getenv("HEALTH_CHECK_SECRET", "")
    if expected_secret and x_health_secret != expected_secret:
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    checks = {
        "database": _check_database(),
        "redis": _check_redis(),
        "vector_store": _check_vector_store(),
        "task_queue": _check_task_queue(),
        "memory": _check_memory(),
    }

    all_ok = all(c["status"] in ("ok", "skipped") for c in checks.values())
    has_warnings = any(c["status"] == "warning" for c in checks.values())

    status = "healthy" if all_ok else "unhealthy"
    if has_warnings and all_ok:
        status = "degraded"

    code = 200 if all_ok else 503
    return JSONResponse({"status": status, "checks": checks}, status_code=code)
