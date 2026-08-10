import io
import urllib.error
import unittest.mock
from fastapi.testclient import TestClient

from caad_erp.api import app as app_module


def test_proxy_mercado_pago_forwards_successful_response() -> None:
    """
    GIVEN a valid request to /api-mp/v1/payments
    WHEN proxy_mercado_pago executes
    THEN it forwards headers and body to Mercado Pago and returns the response
    """
    app = app_module.create_app(skip_lifespan=True)
    mock_resp = unittest.mock.MagicMock()
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.read.return_value = b'{"id": 12345, "status": "pending"}'
    mock_resp.status = 201
    mock_resp.headers = {"content-type": "application/json"}

    with unittest.mock.patch("urllib.request.urlopen", return_value=mock_resp):
        with TestClient(app) as client:
            response = client.post(
                "/api-mp/v1/payments",
                json={"transaction_amount": 10.0},
                headers={"Authorization": "Bearer TEST_TOKEN"},
            )

    assert response.status_code == 201
    assert response.json()["id"] == 12345


def test_proxy_mercado_pago_handles_http_error() -> None:
    """
    GIVEN Mercado Pago returns an HTTPError (e.g. 400 Bad Request)
    WHEN proxy_mercado_pago executes
    THEN it returns the upstream status code and error details
    """
    app = app_module.create_app(skip_lifespan=True)
    mock_error = urllib.error.HTTPError(
        url="https://api.mercadopago.com/v1/payments",
        code=400,
        msg="Bad Request",
        hdrs={"content-type": "application/json"},
        fp=io.BytesIO(b'{"message": "Invalid payment data"}'),
    )

    with unittest.mock.patch("urllib.request.urlopen", side_effect=mock_error):
        with TestClient(app) as client:
            response = client.post("/api-mp/v1/payments", json={})

    assert response.status_code == 400
    assert response.json()["message"] == "Invalid payment data"


def test_proxy_mercado_pago_handles_generic_exception() -> None:
    """
    GIVEN a network failure or generic exception connecting to Mercado Pago
    WHEN proxy_mercado_pago executes
    THEN it returns 502 Bad Gateway
    """
    app = app_module.create_app(skip_lifespan=True)
    with unittest.mock.patch("urllib.request.urlopen", side_effect=RuntimeError("DNS lookup failed")):
        with TestClient(app) as client:
            response = client.get("/api-mp/v1/payments/123")

    assert response.status_code == 502
    assert "Bad Gateway" in response.json()["error"]


def test_proxy_mercado_pago_handles_options_preflight() -> None:
    """
    GIVEN an OPTIONS preflight request to /api-mp/v1/payments
    WHEN proxy_mercado_pago executes
    THEN it returns 200 OK with permissive CORS headers directly
    """
    app = app_module.create_app(skip_lifespan=True)
    with TestClient(app) as client:
        response = client.options("/api-mp/v1/payments")

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    assert "POST" in response.headers["Access-Control-Allow-Methods"]

