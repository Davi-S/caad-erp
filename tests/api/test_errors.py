"""Tests for the global error handling module in the CAAD ERP API.

This module tests the exception handler functions defined in
src/caad_erp/api/errors.py directly.
"""

import json
from unittest.mock import Mock

import fastapi.exceptions
import pytest

from caad_erp import exceptions
from caad_erp.api import errors


@pytest.fixture
def mock_request():
    """Return a mock FastAPI request object."""
    return Mock()


class TestDefaultResponseFactory:
    """Tests for the _default_response_factory function."""

    def test_creates_json_response_with_status_code(self):
        """
        Given a status code and exception
        When _default_response_factory is called
        Then it returns a JSONResponse with the correct status code.
        """
        # Act
        response = errors._default_response_factory(404, ValueError("Not found"))

        # Assert
        assert response.status_code == 404

    def test_creates_json_response_with_exception_message(self):
        """
        Given a status code and exception
        When _default_response_factory is called
        Then the response body contains the exception message.
        """
        # Act
        response = errors._default_response_factory(400, ValueError("Bad request message"))

        # Assert
        data = json.loads(response.body)
        assert data["detail"] == "Bad request message"


class TestValidationErrorResponseFactory:
    """Tests for the _validation_error_response_factory function."""

    def test_creates_422_response(self):
        """
        Given a RequestValidationError
        When _validation_error_response_factory is called
        Then it returns a response with the specified status code.
        """
        # Arrange
        exc = fastapi.exceptions.RequestValidationError(
            errors=[{"loc": ("body", "name"), "msg": "Field required", "type": "missing"}]
        )

        # Act
        response = errors._validation_error_response_factory(422, exc)

        # Assert
        assert response.status_code == 422

    def test_includes_location_and_message(self):
        """
        Given a RequestValidationError with location and message
        When _validation_error_response_factory is called
        Then the detail includes both location and message.
        """
        # Arrange
        exc = fastapi.exceptions.RequestValidationError(
            errors=[{"loc": ("body", "name"), "msg": "Field required", "type": "missing"}]
        )

        # Act
        response = errors._validation_error_response_factory(422, exc)

        # Assert
        data = json.loads(response.body)
        assert "body.name" in data["detail"]
        assert "Field required" in data["detail"]

    def test_handles_empty_errors_list(self):
        """
        Given a RequestValidationError with empty errors
        When _validation_error_response_factory is called
        Then it returns a generic validation error message.
        """
        # Arrange
        exc = fastapi.exceptions.RequestValidationError(errors=[])

        # Act
        response = errors._validation_error_response_factory(422, exc)

        # Assert
        data = json.loads(response.body)
        assert data["detail"] == "Validation error"


class TestCatchAllResponseFactory:
    """Tests for the _catch_all_response_factory function."""

    def test_creates_sanitized_response(self):
        """
        Given any exception
        When _catch_all_response_factory is called
        Then it returns a generic error message without exposing details.
        """
        # Arrange
        exc = Exception("Sensitive internal error details")

        # Act
        response = errors._catch_all_response_factory(500, exc)

        # Assert
        assert response.status_code == 500
        data = json.loads(response.body)
        assert data["detail"] == "An unexpected error occurred"
        assert "Sensitive" not in data["detail"]


class TestCreateExceptionHandler:
    """Tests for the _create_exception_handler factory function."""

    @pytest.mark.asyncio
    async def test_creates_handler_with_default_factory(self, mock_request):
        """
        Given a status code without custom factory
        When the created handler is called
        Then it uses the default response factory.
        """
        # Arrange
        handler = errors._create_exception_handler(400)
        exc = ValueError("Test error")

        # Act
        response = await handler(mock_request, exc)

        # Assert
        assert response.status_code == 400
        data = json.loads(response.body)
        assert data["detail"] == "Test error"

    @pytest.mark.asyncio
    async def test_creates_handler_with_custom_factory(self, mock_request):
        """
        Given a custom response factory
        When the created handler is called
        Then it uses the custom factory.
        """
        # Arrange
        def custom_factory(status_code, exc):
            return errors._default_response_factory(status_code, ValueError("Custom message"))

        handler = errors._create_exception_handler(418, custom_factory)
        exc = ValueError("Original message")

        # Act
        response = await handler(mock_request, exc)

        # Assert
        assert response.status_code == 418
        data = json.loads(response.body)
        assert data["detail"] == "Custom message"


class TestExceptionStatusMap:
    """Tests for the EXCEPTION_STATUS_MAP configuration."""

    def test_contains_missing_reference_error(self):
        """The map should contain MissingReferenceError with 404."""
        exc_types = [item[0] for item in errors.EXCEPTION_STATUS_MAP]
        assert exceptions.MissingReferenceError in exc_types

        for exc_class, status_code, _ in errors.EXCEPTION_STATUS_MAP:
            if exc_class is exceptions.MissingReferenceError:
                assert status_code == 404

    def test_contains_business_rule_violation(self):
        """The map should contain BusinessRuleViolation with 409."""
        for exc_class, status_code, _ in errors.EXCEPTION_STATUS_MAP:
            if exc_class is exceptions.BusinessRuleViolation:
                assert status_code == 409

    def test_contains_value_error(self):
        """The map should contain ValueError with 400."""
        for exc_class, status_code, _ in errors.EXCEPTION_STATUS_MAP:
            if exc_class is ValueError:
                assert status_code == 400

    def test_contains_request_validation_error(self):
        """The map should contain RequestValidationError with 422."""
        for exc_class, status_code, _ in errors.EXCEPTION_STATUS_MAP:
            if exc_class is fastapi.exceptions.RequestValidationError:
                assert status_code == 422

    def test_contains_runtime_error(self):
        """The map should contain RuntimeError with 503."""
        for exc_class, status_code, _ in errors.EXCEPTION_STATUS_MAP:
            if exc_class is RuntimeError:
                assert status_code == 503

    def test_contains_catch_all_exception(self):
        """The map should contain base Exception with 500 as catch-all."""
        exc_types = [item[0] for item in errors.EXCEPTION_STATUS_MAP]
        assert Exception in exc_types

        for exc_class, status_code, _ in errors.EXCEPTION_STATUS_MAP:
            if exc_class is Exception:
                assert status_code == 500


class TestRegisterHandlers:
    """Tests for the register_handlers function."""

    def test_registers_all_handlers_from_map(self):
        """
        Given a FastAPI app
        When register_handlers is called
        Then it registers a handler for each entry in EXCEPTION_STATUS_MAP.
        """
        # Arrange
        app = Mock()
        app.exception_handlers = {}

        # Act
        errors.register_handlers(app)

        # Assert
        assert app.add_exception_handler.call_count == len(errors.EXCEPTION_STATUS_MAP)

    def test_registers_handlers_in_map_order(self):
        """
        Given a FastAPI app
        When register_handlers is called
        Then handlers are registered in the same order as EXCEPTION_STATUS_MAP.
        """
        # Arrange
        app = Mock()
        app.exception_handlers = {}

        # Act
        errors.register_handlers(app)

        # Assert
        calls = app.add_exception_handler.call_args_list
        registered_types = [call[0][0] for call in calls]
        expected_types = [item[0] for item in errors.EXCEPTION_STATUS_MAP]
        assert registered_types == expected_types
