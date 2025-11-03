import openpyxl
import pytest
from openpyxl.workbook import Workbook as OpenpyxlWorkbook

from caad_erp import dal, constants


def test_open_workbook_returns_openpyxl_instance(master_workbook_path):
    """open_workbook should hand back a loaded Workbook object."""

    workbook = dal.open_workbook(master_workbook_path)
    assert isinstance(workbook, OpenpyxlWorkbook)


def test_open_workbook_missing_file_raises(tmp_path):
    """Missing workbook files should yield FileNotFoundError."""

    with pytest.raises(FileNotFoundError):
        dal.open_workbook(tmp_path / "missing.xlsx")


def test_save_workbook_persists_changes(master_workbook_path):
    """save_workbook should persist changes to the provided destination path."""

    workbook = dal.open_workbook(master_workbook_path)
    sheet = workbook[constants.SheetName.PRODUCTS.value]
    sheet.append(["P100", "Chips", "2.50", True])
    dal.save_workbook(workbook, master_workbook_path)

    reloaded = dal.open_workbook(master_workbook_path)
    values = list(reloaded[constants.SheetName.PRODUCTS.value].iter_rows(
        min_row=2, values_only=True))
    assert values == [("P100", "Chips", "2.50", True)]


def test_save_workbook_with_destination_creates_copy(master_workbook_path, tmp_path):
    """Providing a destination should create a new file independent of the source."""

    workbook = dal.open_workbook(master_workbook_path)
    sheet = workbook[constants.SheetName.SALESMEN.value]
    sheet.append(["S2", "Jordan", True])
    copy_path = tmp_path / "copy.xlsx"
    dal.save_workbook(workbook, destination=copy_path)

    copy = openpyxl.load_workbook(copy_path)
    rows = list(copy[constants.SheetName.SALESMEN.value].iter_rows(
        min_row=2, values_only=True))
    assert ("S2", "Jordan", True) in rows


def test_refresh_workbook_returns_new_instance(master_workbook_path):
    """refresh_workbook should return a freshly loaded workbook from disk."""

    original = dal.open_workbook(master_workbook_path)
    sheet = original[constants.SheetName.PRODUCTS.value]
    sheet.append(["P200", "Bars", "4.00", True])
    dal.save_workbook(original, master_workbook_path)

    refreshed = dal.refresh_workbook(master_workbook_path)
    assert refreshed is not original
    values = list(refreshed[constants.SheetName.PRODUCTS.value].iter_rows(
        min_row=2, values_only=True))
    assert ("P200", "Bars", "4.00", True) in values


def test_locate_row_returns_row_index(master_workbook_path):
    """locate_row should return the worksheet index of the matching key."""

    workbook = dal.open_workbook(master_workbook_path)
    sheet = workbook[constants.SheetName.PRODUCTS.value]
    sheet.append(["P600", "Snack", "2.00", True])
    dal.save_workbook(workbook, master_workbook_path)

    reloaded = dal.open_workbook(master_workbook_path)
    row_index = dal.locate_row(
        reloaded,
        constants.SheetName.PRODUCTS.value,
        "ProductID",
        "P600",
    )
    assert row_index == 2


def test_locate_row_returns_none_when_missing(master_workbook_path):
    """locate_row should return None if the key is not present."""

    workbook = dal.open_workbook(master_workbook_path)
    assert (
        dal.locate_row(
            workbook,
            constants.SheetName.PRODUCTS.value,
            "ProductID",
            "NOPE",
        )
        is None
    )
