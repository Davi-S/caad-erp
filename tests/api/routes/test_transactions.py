import pytest
from decimal import Decimal

from caad_erp import constants, dal, exceptions


def _sample_transaction(transaction_type: str = constants.TransactionType.SALE.value) -> dal.TransactionRow:
    return dal.TransactionRow(
        transaction_id="TX001",
        timestamp_iso="2026-01-01T00:00:00+00:00",
        transaction_type=transaction_type,
        product_id="P001",
        salesman_id="S001",
        payment_type=constants.PaymentType.CASH.value,
        quantity_change=Decimal("-1"),
        total_revenue=Decimal("5.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes=None,
    )


# happy path
@pytest.mark.parametrize(
    "endpoint_name",
    [
        "sale",
        "restock",
        "write_off",
        "void",
        "pay_debt",
    ],
)
def test_transaction_mutation_endpoints_return_201_and_standard_response(endpoint_name: str) -> None:
    """
    GIVEN valid payloads for each transaction mutation endpoint
    WHEN corresponding /transactions route is called
    THEN response is 201 with transaction data wrapped in StandardResponse
    """
    from caad_erp.api.routes import transactions as tx_routes

    endpoint_to_patch = {
        "sale": "record_sale",
        "restock": "record_restock",
        "write_off": "record_write_off",
        "void": "record_void",
        "pay_debt": "record_credit_payment",
    }
    endpoint_to_url = {
        "sale": "/transactions/sale",
        "restock": "/transactions/restock",
        "write_off": "/transactions/write-off",
        "void": "/transactions/void",
        "pay_debt": "/transactions/pay-debt",
    }
    payloads = {
        "sale": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
            "total_revenue": "5.00",
            "payment_type": constants.PaymentType.CASH.value,
        },
        "restock": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
            "total_cost": "2.00",
        },
        "write_off": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
        },
        "void": {
            "linked_transaction_id": "TXBASE",
        },
        "pay_debt": {
            "linked_transaction_id": "TXBASE",
            "salesman_id": "S001",
            "total_revenue": "2.00",
            "payment_type": constants.PaymentType.CASH.value,
        },
    }

    attr_name = endpoint_to_patch[endpoint_name]
    original = getattr(tx_routes.bll, attr_name)
    try:
        setattr(tx_routes.bll, attr_name, lambda _context, _command: _sample_transaction())
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(endpoint_to_url[endpoint_name], json=payloads[endpoint_name])
        api_runtime.clear_runtime_context()
    finally:
        setattr(tx_routes.bll, attr_name, original)

    assert response.status_code == 201
    assert response.json()["data"]["transaction_id"] == "TX001"


@pytest.mark.parametrize(
    "endpoint_name",
    [
        "sale",
        "restock",
        "write_off",
        "void",
        "pay_debt",
    ],
)
def test_transaction_mutation_endpoints_persist_context_after_success(endpoint_name: str) -> None:
    """
    GIVEN successful transaction mutation handler execution
    WHEN endpoint decorated by mutating_endpoint returns
    THEN persistence is invoked exactly once through the decorator layer
    """
    from caad_erp.api.routes import transactions as tx_routes
    from caad_erp.api import persistence as persistence_module

    endpoint_to_patch = {
        "sale": "record_sale",
        "restock": "record_restock",
        "write_off": "record_write_off",
        "void": "record_void",
        "pay_debt": "record_credit_payment",
    }
    endpoint_to_url = {
        "sale": "/transactions/sale",
        "restock": "/transactions/restock",
        "write_off": "/transactions/write-off",
        "void": "/transactions/void",
        "pay_debt": "/transactions/pay-debt",
    }
    payloads = {
        "sale": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
            "total_revenue": "5.00",
            "payment_type": constants.PaymentType.CASH.value,
        },
        "restock": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
            "total_cost": "2.00",
        },
        "write_off": {
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": "1",
        },
        "void": {
            "linked_transaction_id": "TXBASE",
        },
        "pay_debt": {
            "linked_transaction_id": "TXBASE",
            "salesman_id": "S001",
            "total_revenue": "2.00",
            "payment_type": constants.PaymentType.CASH.value,
        },
    }

    attr_name = endpoint_to_patch[endpoint_name]
    original = getattr(tx_routes.bll, attr_name)
    original_persist = persistence_module.bll.persist_context
    persisted: list[object] = []
    try:
        setattr(tx_routes.bll, attr_name, lambda _context, _command: _sample_transaction())
        persistence_module.bll.persist_context = lambda context: persisted.append(context)

        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context("ctx")
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(endpoint_to_url[endpoint_name], json=payloads[endpoint_name])
        api_runtime.clear_runtime_context()
    finally:
        setattr(tx_routes.bll, attr_name, original)
        persistence_module.bll.persist_context = original_persist

    assert response.status_code == 201
    assert persisted == ["ctx"]


# sad path
@pytest.mark.parametrize(
    "validation_case",
    [
        "sale_invalid_quantity",
        "sale_negative_revenue",
        "restock_invalid_quantity",
        "restock_negative_cost",
        "write_off_invalid_quantity",
        "void_blank_linked_id",
        "pay_debt_blank_salesman",
        "pay_debt_on_credit_payment_type",
        "pay_debt_negative_revenue",
    ],
)
def test_transaction_endpoints_reject_invalid_payloads_with_422(validation_case: str) -> None:
    """
    GIVEN malformed transaction payloads violating request schema constraints
    WHEN POST /transactions/* endpoints are called
    THEN API returns 422 with standardized validation error metadata
    """
    payloads = {
        "sale_invalid_quantity": (
            "/transactions/sale",
            {
                "product_id": "P001",
                "salesman_id": "S001",
                "quantity": "0",
                "total_revenue": "5.00",
                "payment_type": constants.PaymentType.CASH.value,
            },
        ),
        "sale_negative_revenue": (
            "/transactions/sale",
            {
                "product_id": "P001",
                "salesman_id": "S001",
                "quantity": "1",
                "total_revenue": "-1.00",
                "payment_type": constants.PaymentType.CASH.value,
            },
        ),
        "restock_invalid_quantity": (
            "/transactions/restock",
            {
                "product_id": "P001",
                "salesman_id": "S001",
                "quantity": "0",
                "total_cost": "1.00",
            },
        ),
        "restock_negative_cost": (
            "/transactions/restock",
            {
                "product_id": "P001",
                "salesman_id": "S001",
                "quantity": "1",
                "total_cost": "-1.00",
            },
        ),
        "write_off_invalid_quantity": (
            "/transactions/write-off",
            {
                "product_id": "P001",
                "salesman_id": "S001",
                "quantity": "0",
            },
        ),
        "void_blank_linked_id": (
            "/transactions/void",
            {
                "linked_transaction_id": "",
            },
        ),
        "pay_debt_blank_salesman": (
            "/transactions/pay-debt",
            {
                "linked_transaction_id": "TX001",
                "salesman_id": "",
                "total_revenue": "1.00",
                "payment_type": constants.PaymentType.CASH.value,
            },
        ),
        "pay_debt_on_credit_payment_type": (
            "/transactions/pay-debt",
            {
                "linked_transaction_id": "TX001",
                "salesman_id": "S001",
                "total_revenue": "1.00",
                "payment_type": constants.PaymentType.ON_CREDIT.value,
            },
        ),
        "pay_debt_negative_revenue": (
            "/transactions/pay-debt",
            {
                "linked_transaction_id": "TX001",
                "salesman_id": "S001",
                "total_revenue": "-1.00",
                "payment_type": constants.PaymentType.CASH.value,
            },
        ),
    }

    endpoint, payload = payloads[validation_case]
    from caad_erp.api.app import create_app
    from caad_erp.api import runtime as api_runtime
    from fastapi.testclient import TestClient

    app = create_app(skip_lifespan=True)
    api_runtime.set_runtime_context(object())
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(endpoint, json=payload)
    api_runtime.clear_runtime_context()

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


@pytest.mark.parametrize(
    "domain_error_case",
    [
        "missing_product_reference",
        "missing_salesman_reference",
        "missing_linked_transaction",
        "inactive_product",
        "inactive_salesman",
        "void_ineligible_transaction",
        "credit_payment_invalid_link",
    ],
)
def test_transaction_endpoints_map_domain_errors_to_http_contract(domain_error_case: str) -> None:
    """
    GIVEN BLL workflows raise domain exceptions while processing transaction mutations
    WHEN transaction endpoints execute
    THEN centralized handlers map failures to 404 409 or 400 response contracts
    """
    from caad_erp.api.routes import transactions as tx_routes

    if domain_error_case in {"missing_product_reference", "missing_salesman_reference", "missing_linked_transaction"}:
        exc = exceptions.MissingReferenceError("missing")
        expected = 404
    elif domain_error_case in {"inactive_product", "inactive_salesman", "void_ineligible_transaction", "credit_payment_invalid_link"}:
        exc = exceptions.BusinessRuleViolation("rule")
        expected = 409
    else:
        exc = ValueError("bad")
        expected = 400

    original_sale = tx_routes.bll.record_sale
    try:
        tx_routes.bll.record_sale = lambda _context, _command: (_ for _ in ()).throw(exc)
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/transactions/sale",
                json={
                    "product_id": "P001",
                    "salesman_id": "S001",
                    "quantity": "1",
                    "total_revenue": "5.00",
                    "payment_type": constants.PaymentType.CASH.value,
                },
            )
        api_runtime.clear_runtime_context()
    finally:
        tx_routes.bll.record_sale = original_sale

    assert response.status_code == expected


# edge path
def test_transaction_endpoints_return_503_when_runtime_context_is_unavailable() -> None:
    """
    GIVEN runtime context singleton has not been initialized
    WHEN transaction endpoints are invoked
    THEN requests fail with 503 runtime dependency error mapping
    """
    from caad_erp.api.app import create_app
    from caad_erp.api import runtime as api_runtime
    from fastapi.testclient import TestClient

    app = create_app(skip_lifespan=True)
    api_runtime.clear_runtime_context()
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            "/transactions/sale",
            json={
                "product_id": "P001",
                "salesman_id": "S001",
                "quantity": "1",
                "total_revenue": "5.00",
                "payment_type": constants.PaymentType.CASH.value,
            },
        )

    assert response.status_code == 503
    assert response.json()["error_type"] == "RuntimeError"


def test_transaction_endpoints_map_unexpected_exceptions_to_500() -> None:
    """
    GIVEN an unexpected exception escapes endpoint execution path
    WHEN any transaction endpoint processes the request
    THEN catch-all handler returns sanitized 500 internal_server_error payload
    """
    from caad_erp.api.routes import transactions as tx_routes

    original_sale = tx_routes.bll.record_sale
    try:
        tx_routes.bll.record_sale = lambda _context, _command: (_ for _ in ()).throw(TypeError("boom"))
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/transactions/sale",
                json={
                    "product_id": "P001",
                    "salesman_id": "S001",
                    "quantity": "1",
                    "total_revenue": "5.00",
                    "payment_type": constants.PaymentType.CASH.value,
                },
            )
        api_runtime.clear_runtime_context()
    finally:
        tx_routes.bll.record_sale = original_sale

    assert response.status_code == 500
    assert response.json()["code"] == "internal_server_error"
