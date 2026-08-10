from pathlib import Path

import fastapi
from fastapi.testclient import TestClient

from caad_erp.api import app as app_module
from caad_erp.api import runtime as api_runtime

import unittest.mock
import pytest

# happy path


def test_get_app_version_reads_installed_package_metadata() -> None:
    """
    GIVEN the caad-erp package metadata is available in the environment
    WHEN _get_app_version is called
    THEN it returns a non-empty semantic version string
    """
    version = app_module._get_app_version()

    assert isinstance(version, str)
    assert version


def test_create_app_builds_fastapi_instance_with_expected_metadata() -> None:
    """
    GIVEN application metadata constants and route registry
    WHEN create_app is called
    THEN it returns a configured FastAPI app with expected descriptive fields
    """
    app = app_module.create_app(skip_lifespan=True)

    assert isinstance(app, fastapi.FastAPI)
    assert app.title == app_module.APP_TITLE
    assert app.description == app_module.APP_DESCRIPTION
    assert isinstance(app.version, str)
    assert app.version


def test_create_app_registers_routers_and_global_exception_handlers() -> None:
    """
    GIVEN route modules and exception handler specifications
    WHEN create_app is called
    THEN aggregated routers and error handlers are attached to the app
    """
    app = app_module.create_app(skip_lifespan=True)
    route_paths = {route.path for route in app.routes}

    assert "/health" in route_paths
    assert "/products" in route_paths
    assert "/salesmen" in route_paths
    assert "/transactions/sale" in route_paths
    assert "/reports/stock" in route_paths
    assert Exception in app.exception_handlers


def test_create_app_configures_cors_for_local_network_usage() -> None:
    """
    GIVEN the API is designed for local network access
    WHEN create_app is built
    THEN CORS middleware is configured with permissive local-network settings
    """
    app = app_module.create_app(skip_lifespan=True)
    cors_middleware = next(
        middleware
        for middleware in app.user_middleware
        if middleware.cls.__name__ == "CORSMiddleware"
    )

    assert cors_middleware.kwargs["allow_origins"] == ["*"]
    assert cors_middleware.kwargs["allow_credentials"] is False
    assert cors_middleware.kwargs["allow_methods"] == ["*"]
    assert cors_middleware.kwargs["allow_headers"] == ["*"]


# sad path


def test_skip_lifespan_mode_does_not_require_runtime_startup() -> None:
    """
    GIVEN skip_lifespan mode for lightweight route testing
    WHEN create_app is called with skip_lifespan set to true
    THEN application serves non-runtime endpoints without startup initialization
    """
    api_runtime.clear_runtime_context()
    app = app_module.create_app(skip_lifespan=True)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/health")

    assert response.status_code == 200


def test_lifespan_startup_logs_and_raises_on_initialization_failure() -> None:
    """
    GIVEN an environment where BLL context initialization fails
    WHEN the app lifespan executes
    THEN the exception is caught, logged, and re-raised
    """
    # Arrange
    app = app_module.create_app(skip_lifespan=False)

    # Act / Assert
    with unittest.mock.patch(
        "caad_erp.api.app.bll.load_context",
        side_effect=RuntimeError("simulated config error"),
    ):
        with pytest.raises(RuntimeError, match="simulated config error"):
            with TestClient(app):
                pass


# edge path


def test_lifespan_startup_and_shutdown_manage_runtime_context(
    api_context,
) -> None:
    """
    GIVEN a valid config.ini and workbook in the active working directory
    WHEN app lifespan startup and shutdown execute through TestClient
    THEN runtime context becomes available during runtime and is cleared after shutdown
    """
    current_dir = Path.cwd()
    data_dir = Path(api_context.settings.data_file).parent
    api_runtime.clear_runtime_context()
    try:
        # load_context discovers config.ini from cwd upward
        import os

        os.chdir(data_dir)
        app = app_module.create_app(skip_lifespan=False)
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/health")
            assert response.status_code == 200
            assert api_runtime.get_runtime_context() is not None
    finally:
        os.chdir(current_dir)

    try:
        api_runtime.get_runtime_context()
        assert False, "runtime context should be cleared after lifespan shutdown"
    except RuntimeError as exc:
        assert "RuntimeContext not initialized" in str(exc)
