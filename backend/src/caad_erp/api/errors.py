"""Global exception handlers for the CAAD ERP API.

This module maps domain and framework exceptions to standard HTTP responses
using a declarative exception-to-status code dictionary.
"""

import logging

import fastapi
import fastapi.encoders
import fastapi.exceptions
import fastapi.responses

from caad_erp.bll import rules

logger = logging.getLogger(__name__)

# Map exception types to target HTTP status codes.
STATUS_MAP: dict[type[Exception], int] = {
    rules.ProductNotFoundError: 404,
    rules.SalesmanNotFoundError: 404,
    rules.TransactionNotFoundError: 404,
    rules.DuplicateEntityError: 409,
    rules.BusinessRuleViolation: 400,
    ValueError: 400,
    RuntimeError: 503,
}


def _get_status_code(exc: Exception) -> int:
    """Resolve HTTP status code by walking the exception class MRO."""
    for cls in type(exc).mro():
        if cls in STATUS_MAP:
            return STATUS_MAP[cls]
    return 500


def build_error_response(
    status_code: int,
    detail: str,
    code: str,
    error_type: str,
    extra: dict | None = None,
) -> fastapi.responses.JSONResponse:
    """Construct a standardized JSON error response."""
    content = {
        "detail": detail,
        "code": code,
        "error_type": error_type,
    }
    if extra:
        content.update(extra)
    return fastapi.responses.JSONResponse(status_code=status_code, content=content)


async def domain_exception_handler(
    request: fastapi.Request,
    exc: Exception,
) -> fastapi.responses.JSONResponse:
    """Handle domain exceptions, business rule violations, and mapped errors."""
    status_code = _get_status_code(exc)
    logger.warning("%s: %s", type(exc).__name__, exc)
    return build_error_response(
        status_code=status_code,
        detail=str(exc),
        code=type(exc).__name__.lower(),
        error_type=type(exc).__name__,
    )


async def validation_exception_handler(
    request: fastapi.Request,
    exc: fastapi.exceptions.RequestValidationError,
) -> fastapi.responses.JSONResponse:
    """Handle FastAPI/Pydantic request validation errors."""
    logger.warning("RequestValidationError: %s", exc)
    validation_errors = fastapi.encoders.jsonable_encoder(
        exc.errors(),
        custom_encoder={
            int: str,
            Exception: str,
        },
    )
    if validation_errors:
        first_error = validation_errors[0]
        location = ".".join(str(loc) for loc in first_error.get("loc", []))
        message = first_error.get("msg", "Validation error")
        detail = f"{location}: {message}" if location else message
    else:
        detail = "Validation error"

    return build_error_response(
        status_code=422,
        detail=detail,
        code="validation_error",
        error_type=type(exc).__name__,
        extra={"errors": validation_errors},
    )


async def unhandled_exception_handler(
    request: fastapi.Request,
    exc: Exception,
) -> fastapi.responses.JSONResponse:
    """Catch-all handler for unhandled internal server errors."""
    logger.exception("Unexpected error occurred: %s", exc)
    return build_error_response(
        status_code=500,
        detail="An unexpected error occurred",
        code="internal_server_error",
        error_type=type(exc).__name__,
    )


def register_handlers(app: fastapi.FastAPI) -> None:
    """Register all exception handlers on the FastAPI application."""
    for exc_cls in STATUS_MAP:
        app.add_exception_handler(exc_cls, domain_exception_handler)
    app.add_exception_handler(
        fastapi.exceptions.RequestValidationError, validation_exception_handler
    )
    app.add_exception_handler(Exception, unhandled_exception_handler)
