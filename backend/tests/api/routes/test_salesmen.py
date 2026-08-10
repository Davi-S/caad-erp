from fastapi.testclient import TestClient

# happy path


def test_list_salesmen_returns_all_salesman_collection(
    api_client: TestClient,
) -> None:
    """
    GIVEN salesman records exist with active and inactive variants
    WHEN GET /salesmen is called
    THEN response returns SalesmanListResponse with all salesmen
    """
    create_active = api_client.post(
        "/salesmen",
        json={
            "salesman_id": "S001",
            "salesman_name": "Alice",
            "is_active": True,
        },
    )
    create_inactive = api_client.post(
        "/salesmen",
        json={
            "salesman_id": "S002",
            "salesman_name": "Bob",
            "is_active": False,
        },
    )
    assert create_active.status_code == 201
    assert create_inactive.status_code == 201

    all_response = api_client.get("/salesmen")

    all_ids = {item["salesman_id"] for item in all_response.json()["items"]}

    assert all_response.status_code == 200
    assert "S001" in all_ids
    assert "S002" in all_ids


def test_create_salesman_returns_201_and_standard_response_with_salesman_data(
    api_client: TestClient,
) -> None:
    """
    GIVEN a valid salesman creation payload
    WHEN POST /salesmen is called
    THEN endpoint returns 201 and wrapped SalesmanResponse in StandardResponse.data
    """
    response = api_client.post(
        "/salesmen",
        json={
            "salesman_id": "S010",
            "salesman_name": "Carol",
            "is_active": True,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["detail"] == "Salesman created successfully"
    assert payload["data"]["salesman_id"] == "S010"
    assert payload["data"]["salesman_name"] == "Carol"
    assert payload["data"]["is_active"] is True


def test_deactivate_salesman_returns_updated_salesman_with_is_active_false(
    api_client: TestClient,
) -> None:
    """
    GIVEN an existing active salesman id
    WHEN PATCH /salesmen/{salesman_id} is called
    THEN response indicates success and returned salesman reflects inactive state
    """
    create_response = api_client.post(
        "/salesmen",
        json={
            "salesman_id": "S100",
            "salesman_name": "Dan",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201

    deactivate_response = api_client.patch("/salesmen/S100", json={"is_active": False})
    all_products = api_client.get("/salesmen")

    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["data"]["is_active"] is False
    assert any(
        (item["salesman_id"] == "S100" and not item["is_active"])
        for item in all_products.json()["items"]
    )


# sad path


def test_create_salesman_rejects_validation_errors_with_422(
    api_client: TestClient,
) -> None:
    """
    GIVEN malformed salesman payload violating DTO constraints
    WHEN POST /salesmen is called
    THEN API returns 422 with standardized validation_error payload
    """
    invalid_payloads = [
        {"salesman_id": "", "salesman_name": "Alice"},
        {"salesman_id": "S001", "salesman_name": ""},
    ]

    for payload in invalid_payloads:
        response = api_client.post("/salesmen", json=payload)
        assert response.status_code == 422
        assert response.json()["code"] == "validation_error"


def test_create_salesman_maps_duplicate_id_to_409_conflict(
    api_client: TestClient,
) -> None:
    """
    GIVEN BLL add_salesman raises BusinessRuleViolation for duplicate id
    WHEN POST /salesmen is called
    THEN API returns 409 conflict with structured domain error response
    """
    first = api_client.post(
        "/salesmen",
        json={
            "salesman_id": "SX01",
            "salesman_name": "Eve",
            "is_active": True,
        },
    )
    duplicate = api_client.post(
        "/salesmen",
        json={
            "salesman_id": "SX01",
            "salesman_name": "Eve Duplicate",
            "is_active": True,
        },
    )

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["error_type"] == "BusinessRuleViolation"


def test_deactivate_salesman_returns_404_when_salesman_is_missing(
    api_client: TestClient,
) -> None:
    """
    GIVEN a salesman id not present in storage
    WHEN POST /salesmen/{salesman_id}/deactivate is called
    THEN endpoint returns 404 via MissingReferenceError mapping
    """
    response = api_client.patch("/salesmen/UNKNOWN", json={"is_active": False})

    assert response.status_code == 404
    assert response.json()["error_type"] == "MissingReferenceError"


# edge path


def test_salesmen_endpoints_return_503_when_runtime_context_is_unavailable(
    api_client_without_runtime: TestClient,
) -> None:
    """
    GIVEN runtime context dependency is not initialized
    WHEN salesmen endpoints are requested
    THEN API returns 503 using centralized runtime dependency error handling
    """
    response = api_client_without_runtime.get("/salesmen")

    assert response.status_code == 503
    assert response.json()["error_type"] == "RuntimeError"
