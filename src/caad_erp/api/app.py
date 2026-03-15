"""FastAPI application factory and configuration.

This module provides the ``create_app`` factory function that builds the
FastAPI application instance with all middleware and routes configured.
"""

import contextlib
import importlib.metadata
import logging
import typing as t

import fastapi
import fastapi.middleware.cors

from caad_erp import bll

from . import errors, routes, runtime

logger = logging.getLogger(__name__)

APP_TITLE = "CAAD ERP API"
APP_DESCRIPTION = (
    "A headless HTTP API for the CAAD ERP system. "
    "Intended for local network operation only."
)


def _get_app_version() -> str:
    """Get the application version from package metadata."""
    return importlib.metadata.version("caad-erp")


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI) -> t.AsyncIterator[None]:
    """Manage application lifecycle events.

    This context manager initializes the RuntimeContext singleton on startup
    and ensures proper cleanup on shutdown.
    """
    # Startup: Initialize RuntimeContext
    logger.info("Initializing RuntimeContext...")
    try:
        context = bll.load_context()
        bll.ensure_schema_version(context)
        runtime.set_runtime_context(context)
        logger.info("RuntimeContext initialized successfully")
    except Exception:
        logger.exception("Failed to initialize RuntimeContext")
        raise

    yield

    # Shutdown: Clean up resources
    logger.info("Shutting down RuntimeContext...")
    runtime.clear_runtime_context()
    logger.info("RuntimeContext shutdown complete")


def create_app(*, skip_lifespan: bool = False) -> fastapi.FastAPI:
    """Create and configure the FastAPI application instance.

    Args:
        skip_lifespan: If True, skip the lifespan handler. Useful for testing
            routes without initializing the full runtime context.

    Returns:
        FastAPI: The configured application ready to serve requests.
    """
    app = fastapi.FastAPI(
        title=APP_TITLE,
        description=APP_DESCRIPTION,
        version=_get_app_version(),
        lifespan=None if skip_lifespan else lifespan,
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

    # Register global exception handlers
    errors.register_handlers(app)

    return app
