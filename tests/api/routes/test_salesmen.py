import pytest

from caad_erp import dal, exceptions


# happy path
@pytest.mark.parametrize("include_inactive", [False, True])
def test_list_salesmen_returns_filtered_salesman_collection(include_inactive: bool) -> None:
    """
    GIVEN salesman records exist with active and inactive variants
    WHEN GET /salesmen is called with include_inactive filter values
    THEN response returns SalesmanListResponse honoring requested visibility rules
    """
    from caad_erp.api.routes import salesmen as salesmen_routes

    recorded: dict[str, object] = {}

    def _fake_list_salesmen(_context, *, include_inactive: bool = False):
        recorded["include_inactive"] = include_inactive
        return [
            dal.SalesmanRow(
                salesman_id="S001",
                salesman_name="Alice",
                is_active=True,
            )
        ]

    original = salesmen_routes.bll.list_salesmen
    try:
        salesmen_routes.bll.list_salesmen = _fake_list_salesmen
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get(
                "/salesmen", params={"include_inactive": str(include_inactive).lower()}
            )
        api_runtime.clear_runtime_context()
    finally:
        salesmen_routes.bll.list_salesmen = original

    assert response.status_code == 200
    assert recorded["include_inactive"] is include_inactive
    assert response.json()["items"][0]["salesman_id"] == "S001"


def test_create_salesman_returns_201_and_standard_response_with_salesman_data() -> None:
    """
    GIVEN a valid salesman creation payload
    WHEN POST /salesmen is called
    THEN endpoint returns 201 and wrapped SalesmanResponse in StandardResponse.data
    """
    from caad_erp.api.routes import salesmen as salesmen_routes

    def _fake_add_salesman(_context, _command):
        return dal.SalesmanRow(
            salesman_id="S010",
            salesman_name="Bob",
            is_active=True,
        )

    original = salesmen_routes.bll.add_salesman
    try:
        salesmen_routes.bll.add_salesman = _fake_add_salesman
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/salesmen",
                json={
                    "salesman_id": "S010",
                    "salesman_name": "Bob",
                    "is_active": True,
                },
            )
        api_runtime.clear_runtime_context()
    finally:
        salesmen_routes.bll.add_salesman = original

    assert response.status_code == 201
    assert response.json()["data"]["salesman_id"] == "S010"


def test_deactivate_salesman_returns_updated_salesman_with_is_active_false() -> None:
    """
    GIVEN an existing active salesman id
    WHEN POST /salesmen/{salesman_id}/deactivate is called
    THEN response indicates success and returned salesman reflects inactive state
    """
    from caad_erp.api.routes import salesmen as salesmen_routes

    def _fake_update_salesman(_context, _command):
        return dal.SalesmanRow(
            salesman_id="S100",
            salesman_name="Carol",
            is_active=False,
        )

    original = salesmen_routes.bll.update_salesman
    try:
        salesmen_routes.bll.update_salesman = _fake_update_salesman
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/salesmen/S100/deactivate")
        api_runtime.clear_runtime_context()
    finally:
        salesmen_routes.bll.update_salesman = original

    assert response.status_code == 200
    assert response.json()["data"]["is_active"] is False


# sad path
@pytest.mark.parametrize(
    "invalid_payload_case",
    [
        "blank_salesman_id",
        "blank_salesman_name",
    ],
)
def test_create_salesman_rejects_validation_errors_with_422(invalid_payload_case: str) -> None:
    """
    GIVEN malformed salesman payload violating DTO constraints
    WHEN POST /salesmen is called
    THEN API returns 422 with standardized validation_error payload
    """
    payloads = {
        "blank_salesman_id": {
            "salesman_id": "",
            "salesman_name": "Alice",
        },
        "blank_salesman_name": {
            "salesman_id": "S001",
            "salesman_name": "",
        },
    }
    from caad_erp.api.app import create_app
    from caad_erp.api import runtime as api_runtime
    from fastapi.testclient import TestClient

    app = create_app(skip_lifespan=True)
    api_runtime.set_runtime_context(object())
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post("/salesmen", json=payloads[invalid_payload_case])
    api_runtime.clear_runtime_context()

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_create_salesman_maps_duplicate_id_to_409_conflict() -> None:
    """
    GIVEN BLL add_salesman raises BusinessRuleViolation for duplicate id
    WHEN POST /salesmen is called
    THEN API returns 409 conflict with structured domain error response
    """
    from caad_erp.api.routes import salesmen as salesmen_routes

    def _raise_duplicate(_context, _command):
        raise exceptions.BusinessRuleViolation("duplicate")

    original = salesmen_routes.bll.add_salesman
    try:
        salesmen_routes.bll.add_salesman = _raise_duplicate
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/salesmen",
                json={
                    "salesman_id": "S001",
                    "salesman_name": "Alice",
                },
            )
        api_runtime.clear_runtime_context()
    finally:
        salesmen_routes.bll.add_salesman = original

    assert response.status_code == 409
    assert response.json()["error_type"] == "BusinessRuleViolation"


def test_deactivate_salesman_returns_404_when_salesman_is_missing() -> None:
    """
    GIVEN a salesman id not present in storage
    WHEN POST /salesmen/{salesman_id}/deactivate is called
    THEN endpoint returns 404 via MissingReferenceError mapping
    """
    from caad_erp.api.routes import salesmen as salesmen_routes

    def _missing(_context, _command):
        raise exceptions.MissingReferenceError("missing")

    original = salesmen_routes.bll.update_salesman
    try:
        salesmen_routes.bll.update_salesman = _missing
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/salesmen/UNKNOWN/deactivate")
        api_runtime.clear_runtime_context()
    finally:
        salesmen_routes.bll.update_salesman = original

    assert response.status_code == 404
    assert response.json()["error_type"] == "MissingReferenceError"


# edge path
def test_salesmen_endpoints_return_503_when_runtime_context_is_unavailable() -> None:
    """
    GIVEN runtime context dependency is not initialized
    WHEN salesmen endpoints are requested
    THEN API returns 503 using centralized runtime dependency error handling
    """
    from caad_erp.api.app import create_app
    from caad_erp.api import runtime as api_runtime
    from fastapi.testclient import TestClient

    app = create_app(skip_lifespan=True)
    api_runtime.clear_runtime_context()
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/salesmen")

    assert response.status_code == 503
    assert response.json()["error_type"] == "RuntimeError"
