"""Server entry point for running the CAAD ERP API.

This module provides the ``run_server`` and ``main`` functions for starting
the FastAPI server using uvicorn.
"""

import uvicorn

from .app import create_app

DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8000


def run_server(
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> None:
    """Start the API server.

    Args:
        host: The host address to bind to. Defaults to "0.0.0.0" to allow
              connections from other devices on the local network.
        port: The port to listen on. Defaults to 8000.
    """
    app = create_app()
    uvicorn.run(app, host=host, port=port)


def main() -> None:
    """Entry point for the caad-erp-api console script."""
    run_server()
