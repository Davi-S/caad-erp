import logging
import sys

import uvicorn

from . import app

logger = logging.getLogger(__name__)

DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000


def run_server(
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    serve_static: bool = False,
) -> None:
    """Start the API server.

    Args:
        host: The host address to bind to. Defaults to "0.0.0.0" to allow
              connections from other devices on the local network.
        port: The port to listen on. Defaults to 8000.
        serve_static: Whether to serve built static frontend assets.
    """
    try:
        application = app.create_app(serve_static=serve_static)
    except FileNotFoundError as exc:
        logger.error(str(exc))
        sys.exit(1)

    uvicorn.run(application, host=host, port=port)


def main_api() -> None:
    """Entry point for the caad-erp-api console script (API only)."""
    run_server(serve_static=False)


def main_full() -> None:
    """Entry point for the caad-erp console script (Full app: API + static frontend)."""
    run_server(serve_static=True)


def main() -> None:
    """Entry point for legacy API console script invocations."""
    main_api()

