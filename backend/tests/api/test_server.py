import inspect
import unittest.mock

import pytest

from caad_erp.api import server

# happy path


def test_server_defaults_expose_expected_host_and_port_constants() -> None:
    """
    GIVEN API server module constants
    WHEN defaults are inspected
    THEN host and port match the documented local-network bindings
    """
    assert server.DEFAULT_HOST == "0.0.0.0"
    assert server.DEFAULT_PORT == 8000


def test_run_server_signature_uses_default_host_and_port() -> None:
    """
    GIVEN run_server callable signature
    WHEN default parameter values are inspected
    THEN host and port defaults map to module constants
    """
    signature = inspect.signature(server.run_server)

    assert signature.parameters["host"].default == server.DEFAULT_HOST
    assert signature.parameters["port"].default == server.DEFAULT_PORT
    assert signature.parameters["serve_static"].default is False


# sad path


def test_run_server_exits_when_serve_static_fails_with_file_not_found() -> None:
    """
    GIVEN serve_static=True when frontend/dist is missing
    WHEN run_server is called
    THEN it logs an error and exits with status code 1
    """
    with unittest.mock.patch(
        "caad_erp.api.app.create_app", side_effect=FileNotFoundError("missing dist")
    ):
        with pytest.raises(SystemExit) as exc_info:
            server.run_server(serve_static=True)
        assert exc_info.value.code == 1


def test_run_server_requires_int_port_annotation_for_call_contract() -> None:
    """
    GIVEN run_server API contract
    WHEN annotations are inspected
    THEN port parameter is typed as int for runtime and tooling consistency
    """
    signature = inspect.signature(server.run_server)

    assert signature.parameters["port"].annotation is int


# edge path


def test_main_entry_points_delegate_to_run_server() -> None:
    """
    GIVEN main_api and main_full entry points
    WHEN main_api or main_full are invoked
    THEN run_server is called with the appropriate serve_static setting
    """
    with unittest.mock.patch("caad_erp.api.server.run_server") as mock_run:
        server.main_api()
        mock_run.assert_called_once_with(serve_static=False)

    with unittest.mock.patch("caad_erp.api.server.run_server") as mock_run:
        server.main_full()
        mock_run.assert_called_once_with(serve_static=True)

    with unittest.mock.patch("caad_erp.api.server.run_server") as mock_run:
        server.main()
        mock_run.assert_called_once_with(serve_static=False)
