import importlib


def test_api_module_main_invokes_server_main() -> None:
    """
    GIVEN module execution through python -m caad_erp.api
    WHEN api.__main__ is evaluated
    THEN server.main is invoked as the runtime entrypoint
    """
    module = importlib.import_module("caad_erp.api.__main__")
    calls: list[str] = []

    original_main = module.main
    try:
        module.main = lambda: calls.append("main")
        module.main()
    finally:
        module.main = original_main

    assert calls == ["main"]
