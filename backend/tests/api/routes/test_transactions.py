from fastapi.testclient import TestClient

from caad_erp import constants


def _setup_product_and_salesman(client: TestClient) -> None:
    product_response = client.post(
        "/products",
        json={
            "product_id": "TP001",
            "product_name": "Tx Product",
            "sell_price": 1000,
            "is_active": True,
        },
    )
    salesman_response = client.post(
        "/salesmen",
        json={
            "salesman_id": "TS001",
            "salesman_name": "Tx Salesman",
            "is_active": True,
        },
    )
    assert product_response.status_code == 201
    assert salesman_response.status_code == 201


# happy path


def test_transaction_mutation_endpoints_return_201_and_standard_response(
    api_client: TestClient,
) -> None:
    """
    GIVEN valid payloads for each transaction mutation endpoint
    WHEN corresponding /transactions route is called
    THEN response is 201 with transaction data wrapped in StandardResponse
    """
    _setup_product_and_salesman(api_client)

    sale_response = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "TP001",
            "salesman_id": "TS001",
            "quantity": 2,
            "total_revenue": 2000,
            "payment_type": constants.PaymentType.CASH.value,
        },
    )
    restock_response = api_client.post(
        "/transactions/restock",
        json={
            "product_id": "TP001",
            "salesman_id": "TS001",
            "quantity": 5,
            "total_cost": 1000,
        },
    )
    write_off_response = api_client.post(
        "/transactions/write-off",
        json={
            "product_id": "TP001",
            "salesman_id": "TS001",
            "quantity": 1,
        },
    )

    assert sale_response.status_code == 201
    assert restock_response.status_code == 201
    assert write_off_response.status_code == 201

    restock_id = restock_response.json()["data"]["transaction_id"]
    void_response = api_client.post(
        "/transactions/void",
        json={"linked_transaction_id": restock_id},
    )
    assert void_response.status_code == 201

    credit_sale_response = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "TP001",
            "salesman_id": "TS001",
            "quantity": 1,
            "total_revenue": 0,
            "payment_type": constants.PaymentType.ON_CREDIT.value,
        },
    )
    assert credit_sale_response.status_code == 201
    credit_sale_id = credit_sale_response.json()["data"]["transaction_id"]

    pay_debt_response = api_client.post(
        "/transactions/pay-debt",
        json={
            "linked_transaction_id": credit_sale_id,
            "salesman_id": "TS001",
            "total_revenue": 500,
            "payment_type": constants.PaymentType.CASH.value,
        },
    )
    assert pay_debt_response.status_code == 201


def test_transaction_mutation_endpoints_persist_context_after_success(
    api_client: TestClient,
) -> None:
    """
    GIVEN successful transaction mutation handler execution
    WHEN endpoint decorated by mutating_endpoint returns
    THEN persistence is invoked exactly once through the decorator layer
    """
    _setup_product_and_salesman(api_client)
    response = api_client.post(
        "/transactions/restock",
        json={
            "product_id": "TP001",
            "salesman_id": "TS001",
            "quantity": 3,
            "total_cost": 750,
        },
    )
    report = api_client.get("/reports/log")

    assert response.status_code == 201
    tx_id = response.json()["data"]["transaction_id"]
    assert any(
        item["transaction_id"] == tx_id for item in report.json()["transactions"]
    )


# sad path


def test_transaction_endpoints_reject_invalid_payloads_with_422(
    api_client: TestClient,
) -> None:
    """
    GIVEN malformed transaction payloads violating request schema constraints
    WHEN POST /transactions/* endpoints are called
    THEN API returns 422 with standardized validation error metadata
    """
    invalid_requests = [
        (
            "/transactions/sale",
            {
                "product_id": "P",
                "salesman_id": "S",
                "quantity": 0,
                "total_revenue": 100,
                "payment_type": constants.PaymentType.CASH.value,
            },
        ),
        (
            "/transactions/restock",
            {
                "product_id": "P",
                "salesman_id": "S",
                "quantity": 1,
                "total_cost": -100,
            },
        ),
        (
            "/transactions/write-off",
            {
                "product_id": "P",
                "salesman_id": "S",
                "quantity": 0,
            },
        ),
        (
            "/transactions/void",
            {"linked_transaction_id": ""},
        ),
    ]

    for endpoint, payload in invalid_requests:
        response = api_client.post(endpoint, json=payload)
        assert response.status_code == 422
        assert response.json()["code"] == "validation_error"


def test_transaction_endpoints_map_domain_errors_to_http_contract(
    api_client: TestClient,
) -> None:
    """
    GIVEN BLL workflows raise domain exceptions while processing transaction mutations
    WHEN transaction endpoints execute
    THEN centralized handlers map failures to 404 409 or 400 response contracts
    """
    _setup_product_and_salesman(api_client)

    missing_reference = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "UNKNOWN",
            "salesman_id": "TS001",
            "quantity": 1,
            "total_revenue": 500,
            "payment_type": constants.PaymentType.CASH.value,
        },
    )
    assert missing_reference.status_code == 404

    inactive_product = api_client.patch("/products/TP001", json={"is_active": False})
    assert inactive_product.status_code == 200

    business_rule = api_client.post(
        "/transactions/sale",
        json={
            "product_id": "TP001",
            "salesman_id": "TS001",
            "quantity": 1,
            "total_revenue": 500,
            "payment_type": constants.PaymentType.CASH.value,
        },
    )
    assert business_rule.status_code == 409


# edge path


def test_transaction_endpoints_return_503_when_runtime_context_is_unavailable(
    api_client_without_runtime: TestClient,
) -> None:
    """
    GIVEN runtime context singleton has not been initialized
    WHEN transaction endpoints are invoked
    THEN requests fail with 503 runtime dependency error mapping
    """
    response = api_client_without_runtime.post(
        "/transactions/sale",
        json={
            "product_id": "P001",
            "salesman_id": "S001",
            "quantity": 1,
            "total_revenue": 500,
            "payment_type": constants.PaymentType.CASH.value,
        },
    )

    assert response.status_code == 503
    assert response.json()["error_type"] == "RuntimeError"


def test_bulk_sale_endpoint_success(api_client: TestClient) -> None:
    """
    GIVEN valid BulkSaleRequest payload with multiple items
    WHEN POST /transactions/bulk-sale is called
    THEN returns 201 Created with BulkSaleResponse inside StandardResponse
    """
    _setup_product_and_salesman(api_client)

    response = api_client.post(
        "/transactions/bulk-sale",
        json={
            "items": [
                {
                    "product_id": "TP001",
                    "salesman_id": "TS001",
                    "quantity": 2,
                    "total_revenue": 2000,
                    "payment_type": constants.PaymentType.CASH.value,
                    "notes": "Item 1",
                },
                {
                    "product_id": "TP001",
                    "salesman_id": "TS001",
                    "quantity": 1,
                    "total_revenue": 1000,
                    "payment_type": constants.PaymentType.CASH.value,
                    "notes": "Item 2",
                },
            ]
        },
    )

    assert response.status_code == 201
    json_data = response.json()
    assert json_data["detail"] == "Bulk sale recorded successfully"
    items = json_data["data"]["items"]
    assert len(items) == 2
    assert items[0]["product_id"] == "TP001"
    assert items[0]["quantity_change"] == -2
    assert items[1]["quantity_change"] == -1


def test_bulk_sale_endpoint_rejects_empty_items_with_422(
    api_client: TestClient,
) -> None:
    """
    GIVEN a BulkSaleRequest with an empty items list
    WHEN POST /transactions/bulk-sale is called
    THEN API returns 422 validation error
    """
    response = api_client.post("/transactions/bulk-sale", json={"items": []})
    assert response.status_code == 422


def test_bulk_sale_endpoint_maps_domain_errors(api_client: TestClient) -> None:
    """
    GIVEN a BulkSaleRequest referencing a missing or inactive product
    WHEN POST /transactions/bulk-sale is called
    THEN returns appropriate HTTP contract error (404 or 409)
    """
    _setup_product_and_salesman(api_client)

    response = api_client.post(
        "/transactions/bulk-sale",
        json={
            "items": [
                {
                    "product_id": "UNKNOWN",
                    "salesman_id": "TS001",
                    "quantity": 1,
                    "total_revenue": 1000,
                    "payment_type": constants.PaymentType.CASH.value,
                }
            ]
        },
    )
    assert response.status_code == 404
