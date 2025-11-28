"""Tests for the CAAD ERP API transaction endpoints."""

from decimal import Decimal


def _create_product_and_salesman(client, product_id="P-TRANS-001", salesman_id="S-TRANS-001"):
    """Helper to create test product and salesman."""
    client.post("/products", json={
        "product_id": product_id,
        "product_name": "Test Product",
        "sell_price": "10.00",
    })
    client.post("/salesmen", json={
        "salesman_id": salesman_id,
        "salesman_name": "Test Salesman",
    })


def test_record_sale_returns_201(api_client_with_context):
    """
    Given a valid sale payload
    When POST /transactions/sale is called
    Then it returns 201 with the created transaction.
    """
    # Arrange
    _create_product_and_salesman(api_client_with_context)
    payload = {
        "product_id": "P-TRANS-001",
        "salesman_id": "S-TRANS-001",
        "quantity": "2",
        "total_revenue": "20.00",
        "payment_type": "Cash",
    }

    # Act
    response = api_client_with_context.post("/transactions/sale", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["detail"] == "Sale recorded successfully"
    assert data["data"]["transaction_type"] == "SALE"
    assert data["data"]["product_id"] == "P-TRANS-001"
    assert Decimal(data["data"]["quantity_change"]) == Decimal("-2")


def test_record_sale_on_credit(api_client_with_context):
    """
    Given a sale with payment_type OnCredit
    When POST /transactions/sale is called
    Then it records a credit sale.
    """
    # Arrange
    _create_product_and_salesman(api_client_with_context, "P-CREDIT", "S-CREDIT")
    payload = {
        "product_id": "P-CREDIT",
        "salesman_id": "S-CREDIT",
        "quantity": "1",
        "total_revenue": "0",
        "payment_type": "OnCredit",
    }

    # Act
    response = api_client_with_context.post("/transactions/sale", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["payment_type"] == "OnCredit"


def test_record_restock_returns_201(api_client_with_context):
    """
    Given a valid restock payload
    When POST /transactions/restock is called
    Then it returns 201 with the created transaction.
    """
    # Arrange
    _create_product_and_salesman(api_client_with_context, "P-RESTOCK", "S-RESTOCK")
    payload = {
        "product_id": "P-RESTOCK",
        "salesman_id": "S-RESTOCK",
        "quantity": "10",
        "total_cost": "50.00",
    }

    # Act
    response = api_client_with_context.post("/transactions/restock", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["detail"] == "Restock recorded successfully"
    assert data["data"]["transaction_type"] == "RESTOCK"
    assert Decimal(data["data"]["quantity_change"]) == Decimal("10")
    assert Decimal(data["data"]["total_cost"]) == Decimal("-50.00")


def test_record_write_off_returns_201(api_client_with_context):
    """
    Given a valid write-off payload
    When POST /transactions/write-off is called
    Then it returns 201 with the created transaction.
    """
    # Arrange
    _create_product_and_salesman(api_client_with_context, "P-WRITEOFF", "S-WRITEOFF")
    # First restock some inventory
    api_client_with_context.post("/transactions/restock", json={
        "product_id": "P-WRITEOFF",
        "salesman_id": "S-WRITEOFF",
        "quantity": "5",
        "total_cost": "25.00",
    })
    payload = {
        "product_id": "P-WRITEOFF",
        "salesman_id": "S-WRITEOFF",
        "quantity": "2",
    }

    # Act
    response = api_client_with_context.post("/transactions/write-off", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["detail"] == "Write-off recorded successfully"
    assert data["data"]["transaction_type"] == "WRITE_OFF"
    assert Decimal(data["data"]["quantity_change"]) == Decimal("-2")


def test_record_void_returns_201(api_client_with_context):
    """
    Given an existing transaction
    When POST /transactions/void is called
    Then it returns 201 with the void transaction.
    """
    # Arrange
    _create_product_and_salesman(api_client_with_context, "P-VOID", "S-VOID")
    sale_response = api_client_with_context.post("/transactions/sale", json={
        "product_id": "P-VOID",
        "salesman_id": "S-VOID",
        "quantity": "1",
        "total_revenue": "10.00",
        "payment_type": "Cash",
    })
    transaction_id = sale_response.json()["data"]["transaction_id"]

    payload = {
        "linked_transaction_id": transaction_id,
        "notes": "Customer returned item",
    }

    # Act
    response = api_client_with_context.post("/transactions/void", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["detail"] == "Transaction voided successfully"
    assert data["data"]["transaction_type"] == "VOID"
    assert data["data"]["linked_transaction_id"] == transaction_id


def test_record_pay_debt_returns_201(api_client_with_context):
    """
    Given an outstanding credit sale
    When POST /transactions/pay-debt is called
    Then it returns 201 with the credit payment transaction.
    """
    # Arrange
    _create_product_and_salesman(api_client_with_context, "P-DEBT", "S-DEBT")
    sale_response = api_client_with_context.post("/transactions/sale", json={
        "product_id": "P-DEBT",
        "salesman_id": "S-DEBT",
        "quantity": "1",
        "total_revenue": "0",
        "payment_type": "OnCredit",
    })
    transaction_id = sale_response.json()["data"]["transaction_id"]

    payload = {
        "linked_transaction_id": transaction_id,
        "salesman_id": "S-DEBT",
        "total_revenue": "10.00",
        "payment_type": "Cash",
    }

    # Act
    response = api_client_with_context.post("/transactions/pay-debt", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["detail"] == "Credit payment recorded successfully"
    assert data["data"]["transaction_type"] == "CREDIT_PAYMENT"


def test_sale_with_nonexistent_product_returns_404(api_client_with_context):
    """
    Given a sale with nonexistent product
    When POST /transactions/sale is called
    Then it returns 404 Not Found.
    """
    # Arrange
    api_client_with_context.post("/salesmen", json={
        "salesman_id": "S-EXISTS",
        "salesman_name": "Existing Salesman",
    })
    payload = {
        "product_id": "P-NONEXISTENT",
        "salesman_id": "S-EXISTS",
        "quantity": "1",
        "total_revenue": "10.00",
        "payment_type": "Cash",
    }

    # Act
    response = api_client_with_context.post("/transactions/sale", json=payload)

    # Assert
    assert response.status_code == 404


def test_void_nonexistent_transaction_returns_404(api_client_with_context):
    """
    Given a nonexistent transaction ID
    When POST /transactions/void is called
    Then it returns 404 Not Found.
    """
    # Arrange
    payload = {
        "linked_transaction_id": "NONEXISTENT",
    }

    # Act
    response = api_client_with_context.post("/transactions/void", json=payload)

    # Assert
    assert response.status_code == 404
