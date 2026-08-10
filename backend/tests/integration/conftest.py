from pathlib import Path

import pytest

from caad_erp import constants
from caad_erp.bll import runtime
from setup_excel import create_master_workbook


@pytest.fixture
def integration_workspace(tmp_path: Path) -> Path:
    """
    GIVEN a temporary directory provided by pytest
    WHEN integration_workspace fixture is requested
    THEN an isolated workspace path is returned for end-to-end test artifacts
    """
    return tmp_path


@pytest.fixture
def integration_config_path(integration_workspace: Path) -> Path:
    """
    GIVEN an isolated integration workspace
    WHEN integration_config_path fixture is requested
    THEN a config.ini path inside that workspace is returned
    """
    config_path = integration_workspace / "config.ini"
    config_path.write_text(
        "\n".join(
            [
                "[System]",
                "DataFile = master_workbook.xlsx",
                "LoungeName = Integration Lounge",
                f"SchemaVersion = {constants.EXPECTED_SCHEMA_VERSION}",
                "",
                "[Defaults]",
                "DefaultSalesman = GRR00000000",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return config_path


@pytest.fixture
def integration_workbook_path(integration_workspace: Path) -> Path:
    """
    GIVEN an isolated integration workspace
    WHEN integration_workbook_path fixture is requested
    THEN a workbook destination path for end-to-end flows is returned
    """
    return integration_workspace / "master_workbook.xlsx"


@pytest.fixture
def initialized_context(integration_config_path: Path):
    """
    GIVEN an integration config and initialized workbook state
    WHEN initialized_context fixture is requested
    THEN a RuntimeContext ready for cross-layer scenarios is returned
    """
    create_master_workbook(
        integration_config_path.parent / "master_workbook.xlsx",
        default_salesman_id="GRR00000000",
        overwrite=True,
    )
    return runtime.load_context(integration_config_path)
