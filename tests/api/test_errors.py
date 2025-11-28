"""Tests for the global error handling in the CAAD ERP API.

This module contains negative tests (Sad Path) that verify error responses
are correctly formatted when BLL exceptions are triggered.
"""


def _create_product_and_salesman(client, product_id="P-ERR-001", salesman_id="S-ERR-001"):
    """Helper to create test product and salesman."""
    client.post("/products", json={
        "product_id": product_id,
        "product_name": "Error Test Product",
        "sell_price": "10.00",
    })
    client.post("/salesmen", json={
        "salesman_id": salesman_id,
        "salesman_name": "Error Test Salesman",
    })


# ===========================================================================
# Products Error Handling Tests
# ===========================================================================


def test_create_duplicate_product_error_response_format(api_client_with_context):
    """
    Given an existing product
    When POST /products is called with the same ID
    Then it returns 409 with a JSON detail message.
    """
    # Arrange
    payload = {
        "product_id": "P-DUP-ERR",
        "product_name": "Original Product",
        "sell_price": "20.00",
    }
    api_client_with_context.post("/products", json=payload)

    # Act
    response = api_client_with_context.post("/products", json=payload)

    # Assert
    assert response.status_code == 409
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)
    assert len(data["detail"]) > 0


def test_deactivate_nonexistent_product_error_response_format(api_client_with_context):
    """
    Given a nonexistent product ID
    When POST /products/{id}/deactivate is called
    Then it returns 404 with a JSON detail message.
    """
    # Act
    response = api_client_with_context.post("/products/P-DOES-NOT-EXIST/deactivate")

    # Assert
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)
    assert "P-DOES-NOT-EXIST" in data["detail"]


# ===========================================================================
# Salesmen Error Handling Tests
# ===========================================================================


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


# ===========================================================================
# Transactions Error Handling Tests
# ===========================================================================


def test_sale_with_nonexistent_product_error_response_format(api_client_with_context):
    """
    Given a sale with nonexistent product
    When POST /transactions/sale is called
    Then it returns 404 with a JSON detail message.
    """
    # Arrange - create salesman only
    api_client_with_context.post("/salesmen", json={
        "salesman_id": "S-ERR-SALE",
        "salesman_name": "Error Sale Salesman",
    })
    payload = {
        "product_id": "P-MISSING-PRODUCT",
        "salesman_id": "S-ERR-SALE",
        "quantity": "1",
        "total_revenue": "10.00",
        "payment_type": "Cash",
    }

    # Act
    response = api_client_with_context.post("/transactions/sale", json=payload)

    # Assert
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)


def test_sale_with_nonexistent_salesman_error_response_format(api_client_with_context):
    """
    Given a sale with nonexistent salesman
    When POST /transactions/sale is called
    Then it returns 404 with a JSON detail message.
    """
    # Arrange - create product only
    api_client_with_context.post("/products", json={
        "product_id": "P-ERR-SALE",
        "product_name": "Error Sale Product",
        "sell_price": "10.00",
    })
    payload = {
        "product_id": "P-ERR-SALE",
        "salesman_id": "S-MISSING-SALESMAN",
        "quantity": "1",
        "total_revenue": "10.00",
        "payment_type": "Cash",
    }

    # Act
    response = api_client_with_context.post("/transactions/sale", json=payload)

    # Assert
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)


def test_restock_with_nonexistent_product_error_response_format(api_client_with_context):
    """
    Given a restock with nonexistent product
    When POST /transactions/restock is called
    Then it returns 404 with a JSON detail message.
    """
    # Arrange - create salesman only
    api_client_with_context.post("/salesmen", json={
        "salesman_id": "S-ERR-RESTOCK",
        "salesman_name": "Error Restock Salesman",
    })
    payload = {
        "product_id": "P-MISSING-FOR-RESTOCK",
        "salesman_id": "S-ERR-RESTOCK",
        "quantity": "5",
        "total_cost": "25.00",
    }

    # Act
    response = api_client_with_context.post("/transactions/restock", json=payload)

    # Assert
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)


def test_write_off_with_nonexistent_product_error_response_format(api_client_with_context):
    """
    Given a write-off with nonexistent product
    When POST /transactions/write-off is called
    Then it returns 404 with a JSON detail message.
    """
    # Arrange - create salesman only
    api_client_with_context.post("/salesmen", json={
        "salesman_id": "S-ERR-WRITEOFF",
        "salesman_name": "Error WriteOff Salesman",
    })
    payload = {
        "product_id": "P-MISSING-FOR-WRITEOFF",
        "salesman_id": "S-ERR-WRITEOFF",
        "quantity": "1",
    }

    # Act
    response = api_client_with_context.post("/transactions/write-off", json=payload)

    # Assert
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)


def test_void_nonexistent_transaction_error_response_format(api_client_with_context):
    """
    Given a nonexistent transaction ID
    When POST /transactions/void is called
    Then it returns 404 with a JSON detail message.
    """
    # Arrange
    payload = {
        "linked_transaction_id": "TX-NONEXISTENT-123",
    }

    # Act
    response = api_client_with_context.post("/transactions/void", json=payload)

    # Assert
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)


def test_pay_debt_nonexistent_transaction_error_response_format(api_client_with_context):
    """
    Given a nonexistent linked transaction ID
    When POST /transactions/pay-debt is called
    Then it returns 404 with a JSON detail message.
    """
    # Arrange
    api_client_with_context.post("/salesmen", json={
        "salesman_id": "S-ERR-PAYDEBT",
        "salesman_name": "Error PayDebt Salesman",
    })
    payload = {
        "linked_transaction_id": "TX-NONEXISTENT-DEBT",
        "salesman_id": "S-ERR-PAYDEBT",
        "total_revenue": "10.00",
        "payment_type": "Cash",
    }

    # Act
    response = api_client_with_context.post("/transactions/pay-debt", json=payload)

    # Assert
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)


# ===========================================================================
# Error Response Consistency Tests
# ===========================================================================


def test_all_error_responses_have_consistent_format(api_client_with_context):
    """
    Given various error conditions
    When the errors are triggered
    Then all responses follow the same JSON format with 'detail' key.
    """
    # Test 409 - duplicate product
    api_client_with_context.post("/products", json={
        "product_id": "P-CONSISTENCY",
        "product_name": "Consistency Test",
        "sell_price": "10.00",
    })
    response_409 = api_client_with_context.post("/products", json={
        "product_id": "P-CONSISTENCY",
        "product_name": "Duplicate",
        "sell_price": "10.00",
    })

    # Test 404 - missing product
    response_404 = api_client_with_context.post("/products/P-MISSING-CONSISTENCY/deactivate")

    # Verify both have the same structure
    data_409 = response_409.json()
    data_404 = response_404.json()

    assert "detail" in data_409
    assert "detail" in data_404
    assert isinstance(data_409["detail"], str)
    assert isinstance(data_404["detail"], str)
