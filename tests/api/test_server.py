import pytest

from caad_erp.api import server


# happy path
def test_run_server_uses_default_host_and_port() -> None:
    """
    GIVEN no explicit host or port override
    WHEN run_server is called
    THEN uvicorn.run is invoked with application and default binding values
    """
    captured: dict[str, object] = {}

    original_create_app = server.app.create_app
    original_uvicorn_run = server.uvicorn.run
    try:
        server.app.create_app = lambda: "fake-app"

        def _fake_run(application, *, host, port):
            captured["application"] = application
            captured["host"] = host
            captured["port"] = port

        server.uvicorn.run = _fake_run
        server.run_server()
    finally:
        server.app.create_app = original_create_app
        server.uvicorn.run = original_uvicorn_run

    assert captured == {
        "application": "fake-app",
        "host": server.DEFAULT_HOST,
        "port": server.DEFAULT_PORT,
    }


def test_run_server_uses_explicit_host_and_port_overrides() -> None:
    """
    GIVEN explicit host and port values for deployment context
    WHEN run_server is called with overrides
    THEN uvicorn.run is invoked using those exact network settings
    """
    captured: dict[str, object] = {}

    original_create_app = server.app.create_app
    original_uvicorn_run = server.uvicorn.run
    try:
        server.app.create_app = lambda: "fake-app"

        def _fake_run(application, *, host, port):
            captured["application"] = application
            captured["host"] = host
            captured["port"] = port

        server.uvicorn.run = _fake_run
        server.run_server(host="127.0.0.1", port=9001)
    finally:
        server.app.create_app = original_create_app
        server.uvicorn.run = original_uvicorn_run

    assert captured == {
        "application": "fake-app",
        "host": "127.0.0.1",
        "port": 9001,
    }


def test_main_delegates_to_run_server_entrypoint() -> None:
    """
    GIVEN the API console entrypoint invocation
    WHEN server.main executes
    THEN run_server is called exactly once to start HTTP serving
    """
    calls: list[str] = []
    original_run_server = server.run_server
    try:
        server.run_server = lambda: calls.append("run")
        server.main()
    finally:
        server.run_server = original_run_server

    assert calls == ["run"]


# sad path
def test_run_server_propagates_uvicorn_runtime_failures() -> None:
    """
    GIVEN uvicorn.run raises due to bind or startup failures
    WHEN run_server is invoked
    THEN the original exception propagates for operational visibility
    """
    original_create_app = server.app.create_app
    original_uvicorn_run = server.uvicorn.run
    try:
        server.app.create_app = lambda: "fake-app"

        def _boom(*_args, **_kwargs):
            raise RuntimeError("bind failed")

        server.uvicorn.run = _boom
        with pytest.raises(RuntimeError, match="bind failed"):
            server.run_server()
    finally:
        server.app.create_app = original_create_app
        server.uvicorn.run = original_uvicorn_run


# edge path
def test_run_server_creates_application_once_per_invocation() -> None:
    """
    GIVEN one server startup invocation
    WHEN run_server is executed
    THEN create_app is evaluated once and passed directly to uvicorn.run
    """
    create_calls: list[str] = []

    original_create_app = server.app.create_app
    original_uvicorn_run = server.uvicorn.run
    try:
        def _fake_create_app():
            create_calls.append("create")
            return "fake-app"

        server.app.create_app = _fake_create_app
        server.uvicorn.run = lambda *_args, **_kwargs: None
        server.run_server()
    finally:
        server.app.create_app = original_create_app
        server.uvicorn.run = original_uvicorn_run

    assert create_calls == ["create"]
