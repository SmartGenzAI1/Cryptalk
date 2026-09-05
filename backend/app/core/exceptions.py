# exception hierarchy + handlers

from typing import Any, Dict, Optional

from fastapi import Request
from fastapi.responses import JSONResponse

# domain exceptions
class DomainError(Exception):

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

def _add_cors_headers(response: JSONResponse, request: Request) -> JSONResponse:
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    return response

# exception handlers
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    res = JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )
    return _add_cors_headers(res, request)

async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    import logging
    logging.exception("Unhandled error: %s", exc)
    res = JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "message": "An unexpected error occurred",
        },
    )
    return _add_cors_headers(res, request)
