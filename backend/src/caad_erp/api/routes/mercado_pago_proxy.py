"""Mercado Pago reverse proxy router.

This module provides a server-side proxy route for forwarding requests to the
Mercado Pago API, preventing browser CORS restrictions during local network operation
and single-process deployment.
"""

import logging
import urllib.error
import urllib.request

import fastapi
import fastapi.responses

logger = logging.getLogger(__name__)

router = fastapi.APIRouter(prefix="/api-mp", tags=["MercadoPago Proxy"])

MP_TARGET_HOST = "https://api.mercadopago.com"


@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    include_in_schema=False,
)
async def proxy_mercado_pago(
    request: fastapi.Request, path: str
) -> fastapi.responses.Response:
    """Forward requests to Mercado Pago API.

    Args:
        request: The incoming FastAPI request.
        path: Path parameter appended to the Mercado Pago base URL.

    Returns:
        fastapi.responses.Response: The response received from Mercado Pago.
    """
    # Respond to CORS OPTIONS preflight directly without forwarding to Mercado Pago
    if request.method == "OPTIONS":
        return fastapi.responses.Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Idempotency-Key, Accept",
            },
        )

    url = f"{MP_TARGET_HOST}/{path}"
    body = await request.body()

    # Forward necessary client headers to Mercado Pago
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    for key, val in request.headers.items():
        key_lower = key.lower()
        if key_lower in (
            "authorization",
            "content-type",
            "x-idempotency-key",
            "accept",
        ):
            headers[key] = val

    req = urllib.request.Request(
        url=url,
        data=body if body else None,
        headers=headers,
        method=request.method,
    )

    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read()
            status_code = int(getattr(resp, "status", getattr(resp, "code", 200)))
            content_type = resp.headers.get("content-type", "application/json")
            return fastapi.responses.Response(
                content=resp_body,
                status_code=status_code,
                media_type=content_type,
            )
    except urllib.error.HTTPError as err:
        err_body = err.read()
        content_type = err.headers.get("content-type", "application/json")
        return fastapi.responses.Response(
            content=err_body,
            status_code=err.code,
            media_type=content_type,
        )
    except Exception as exc:
        logger.exception("Mercado Pago proxy failure for path: %s", path)
        return fastapi.responses.JSONResponse(
            status_code=502,
            content={"error": f"Bad Gateway forwarding to Mercado Pago: {exc!s}"},
        )
