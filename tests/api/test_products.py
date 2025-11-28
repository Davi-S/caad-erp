"""Tests for the CAAD ERP API product endpoints."""

from decimal import Decimal


def test_create_product_returns_201(api_client_with_context):
    """
    Given a valid product payload
    When POST /products is called
    Then it returns 201 with the created product data.
    """
    # Arrange
    payload = {
        "product_id": "P-TEST-001",
        "product_name": "Test Product",
        "sell_price": "10.00",
        "is_active": True,
    }

    # Act
    response = api_client_with_context.post("/products", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["detail"] == "Product created successfully"
    assert data["data"]["product_id"] == "P-TEST-001"
    assert data["data"]["product_name"] == "Test Product"
    assert Decimal(data["data"]["sell_price"]) == Decimal("10.00")
    assert data["data"]["is_active"] is True


def test_create_product_with_inactive_flag(api_client_with_context):
    """
    Given a product payload with is_active=False
    When POST /products is called
    Then the product is created as inactive.
    """
    # Arrange
    payload = {
        "product_id": "P-TEST-002",
        "product_name": "Inactive Product",
        "sell_price": "15.00",
        "is_active": False,
    }

    # Act
    response = api_client_with_context.post("/products", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["is_active"] is False


def test_create_duplicate_product_returns_409(api_client_with_context):
    """
    Given an existing product
    When POST /products is called with the same ID
    Then it returns 409 Conflict.
    """
    # Arrange
    payload = {
        "product_id": "P-DUPLICATE",
        "product_name": "Original Product",
        "sell_price": "20.00",
    }
    api_client_with_context.post("/products", json=payload)

    # Act
    response = api_client_with_context.post("/products", json=payload)

    # Assert
    assert response.status_code == 409


def test_create_product_with_invalid_price_returns_422(api_client_with_context):
    """
    Given a product payload with negative sell_price
    When POST /products is called
    Then it returns 422 Unprocessable Entity.
    """
    # Arrange
    payload = {
        "product_id": "P-INVALID",
        "product_name": "Invalid Product",
        "sell_price": "-10.00",
    }

    # Act
    response = api_client_with_context.post("/products", json=payload)

    # Assert
    assert response.status_code == 422


def test_deactivate_product_returns_200(api_client_with_context):
    """
    Given an existing active product
    When POST /products/{id}/deactivate is called
    Then it returns 200 with the deactivated product.
    """
    # Arrange
    payload = {
        "product_id": "P-TO-DEACTIVATE",
        "product_name": "Active Product",
        "sell_price": "25.00",
    }
    api_client_with_context.post("/products", json=payload)

    # Act
    response = api_client_with_context.post("/products/P-TO-DEACTIVATE/deactivate")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["detail"] == "Product deactivated successfully"
    assert data["data"]["is_active"] is False


def test_deactivate_nonexistent_product_returns_404(api_client_with_context):
    """
    Given a nonexistent product ID
    When POST /products/{id}/deactivate is called
    Then it returns 404 Not Found.
    """
    # Act
    response = api_client_with_context.post("/products/P-NONEXISTENT/deactivate")

    # Assert
    assert response.status_code == 404
