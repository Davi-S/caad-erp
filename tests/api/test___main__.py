import importlib


def test_api_module_main_reexports_server_main_symbol() -> None:
    """
    GIVEN module execution support through python -m caad_erp.api
    WHEN caad_erp.api.__main__ is imported
    THEN module-level main symbol points to caad_erp.api.server.main
    """
    module = importlib.import_module("caad_erp.api.__main__")
    server = importlib.import_module("caad_erp.api.server")

    assert module.main is server.main
