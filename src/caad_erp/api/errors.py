"""Global exception handlers for the CAAD ERP API.

This module provides centralized exception handling to map BLL exceptions
to appropriate HTTP status codes and response formats.
"""

import dataclasses
import logging
import typing as t

import fastapi
import fastapi.exceptions
import fastapi.responses

from caad_erp import exceptions

logger = logging.getLogger(__name__)


# Type alias for response factory functions.
ResponseFactory = t.Callable[[int, Exception], fastapi.responses.JSONResponse]


@dataclasses.dataclass(frozen=True)
class ExceptionHandlerSpec:
    """Declarative configuration for registering one exception handler."""

    exception_class: type[Exception]
    status_code: int
    response_factory: ResponseFactory
    log_level: int = logging.WARNING


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
    error_code = type(exc).__name__.lower()
    return fastapi.responses.JSONResponse(
        status_code=status_code,
        content={
            "detail": str(exc),
            "code": error_code,
            "error_type": type(exc).__name__,
        },
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
    validation_errors = exc.errors()
    if validation_errors:
        # Extract first error message for the detail field
        first_error = validation_errors[0]
        location = ".".join(str(loc) for loc in first_error.get("loc", []))
        message = first_error.get("msg", "Validation error")
        detail = f"{location}: {message}" if location else message
    else:
        detail = "Validation error"

    return fastapi.responses.JSONResponse(
        status_code=status_code,
        content={
            "detail": detail,
            "code": "validation_error",
            "error_type": type(exc).__name__,
            "errors": validation_errors,
        },
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
        content={
            "detail": "An unexpected error occurred",
            "code": "internal_server_error",
            "error_type": type(exc).__name__,
        },
    )


# Exception-to-HTTP-status-code mapping with explicit response factories.
EXCEPTION_HANDLER_SPECS: list[ExceptionHandlerSpec] = [
    # Domain-specific errors
    ExceptionHandlerSpec(
        exceptions.MissingReferenceError,
        404,
        _default_response_factory,
    ),
    ExceptionHandlerSpec(
        exceptions.BusinessRuleViolation,
        409,
        _default_response_factory,
    ),
    ExceptionHandlerSpec(
        ValueError,
        400,
        _default_response_factory,
    ),
    # Validation errors from Pydantic
    ExceptionHandlerSpec(
        fastapi.exceptions.RequestValidationError,
        422,
        _validation_error_response_factory,
    ),
    # Dependency/runtime errors
    ExceptionHandlerSpec(
        RuntimeError,
        503,
        _default_response_factory,
    ),
    # Catch-all for unexpected errors (should be last)
    ExceptionHandlerSpec(
        Exception,
        500,
        _catch_all_response_factory,
        log_level=logging.ERROR,
    ),
]


def _exception_specificity(exc_class: type[Exception]) -> int:
    """Return inheritance depth used to register more specific classes first."""
    return len(exc_class.mro())


def _validate_exception_handler_specs(
    specs: t.Sequence[ExceptionHandlerSpec],
) -> None:
    """Validate handler configuration at application startup."""
    if not specs:
        raise RuntimeError("EXCEPTION_HANDLER_SPECS must not be empty")

    seen_classes: set[type[Exception]] = set()
    catch_all_count = 0

    for spec in specs:
        if spec.exception_class in seen_classes:
            raise RuntimeError(
                f"Duplicate exception handler spec for {spec.exception_class.__name__}"
            )
        seen_classes.add(spec.exception_class)

        if spec.exception_class is Exception:
            catch_all_count += 1

        if not (100 <= spec.status_code <= 599):
            raise RuntimeError(
                "Invalid status code "
                f"{spec.status_code} for {spec.exception_class.__name__}"
            )

    if catch_all_count != 1:
        raise RuntimeError(
            "EXCEPTION_HANDLER_SPECS must define exactly one Exception catch-all handler"
        )


def _create_exception_handler(
    status_code: int,
    response_factory: ResponseFactory,
    log_level: int = logging.WARNING,
) -> t.Callable[
    [fastapi.Request, Exception],
    t.Coroutine[t.Any, t.Any, fastapi.responses.JSONResponse],
]:
    """Create an exception handler function for the given configuration.

    Args:
        status_code: HTTP status code to return.
        response_factory: Response factory used to build the JSON payload.
        log_level: Logging level for the exception.

    Returns:
        An async exception handler function.
    """
    async def handler(
        request: fastapi.Request,
        exc: Exception,
    ) -> fastapi.responses.JSONResponse:
        if log_level >= logging.ERROR:
            logger.exception("%s: %s", type(exc).__name__, exc)
        else:
            logger.log(log_level, "%s: %s", type(exc).__name__, exc)
        return response_factory(status_code, exc)

    return handler


def register_handlers(app: fastapi.FastAPI) -> None:
    """Register all exception handlers on the FastAPI application.

    This function should be called during application initialization
    to ensure all endpoints benefit from centralized exception handling.

    The registration process validates configuration at startup and then
    registers handlers from most specific exception classes to least specific.

    Args:
        app: The FastAPI application instance.
    """
    _validate_exception_handler_specs(EXCEPTION_HANDLER_SPECS)

    # Register by specificity, not by defined order
    for spec in sorted(
        EXCEPTION_HANDLER_SPECS,
        key=lambda value: _exception_specificity(value.exception_class),
        reverse=True,
    ):
        handler = _create_exception_handler(
            spec.status_code,
            spec.response_factory,
            spec.log_level,
        )
        app.add_exception_handler(spec.exception_class, handler)
