import configparser
import importlib
import os
import sys
from pathlib import Path

# Ensure the src layout package is importable when running tests without installing
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from caad_erp import core_logic

# We need to import the modules we're going to patch
from caad_erp import data_manager
import openpyxl
import pytest
from caad_erp import setup_excel
from openpyxl.styles import Font


@pytest.fixture(scope="function")
def setup_test_environment(tmp_path, monkeypatch):
    """
    A pytest fixture that creates a temporary, isolated environment for each test.

    This fixture will:
    1. Create a temporary directory (tmp_path).
    2. Create a fake 'config.ini' inside it.
    3. Create a fake, blank 'test_data.xlsx' inside it.
    4. Use monkeypatch to "trick" data_manager and core_logic into
       using these fake files instead of the real ones.
    5. Reload the modules to ensure they use the patched paths.
    """

    # 1. Define paths in the temporary directory
    fake_config_path = tmp_path / "test_config.ini"
    fake_data_path = tmp_path / "test_data.xlsx"

    # 2. Create the fake config.ini
    config = configparser.ConfigParser()
    config.optionxform = str
    config["System"] = {
        "SchemaVersion": "1.4",
        "LoungeName": "Test Lounge",
        "DataFile": str(fake_data_path),
    }
    config["Defaults"] = {"DefaultSalesman": "S1"}
    with open(fake_config_path, "w") as configfile:
        config.write(configfile)

    # 3. Create the fake data.xlsx by borrowing logic from setup_excel.py
    wb = openpyxl.Workbook()
    del wb["Sheet"]
    bold_font = Font(bold=True)

    # Create sheets
    for sheet_name, columns in setup_excel.SHEET_COLUMNS.items():
        ws = wb.create_sheet(title=sheet_name)
        for col_idx, column_name in enumerate(columns, 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.value = column_name
            cell.font = bold_font

    # Add default salesman
    ws_salesmen = wb["Salesmen"]
    ws_salesmen.append(setup_excel.DEFAULT_SALESMAN)
    wb.save(fake_data_path)

    # 4. Use monkeypatch to set the global paths in the modules
    monkeypatch.setattr(data_manager, "CONFIG_FILE", str(fake_config_path))
    monkeypatch.setattr(data_manager, "DATA_FILE", str(fake_data_path))

    # 5. Reload the modules to pick up the patched paths
    # This is CRITICAL because the config is loaded on import.
    importlib.reload(data_manager)
    importlib.reload(core_logic)

    # Yield control back to the test function
    yield

    # Teardown (clearing the cache) happens after the test
    core_logic._data_cache = None
