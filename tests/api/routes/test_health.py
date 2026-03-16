from fastapi.testclient import TestClient


def test_health_endpoint_returns_expected_status_payload() -> None:
    """
    GIVEN the API application is running
    WHEN GET /health is requested
    THEN response is 200 with stable healthy status and service message fields
    """
    from caad_erp.api.app import create_app

    app = create_app(skip_lifespan=True)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert payload["message"] == "CAAD ERP API is running"
