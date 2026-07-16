"""Global exception handlers for the CAAD ERP API.

This module provides centralized exception handling to map BLL exceptions
to appropriate HTTP status codes and response formats.
"""

import dataclasses
import logging
import typing as t

import fastapi
import fastapi.encoders
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


class ErrorResponseBuilder:
    """Factory object responsible for constructing JSON error payloads."""

    @staticmethod
    def default(
        status_code: int,
        exc: Exception,
    ) -> fastapi.responses.JSONResponse:
        """Create a standardized JSON error response."""
        error_code = type(exc).__name__.lower()
        return fastapi.responses.JSONResponse(
            status_code=status_code,
            content={
                "detail": str(exc),
                "code": error_code,
                "error_type": type(exc).__name__,
            },
        )

    @staticmethod
    def validation(
        status_code: int,
        exc: fastapi.exceptions.RequestValidationError,
    ) -> fastapi.responses.JSONResponse:
        """Create a validation error response with structured error details."""
        validation_errors = fastapi.encoders.jsonable_encoder(
            exc.errors(),
            custom_encoder={
                int: str,
                Exception: str,
            },
        )
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

    @staticmethod
    def catch_all(
        status_code: int,
        exc: Exception,
    ) -> fastapi.responses.JSONResponse:
        """Create a sanitized error response for unexpected exceptions."""
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
        ErrorResponseBuilder.default,
    ),
    ExceptionHandlerSpec(
        exceptions.BusinessRuleViolation,
        409,
        ErrorResponseBuilder.default,
    ),
    ExceptionHandlerSpec(
        ValueError,
        400,
        ErrorResponseBuilder.default,
    ),
    # Validation errors from Pydantic
    ExceptionHandlerSpec(
        fastapi.exceptions.RequestValidationError,
        422,
        ErrorResponseBuilder.validation,
    ),
    # Dependency/runtime errors
    ExceptionHandlerSpec(
        RuntimeError,
        503,
        ErrorResponseBuilder.default,
    ),
    # Catch-all for unexpected errors (should be last)
    ExceptionHandlerSpec(
        Exception,
        500,
        ErrorResponseBuilder.catch_all,
        log_level=logging.ERROR,
    ),
]


class ExceptionHandlerRegistry:
    """Registers validated exception handlers on a FastAPI application."""

    def __init__(
        self,
        specs: t.Sequence[ExceptionHandlerSpec],
        *,
        logger_instance: logging.Logger,
    ) -> None:
        self._specs = list(specs)
        self._logger = logger_instance
        self._validate_specs()

    @staticmethod
    def _exception_specificity(exc_class: type[Exception]) -> int:
        """Return inheritance depth to register specific handlers first."""
        return len(exc_class.mro())

    def _validate_specs(self) -> None:
        """Validate handler configuration before registration."""
        if not self._specs:
            raise RuntimeError("EXCEPTION_HANDLER_SPECS must not be empty")

        seen_classes: set[type[Exception]] = set()
        catch_all_count = 0

        for spec in self._specs:
            if spec.exception_class in seen_classes:
                raise RuntimeError(
                    "Duplicate exception handler spec for "
                    f"{spec.exception_class.__name__}"
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

    def _build_handler(
        self,
        spec: ExceptionHandlerSpec,
    ) -> t.Callable[
        [fastapi.Request, Exception],
        t.Coroutine[t.Any, t.Any, fastapi.responses.JSONResponse],
    ]:
        """Build one FastAPI-compatible async exception handler."""

        async def handler(
            request: fastapi.Request,
            exc: Exception,
        ) -> fastapi.responses.JSONResponse:
            if spec.log_level >= logging.ERROR:
                self._logger.exception("%s: %s", type(exc).__name__, exc)
            else:
                self._logger.log(spec.log_level, "%s: %s", type(exc).__name__, exc)
            return spec.response_factory(spec.status_code, exc)

        return handler

    def register(self, app: fastapi.FastAPI) -> None:
        """Validate specs and register handlers sorted by type specificity."""
        for spec in sorted(
            self._specs,
            key=lambda value: self._exception_specificity(
                value.exception_class),
            reverse=True,
        ):
            app.add_exception_handler(spec.exception_class, self._build_handler(spec))


def register_handlers(app: fastapi.FastAPI) -> None:
    """Register all exception handlers on the FastAPI application.

    This function should be called during application initialization
    to ensure all endpoints benefit from centralized exception handling.

    The registration process validates configuration at startup and then
    registers handlers from most specific exception classes to least specific.

    Args:
        app: The FastAPI application instance.
    """
    registry = ExceptionHandlerRegistry(
        EXCEPTION_HANDLER_SPECS,
        logger_instance=logger,
    )
    registry.register(app)
