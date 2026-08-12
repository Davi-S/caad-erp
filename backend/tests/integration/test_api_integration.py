from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from caad_erp import bll, constants
from caad_erp.api import app as api_app
from caad_erp.api import runtime as api_runtime


def _create_product(
    client: TestClient,
    product_id: str,
    *,
    sell_price: int = 1000,
    is_active: bool = True,
) -> dict:
    response = client.post(
        "/products",
        json={
            "product_id": product_id,
            "product_name": f"Product {product_id}",
            "sell_price": sell_price,
            "is_active": is_active,
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def _create_salesman(
    client: TestClient,
    salesman_id: str,
    *,
    is_active: bool = True,
) -> dict:
    response = client.post(
        "/salesmen",
        json={
            "salesman_id": salesman_id,
            "salesman_name": f"Salesman {salesman_id}",
            "is_active": is_active,
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


@pytest.fixture
def api_client(initialized_context: bll.RuntimeContext):
    application = api_app.create_app(skip_lifespan=True)
    api_runtime.set_runtime_context(initialized_context)
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client
    api_runtime.clear_runtime_context()


# happy path
def test_health_endpoint_returns_healthy_status_contract(
    api_client: TestClient,
) -> None:
    """
    GIVEN the FastAPI application is bootstrapped with runtime context initialized
    WHEN GET /health is called through an HTTP test client
    THEN the response is 200 and contains the stable health payload contract
    """
    response = api_client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert payload["message"] == "CAAD ERP API is running"


def test_products_flow_create_list_and_deactivate_roundtrip(
    api_client: TestClient,
) -> None:
    """
    GIVEN an API client and an initially clean product catalog
    WHEN a product is created listed and then deactivated via products endpoints
    THEN each response follows schema contract and state transitions persist end-to-end
    """
    created = _create_product(api_client, "API-P001")
    list_response = api_client.get("/products")
    deactivate_response = api_client.patch(
        "/products/API-P001", json={"is_active": False}
    )
    all_list_after_deactivation = api_client.get("/products")

    assert created["product_id"] == "API-P001"
    assert list_response.status_code == 200
    assert any(
        item["product_id"] == "API-P001" for item in list_response.json()["items"]
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["data"]["is_active"] is False
    assert any(
        (item["product_id"] == "API-P001" and not item["is_active"])
        for item in all_list_after_deactivation.json()["items"]
    )


def test_bulk_sale_end_to_end_flow(api_client: TestClient) -> None:
    """
    GIVEN an API client with products and salesman initialized
    WHEN POST /transactions/bulk-sale is called with multiple items
    THEN bulk transactions are recorded, inventory is updated, and log report includes all sales
    """
    _create_product(api_client, "BULK-API-P1")
    _create_product(api_client, "BULK-API-P2")
    _create_salesman(api_client, "BULK-API-S1")
    api_client.post(
        "/transactions/restock",
        json={
            "product_id": "BULK-API-P1",
            "salesman_id": "BULK-API-S1",
            "quantity": 10,
            "total_cost": 1000,
        },
    )
    api_client.post(
        "/transactions/restock",
        json={
            "product_id": "BULK-API-P2",
            "salesman_id": "BULK-API-S1",
            "quantity": 10,
            "total_cost": 1000,
        },
    )

    bulk_response = api_client.post(
        "/transactions/bulk-sale",
        json={
            "items": [
                {
                    "product_id": "BULK-API-P1",
                    "salesman_id": "BULK-API-S1",
                    "quantity": 3,
                    "total_revenue": 3000,
                    "payment_type": constants.PaymentType.CASH.value,
                    "notes": "E2E Bulk 1",
                },
                {
                    "product_id": "BULK-API-P2",
                    "salesman_id": "BULK-API-S1",
                    "quantity": 2,
                    "total_revenue": 2000,
                    "payment_type": constants.PaymentType.CASH.value,
                    "notes": "E2E Bulk 2",
                },
            ]
        },
    )

    assert bulk_response.status_code == 201
    log_response = api_client.get("/reports/log")
    assert log_response.status_code == 200
    txs = log_response.json()["transactions"]
    e2e_txs = [
        tx
        for tx in txs
        if tx["salesman_id"] == "BULK-API-S1"
        and tx["transaction_type"] == constants.TransactionType.SALE.value
    ]
    assert len(e2e_txs) == 2


def test_salesmen_flow_create_list_and_deactivate_roundtrip(
    api_client: TestClient,
) -> None:
    """
    GIVEN an API client and baseline salesman records
    WHEN a salesman is created listed and deactivated
    THEN responses are successful
    """
    created = _create_salesman(api_client, "API-S001")
    list_response = api_client.get("/salesmen")
    deactivate_response = api_client.patch(
        "/salesmen/API-S001", json={"is_active": False}
    )
    all_list_after_deactivation = api_client.get("/salesmen")

    assert created["salesman_id"] == "API-S001"
    assert list_response.status_code == 200
    assert any(
        item["salesman_id"] == "API-S001" for item in list_response.json()["items"]
    )
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["data"]["is_active"] is False
    assert any(
        (item["salesman_id"] == "API-S001" and not item["is_active"])
        for item in all_list_after_deactivation.json()["items"]
    )


@pytest.mark.parametrize(
    "transaction_endpoint",
    [
        "sale",
        "restock",
        "write-off",
        "void",
        "pay-debt",
    ],
)
def test_transaction_mutation_endpoints_create_transaction_records(
    api_client: TestClient,
    transaction_endpoint: str,
) -> None:
    """
    GIVEN valid preconditions and payloads for each transaction mutation route
    WHEN POST /transactions/{transaction_endpoint} is executed
    THEN endpoint returns 201 and the created transaction appears in downstream reports
    """
    _create_product(api_client, "API-PTX")
    _create_salesman(api_client, "API-STX")
    api_client.post(
        "/transactions/restock",
        json={
            "product_id": "API-PTX",
            "salesman_id": "API-STX",
            "quantity": 100,
            "total_cost": 10000,
        },
    )

    payload_by_endpoint = {
        "sale": {
            "product_id": "API-PTX",
            "salesman_id": "API-STX",
            "quantity": "2",
            "total_revenue": "20.00",
            "payment_type": constants.PaymentType.CASH.value,
            "notes": "sale tx",
        },
        "restock": {
            "product_id": "API-PTX",
            "salesman_id": "API-STX",
            "quantity": "4",
            "total_cost": "8.00",
            "notes": "restock tx",
        },
        "write-off": {
            "product_id": "API-PTX",
            "salesman_id": "API-STX",
            "quantity": "1",
            "notes": "write off tx",
        },
    }

    if transaction_endpoint == "void":
        baseline = api_client.post(
            "/transactions/restock",
            json={
                "product_id": "API-PTX",
                "salesman_id": "API-STX",
                "quantity": "3",
                "total_cost": "5.00",
                "notes": "to be voided",
            },
        )
        assert baseline.status_code == 201
        linked_id = baseline.json()["data"]["transaction_id"]
        payload = {"linked_transaction_id": linked_id, "notes": "void tx"}
    elif transaction_endpoint == "pay-debt":
        credit_sale = api_client.post(
            "/transactions/sale",
            json={
                "product_id": "API-PTX",
                "salesman_id": "API-STX",
                "quantity": "2",
                "total_revenue": "0.00",
                "payment_type": constants.PaymentType.ON_CREDIT.value,
                "notes": "credit sale",
            },
        )
        assert credit_sale.status_code == 201
        linked_id = credit_sale.json()["data"]["transaction_id"]
        payload = {
            "linked_transaction_id": linked_id,
            "salesman_id": "API-STX",
            "total_revenue": "5.00",
            "payment_type": constants.PaymentType.CASH.value,
            "notes": "debt payment",
        }
    else:
        payload = payload_by_endpoint[transaction_endpoint]

    response = api_client.post(f"/transactions/{transaction_endpoint}", json=payload)
    assert response.status_code == 201
    created_id = response.json()["data"]["transaction_id"]

    log_response = api_client.get("/reports/log")
    assert log_response.status_code == 200
    assert any(
        row["transaction_id"] == created_id
        for row in log_response.json()["transactions"]
    )


@pytest.mark.parametrize(
    "report_endpoint",
    [
        "stock",
        "profit",
        "debts",
        "log",
    ],
)
def test_report_endpoints_return_consistent_http_contracts(
    api_client: TestClient,
    report_endpoint: str,
) -> None:
    """
    GIVEN a deterministic sequence of setup operations producing reportable data
    WHEN GET /reports/{report_endpoint} is requested
    THEN response is 200 and payload shape plus core values match BLL expectations
    """
    _create_product(api_client, "API-REP-P")
    _create_salesman(api_client, "API-REP-S")

    restock_response = api_client.post(
        "/transactions/restock",
        json={
            "product_id": "API-REP-P",
            "salesman_id": "API-REP-S",
            "quantity": 5,
            "total_cost": 1000,
        },
    )
    sale_response = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "API-REP-P",
            "salesman_id": "API-REP-S",
            "quantity": 2,
            "total_revenue": 2000,
            "payment_type": constants.PaymentType.CASH.value,
        },
    )
    credit_sale_response = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "API-REP-P",
            "salesman_id": "API-REP-S",
            "quantity": 1,
            "total_revenue": 0,
            "payment_type": constants.PaymentType.ON_CREDIT.value,
        },
    )
    assert restock_response.status_code == 201
    assert sale_response.status_code == 201
    assert credit_sale_response.status_code == 201

    response = api_client.get(f"/reports/{report_endpoint}")
    assert response.status_code == 200
    payload = response.json()

    if report_endpoint == "stock":
        item = next(i for i in payload["items"] if i["product_id"] == "API-REP-P")
        assert item["quantity"] == 2
    elif report_endpoint == "profit":
        assert payload["total_revenue"] == 2000
        assert payload["total_cost"] == -1000
        assert payload["profit"] == 1000
    elif report_endpoint == "debts":
        assert payload["total_outstanding"] == 1000
        assert len(payload["balances"]) == 1
    else:
        assert len(payload["transactions"]) >= 3


def test_api_mutations_persist_state_visible_after_app_restart(
    initialized_context: bll.RuntimeContext,
    integration_config_path: Path,
) -> None:
    """
    GIVEN successful mutating requests made through the API layer
    WHEN the app lifecycle is restarted and resources are reloaded from disk
    THEN previously mutated data remains visible via subsequent API reads
    """
    first_app = api_app.create_app(skip_lifespan=True)
    api_runtime.set_runtime_context(initialized_context)
    with TestClient(first_app) as client:
        created = _create_product(client, "API-PERSIST-001")
    api_runtime.clear_runtime_context()

    reloaded_context = bll.load_context(integration_config_path)
    second_app = api_app.create_app(skip_lifespan=True)
    api_runtime.set_runtime_context(reloaded_context)
    with TestClient(second_app) as client:
        list_response = client.get("/products", params={"include_inactive": "true"})
    api_runtime.clear_runtime_context()

    assert created["product_id"] == "API-PERSIST-001"
    assert list_response.status_code == 200
    assert any(
        item["product_id"] == "API-PERSIST-001"
        for item in list_response.json()["items"]
    )


# sad path
@pytest.mark.parametrize(
    "invalid_request_case",
    [
        "create_product_missing_required_fields",
        "create_salesman_blank_identifier",
        "sale_negative_quantity",
        "restock_negative_cost",
        "void_missing_linked_transaction_id",
        "pay_debt_on_credit_payment_type",
    ],
)
def test_api_returns_422_for_invalid_request_payloads(
    api_client: TestClient,
    invalid_request_case: str,
) -> None:
    """
    GIVEN malformed request payloads violating pydantic schema constraints
    WHEN corresponding API endpoints are invoked
    THEN API returns 422 with standardized validation_error metadata and details
    """
    request_map = {
        "create_product_missing_required_fields": ("/products", {}),
        "create_salesman_blank_identifier": (
            "/salesmen",
            {"salesman_id": "", "salesman_name": "Blank", "is_active": True},
        ),
        "sale_negative_quantity": (
            "/transactions/sale",
            {
                "product_id": "ANY-P",
                "salesman_id": "ANY-S",
                "quantity": -1,
                "total_revenue": 500,
                "payment_type": constants.PaymentType.CASH.value,
            },
        ),
        "restock_negative_cost": (
            "/transactions/restock",
            {
                "product_id": "ANY-P",
                "salesman_id": "ANY-S",
                "quantity": 1,
                "total_cost": -1,
            },
        ),
        "void_missing_linked_transaction_id": (
            "/transactions/void",
            {"linked_transaction_id": ""},
        ),
        "pay_debt_on_credit_payment_type": (
            "/transactions/pay-debt",
            {
                "linked_transaction_id": "TX-UNKNOWN",
                "salesman_id": "ANY-S",
                "total_revenue": 200,
                "payment_type": constants.PaymentType.ON_CREDIT.value,
            },
        ),
    }

    endpoint, payload = request_map[invalid_request_case]
    response = api_client.post(endpoint, json=payload)
    body = response.json()

    assert response.status_code == 422
    assert body["code"] == "validation_error"
    assert body["error_type"] == "RequestValidationError"
    assert isinstance(body["errors"], list)


@pytest.mark.parametrize(
    "missing_reference_case",
    [
        "deactivate_unknown_product",
        "deactivate_unknown_salesman",
        "sale_unknown_product",
        "sale_unknown_salesman",
        "pay_debt_unknown_linked_transaction",
    ],
)
def test_api_maps_missing_references_to_404(
    api_client: TestClient,
    missing_reference_case: str,
) -> None:
    """
    GIVEN endpoint operations that reference ids absent from workbook state
    WHEN those operations are requested through the API
    THEN response status is 404 with error payload mapped by global handlers
    """
    if missing_reference_case == "deactivate_unknown_product":
        response = api_client.patch("/products/UNKNOWN-P", json={"is_active": False})
    elif missing_reference_case == "deactivate_unknown_salesman":
        response = api_client.patch("/products/UNKNOWN-S", json={"is_active": False})
    elif missing_reference_case == "sale_unknown_product":
        _create_salesman(api_client, "MR-S001")
        response = api_client.post(
            "/transactions/sale",
            json={
                "product_id": "UNKNOWN-P",
                "salesman_id": "MR-S001",
                "quantity": 1,
                "total_revenue": 500,
                "payment_type": constants.PaymentType.CASH.value,
            },
        )
    elif missing_reference_case == "sale_unknown_salesman":
        _create_product(api_client, "MR-P001")
        _create_salesman(api_client, "MR-S001")
        api_client.post(
            "/transactions/restock",
            json={
                "product_id": "MR-P001",
                "salesman_id": "MR-S001",
                "quantity": 10,
                "total_cost": 1000,
            },
        )
        response = api_client.post(
            "/transactions/sale",
            json={
                "product_id": "MR-P001",
                "salesman_id": "UNKNOWN-S",
                "quantity": 1,
                "total_revenue": 500,
                "payment_type": constants.PaymentType.CASH.value,
            },
        )
    else:
        _create_salesman(api_client, "MR-S002")
        response = api_client.post(
            "/transactions/pay-debt",
            json={
                "linked_transaction_id": "UNKNOWN-TX",
                "salesman_id": "MR-S002",
                "total_revenue": 300,
                "payment_type": constants.PaymentType.CASH.value,
            },
        )

    body = response.json()
    assert response.status_code == 404
    assert body["code"] == "missingreferenceerror"
    assert body["error_type"] == "MissingReferenceError"


@pytest.mark.parametrize(
    "business_rule_case",
    [
        "create_duplicate_product",
        "create_duplicate_salesman",
        "sale_inactive_product",
        "restock_inactive_salesman",
        "void_ineligible_transaction_type",
    ],
)
def test_api_maps_business_rule_violations_to_409(
    api_client: TestClient,
    business_rule_case: str,
) -> None:
    """
    GIVEN validly shaped requests that violate domain business rules
    WHEN API endpoints delegate to BLL and business rule errors occur
    THEN response status is 409 with structured domain-error response body
    """
    if business_rule_case == "create_duplicate_product":
        _create_product(api_client, "BR-P001")
        response = api_client.post(
            "/products",
            json={
                "product_id": "BR-P001",
                "product_name": "Duplicate",
                "sell_price": 200,
                "is_active": True,
            },
        )
    elif business_rule_case == "create_duplicate_salesman":
        _create_salesman(api_client, "BR-S001")
        response = api_client.post(
            "/salesmen",
            json={
                "salesman_id": "BR-S001",
                "salesman_name": "Duplicate",
                "is_active": True,
            },
        )
    elif business_rule_case == "sale_inactive_product":
        _create_product(api_client, "BR-P002", is_active=False)
        _create_salesman(api_client, "BR-S002")
        response = api_client.post(
            "/transactions/sale",
            json={
                "product_id": "BR-P002",
                "salesman_id": "BR-S002",
                "quantity": 1,
                "total_revenue": 500,
                "payment_type": constants.PaymentType.CASH.value,
            },
        )
    elif business_rule_case == "restock_inactive_salesman":
        _create_product(api_client, "BR-P003")
        _create_salesman(api_client, "BR-S003", is_active=False)
        response = api_client.post(
            "/transactions/restock",
            json={
                "product_id": "BR-P003",
                "salesman_id": "BR-S003",
                "quantity": 2,
                "total_cost": 300,
            },
        )
    else:
        _create_product(api_client, "BR-P004")
        _create_salesman(api_client, "BR-S004")
        restock = api_client.post(
            "/transactions/restock",
            json={
                "product_id": "BR-P004",
                "salesman_id": "BR-S004",
                "quantity": 2,
                "total_cost": 500,
            },
        )
        assert restock.status_code == 201
        restock_id = restock.json()["data"]["transaction_id"]
        first_void = api_client.post(
            "/transactions/void",
            json={"linked_transaction_id": restock_id},
        )
        assert first_void.status_code == 201
        void_id = first_void.json()["data"]["transaction_id"]
        response = api_client.post(
            "/transactions/void",
            json={"linked_transaction_id": void_id},
        )

    body = response.json()
    assert response.status_code == 409
    assert body["code"] == "businessruleviolation"
    assert body["error_type"] == "BusinessRuleViolation"


def test_api_maps_domain_and_validation_failures_without_internal_crash(
    api_client: TestClient,
) -> None:
    """
    GIVEN real endpoint execution with invalid and missing references
    WHEN request handling applies centralized exception mapping
    THEN API returns expected non-500 status codes and stable error payload contracts
    """
    missing_reference = api_client.patch("/products/UNKNOWN", json={"is_active": False})
    validation_error = api_client.post(
        "/products",
        json={"product_id": "", "product_name": "x", "sell_price": 100},
    )

    assert missing_reference.status_code == 404
    assert missing_reference.json()["error_type"] == "MissingReferenceError"
    assert validation_error.status_code == 422
    assert validation_error.json()["code"] == "validation_error"


# edge path
def test_api_returns_503_when_runtime_context_is_not_initialized() -> None:
    """
    GIVEN application routes are exercised without initialized runtime singleton
    WHEN an endpoint requiring runtime context dependency is called
    THEN response is 503 indicating temporary runtime dependency unavailability
    """
    application = api_app.create_app(skip_lifespan=True)
    api_runtime.clear_runtime_context()
    with TestClient(application) as client:
        response = client.get("/products")

    payload = response.json()
    assert response.status_code == 503
    assert payload["code"] == "runtimeerror"
    assert payload["error_type"] == "RuntimeError"


def test_reports_remain_consistent_after_interleaved_mutations_and_reads(
    api_client: TestClient,
) -> None:
    """
    GIVEN a long-lived API session with interleaved writes and report reads
    WHEN stock profit debts and log endpoints are requested repeatedly
    THEN observed report values remain internally consistent with transaction history
    """
    _create_product(api_client, "CONS-P001", sell_price=1000)
    _create_salesman(api_client, "CONS-S001")

    restock_response = api_client.post(
        "/transactions/restock",
        json={
            "product_id": "CONS-P001",
            "salesman_id": "CONS-S001",
            "quantity": 10,
            "total_cost": 1500,
        },
    )
    assert restock_response.status_code == 201

    sale_response = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "CONS-P001",
            "salesman_id": "CONS-S001",
            "quantity": 3,
            "total_revenue": 3000,
            "payment_type": constants.PaymentType.CASH.value,
        },
    )
    assert sale_response.status_code == 201

    stock_after_sale = api_client.get("/reports/stock")
    profit_after_sale = api_client.get("/reports/profit")
    assert stock_after_sale.status_code == 200
    assert profit_after_sale.status_code == 200

    write_off_response = api_client.post(
        "/transactions/write-off",
        json={
            "product_id": "CONS-P001",
            "salesman_id": "CONS-S001",
            "quantity": 2,
        },
    )
    assert write_off_response.status_code == 201

    credit_sale_response = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "CONS-P001",
            "salesman_id": "CONS-S001",
            "quantity": 1,
            "total_revenue": 0,
            "payment_type": constants.PaymentType.ON_CREDIT.value,
        },
    )
    assert credit_sale_response.status_code == 201

    stock_final = api_client.get("/reports/stock")
    profit_final = api_client.get("/reports/profit")
    debts_final = api_client.get("/reports/debts")
    log_final = api_client.get("/reports/log")

    assert stock_final.status_code == 200
    assert profit_final.status_code == 200
    assert debts_final.status_code == 200
    assert log_final.status_code == 200

    stock_item = next(
        item
        for item in stock_final.json()["items"]
        if item["product_id"] == "CONS-P001"
    )
    assert stock_item["quantity"] == 4

    profit_payload = profit_final.json()
    assert profit_payload["total_revenue"] == 3000
    assert profit_payload["total_cost"] == -1500
    assert profit_payload["profit"] == 1500

    debts_payload = debts_final.json()
    assert debts_payload["total_outstanding"] == 1000
    assert len(debts_payload["balances"]) == 1

    transaction_types = {
        tx["transaction_type"] for tx in log_final.json()["transactions"]
    }
    assert constants.TransactionType.RESTOCK.value in transaction_types
    assert constants.TransactionType.SALE.value in transaction_types
    assert constants.TransactionType.WRITE_OFF.value in transaction_types


def test_master_workbook_download_integration_flow(api_client: TestClient) -> None:
    """
    GIVEN an API client with active product, salesman, and transaction entries
    WHEN GET /reports/workbook is requested
    THEN downloadable binary matches current master workbook state across all sheets
    """
    import io

    import openpyxl

    _create_product(api_client, "INT-WB-P1", sell_price=1500)
    _create_salesman(api_client, "INT-WB-S1")

    restock_res = api_client.post(
        "/transactions/restock",
        json={
            "product_id": "INT-WB-P1",
            "salesman_id": "INT-WB-S1",
            "quantity": 10,
            "total_cost": 1000,
        },
    )
    assert restock_res.status_code == 201

    sale_res = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "INT-WB-P1",
            "salesman_id": "INT-WB-S1",
            "quantity": 1,
            "total_revenue": 1500,
            "payment_type": constants.PaymentType.CASH.value,
        },
    )
    assert sale_res.status_code == 201

    download_res = api_client.get("/reports/workbook")
    assert download_res.status_code == 200
    assert (
        download_res.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    wb = openpyxl.load_workbook(io.BytesIO(download_res.content))

    # Verify product sheet contains new product
    products_ws = wb["Products"]
    prod_ids = [cell.value for cell in products_ws["A"][1:]]
    assert "INT-WB-P1" in prod_ids

    # Verify salesman sheet contains new salesman
    salesmen_ws = wb["Salesmen"]
    salesman_ids = [cell.value for cell in salesmen_ws["A"][1:]]
    assert "INT-WB-S1" in salesman_ids

    # Verify transaction log contains sale
    tx_ws = wb["TransactionLog"]
    tx_product_ids = [cell.value for cell in tx_ws["D"][1:]]
    assert "INT-WB-P1" in tx_product_ids
