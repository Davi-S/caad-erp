"""Global exception handlers for the CAAD ERP API.

This module provides centralized exception handling to map BLL exceptions
to appropriate HTTP status codes and response formats.
"""

import functools
import logging
import typing as t

import fastapi
import fastapi.exceptions
import fastapi.responses

from caad_erp import exceptions

logger = logging.getLogger(__name__)


# Type alias for custom response factory functions
ResponseFactory = t.Callable[[int, Exception], fastapi.responses.JSONResponse]


def _default_response_factory(
    status_code: int,
    exc: Exception,
) -> fastapi.responses.JSONResponse:
    """Create a standardized JSON error response.

    Args:
        status_code: HTTP status code for the response.
        exc: The exception that triggered this response.

    Returns:
        JSONResponse with the standard error format.
    """
    return fastapi.responses.JSONResponse(
        status_code=status_code,
        content={"detail": str(exc)},
    )


def _validation_error_response_factory(
    status_code: int,
    exc: fastapi.exceptions.RequestValidationError,
) -> fastapi.responses.JSONResponse:
    """Create a validation error response with structured error details.

    Args:
        status_code: HTTP status code for the response.
        exc: The RequestValidationError exception.

    Returns:
        JSONResponse with validation error details.
    """
    errors = exc.errors()
    if errors:
        # Extract first error message for the detail field
        first_error = errors[0]
        location = ".".join(str(loc) for loc in first_error.get("loc", []))
        message = first_error.get("msg", "Validation error")
        detail = f"{location}: {message}" if location else message
    else:
        detail = "Validation error"

    return fastapi.responses.JSONResponse(
        status_code=status_code,
        content={"detail": detail},
    )


def _catch_all_response_factory(
    status_code: int,
    exc: Exception,
) -> fastapi.responses.JSONResponse:
    """Create a sanitized error response for unexpected exceptions.

    Args:
        status_code: HTTP status code for the response.
        exc: The exception that triggered this response.

    Returns:
        JSONResponse with a generic error message.
    """
    return fastapi.responses.JSONResponse(
        status_code=status_code,
        content={"detail": "An unexpected error occurred"},
    )


# Exception-to-HTTP-status-code mapping with optional custom response factories.
# More specific exceptions should be listed before their base classes.
# Each tuple contains: (exception_class, status_code, optional_response_factory)
EXCEPTION_STATUS_MAP: list[
    tuple[type[Exception], int, t.Optional[ResponseFactory]]
] = [
    # Domain-specific errors
    (exceptions.MissingReferenceError, 404, None),
    (exceptions.BusinessRuleViolation, 409, None),
    (ValueError, 400, None),
    # Validation errors from Pydantic
    (fastapi.exceptions.RequestValidationError, 422, _validation_error_response_factory),
    # Dependency/runtime errors
    (RuntimeError, 503, None),
    # Catch-all for unexpected errors (should be last)
    (Exception, 500, _catch_all_response_factory),
]


def _create_exception_handler(
    status_code: int,
    response_factory: t.Optional[ResponseFactory] = None,
    log_level: int = logging.WARNING,
) -> t.Callable[
    [fastapi.Request, Exception],
    t.Coroutine[t.Any, t.Any, fastapi.responses.JSONResponse],
]:
    """Create an exception handler function for the given configuration.

    Args:
        status_code: HTTP status code to return.
        response_factory: Optional custom response factory. If None,
            uses _default_response_factory.
        log_level: Logging level for the exception.

    Returns:
        An async exception handler function.
    """
    factory = response_factory or _default_response_factory

    async def handler(
        request: fastapi.Request,
        exc: Exception,
    ) -> fastapi.responses.JSONResponse:
        logger.log(log_level, "%s: %s", type(exc).__name__, exc)
        return factory(status_code, exc)

    return handler


def register_handlers(app: fastapi.FastAPI) -> None:
    """Register all exception handlers on the FastAPI application.

    This function should be called during application initialization
    to ensure all endpoints benefit from centralized exception handling.

    Exception handlers are registered in the order defined in
    EXCEPTION_STATUS_MAP, ensuring more specific exceptions are
    handled before their base classes.

    Args:
        app: The FastAPI application instance.
    """
    for exc_class, status_code, response_factory in EXCEPTION_STATUS_MAP:
        # Use ERROR level for catch-all, WARNING for others
        log_level = logging.ERROR if exc_class is Exception else logging.WARNING
        handler = _create_exception_handler(status_code, response_factory, log_level)
        app.add_exception_handler(exc_class, handler)
