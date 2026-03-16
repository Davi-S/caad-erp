import pytest
from decimal import Decimal

from caad_erp import dal, exceptions


# happy path
@pytest.mark.parametrize("include_inactive", [False, True])
def test_list_products_returns_filtered_product_collection(include_inactive: bool) -> None:
    """
    GIVEN product records exist with active and inactive variants
    WHEN GET /products is called with include_inactive filter values
    THEN response returns ProductListResponse honoring requested visibility rules
    """
    from caad_erp.api.routes import products as products_routes

    recorded: dict[str, object] = {}

    def _fake_list_products(_context, *, include_inactive: bool = False):
        recorded["include_inactive"] = include_inactive
        return [
            dal.ProductRow(
                product_id="P001",
                product_name="Soda",
                sell_price=Decimal("2.50"),
                is_active=True,
            )
        ]

    original = products_routes.bll.list_products
    try:
        products_routes.bll.list_products = _fake_list_products
        from caad_erp.api.app import create_app
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        from caad_erp.api import runtime as api_runtime

        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get(
                "/products", params={"include_inactive": str(include_inactive).lower()}
            )
        api_runtime.clear_runtime_context()
    finally:
        products_routes.bll.list_products = original

    assert response.status_code == 200
    assert recorded["include_inactive"] is include_inactive
    assert response.json()["items"][0]["product_id"] == "P001"


def test_create_product_returns_201_and_standard_response_with_product_data() -> None:
    """
    GIVEN a valid product creation payload
    WHEN POST /products is called
    THEN endpoint returns 201 and wrapped ProductResponse in StandardResponse.data
    """
    from caad_erp.api.routes import products as products_routes

    def _fake_add_product(_context, _command):
        return dal.ProductRow(
            product_id="P010",
            product_name="Juice",
            sell_price=Decimal("3.75"),
            is_active=True,
        )

    original = products_routes.bll.add_product
    try:
        products_routes.bll.add_product = _fake_add_product
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/products",
                json={
                    "product_id": "P010",
                    "product_name": "Juice",
                    "sell_price": "3.75",
                    "is_active": True,
                },
            )
        api_runtime.clear_runtime_context()
    finally:
        products_routes.bll.add_product = original

    assert response.status_code == 201
    payload = response.json()
    assert payload["detail"] == "Product created successfully"
    assert payload["data"]["product_id"] == "P010"


def test_deactivate_product_returns_updated_product_with_is_active_false() -> None:
    """
    GIVEN an existing active product id
    WHEN POST /products/{product_id}/deactivate is called
    THEN response indicates success and returned product reflects inactive state
    """
    from caad_erp.api.routes import products as products_routes

    def _fake_update_product(_context, _command):
        return dal.ProductRow(
            product_id="P100",
            product_name="Water",
            sell_price=Decimal("1.00"),
            is_active=False,
        )

    original = products_routes.bll.update_product
    try:
        products_routes.bll.update_product = _fake_update_product
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/products/P100/deactivate")
        api_runtime.clear_runtime_context()
    finally:
        products_routes.bll.update_product = original

    assert response.status_code == 200
    assert response.json()["data"]["is_active"] is False


# sad path
@pytest.mark.parametrize(
    "invalid_payload_case",
    [
        "blank_product_id",
        "blank_product_name",
        "negative_sell_price",
    ],
)
def test_create_product_rejects_validation_errors_with_422(invalid_payload_case: str) -> None:
    """
    GIVEN malformed product payload violating DTO constraints
    WHEN POST /products is called
    THEN API returns 422 with standardized validation_error payload
    """
    payloads = {
        "blank_product_id": {
            "product_id": "",
            "product_name": "Soda",
            "sell_price": "1.00",
        },
        "blank_product_name": {
            "product_id": "P001",
            "product_name": "",
            "sell_price": "1.00",
        },
        "negative_sell_price": {
            "product_id": "P001",
            "product_name": "Soda",
            "sell_price": "-1.00",
        },
    }
    from caad_erp.api.app import create_app
    from caad_erp.api import runtime as api_runtime
    from fastapi.testclient import TestClient

    app = create_app(skip_lifespan=True)
    api_runtime.set_runtime_context(object())
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post("/products", json=payloads[invalid_payload_case])
    api_runtime.clear_runtime_context()

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


@pytest.mark.parametrize(
    "domain_error_case",
    [
        "duplicate_product_id",
        "invalid_business_rule",
    ],
)
def test_create_product_maps_domain_failures_to_expected_error_codes(domain_error_case: str) -> None:
    """
    GIVEN BLL product creation raises domain exceptions
    WHEN POST /products is executed
    THEN error mapping returns consistent HTTP status and structured error body
    """
    from caad_erp.api.routes import products as products_routes

    def _raise_business(_context, _command):
        raise exceptions.BusinessRuleViolation("duplicate")

    def _raise_value(_context, _command):
        raise ValueError("invalid")

    original = products_routes.bll.add_product
    try:
        products_routes.bll.add_product = (
            _raise_business if domain_error_case == "duplicate_product_id" else _raise_value
        )
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/products",
                json={
                    "product_id": "P001",
                    "product_name": "Soda",
                    "sell_price": "1.00",
                },
            )
        api_runtime.clear_runtime_context()
    finally:
        products_routes.bll.add_product = original

    assert response.status_code == (409 if domain_error_case == "duplicate_product_id" else 400)


def test_deactivate_product_returns_404_when_product_is_missing() -> None:
    """
    GIVEN a product id not present in storage
    WHEN POST /products/{product_id}/deactivate is called
    THEN endpoint returns 404 via MissingReferenceError mapping
    """
    from caad_erp.api.routes import products as products_routes

    def _missing(_context, _command):
        raise exceptions.MissingReferenceError("missing")

    original = products_routes.bll.update_product
    try:
        products_routes.bll.update_product = _missing
        from caad_erp.api.app import create_app
        from caad_erp.api import runtime as api_runtime
        from fastapi.testclient import TestClient

        app = create_app(skip_lifespan=True)
        api_runtime.set_runtime_context(object())
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/products/UNKNOWN/deactivate")
        api_runtime.clear_runtime_context()
    finally:
        products_routes.bll.update_product = original

    assert response.status_code == 404
    assert response.json()["error_type"] == "MissingReferenceError"


# edge path
def test_products_endpoints_return_503_when_runtime_context_is_unavailable() -> None:
    """
    GIVEN runtime context dependency is not initialized
    WHEN products endpoints are requested
    THEN API returns 503 using centralized runtime dependency error handling
    """
    from caad_erp.api.app import create_app
    from caad_erp.api import runtime as api_runtime
    from fastapi.testclient import TestClient

    app = create_app(skip_lifespan=True)
    api_runtime.clear_runtime_context()
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/products")

    assert response.status_code == 503
    assert response.json()["error_type"] == "RuntimeError"
