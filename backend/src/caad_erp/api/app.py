"""FastAPI application factory and configuration.

This module provides the ``create_app`` factory function that builds the
FastAPI application instance with all middleware and routes configured.
"""

import contextlib
import importlib.metadata
import logging
import pathlib
import typing as t

import fastapi
import fastapi.middleware.cors
import fastapi.responses

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


def _get_frontend_dist_dir() -> pathlib.Path:
    """Resolve the default frontend/dist directory relative to the repository root."""
    backend_dir = pathlib.Path(__file__).resolve().parents[3]
    return backend_dir.parent / "frontend" / "dist"


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


def create_app(
    *,
    skip_lifespan: bool = False,
    serve_static: bool = False,
    static_dir: pathlib.Path | None = None,
) -> fastapi.FastAPI:
    """Create and configure the FastAPI application instance.

    Args:
        skip_lifespan: If True, skip the lifespan handler. Useful for testing
            routes without initializing the full runtime context.
        serve_static: If True, mount static frontend assets from frontend/dist
            and provide Single Page Application (SPA) routing fallback.
        static_dir: Optional explicit directory path to static assets. Defaults
            to frontend/dist in the workspace.

    Returns:
        FastAPI: The configured application ready to serve requests.

    Raises:
        FileNotFoundError: If serve_static is True but frontend/dist (or index.html)
            is missing.
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

    # Register API routes
    app.include_router(routes.router)

    # Register global exception handlers
    errors.register_handlers(app)

    # Mount static assets and SPA catch-all fallback if requested
    if serve_static:
        dist_dir = (static_dir or _get_frontend_dist_dir()).resolve()
        if not dist_dir.exists() or not (dist_dir / "index.html").exists():
            raise FileNotFoundError(
                f"frontend/dist directory not found at '{dist_dir}'. "
                "Please build the frontend assets first by running 'npm run build:frontend'."
            )

        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str) -> fastapi.responses.FileResponse:
            target = dist_dir / full_path
            if full_path and target.is_file():
                return fastapi.responses.FileResponse(target)
            return fastapi.responses.FileResponse(dist_dir / "index.html")

    return app
