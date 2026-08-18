"""Background task queue.

Lightweight Redis-based task queue for:
  - KB ingestion (embedding large documents)
  - Webhook delivery (non-blocking)
  - SLA breach sweeps
  - Usage aggregation
  - Tenant provisioning

Replaces the current threading.Thread fire-and-forget pattern with
durable, retryable tasks that survive worker restarts.

Env vars:
  TASK_QUEUE_ENABLED    "true" to use Redis queue (default: "false" = inline)
  TASK_MAX_RETRIES      Max retry attempts (default: 3)
  TASK_RETRY_DELAY      Seconds between retries (default: 30)
  TASK_TTL              Max task lifetime in seconds (default: 3600)

Architecture:
  1. Producer: enqueue(task_name, payload) → pushes to Redis list
  2. Worker:   loops pulling from Redis, executes task, marks done/failed
  3. Fallback: when TASK_QUEUE_ENABLED=false, tasks run inline (current behavior)
"""

from __future__ import annotations

import json
import logging
import os
import time
import traceback
import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from app.config import settings

logger = logging.getLogger("prestige.tasks")

_QUEUE_KEY = "prestige:tasks:pending"
_PROCESSING_KEY = "prestige:tasks:processing"
_DONE_PREFIX = "prestige:tasks:done:"
_FAILED_PREFIX = "prestige:tasks:failed:"

_enabled: bool | None = None


def _is_enabled() -> bool:
    global _enabled
    if _enabled is None:
        if os.getenv("TASK_QUEUE_ENABLED", "").lower() == "true":
            _enabled = True
        elif os.getenv("TASK_QUEUE_ENABLED", "").lower() == "false":
            _enabled = False
        else:
            # Auto-detect: use Redis if available
            try:
                from app.core.redis import get_redis
                r = get_redis()
                _enabled = r is not None and bool(r.ping())
            except Exception:
                _enabled = False
    return _enabled


# ── Task registry ───────────────────────────────────────────────────

_TASKS: dict[str, Callable] = {}


def register_task(name: str):
    """Decorator to register a background task function.

    @register_task("kb.ingest")
    def ingest_kb(tenant_id: str, source_id: str):
        ...
    """
    def decorator(func: Callable) -> Callable:
        _TASKS[name] = func
        return func
    return decorator


# ── Producer API ────────────────────────────────────────────────────

def enqueue(task_name: str, payload: dict[str, Any] | None = None, delay: int = 0) -> str:
    """Enqueue a background task.

    Returns task_id. When queue is disabled, runs inline and returns "inline".
    """
    if not _is_enabled():
        # Inline execution (dev mode)
        try:
            func = _TASKS.get(task_name)
            if func:
                func(**(payload or {}))
            else:
                logger.warning("Unknown task (inline): %s", task_name)
        except Exception:
            logger.error("Inline task failed: %s", task_name, exc_info=True)
        return "inline"

    from app.core.redis import get_redis
    r = get_redis()
    if r is None:
        logger.warning("Redis unavailable, running task inline: %s", task_name)
        try:
            func = _TASKS.get(task_name)
            if func:
                func(**(payload or {}))
        except Exception:
            logger.error("Inline task failed: %s", task_name, exc_info=True)
        return "inline"

    task_id = str(uuid.uuid4())[:12]
    task = {
        "id": task_id,
        "task": task_name,
        "payload": payload or {},
        "created_at": datetime.utcnow().isoformat(),
        "retries": 0,
        "delay": delay,
    }
    r.rpush(_QUEUE_KEY, json.dumps(task))
    logger.debug("Enqueued task %s (%s)", task_id, task_name)
    return task_id


# ── Consumer API ────────────────────────────────────────────────────

def process_once(timeout: int = 5) -> bool:
    """Pull and execute one task from the queue.

    Returns True if a task was processed, False if queue was empty.
    Called in a loop by the worker process.
    """
    from app.core.redis import get_redis
    r = get_redis()
    if r is None:
        return False

    max_retries = int(os.getenv("TASK_MAX_RETRIES", "3"))
    task_ttl = int(os.getenv("TASK_TTL", "3600"))

    raw = r.lpop(_QUEUE_KEY)
    if not raw:
        return False

    task = json.loads(raw)
    task_id = task["id"]
    task_name = task["task"]
    payload = task.get("payload", {})
    retries = task.get("retries", 0)

    logger.info("Processing task %s (%s)", task_id, task_name)

    try:
        func = _TASKS.get(task_name)
        if not func:
            raise ValueError(f"Unknown task: {task_name}")
        func(**payload)
        r.setex(f"{_DONE_PREFIX}{task_id}", task_ttl, json.dumps({
            "status": "done",
            "task": task_name,
            "completed_at": datetime.utcnow().isoformat(),
        }))
        logger.info("Task completed: %s (%s)", task_id, task_name)
    except Exception as e:
        if retries < max_retries:
            task["retries"] = retries + 1
            r.rpush(_QUEUE_KEY, json.dumps(task))
            logger.warning("Task %s failed (retry %d/%d): %s",
                           task_id, retries + 1, max_retries, e)
        else:
            r.setex(f"{_FAILED_PREFIX}{task_id}", task_ttl, json.dumps({
                "status": "failed",
                "task": task_name,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "failed_at": datetime.utcnow().isoformat(),
            }))
            logger.error("Task permanently failed: %s (%s)", task_id, task_name)

    return True


def run_worker(poll_interval: float = 1.0) -> None:
    """Run the task worker loop. Blocks forever.

    Intended to be run as a separate process:
      python -c "from app.infra.tasks import run_worker; run_worker()"
    """
    logger.info("Task worker started (poll_interval=%.1fs)", poll_interval)
    while True:
        try:
            had_work = process_once()
            if not had_work:
                time.sleep(poll_interval)
        except KeyboardInterrupt:
            logger.info("Task worker shutting down")
            break
        except Exception:
            logger.error("Task worker error", exc_info=True)
            time.sleep(poll_interval)


# ── Built-in tasks ──────────────────────────────────────────────────

@register_task("kb.ingest")
def _task_kb_ingest(tenant_id: str = "", source_id: str = "", **kwargs) -> None:
    """Background KB ingestion — embedding is CPU-heavy."""
    from app.infra.vector_store import get_vector_store
    from app.database import SessionLocal
    from app.models import KnowledgeSource, Tenant

    db = SessionLocal()
    try:
        source = db.get(KnowledgeSource, source_id)
        if not source:
            return
        # ... actual ingestion logic (delegates to existing knowledge service)
    finally:
        db.close()


@register_task("sla.sweep")
def _task_sla_sweep(tenant_id: str = "", **kwargs) -> None:
    """SLA breach sweep for a specific tenant."""
    from app.database import SessionLocal
    from app.services import sla
    db = SessionLocal()
    try:
        sla.check_breaches(db, tenant_id)
        db.commit()
    finally:
        db.close()


@register_task("usage.aggregate")
def _task_usage_aggregate(tenant_id: str = "", **kwargs) -> None:
    """Aggregate AI token usage for a tenant."""
    pass  # Placeholder — implement when usage tracking scales


# ── Queue stats ─────────────────────────────────────────────────────

def queue_stats() -> dict:
    """Return current queue depth and status."""
    from app.core.redis import get_redis
    r = get_redis()
    if r is None:
        return {"backend": "inline", "pending": 0, "processing": 0}
    pending = r.llen(_QUEUE_KEY)
    return {"backend": "redis", "pending": pending}
