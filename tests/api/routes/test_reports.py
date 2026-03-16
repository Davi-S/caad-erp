import pytest
from decimal import Decimal

from caad_erp import bll, constants, dal, exceptions


# happy path
@pytest.mark.parametrize(
    "report_endpoint",
    [
        "stock",
        "profit",
        "debts",
        "log",
    ],
)
def test_report_endpoints_return_200_with_expected_response_shapes(report_endpoint: str) -> None:
    """
    GIVEN a valid runtime context and existing workbook data
    WHEN GET /reports/{report_endpoint} is requested
    THEN endpoint returns 200 with response payload matching schema contract
    """
    from caad_erp.api.routes import reports as report_routes

    original_inventory = report_routes.bll.calculate_inventory
    original_profit = report_routes.bll.calculate_profit_summary
    original_debts = report_routes.bll.calculate_outstanding_debts
    original_log = report_routes.bll.list_transactions
    try:
        report_routes.bll.calculate_inventory = lambda _context: {"P002": Decimal("3")}
        report_routes.bll.calculate_profit_summary = lambda _context: {
            "total_revenue": Decimal("10.00"),
            "total_cost": Decimal("-2.00"),
            "profit": Decimal("8.00"),
        }
        report_routes.bll.calculate_outstanding_debts = lambda _context: {
            "balances": [],
            "total_outstanding": Decimal("0.00"),
        }
        report_routes.bll.list_transactions = lambda _context: [
            dal.TransactionRow(
                transaction_id="TX001",
                timestamp_iso="2026-01-01T00:00:00+00:00",
                transaction_type=constants.TransactionType.SALE.value,
                product_id="P002",
                salesman_id="S001",
                payment_type=constants.PaymentType.CASH.value,
                quantity_change=Decimal("-1"),
                total_revenue=Decimal("5.00"),
                total_cost=Decimal("0.00"),
                linked_transaction_id=None,
                notes=None,
            )
        ]

        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get(f"/reports/{report_endpoint}")
        api_runtime.clear_runtime_context()
    finally:
        report_routes.bll.calculate_inventory = original_inventory
        report_routes.bll.calculate_profit_summary = original_profit
        report_routes.bll.calculate_outstanding_debts = original_debts
        report_routes.bll.list_transactions = original_log

    assert response.status_code == 200
    payload = response.json()
    if report_endpoint == "stock":
        assert "items" in payload
    elif report_endpoint == "profit":
        assert "profit" in payload
    elif report_endpoint == "debts":
        assert "balances" in payload
    else:
        assert "transactions" in payload


def test_stock_report_sorts_items_by_product_id() -> None:
    """
    GIVEN unsorted inventory map returned by business layer
    WHEN GET /reports/stock is called
    THEN API response items are emitted in deterministic product_id order
    """
    from caad_erp.api.routes import reports as report_routes

    original_inventory = report_routes.bll.calculate_inventory
    try:
        report_routes.bll.calculate_inventory = lambda _context: {
            "P200": Decimal("1"),
            "P100": Decimal("2"),
        }
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/reports/stock")
        api_runtime.clear_runtime_context()
    finally:
        report_routes.bll.calculate_inventory = original_inventory

    assert response.status_code == 200
    ids = [item["product_id"] for item in response.json()["items"]]
    assert ids == ["P100", "P200"]


def test_debts_report_maps_outstanding_debt_models_to_response_items() -> None:
    """
    GIVEN outstanding debt domain objects from calculate_outstanding_debts
    WHEN GET /reports/debts is called
    THEN balances are translated to DebtItem records preserving numeric fields
    """
    from caad_erp.api.routes import reports as report_routes

    original_debts = report_routes.bll.calculate_outstanding_debts
    try:
        debt = bll.OutstandingDebt(
            transaction_id="TX001",
            timestamp_iso="2026-01-01T00:00:00+00:00",
            product_id="P001",
            salesman_id="S001",
            quantity=Decimal("2"),
            expected_amount=Decimal("10.00"),
            amount_paid=Decimal("4.00"),
            balance=Decimal("6.00"),
        )
        report_routes.bll.calculate_outstanding_debts = lambda _context: {
            "balances": [debt],
            "total_outstanding": Decimal("6.00"),
        }

        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/reports/debts")
        api_runtime.clear_runtime_context()
    finally:
        report_routes.bll.calculate_outstanding_debts = original_debts

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_outstanding"] == "6.00"
    assert payload["balances"][0]["transaction_id"] == "TX001"


def test_log_report_maps_transaction_rows_to_transaction_response_entries() -> None:
    """
    GIVEN transaction rows from business layer listing
    WHEN GET /reports/log is called
    THEN API returns serialized transaction entries with complete field set
    """
    from caad_erp.api.routes import reports as report_routes

    original_log = report_routes.bll.list_transactions
    try:
        report_routes.bll.list_transactions = lambda _context: [
            dal.TransactionRow(
                transaction_id="TX010",
                timestamp_iso="2026-01-01T00:00:00+00:00",
                transaction_type=constants.TransactionType.RESTOCK.value,
                product_id="P001",
                salesman_id="S001",
                payment_type=None,
                quantity_change=Decimal("2"),
                total_revenue=Decimal("0.00"),
                total_cost=Decimal("-3.00"),
                linked_transaction_id=None,
                notes="note",
            )
        ]

        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/reports/log")
        api_runtime.clear_runtime_context()
    finally:
        report_routes.bll.list_transactions = original_log

    assert response.status_code == 200
    tx = response.json()["transactions"][0]
    assert tx["transaction_id"] == "TX010"
    assert tx["transaction_type"] == constants.TransactionType.RESTOCK.value


# sad path
@pytest.mark.parametrize(
    "report_endpoint",
    [
        "stock",
        "profit",
        "debts",
        "log",
    ],
)
def test_report_endpoints_map_domain_exceptions_to_configured_http_status(report_endpoint: str) -> None:
    """
    GIVEN report calculation raises domain or value errors
    WHEN corresponding report endpoint is requested
    THEN response status follows centralized exception mapping contract
    """
    from caad_erp.api.routes import reports as report_routes

    if report_endpoint == "stock":
        attr_name = "calculate_inventory"
        raise_exc = exceptions.MissingReferenceError("missing")
        expected = 404
    elif report_endpoint == "profit":
        attr_name = "calculate_profit_summary"
        raise_exc = exceptions.BusinessRuleViolation("rule")
        expected = 409
    elif report_endpoint == "debts":
        attr_name = "calculate_outstanding_debts"
        raise_exc = ValueError("bad")
        expected = 400
    else:
        attr_name = "list_transactions"
        raise_exc = exceptions.MissingReferenceError("missing")
        expected = 404

    original = getattr(report_routes.bll, attr_name)
    try:
        setattr(report_routes.bll, attr_name, lambda _context: (_ for _ in ()).throw(raise_exc))
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get(f"/reports/{report_endpoint}")
        api_runtime.clear_runtime_context()
    finally:
        setattr(report_routes.bll, attr_name, original)

    assert response.status_code == expected


# edge path
def test_report_endpoints_return_503_when_runtime_context_is_unavailable() -> None:
    """
    GIVEN runtime context dependency has not been initialized
    WHEN report endpoints are requested
    THEN API returns 503 indicating temporary service dependency unavailability
    """
    from caad_erp.api.app import create_app
    from caad_erp.api import runtime as api_runtime
    from fastapi.testclient import TestClient

    app = create_app(skip_lifespan=True)
    api_runtime.clear_runtime_context()
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/reports/stock")

    assert response.status_code == 503
    assert response.json()["error_type"] == "RuntimeError"


def test_report_endpoints_map_unexpected_exceptions_to_sanitized_500_response() -> None:
    """
    GIVEN unexpected internal failures inside report endpoint execution
    WHEN request handling raises uncaught exceptions
    THEN global catch-all returns sanitized 500 payload without internals
    """
    from caad_erp.api.routes import reports as report_routes

    original_inventory = report_routes.bll.calculate_inventory
    try:
        report_routes.bll.calculate_inventory = lambda _context: (_ for _ in ()).throw(TypeError("boom"))
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/reports/stock")
        api_runtime.clear_runtime_context()
    finally:
        report_routes.bll.calculate_inventory = original_inventory

    assert response.status_code == 500
    assert response.json()["code"] == "internal_server_error"
