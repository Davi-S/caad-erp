import logging
import socket
import sys

import uvicorn

from . import app

logger = logging.getLogger(__name__)

DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000


def _get_local_ip() -> str | None:
    """Attempt to discover the primary local network IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


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

    local_ip = _get_local_ip()
    mode_str = "Full Application" if serve_static else "API Only"
    print(f"\n  CAAD ERP ({mode_str}) is running at:")
    print(f"  - Local:   http://localhost:{port}/")
    if local_ip:
        print(f"  - Network: http://{local_ip}:{port}/\n")

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
