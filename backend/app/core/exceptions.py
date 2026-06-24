"""Custom exception hierarchy and FastAPI exception handlers.

Domain errors raise typed exceptions which are translated to consistent
JSON error responses by the registered handlers.  This keeps the API
contract uniform and the service layer free of HTTP concerns.
"""

from typing import Any, Dict, Optional

from fastapi import Request
from fastapi.responses import JSONResponse


# ─── Domain exceptions ──────────────────────────────────────────────────


class DomainError(Exception):
    """Base class for all domain-level errors."""

    status_code: int = 400
    error_code: str = "domain_error"

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundError(DomainError):
    status_code = 404
    error_code = "not_found"


class ConflictError(DomainError):
    status_code = 409
    error_code = "conflict"


class AuthError(DomainError):
    status_code = 401
    error_code = "unauthorized"


class ForbiddenError(DomainError):
    status_code = 403
    error_code = "forbidden"


class ValidationError(DomainError):
    status_code = 422
    error_code = "validation_error"


# ─── Exception handlers ────────────────────────────────────────────────


async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    """Convert domain exceptions into structured JSON responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unexpected errors — log and return a 500."""
    import logging
    logging.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "message": "An unexpected error occurred",
        },
    )
