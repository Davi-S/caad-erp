import inspect

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


# sad path

def test_run_server_requires_int_port_annotation_for_call_contract() -> None:
    """
    GIVEN run_server API contract
    WHEN annotations are inspected
    THEN port parameter is typed as int for runtime and tooling consistency
    """
    signature = inspect.signature(server.run_server)

    assert signature.parameters["port"].annotation is int


# edge path

def test_main_delegates_to_run_server_through_module_source_contract() -> None:
    """
    GIVEN server module implementation
    WHEN source code for main is inspected
    THEN it contains a direct run_server invocation as the sole side effect
    """
    source = inspect.getsource(server.main)

    assert "run_server()" in source
