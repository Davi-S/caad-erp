import asyncio

import fastapi
import fastapi.exceptions
import pytest

from caad_erp.api import errors
from caad_erp.bll import rules


def test_build_error_response_returns_standard_payload_shape() -> None:
    """
    GIVEN status code, detail, code, and error type
    WHEN build_error_response is called
    THEN JSON response includes expected payload fields and status code
    """
    response = errors.build_error_response(
        status_code=409,
        detail="Duplicate product",
        code="duplicateproducterror",
        error_type="DuplicateProductError",
    )
    payload = response.body.decode("utf-8")

    assert response.status_code == 409
    assert "Duplicate product" in payload
    assert "duplicateproducterror" in payload
    assert "DuplicateProductError" in payload


@pytest.mark.parametrize(
    "exc, expected_status",
    [
        (rules.ProductNotFoundError("missing"), 404),
        (rules.SalesmanNotFoundError("missing"), 404),
        (rules.TransactionNotFoundError("missing"), 404),
        (rules.DuplicateProductError("duplicate"), 409),
        (rules.DuplicateSalesmanError("duplicate"), 409),
        (rules.InvalidQuantityError("invalid"), 400),
        (rules.BusinessRuleViolation("generic violation"), 400),
        (ValueError("bad value"), 400),
        (RuntimeError("system down"), 503),
        (KeyError("unknown key"), 500),
    ],
)
def test_get_status_code_resolves_mro_inheritance(
    exc: Exception, expected_status: int
) -> None:
    """
    GIVEN an exception instance
    WHEN _get_status_code is called
    THEN it resolves the expected HTTP status code via STATUS_MAP MRO lookup
    """
    assert errors._get_status_code(exc) == expected_status


def test_domain_exception_handler_returns_correct_status_and_body() -> None:
    """
    GIVEN a domain rule exception
    WHEN domain_exception_handler is executed asynchronously
    THEN returns JSONResponse with mapped status code and structured detail
    """
    exc = rules.ProductNotFoundError("Product P999 not found")
    response = asyncio.run(errors.domain_exception_handler(None, exc))
    payload = response.body.decode("utf-8")

    assert response.status_code == 404
    assert "Product P999 not found" in payload
    assert "productnotfounderror" in payload
    assert "ProductNotFoundError" in payload


def test_validation_exception_handler_includes_structured_errors_list() -> None:
    """
    GIVEN a FastAPI RequestValidationError containing field-level items
    WHEN validation_exception_handler is executed
    THEN payload includes summarized location detail and errors array
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

    response = asyncio.run(errors.validation_exception_handler(None, error))
    payload = response.body.decode("utf-8")

    assert response.status_code == 422
    assert "validation_error" in payload
    assert "body.quantity: Input should be greater than 0" in payload
    assert "errors" in payload


def test_validation_exception_handler_handles_empty_errors_list_gracefully() -> None:
    """
    GIVEN a RequestValidationError with an empty errors list
    WHEN validation_exception_handler is executed
    THEN response returns stable default validation error payload
    """
    error = fastapi.exceptions.RequestValidationError([])
    response = asyncio.run(errors.validation_exception_handler(None, error))
    payload = response.body.decode("utf-8")

    assert response.status_code == 422
    assert "Validation error" in payload
    assert '"errors":[]' in payload


def test_unhandled_exception_handler_sanitizes_internal_error_message() -> None:
    """
    GIVEN an unexpected internal exception
    WHEN unhandled_exception_handler is executed
    THEN payload hides internals behind generic internal_server_error detail
    """
    response = asyncio.run(
        errors.unhandled_exception_handler(None, TypeError("boom"))
    )
    payload = response.body.decode("utf-8")

    assert response.status_code == 500
    assert "An unexpected error occurred" in payload
    assert "internal_server_error" in payload
    assert "TypeError" in payload


def test_register_handlers_attaches_all_exception_handlers() -> None:
    """
    GIVEN a FastAPI application instance
    WHEN register_handlers is called
    THEN all STATUS_MAP exception types and validation/catch-all handlers are attached
    """
    app = fastapi.FastAPI()
    errors.register_handlers(app)

    for exc_cls in errors.STATUS_MAP:
        assert exc_cls in app.exception_handlers
    assert fastapi.exceptions.RequestValidationError in app.exception_handlers
    assert Exception in app.exception_handlers
