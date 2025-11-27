"""Tests for the CAAD ERP API health check endpoint."""

import pytest
from fastapi.testclient import TestClient

from caad_erp.api import create_app


@pytest.fixture
def client() -> TestClient:
    """Return a test client for the API application."""
    app = create_app()
    return TestClient(app)


def test_health_check_returns_healthy_status(client):
    """
    Given a running API server
    When the /health endpoint is called
    Then it returns a 200 status with healthy message.
    """

    # Arrange
    # (client fixture provides the test client)

    # Act
    response = client.get("/health")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["message"] == "CAAD ERP API is running"


def test_health_check_response_structure(client):
    """
    Given a running API server
    When the /health endpoint is called
    Then the response contains the expected fields.
    """

    # Arrange
    # (client fixture provides the test client)

    # Act
    response = client.get("/health")

    # Assert
    data = response.json()
    assert "status" in data
    assert "message" in data


def test_health_check_content_type(client):
    """
    Given a running API server
    When the /health endpoint is called
    Then the response has JSON content type.
    """

    # Arrange
    # (client fixture provides the test client)

    # Act
    response = client.get("/health")

    # Assert
    assert response.headers["content-type"] == "application/json"
