"""Tests for the CAAD ERP API report endpoints."""

from decimal import Decimal


def _setup_data(client):
    """Helper to set up test data for reports."""
    # Create products
    client.post("/products", json={
        "product_id": "P-REPORT-001",
        "product_name": "Report Product 1",
        "sell_price": "10.00",
    })
    client.post("/products", json={
        "product_id": "P-REPORT-002",
        "product_name": "Report Product 2",
        "sell_price": "20.00",
    })
    
    # Create salesman
    client.post("/salesmen", json={
        "salesman_id": "S-REPORT",
        "salesman_name": "Report Salesman",
    })
    
    # Create some transactions
    client.post("/transactions/restock", json={
        "product_id": "P-REPORT-001",
        "salesman_id": "S-REPORT",
        "quantity": "10",
        "total_cost": "50.00",
    })
    client.post("/transactions/sale", json={
        "product_id": "P-REPORT-001",
        "salesman_id": "S-REPORT",
        "quantity": "3",
        "total_revenue": "30.00",
        "payment_type": "Cash",
    })


def test_get_stock_report_returns_200(api_client_with_context):
    """
    Given transactions that affect inventory
    When GET /reports/stock is called
    Then it returns 200 with stock levels.
    """
    # Arrange
    _setup_data(api_client_with_context)

    # Act
    response = api_client_with_context.get("/reports/stock")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    
    # Find P-REPORT-001 in items (10 restocked - 3 sold = 7)
    item = next((i for i in data["items"] if i["product_id"] == "P-REPORT-001"), None)
    assert item is not None
    assert Decimal(item["quantity"]) == Decimal("7")


def test_get_stock_report_empty_returns_200(api_client_with_context):
    """
    Given no transactions
    When GET /reports/stock is called
    Then it returns 200 with empty items list.
    """
    # Act
    response = api_client_with_context.get("/reports/stock")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)


def test_get_profit_report_returns_200(api_client_with_context):
    """
    Given transactions with revenue and costs
    When GET /reports/profit is called
    Then it returns 200 with profit summary.
    """
    # Arrange
    _setup_data(api_client_with_context)

    # Act
    response = api_client_with_context.get("/reports/profit")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert "total_revenue" in data
    assert "total_cost" in data
    assert "profit" in data
    
    # Verify calculations: revenue=30, cost=-50, profit=-20
    assert Decimal(data["total_revenue"]) == Decimal("30.00")
    assert Decimal(data["total_cost"]) == Decimal("-50.00")
    assert Decimal(data["profit"]) == Decimal("-20.00")


def test_get_debts_report_returns_200(api_client_with_context):
    """
    Given credit sales
    When GET /reports/debts is called
    Then it returns 200 with outstanding balances.
    """
    # Arrange
    api_client_with_context.post("/products", json={
        "product_id": "P-DEBT-REPORT",
        "product_name": "Debt Report Product",
        "sell_price": "15.00",
    })
    api_client_with_context.post("/salesmen", json={
        "salesman_id": "S-DEBT-REPORT",
        "salesman_name": "Debt Report Salesman",
    })
    api_client_with_context.post("/transactions/sale", json={
        "product_id": "P-DEBT-REPORT",
        "salesman_id": "S-DEBT-REPORT",
        "quantity": "2",
        "total_revenue": "0",
        "payment_type": "OnCredit",
    })

    # Act
    response = api_client_with_context.get("/reports/debts")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert "balances" in data
    assert "total_outstanding" in data
    assert len(data["balances"]) >= 1
    assert Decimal(data["total_outstanding"]) > 0


def test_get_debts_report_no_debts_returns_200(api_client_with_context):
    """
    Given no credit sales
    When GET /reports/debts is called
    Then it returns 200 with empty balances and zero total.
    """
    # Act
    response = api_client_with_context.get("/reports/debts")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["balances"] == []
    assert Decimal(data["total_outstanding"]) == Decimal("0")


def test_get_log_report_returns_200(api_client_with_context):
    """
    Given transactions in the log
    When GET /reports/log is called
    Then it returns 200 with all transactions.
    """
    # Arrange
    _setup_data(api_client_with_context)

    # Act
    response = api_client_with_context.get("/reports/log")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert "transactions" in data
    assert len(data["transactions"]) >= 2  # At least restock and sale


def test_get_log_report_empty_returns_200(api_client_with_context):
    """
    Given no transactions
    When GET /reports/log is called
    Then it returns 200 with empty transactions list.
    """
    # Act
    response = api_client_with_context.get("/reports/log")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["transactions"] == []


def test_log_report_transaction_structure(api_client_with_context):
    """
    Given transactions in the log
    When GET /reports/log is called
    Then each transaction has the expected structure.
    """
    # Arrange
    api_client_with_context.post("/products", json={
        "product_id": "P-STRUCT",
        "product_name": "Structure Product",
        "sell_price": "10.00",
    })
    api_client_with_context.post("/salesmen", json={
        "salesman_id": "S-STRUCT",
        "salesman_name": "Structure Salesman",
    })
    api_client_with_context.post("/transactions/restock", json={
        "product_id": "P-STRUCT",
        "salesman_id": "S-STRUCT",
        "quantity": "5",
        "total_cost": "25.00",
    })

    # Act
    response = api_client_with_context.get("/reports/log")

    # Assert
    data = response.json()
    assert len(data["transactions"]) > 0
    
    transaction = data["transactions"][0]
    assert "transaction_id" in transaction
    assert "timestamp_iso" in transaction
    assert "transaction_type" in transaction
    assert "product_id" in transaction
    assert "salesman_id" in transaction
    assert "quantity_change" in transaction
    assert "total_revenue" in transaction
    assert "total_cost" in transaction
