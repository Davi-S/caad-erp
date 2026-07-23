from fastapi.testclient import TestClient

from caad_erp import constants


def _seed_report_data(client: TestClient) -> None:
    assert (
        client.post(
            "/products",
            json={
                "product_id": "RP100",
                "product_name": "Report Product A",
                "sell_price": 500,
                "is_active": True,
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/products",
            json={
                "product_id": "RP200",
                "product_name": "Report Product B",
                "sell_price": 700,
                "is_active": True,
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/salesmen",
            json={
                "salesman_id": "RS100",
                "salesman_name": "Report Salesman",
                "is_active": True,
            },
        ).status_code
        == 201
    )

    assert (
        client.post(
            "/transactions/restock",
            json={
                "product_id": "RP100",
                "salesman_id": "RS100",
                "quantity": 5,
                "total_cost": 1000,
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/transactions/restock",
            json={
                "product_id": "RP200",
                "salesman_id": "RS100",
                "quantity": 3,
                "total_cost": 600,
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/transactions/sale",
            json={
                "product_id": "RP100",
                "salesman_id": "RS100",
                "quantity": 2,
                "total_revenue": 1000,
                "payment_type": constants.PaymentType.CASH.value,
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/transactions/sale",
            json={
                "product_id": "RP200",
                "salesman_id": "RS100",
                "quantity": 1,
                "total_revenue": 700,
                "payment_type": constants.PaymentType.ON_CREDIT.value,
            },
        ).status_code
        == 201
    )


# happy path


def test_report_endpoints_return_200_with_expected_response_shapes(
    api_client: TestClient,
) -> None:
    """
    GIVEN valid runtime context and persisted transaction data
    WHEN each /reports endpoint is requested
    THEN response is 200 and payload matches the documented schema shape
    """
    _seed_report_data(api_client)

    stock = api_client.get("/reports/stock")
    profit = api_client.get("/reports/profit")
    debts = api_client.get("/reports/debts")
    log = api_client.get("/reports/log")

    assert stock.status_code == 200
    assert profit.status_code == 200
    assert debts.status_code == 200
    assert log.status_code == 200

    assert "items" in stock.json()
    assert "profit" in profit.json()
    assert "balances" in debts.json()
    assert "transactions" in log.json()


def test_stock_report_sorts_items_by_product_id(
    api_client: TestClient,
) -> None:
    """
    GIVEN inventory contains multiple product ids
    WHEN GET /reports/stock is called
    THEN response items are sorted by product_id in ascending order
    """
    _seed_report_data(api_client)
    response = api_client.get("/reports/stock")

    assert response.status_code == 200
    ids = [item["product_id"] for item in response.json()["items"]]
    assert ids == sorted(ids)


def test_debts_report_contains_outstanding_credit_balances(
    api_client: TestClient,
) -> None:
    """
    GIVEN at least one on-credit sale without full repayment
    WHEN GET /reports/debts is called
    THEN response includes that transaction in balances with a positive outstanding total
    """
    _seed_report_data(api_client)
    response = api_client.get("/reports/debts")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_outstanding"] != 0
    assert any(item["product_id"] == "RP200" for item in payload["balances"])


def test_log_report_includes_transactions_with_full_fields(
    api_client: TestClient,
) -> None:
    """
    GIVEN transactions are recorded through API mutation endpoints
    WHEN GET /reports/log is requested
    THEN each entry exposes transaction identifiers and typed transaction metadata
    """
    _seed_report_data(api_client)
    response = api_client.get("/reports/log")

    assert response.status_code == 200
    entries = response.json()["transactions"]
    assert entries
    first = entries[0]
    assert "transaction_id" in first
    assert "transaction_type" in first
    assert "product_id" in first


# sad path


def test_reports_endpoints_remain_valid_with_empty_dataset(
    api_client: TestClient,
) -> None:
    """
    GIVEN no products or transactions exist
    WHEN report endpoints are requested
    THEN they return successful empty or zeroed payloads instead of errors
    """
    stock = api_client.get("/reports/stock")
    profit = api_client.get("/reports/profit")
    debts = api_client.get("/reports/debts")
    log = api_client.get("/reports/log")

    assert stock.status_code == 200
    assert stock.json()["items"] == []

    assert profit.status_code == 200
    assert profit.json()["total_revenue"] == 0

    assert debts.status_code == 200
    assert debts.json()["balances"] == []

    assert log.status_code == 200
    assert log.json()["transactions"] == []


# edge path


def test_report_endpoints_return_503_when_runtime_context_is_unavailable(
    api_client_without_runtime: TestClient,
) -> None:
    """
    GIVEN runtime context dependency has not been initialized
    WHEN report endpoints are requested
    THEN API returns 503 indicating temporary service dependency unavailability
    """
    response = api_client_without_runtime.get("/reports/stock")

    assert response.status_code == 503
    assert response.json()["error_type"] == "RuntimeError"
