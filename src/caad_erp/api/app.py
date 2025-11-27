"""FastAPI application factory and configuration.

This module provides the ``create_app`` factory function that builds the
FastAPI application instance with all middleware and routes configured.
"""

import importlib.metadata

import fastapi
import fastapi.middleware.cors

from . import routes

APP_TITLE = "CAAD ERP API"
APP_DESCRIPTION = (
    "A headless HTTP API for the CAAD ERP system. "
    "Intended for local network operation only."
)


def _get_app_version() -> str:
    """Get the application version from package metadata."""
    try:
        return importlib.metadata.version("caad-erp")
    except Exception:
        return "0.0.0"


def create_app() -> fastapi.FastAPI:
    """Create and configure the FastAPI application instance.

    Returns:
        FastAPI: The configured application ready to serve requests.
    """
    app = fastapi.FastAPI(
        title=APP_TITLE,
        description=APP_DESCRIPTION,
        version=_get_app_version(),
    )

    # Configure CORS for local development/local network use
    # Allow all origins without credentials for maximum compatibility
    # Since this API is intended for local network only, this is acceptable
    app.add_middleware(
        fastapi.middleware.cors.CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routes
    app.include_router(routes.router)

    return app
