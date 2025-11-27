"""Tests for the CAAD ERP API health check endpoint."""

import fastapi.testclient

from caad_erp import api


def test_health_check_returns_healthy_status(api_client):
    """
    Given a running API server
    When the /health endpoint is called
    Then it returns a 200 status with healthy message.
    """

    # Arrange
    # (client fixture provides the test client)

    # Act
    response = api_client.get("/health")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["message"] == "CAAD ERP API is running"


def test_health_check_response_structure(api_client):
    """
    Given a running API server
    When the /health endpoint is called
    Then the response contains the expected fields.
    """

    # Arrange
    # (client fixture provides the test client)

    # Act
    response = api_client.get("/health")

    # Assert
    data = response.json()
    assert "status" in data
    assert "message" in data


def test_health_check_content_type(api_client):
    """
    Given a running API server
    When the /health endpoint is called
    Then the response has JSON content type.
    """

    # Arrange
    # (client fixture provides the test client)

    # Act
    response = api_client.get("/health")

    # Assert
    assert response.headers["content-type"] == "application/json"
