from fastapi.testclient import TestClient


# happy path

def test_list_products_returns_filtered_product_collection(
    api_client: TestClient,
) -> None:
    """
    GIVEN product records exist with active and inactive variants
    WHEN GET /products is called with include_inactive filter values
    THEN response returns ProductListResponse honoring requested visibility rules
    """
    create_active = api_client.post(
        "/products",
        json={
            "product_id": "P001",
            "product_name": "Soda",
            "sell_price": "2.50",
            "is_active": True,
        },
    )
    create_inactive = api_client.post(
        "/products",
        json={
            "product_id": "P002",
            "product_name": "Juice",
            "sell_price": "3.25",
            "is_active": False,
        },
    )
    assert create_active.status_code == 201
    assert create_inactive.status_code == 201

    active_only = api_client.get("/products")
    with_inactive = api_client.get(
        "/products", params={"include_inactive": "true"})

    active_ids = {item["product_id"] for item in active_only.json()["items"]}
    all_ids = {item["product_id"] for item in with_inactive.json()["items"]}

    assert active_only.status_code == 200
    assert with_inactive.status_code == 200
    assert "P001" in active_ids
    assert "P002" not in active_ids
    assert {"P001", "P002"}.issubset(all_ids)


def test_create_product_returns_201_and_standard_response_with_product_data(
    api_client: TestClient,
) -> None:
    """
    GIVEN a valid product creation payload
    WHEN POST /products is called
    THEN endpoint returns 201 and wrapped ProductResponse in StandardResponse.data
    """
    response = api_client.post(
        "/products",
        json={
            "product_id": "P010",
            "product_name": "Water",
            "sell_price": "1.25",
            "is_active": True,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["detail"] == "Product created successfully"
    assert payload["data"]["product_id"] == "P010"
    assert payload["data"]["product_name"] == "Water"
    assert payload["data"]["sell_price"] == "1.25"
    assert payload["data"]["is_active"] is True


def test_deactivate_product_returns_updated_product_with_is_active_false(
    api_client: TestClient,
) -> None:
    """
    GIVEN an existing active product id
    WHEN POST /products/{product_id}/deactivate is called
    THEN response indicates success and returned product reflects inactive state
    """
    create_response = api_client.post(
        "/products",
        json={
            "product_id": "P100",
            "product_name": "Energy",
            "sell_price": "4.50",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201

    deactivate_response = api_client.post("/products/P100/deactivate")
    active_only = api_client.get("/products")
    with_inactive = api_client.get(
        "/products", params={"include_inactive": "true"})

    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["data"]["is_active"] is False
    assert all(item["product_id"] !=
               "P100" for item in active_only.json()["items"])
    assert any(item["product_id"] ==
               "P100" for item in with_inactive.json()["items"])


# sad path

def test_create_product_rejects_validation_errors_with_422(
    api_client: TestClient,
) -> None:
    """
    GIVEN malformed product payload violating DTO constraints
    WHEN POST /products is called
    THEN API returns 422 with standardized validation_error payload
    """
    invalid_payloads = [
        {"product_id": "", "product_name": "Soda", "sell_price": "1.00"},
        {"product_id": "P001", "product_name": "", "sell_price": "1.00"},
        {"product_id": "P001", "product_name": "Soda", "sell_price": "-1.00"},
    ]

    for payload in invalid_payloads:
        response = api_client.post("/products", json=payload)
        assert response.status_code == 422
        assert response.json()["code"] == "validation_error"


def test_create_product_maps_domain_failures_to_expected_error_codes(
    api_client: TestClient,
) -> None:
    """
    GIVEN BLL product creation raises domain exceptions
    WHEN POST /products is executed
    THEN error mapping returns consistent HTTP status and structured error body
    """
    first = api_client.post(
        "/products",
        json={
            "product_id": "PX01",
            "product_name": "Cola",
            "sell_price": "2.00",
            "is_active": True,
        },
    )
    duplicate = api_client.post(
        "/products",
        json={
            "product_id": "PX01",
            "product_name": "Cola Duplicate",
            "sell_price": "2.50",
            "is_active": True,
        },
    )

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["error_type"] == "BusinessRuleViolation"


def test_deactivate_product_returns_404_when_product_is_missing(
    api_client: TestClient,
) -> None:
    """
    GIVEN a product id not present in storage
    WHEN POST /products/{product_id}/deactivate is called
    THEN endpoint returns 404 via MissingReferenceError mapping
    """
    response = api_client.post("/products/UNKNOWN/deactivate")

    assert response.status_code == 404
    assert response.json()["error_type"] == "MissingReferenceError"


# edge path

def test_products_endpoints_return_503_when_runtime_context_is_unavailable(
    api_client_without_runtime: TestClient,
) -> None:
    """
    GIVEN runtime context dependency is not initialized
    WHEN products endpoints are requested
    THEN API returns 503 using centralized runtime dependency error handling
    """
    response = api_client_without_runtime.get("/products")

    assert response.status_code == 503
    assert response.json()["error_type"] == "RuntimeError"
