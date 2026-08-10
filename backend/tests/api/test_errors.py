import pytest
import asyncio
import logging

import fastapi
import fastapi.exceptions

from caad_erp import exceptions
from caad_erp.api import errors


# happy path
def test_default_error_response_builder_returns_standard_payload_shape() -> None:
    """
    GIVEN a domain exception and target status code
    WHEN ErrorResponseBuilder.default is called
    THEN JSON payload includes detail code and error_type with expected status
    """
    response = errors.ErrorResponseBuilder.default(
        409,
        exceptions.BusinessRuleViolation("duplicate"),
    )
    payload = response.body.decode("utf-8")

    assert response.status_code == 409
    assert "duplicate" in payload
    assert "businessruleviolation" in payload
    assert "BusinessRuleViolation" in payload


def test_validation_error_response_builder_includes_structured_errors_list() -> None:
    """
    GIVEN a FastAPI RequestValidationError containing field-level entries
    WHEN ErrorResponseBuilder.validation is called
    THEN payload includes summarized detail and full errors array
    """
    error = fastapi.exceptions.RequestValidationError(
        [
            {
                "type": "value_error",
                "loc": ("body", "quantity"),
                "msg": "Input should be greater than 0",
                "input": 0,
            }
        ]
    )

    response = errors.ErrorResponseBuilder.validation(422, error)
    payload = response.body.decode("utf-8")

    assert response.status_code == 422
    assert "validation_error" in payload
    assert "body.quantity" in payload
    assert "errors" in payload


def test_catch_all_response_builder_sanitizes_internal_error_message() -> None:
    """
    GIVEN an unexpected internal exception
    WHEN ErrorResponseBuilder.catch_all is called
    THEN payload hides internals behind generic internal_server_error detail
    """
    response = errors.ErrorResponseBuilder.catch_all(500, TypeError("boom"))
    payload = response.body.decode("utf-8")

    assert response.status_code == 500
    assert "An unexpected error occurred" in payload
    assert "internal_server_error" in payload
    assert "TypeError" in payload


def test_exception_handler_registry_registers_handlers_by_specificity_order() -> None:
    """
    GIVEN valid exception handler specs with mixed inheritance depth
    WHEN ExceptionHandlerRegistry.register is invoked
    THEN handlers are attached from most specific to least specific classes
    """
    calls: list[str] = []

    class FakeApp:
        def add_exception_handler(self, exception_class, _handler):
            calls.append(exception_class.__name__)

    specs = [
        errors.ExceptionHandlerSpec(
            Exception, 500, errors.ErrorResponseBuilder.catch_all
        ),
        errors.ExceptionHandlerSpec(
            exceptions.BusinessRuleViolation, 409, errors.ErrorResponseBuilder.default
        ),
        errors.ExceptionHandlerSpec(
            exceptions.MissingReferenceError, 404, errors.ErrorResponseBuilder.default
        ),
    ]

    registry = errors.ExceptionHandlerRegistry(
        specs, logger_instance=logging.getLogger("t")
    )
    registry.register(FakeApp())

    assert calls == ["MissingReferenceError", "BusinessRuleViolation", "Exception"]


def test_register_handlers_builds_registry_and_registers_all_defaults() -> None:
    """
    GIVEN the default EXCEPTION_HANDLER_SPECS mapping
    WHEN register_handlers is called
    THEN application receives the complete centralized exception handling policy
    """
    app = fastapi.FastAPI()
    errors.register_handlers(app)

    for spec in errors.EXCEPTION_HANDLER_SPECS:
        assert spec.exception_class in app.exception_handlers


# sad path
@pytest.mark.parametrize(
    "invalid_spec_case",
    [
        "empty_specs",
        "duplicate_exception_class",
        "missing_catch_all",
        "multiple_catch_all",
        "invalid_status_code_low",
        "invalid_status_code_high",
    ],
)
def test_exception_handler_registry_rejects_invalid_spec_configurations(
    invalid_spec_case: str,
) -> None:
    """
    GIVEN malformed exception handler specifications
    WHEN ExceptionHandlerRegistry is initialized
    THEN configuration validation fails with a descriptive RuntimeError
    """
    default_factory = errors.ErrorResponseBuilder.default
    catch_all_factory = errors.ErrorResponseBuilder.catch_all

    if invalid_spec_case == "empty_specs":
        specs = []
    elif invalid_spec_case == "duplicate_exception_class":
        specs = [
            errors.ExceptionHandlerSpec(ValueError, 400, default_factory),
            errors.ExceptionHandlerSpec(ValueError, 422, default_factory),
            errors.ExceptionHandlerSpec(Exception, 500, catch_all_factory),
        ]
    elif invalid_spec_case == "missing_catch_all":
        specs = [errors.ExceptionHandlerSpec(ValueError, 400, default_factory)]
    elif invalid_spec_case == "multiple_catch_all":
        specs = [
            errors.ExceptionHandlerSpec(Exception, 500, catch_all_factory),
            errors.ExceptionHandlerSpec(Exception, 501, catch_all_factory),
        ]
    elif invalid_spec_case == "invalid_status_code_low":
        specs = [
            errors.ExceptionHandlerSpec(ValueError, 99, default_factory),
            errors.ExceptionHandlerSpec(Exception, 500, catch_all_factory),
        ]
    else:
        specs = [
            errors.ExceptionHandlerSpec(ValueError, 600, default_factory),
            errors.ExceptionHandlerSpec(Exception, 500, catch_all_factory),
        ]

    with pytest.raises(RuntimeError):
        errors.ExceptionHandlerRegistry(specs, logger_instance=logging.getLogger("t"))


# edge path
def test_validation_error_builder_handles_empty_errors_list_gracefully() -> None:
    """
    GIVEN a RequestValidationError exposing no concrete error items
    WHEN ErrorResponseBuilder.validation is called
    THEN response still returns a stable validation_error payload structure
    """
    error = fastapi.exceptions.RequestValidationError([])
    response = errors.ErrorResponseBuilder.validation(422, error)
    payload = response.body.decode("utf-8")

    assert response.status_code == 422
    assert "Validation error" in payload
    assert '"errors":[]' in payload


@pytest.mark.parametrize("log_level", [10, 20, 30, 40, 50])
def test_built_exception_handler_logs_using_specified_log_level(
    log_level: int, caplog: pytest.LogCaptureFixture
) -> None:
    """
    GIVEN an ExceptionHandlerSpec with a specific log level
    WHEN generated handler processes an exception
    THEN logging behavior follows the configured severity policy
    """
    logger = logging.getLogger(f"test-errors-{log_level}")
    logger.setLevel(logging.DEBUG)

    spec = errors.ExceptionHandlerSpec(
        exception_class=ValueError,
        status_code=400,
        response_factory=errors.ErrorResponseBuilder.default,
        log_level=log_level,
    )
    registry = errors.ExceptionHandlerRegistry(
        [
            spec,
            errors.ExceptionHandlerSpec(
                Exception, 500, errors.ErrorResponseBuilder.catch_all
            ),
        ],
        logger_instance=logger,
    )
    handler = registry._build_handler(spec)

    caplog.set_level(logging.DEBUG, logger=logger.name)

    response = asyncio.run(handler(None, ValueError("boom")))
    expected_level = logging.ERROR if log_level >= logging.ERROR else log_level

    assert response.status_code == 400
    assert any(
        record.levelno == expected_level and "ValueError" in record.message
        for record in caplog.records
    )
