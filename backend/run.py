"""Entry point.  Use ``python run.py`` for dev (single worker, auto-reload)
and ``gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w N`` for
production.  The WORKERS env var controls worker count when running via
``python run.py`` in a non-dev environment (e.g. Docker).

Scaling note for 20K concurrent users:
  - Each worker handles ~500 concurrent connections (async I/O).
  - 4 workers x 500 = 2000 concurrent, which is enough because not all
    20K users are active simultaneously -- typical ratio is 5-10% concurrent.
  - For truly 20K simultaneous connections, use 8+ workers behind a load
    balancer, or horizontal scaling with multiple pods.
"""

import os
os.environ.setdefault("PYDANTIC_DISABLE_PLUGINS", "__all__")
import uvicorn

if __name__ == "__main__":
    workers = int(os.getenv("WORKERS", "1"))
    reload = os.getenv("ENVIRONMENT", "development") != "production"
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        app_dir=".",
        workers=workers,
        reload=reload,
        log_level="info",
        timeout_keep_alive=30,
        limit_concurrency=500,  # per-worker connection limit
        reload_excludes=["*.pyc", "__pycache__", ".venv/*", "chroma_data/*"],
    )
