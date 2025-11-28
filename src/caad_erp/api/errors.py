"""Global exception handlers for the CAAD ERP API.

This module provides centralized exception handling to map BLL exceptions
to appropriate HTTP status codes and response formats.
"""

import logging

import fastapi
import fastapi.responses

from caad_erp import exceptions

logger = logging.getLogger(__name__)


# Exception-to-HTTP-status-code mapping
# More specific exceptions should be listed before their base classes
EXCEPTION_STATUS_MAP: list[tuple[type[Exception], int]] = [
    (exceptions.MissingReferenceError, 404),
    (exceptions.BusinessRuleViolation, 409),
    (ValueError, 400),
]


def _create_error_response(status_code: int, detail: str) -> fastapi.responses.JSONResponse:
    """Create a standardized JSON error response.

    Args:
        status_code: HTTP status code for the response.
        detail: Error message to include in the response body.

    Returns:
        JSONResponse with the standard error format.
    """
    return fastapi.responses.JSONResponse(
        status_code=status_code,
        content={"detail": detail},
    )


async def business_rule_violation_handler(
    request: fastapi.Request,
    exc: exceptions.BusinessRuleViolation,
) -> fastapi.responses.JSONResponse:
    """Handle BusinessRuleViolation exceptions.

    Maps to 409 Conflict for general business rule violations,
    except for MissingReferenceError which is handled separately.
    """
    logger.warning("BusinessRuleViolation: %s", exc)
    return _create_error_response(409, str(exc))


async def missing_reference_error_handler(
    request: fastapi.Request,
    exc: exceptions.MissingReferenceError,
) -> fastapi.responses.JSONResponse:
    """Handle MissingReferenceError exceptions.

    Maps to 404 Not Found when referenced entities don't exist.
    """
    logger.warning("MissingReferenceError: %s", exc)
    return _create_error_response(404, str(exc))


async def value_error_handler(
    request: fastapi.Request,
    exc: ValueError,
) -> fastapi.responses.JSONResponse:
    """Handle ValueError exceptions.

    Maps to 400 Bad Request for invalid input values.
    """
    logger.warning("ValueError: %s", exc)
    return _create_error_response(400, str(exc))


def register_handlers(app: fastapi.FastAPI) -> None:
    """Register all exception handlers on the FastAPI application.

    This function should be called during application initialization
    to ensure all endpoints benefit from centralized exception handling.

    Args:
        app: The FastAPI application instance.
    """
    # Register handlers in order from most specific to least specific
    app.add_exception_handler(
        exceptions.MissingReferenceError,
        missing_reference_error_handler,
    )
    app.add_exception_handler(
        exceptions.BusinessRuleViolation,
        business_rule_violation_handler,
    )
    app.add_exception_handler(ValueError, value_error_handler)
