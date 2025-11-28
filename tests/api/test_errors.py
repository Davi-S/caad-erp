"""Tests for the global error handling module in the CAAD ERP API.

This module tests the exception handler functions defined in
src/caad_erp/api/errors.py directly.
"""

import json
from unittest.mock import Mock

import pytest

from caad_erp import exceptions
from caad_erp.api import errors


@pytest.fixture
def mock_request():
    """Return a mock FastAPI request object."""
    return Mock()


class TestCreateErrorResponse:
    """Tests for the _create_error_response helper function."""

    def test_creates_json_response_with_status_code(self):
        """
        Given a status code and detail message
        When _create_error_response is called
        Then it returns a JSONResponse with the correct status code.
        """
        # Act
        response = errors._create_error_response(404, "Not found")

        # Assert
        assert response.status_code == 404

    def test_creates_json_response_with_detail_body(self):
        """
        Given a status code and detail message
        When _create_error_response is called
        Then the response body contains a 'detail' key with the message.
        """
        # Act
        response = errors._create_error_response(400, "Bad request message")

        # Assert
        data = json.loads(response.body)
        assert data["detail"] == "Bad request message"


class TestBusinessRuleViolationHandler:
    """Tests for the business_rule_violation_handler function."""

    @pytest.mark.asyncio
    async def test_returns_409_status_code(self, mock_request):
        """
        Given a BusinessRuleViolation exception
        When business_rule_violation_handler is called
        Then it returns a response with 409 status code.
        """
        # Arrange
        exc = exceptions.BusinessRuleViolation("Duplicate entity")

        # Act
        response = await errors.business_rule_violation_handler(mock_request, exc)

        # Assert
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_returns_exception_message_as_detail(self, mock_request):
        """
        Given a BusinessRuleViolation exception with a message
        When business_rule_violation_handler is called
        Then the response body contains the exception message.
        """
        # Arrange
        exc = exceptions.BusinessRuleViolation("Product already exists")

        # Act
        response = await errors.business_rule_violation_handler(mock_request, exc)

        # Assert
        data = json.loads(response.body)
        assert data["detail"] == "Product already exists"


class TestMissingReferenceErrorHandler:
    """Tests for the missing_reference_error_handler function."""

    @pytest.mark.asyncio
    async def test_returns_404_status_code(self, mock_request):
        """
        Given a MissingReferenceError exception
        When missing_reference_error_handler is called
        Then it returns a response with 404 status code.
        """
        # Arrange
        exc = exceptions.MissingReferenceError("Product not found")

        # Act
        response = await errors.missing_reference_error_handler(mock_request, exc)

        # Assert
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_exception_message_as_detail(self, mock_request):
        """
        Given a MissingReferenceError exception with a message
        When missing_reference_error_handler is called
        Then the response body contains the exception message.
        """
        # Arrange
        exc = exceptions.MissingReferenceError("Unknown product ID: P-123")

        # Act
        response = await errors.missing_reference_error_handler(mock_request, exc)

        # Assert
        data = json.loads(response.body)
        assert data["detail"] == "Unknown product ID: P-123"


class TestValueErrorHandler:
    """Tests for the value_error_handler function."""

    @pytest.mark.asyncio
    async def test_returns_400_status_code(self, mock_request):
        """
        Given a ValueError exception
        When value_error_handler is called
        Then it returns a response with 400 status code.
        """
        # Arrange
        exc = ValueError("Invalid input")

        # Act
        response = await errors.value_error_handler(mock_request, exc)

        # Assert
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_returns_exception_message_as_detail(self, mock_request):
        """
        Given a ValueError exception with a message
        When value_error_handler is called
        Then the response body contains the exception message.
        """
        # Arrange
        exc = ValueError("Quantity must be positive")

        # Act
        response = await errors.value_error_handler(mock_request, exc)

        # Assert
        data = json.loads(response.body)
        assert data["detail"] == "Quantity must be positive"


class TestRegisterHandlers:
    """Tests for the register_handlers function."""

    def test_registers_missing_reference_error_handler(self):
        """
        Given a FastAPI app
        When register_handlers is called
        Then MissingReferenceError handler is registered.
        """
        # Arrange
        app = Mock()
        app.exception_handlers = {}

        # Act
        errors.register_handlers(app)

        # Assert
        assert app.add_exception_handler.call_count == 3
        calls = app.add_exception_handler.call_args_list
        exception_types = [call[0][0] for call in calls]
        assert exceptions.MissingReferenceError in exception_types

    def test_registers_business_rule_violation_handler(self):
        """
        Given a FastAPI app
        When register_handlers is called
        Then BusinessRuleViolation handler is registered.
        """
        # Arrange
        app = Mock()
        app.exception_handlers = {}

        # Act
        errors.register_handlers(app)

        # Assert
        calls = app.add_exception_handler.call_args_list
        exception_types = [call[0][0] for call in calls]
        assert exceptions.BusinessRuleViolation in exception_types

    def test_registers_value_error_handler(self):
        """
        Given a FastAPI app
        When register_handlers is called
        Then ValueError handler is registered.
        """
        # Arrange
        app = Mock()
        app.exception_handlers = {}

        # Act
        errors.register_handlers(app)

        # Assert
        calls = app.add_exception_handler.call_args_list
        exception_types = [call[0][0] for call in calls]
        assert ValueError in exception_types
