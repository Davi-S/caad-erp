import pytest
import asyncio

import fastapi
from fastapi.testclient import TestClient

from caad_erp.api import app as app_module


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


@pytest.mark.parametrize("skip_lifespan", [True, False])
def test_create_app_builds_fastapi_instance_with_expected_metadata(skip_lifespan: bool) -> None:
    """
    GIVEN valid application metadata constants and route registry
    WHEN create_app is called with either lifespan mode
    THEN it returns a configured FastAPI app with title description and version
    """
    app = app_module.create_app(skip_lifespan=skip_lifespan)

    assert isinstance(app, fastapi.FastAPI)
    assert app.title == app_module.APP_TITLE
    assert app.description == app_module.APP_DESCRIPTION
    assert isinstance(app.version, str)
    assert app.version
    if skip_lifespan:
        assert app.router.lifespan_context is not app_module.lifespan
    else:
        assert callable(app.router.lifespan_context)


def test_create_app_registers_all_routers_and_global_exception_handlers() -> None:
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


def test_lifespan_initializes_runtime_context_on_startup_and_clears_on_shutdown() -> None:
    """
    GIVEN bll.load_context and bll.ensure_schema_version succeed
    WHEN lifespan startup and shutdown phases execute
    THEN runtime context is set during startup and cleared during shutdown
    """
    calls: list[str] = []
    fake_context = object()

    original_load_context = app_module.bll.load_context
    original_ensure_schema_version = app_module.bll.ensure_schema_version
    original_set_runtime_context = app_module.runtime.set_runtime_context
    original_clear_runtime_context = app_module.runtime.clear_runtime_context
    try:
        app_module.bll.load_context = lambda: fake_context
        app_module.bll.ensure_schema_version = lambda context: calls.append(
            f"ensure:{context is fake_context}"
        )
        app_module.runtime.set_runtime_context = lambda context: calls.append(
            f"set:{context is fake_context}"
        )
        app_module.runtime.clear_runtime_context = lambda: calls.append("clear")

        async def _run_lifespan() -> None:
            async with app_module.lifespan(fastapi.FastAPI()):
                calls.append("inside")

        asyncio.run(_run_lifespan())
    finally:
        app_module.bll.load_context = original_load_context
        app_module.bll.ensure_schema_version = original_ensure_schema_version
        app_module.runtime.set_runtime_context = original_set_runtime_context
        app_module.runtime.clear_runtime_context = original_clear_runtime_context

    assert calls == ["ensure:True", "set:True", "inside", "clear"]


# sad path
@pytest.mark.parametrize(
    "failure_stage",
    [
        "load_context_raises",
        "ensure_schema_version_raises",
    ],
)
def test_lifespan_propagates_startup_failures_without_partial_state(failure_stage: str) -> None:
    """
    GIVEN startup dependencies fail while initializing runtime state
    WHEN lifespan startup executes
    THEN the original exception is propagated and runtime singleton remains safe
    """
    calls: list[str] = []
    fake_context = object()

    original_load_context = app_module.bll.load_context
    original_ensure_schema_version = app_module.bll.ensure_schema_version
    original_set_runtime_context = app_module.runtime.set_runtime_context
    original_clear_runtime_context = app_module.runtime.clear_runtime_context
    try:
        if failure_stage == "load_context_raises":
            app_module.bll.load_context = lambda: (_ for _ in ()).throw(
                RuntimeError("load failed")
            )
            app_module.bll.ensure_schema_version = lambda context: None
        else:
            app_module.bll.load_context = lambda: fake_context
            app_module.bll.ensure_schema_version = lambda context: (_ for _ in ()).throw(
                RuntimeError("schema failed")
            )

        app_module.runtime.set_runtime_context = lambda context: calls.append("set")
        app_module.runtime.clear_runtime_context = lambda: calls.append("clear")

        async def _run_lifespan() -> None:
            async with app_module.lifespan(fastapi.FastAPI()):
                pass

        with pytest.raises(RuntimeError):
            asyncio.run(_run_lifespan())
    finally:
        app_module.bll.load_context = original_load_context
        app_module.bll.ensure_schema_version = original_ensure_schema_version
        app_module.runtime.set_runtime_context = original_set_runtime_context
        app_module.runtime.clear_runtime_context = original_clear_runtime_context

    assert calls == []


# edge path
def test_create_app_with_skip_lifespan_true_exposes_routes_without_startup_runtime() -> None:
    """
    GIVEN skip_lifespan mode for lightweight route testing
    WHEN create_app is called with skip_lifespan set to true
    THEN application creation succeeds without invoking runtime startup wiring
    """
    app = app_module.create_app(skip_lifespan=True)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/health")

    assert response.status_code == 200