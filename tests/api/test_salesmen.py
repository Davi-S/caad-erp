"""Tests for the CAAD ERP API salesman endpoints."""


def test_create_salesman_returns_201(api_client_with_context):
    """
    Given a valid salesman payload
    When POST /salesmen is called
    Then it returns 201 with the created salesman data.
    """
    # Arrange
    payload = {
        "salesman_id": "S-TEST-001",
        "salesman_name": "John Doe",
        "is_active": True,
    }

    # Act
    response = api_client_with_context.post("/salesmen", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["detail"] == "Salesman created successfully"
    assert data["data"]["salesman_id"] == "S-TEST-001"
    assert data["data"]["salesman_name"] == "John Doe"
    assert data["data"]["is_active"] is True


def test_create_salesman_with_inactive_flag(api_client_with_context):
    """
    Given a salesman payload with is_active=False
    When POST /salesmen is called
    Then the salesman is created as inactive.
    """
    # Arrange
    payload = {
        "salesman_id": "S-TEST-002",
        "salesman_name": "Inactive Salesman",
        "is_active": False,
    }

    # Act
    response = api_client_with_context.post("/salesmen", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["is_active"] is False


def test_create_duplicate_salesman_returns_409(api_client_with_context):
    """
    Given an existing salesman
    When POST /salesmen is called with the same ID
    Then it returns 409 Conflict.
    """
    # Arrange
    payload = {
        "salesman_id": "S-DUPLICATE",
        "salesman_name": "Original Salesman",
    }
    api_client_with_context.post("/salesmen", json=payload)

    # Act
    response = api_client_with_context.post("/salesmen", json=payload)

    # Assert
    assert response.status_code == 409


def test_deactivate_salesman_returns_200(api_client_with_context):
    """
    Given an existing active salesman
    When POST /salesmen/{id}/deactivate is called
    Then it returns 200 with the deactivated salesman.
    """
    # Arrange
    payload = {
        "salesman_id": "S-TO-DEACTIVATE",
        "salesman_name": "Active Salesman",
    }
    api_client_with_context.post("/salesmen", json=payload)

    # Act
    response = api_client_with_context.post("/salesmen/S-TO-DEACTIVATE/deactivate")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["detail"] == "Salesman deactivated successfully"
    assert data["data"]["is_active"] is False


def test_deactivate_nonexistent_salesman_returns_404(api_client_with_context):
    """
    Given a nonexistent salesman ID
    When POST /salesmen/{id}/deactivate is called
    Then it returns 404 Not Found.
    """
    # Act
    response = api_client_with_context.post("/salesmen/S-NONEXISTENT/deactivate")

    # Assert
    assert response.status_code == 404


def test_create_duplicate_salesman_error_response_format(api_client_with_context):
    """
    Given an existing salesman
    When POST /salesmen is called with the same ID
    Then it returns 409 with a JSON detail message.
    """
    # Arrange
    payload = {
        "salesman_id": "S-DUP-ERR",
        "salesman_name": "Original Salesman",
    }
    api_client_with_context.post("/salesmen", json=payload)

    # Act
    response = api_client_with_context.post("/salesmen", json=payload)

    # Assert
    assert response.status_code == 409
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)
    assert len(data["detail"]) > 0


def test_deactivate_nonexistent_salesman_error_response_format(api_client_with_context):
    """
    Given a nonexistent salesman ID
    When POST /salesmen/{id}/deactivate is called
    Then it returns 404 with a JSON detail message.
    """
    # Act
    response = api_client_with_context.post("/salesmen/S-DOES-NOT-EXIST/deactivate")

    # Assert
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)
    assert "S-DOES-NOT-EXIST" in data["detail"]
