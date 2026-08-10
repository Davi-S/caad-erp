from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from caad_erp import constants
from caad_erp.api import app as api_app
from caad_erp.api import runtime as api_runtime
from caad_erp.bll import runtime as bll_runtime
from setup_excel import create_master_workbook


@pytest.fixture
def api_workspace(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture
def api_config_path(api_workspace: Path) -> Path:
    config_path = api_workspace / "config.ini"
    config_path.write_text(
        "\n".join(
            [
                "[System]",
                "DataFile = master_workbook.xlsx",
                "LoungeName = API Unit Test Lounge",
                f"SchemaVersion = {constants.EXPECTED_SCHEMA_VERSION}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return config_path


@pytest.fixture
def api_context(api_config_path: Path):
    create_master_workbook(
        api_config_path.parent / "master_workbook.xlsx",
        overwrite=True,
    )
    return bll_runtime.load_context(api_config_path)


@pytest.fixture
def api_client(api_context):
    application = api_app.create_app(skip_lifespan=True)
    api_runtime.set_runtime_context(api_context)
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client
    api_runtime.clear_runtime_context()


@pytest.fixture
def api_client_without_runtime():
    application = api_app.create_app(skip_lifespan=True)
    api_runtime.clear_runtime_context()
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client
    api_runtime.clear_runtime_context()
