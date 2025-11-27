"""FastAPI application factory and configuration.

This module provides the ``create_app`` factory function that builds the
FastAPI application instance with all middleware and routes configured.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import health

APP_TITLE = "CAAD ERP API"
APP_DESCRIPTION = (
    "A headless HTTP API for the CAAD ERP system. "
    "Intended for local network operation only."
)
APP_VERSION = "0.1.0"


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance.

    Returns:
        FastAPI: The configured application ready to serve requests.
    """
    app = FastAPI(
        title=APP_TITLE,
        description=APP_DESCRIPTION,
        version=APP_VERSION,
    )

    # Configure CORS for local development
    # Allow all origins for local network use cases
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routes
    app.include_router(health.router)

    return app
