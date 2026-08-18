"""Production Gunicorn config.

Usage:
  gunicorn app.main:app -c gunicorn.conf.py

Or with custom worker count:
  gunicorn app.main:app -c gunicorn.conf.py -w 8

Worker sizing for scale:
  5M customers  → 4-8 workers, 4GB RAM each
  10M customers → 8-16 workers, 8GB RAM each, read replicas
  20M+ customers → horizontal scaling (multiple pods/instances)

Worker class:
  uvicorn.workers.UvicornWorker is required for async/await support.
"""

from __future__ import annotations

import json
import os
import sys
import time

# ── Server socket ───────────────────────────────────────────────────

bind = os.getenv("BIND", "0.0.0.0:8000")
backlog = int(os.getenv("BACKLOG", "2048"))

# ── Workers ─────────────────────────────────────────────────────────

# Rule of thumb: 2 × CPU cores + 1 for async apps.
# For I/O-bound apps (like this one), more workers are fine.
workers = int(os.getenv("WORKERS", "4"))
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = int(os.getenv("WORKER_CONNECTIONS", "1000"))
timeout = int(os.getenv("TIMEOUT", "30"))
keepalive = int(os.getenv("KEEPALIVE", "5"))
graceful_timeout = int(os.getenv("GRACEFUL_TIMEOUT", "30"))

# ── Memory management ──────────────────────────────────────────────

# Restart workers after this many requests to prevent memory leaks.
max_requests = int(os.getenv("MAX_REQUESTS", "2000"))
max_requests_jitter = int(os.getenv("MAX_REQUESTS_JITTER", "200"))

# ── Logging ─────────────────────────────────────────────────────────

loglevel = os.getenv("LOG_LEVEL", "info")
accesslog = os.getenv("ACCESS_LOG", "-")
errorlog = os.getenv("ERROR_LOG", "-")
access_log_format = json.dumps({
    "timestamp": "%(t)s",
    "remote_addr": "%(h)s",
    "method": "%(m)s",
    "path": "%(U)s",
    "query": "%(q)s",
    "status": "%(s)s",
    "response_length": "%(B)s",
    "response_time": "%(D)s",
    "referer": "%(f)s",
    "user_agent": "%(a)s",
})

# ── Process naming ──────────────────────────────────────────────────

proc_name = "prestige"

# ── Server hooks ────────────────────────────────────────────────────

def on_starting(server):
    """Called just before the master process is initialized."""
    server.log.info("Prestige server starting (workers=%s, bind=%s)",
                     workers, bind)


def post_fork(server, worker):
    """Called just after a worker has been forked."""
    server.log.info("Worker spawned (pid=%s)", worker.pid)


def pre_exec(server):
    """Called just before a new master process is forked."""
    server.log.info("Forked child, re-executing.")


def worker_int(worker):
    """Called when a worker receives the INT or QUIT signal."""
    worker.log.info("Worker received INT/QUIT signal (pid=%s)", worker.pid)


def worker_abort(worker):
    """Called when a worker receives the SIGABRT signal (timeout)."""
    worker.log.warning("Worker timed out (pid=%s)", worker.pid)


def post_worker_init(worker):
    """Called just after a worker has been initialized.

    Used to set up the task worker thread in each worker process.
    """
    pass


# ── Preloaded app ───────────────────────────────────────────────────

preload_app = os.getenv("PRELOAD_APP", "false").lower() == "true"
