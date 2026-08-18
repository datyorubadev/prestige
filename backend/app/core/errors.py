import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ApiError(Exception):
    """Base for domain errors — rendered into the standard error envelope (§8)."""

    def __init__(self, code: str, message: str, status_code: int = 400, details: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class TenantNotFound(ApiError):
    def __init__(self, message: str = "Tenant not found"):
        super().__init__("NOT_FOUND", message, 404)


class TicketNotFound(ApiError):
    def __init__(self, message: str = "Ticket not found"):
        super().__init__("NOT_FOUND", message, 404)


class InsufficientPrivileges(ApiError):
    def __init__(self, message: str = "Insufficient privileges"):
        super().__init__("FORBIDDEN", message, 403)


class InvalidCredentials(ApiError):
    def __init__(self, message: str = "Invalid email or password"):
        super().__init__("UNAUTHORIZED", message, 401)


class ResourceQuotaExceeded(ApiError):
    def __init__(self, message: str = "Plan quota exceeded"):
        super().__init__("QUOTA_EXCEEDED", message, 422)


class InviteExpired(ApiError):
    def __init__(self, message: str = "This invite link has expired or is invalid"):
        super().__init__("INVITE_EXPIRED", message, 410)


class ResetTokenExpired(ApiError):
    def __init__(self, message: str = "This reset link has expired or is invalid"):
        super().__init__("RESET_TOKEN_EXPIRED", message, 410)


class TenantNotActive(ApiError):
    def __init__(self, message: str = "Tenant is not active"):
        super().__init__("TENANT_NOT_ACTIVE", message, 409)


class PlanDowngradeBlocked(ApiError):
    def __init__(self, message: str = "Downgrade below current usage is blocked"):
        super().__init__("PLAN_DOWNGRADE_BLOCKED", message, 422)


class LabelNotFound(ApiError):
    def __init__(self, message: str = "Label not found"):
        super().__init__("NOT_FOUND", message, 404)


class LabelConflict(ApiError):
    def __init__(self, message: str = "A label with this name already exists"):
        super().__init__("LABEL_EXISTS", message, 409)


def _envelope(code: str, message: str, status_code: int, details: Any = None) -> JSONResponse:
    body = {"error": {"code": code, "message": message, "details": details}}
    return JSONResponse(status_code=status_code, content=body)


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError):
        return _envelope(exc.code, exc.message, exc.status_code, exc.details)

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        code = {400: "VALIDATION_ERROR", 401: "UNAUTHORIZED", 403: "FORBIDDEN",
                404: "NOT_FOUND", 405: "NOT_FOUND", 429: "RATE_LIMITED"}.get(
            exc.status_code, "HTTP_ERROR"
        )
        return _envelope(code, str(exc.detail), exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        return _envelope(
            "VALIDATION_ERROR",
            "Request validation failed",
            400,
            {"fields": exc.errors()},
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        request_id = getattr(request.state, "request_id", None)
        return _envelope(
            "INTERNAL_ERROR",
            "An unexpected error occurred",
            500,
            {"request_id": request_id},
        )
