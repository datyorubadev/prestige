from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.errors import install_exception_handlers
from app.core.logging import setup_logging


def create_app() -> FastAPI:
    app = FastAPI(title="Prestige — Multi-Tenant AI Support Portal")

    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.1,
            send_default_pii=False,
        )

    from app.database import migrate_schema

    migrate_schema()

    # Robust CORS for development & production
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    for origin in settings.cors_origin_list:
        if origin != "*" and origin not in allowed_origins:
            allowed_origins.append(origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:[0-9]+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    setup_logging(app)
    install_exception_handlers(app)

    import os
    from fastapi.staticfiles import StaticFiles
    os.makedirs("static/uploads", exist_ok=True)
    app.mount("/static", StaticFiles(directory="static"), name="static")

    from app.api import (agents, ai, assist, attachments, auth, billing, canned, channel_webhooks, channels, crawl,
                         custom_fields, custom_tools, customers, dashboard, faqs, invoices, kb, knowledge,
                         labels, macros, notifications, portal, realtime, rules,
                         settings as settings_api, superadmin, teams, tickets, two_factor, widget, verification)

    app.include_router(auth.router, prefix="/api")
    app.include_router(ai.router, prefix="/api")
    app.include_router(tickets.router, prefix="/api")
    app.include_router(customers.router, prefix="/api")
    app.include_router(labels.router, prefix="/api")
    app.include_router(macros.router, prefix="/api")
    app.include_router(custom_fields.router, prefix="/api")
    app.include_router(custom_tools.router, prefix="/api")
    app.include_router(kb.router, prefix="/api")
    app.include_router(knowledge.router, prefix="/api")
    app.include_router(attachments.router, prefix="/api")
    app.include_router(crawl.router, prefix="/api")
    app.include_router(agents.router, prefix="/api")
    app.include_router(canned.router, prefix="/api")
    app.include_router(invoices.router, prefix="/api")
    app.include_router(billing.router, prefix="/api")
    app.include_router(rules.router, prefix="/api")
    app.include_router(notifications.router, prefix="/api")
    app.include_router(dashboard.router, prefix="/api")
    app.include_router(widget.router, prefix="/api")
    app.include_router(widget.chat_router, prefix="/api")
    app.include_router(portal.router, prefix="/api")
    app.include_router(superadmin.router, prefix="/api")
    app.include_router(faqs.router, prefix="/api")
    app.include_router(settings_api.router, prefix="/api")
    app.include_router(channels.router, prefix="/api")
    app.include_router(channel_webhooks.router, prefix="/api")
    app.include_router(assist.router, prefix="/api")
    app.include_router(teams.router, prefix="/api")
    app.include_router(verification.router, prefix="/api")
    app.include_router(two_factor.router, prefix="/api")
    app.include_router(realtime.router)
    app.include_router(realtime.ws_router)

    # ── Health check endpoints (for K8s, ECS, load balancers) ────────
    from app.infra.health import router as health_router
    app.include_router(health_router)

    @app.get("/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok", "environment": settings.environment}

    # ---- Rate limiting ----
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    from fastapi.responses import JSONResponse

    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, lambda request, exc: JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"}))
    # Per‑tenant limits can be applied via decorators on individual routes, e.g.:
    # @app.post("/api/chat")
    # @limiter.limit(f"{settings.rate_limit_chat_per_min}/minute")
    # def chat(...): ...

    return app


app = create_app()
