from pathlib import Path

import argparse
import openpyxl
import pytest

from caad_erp import bll, constants, dal
from caad_erp.cli.commands import list_salesmen
from caad_erp.settings import AppSettings


def _make_context(tmp_path: Path) -> bll.RuntimeContext:
    wb = openpyxl.Workbook()
    default = wb.active
    wb.remove(default)
    products = wb.create_sheet(constants.SheetName.PRODUCTS.value)
    products.append(["ProductID", "ProductName", "SellPrice", "IsActive"])
    salesmen = wb.create_sheet(constants.SheetName.SALESMEN.value)
    salesmen.append(["SalesmanID", "SalesmanName", "IsActive"])
    salesmen.append(["S001", "Ana", True])
    salesmen.append(["S002", "Bob", False])
    tx = wb.create_sheet(constants.SheetName.TRANSACTION_LOG.value)
    tx.append([
        "TransactionID",
        "Timestamp",
        "TransactionType",
        "ProductID",
        "SalesmanID",
        "PaymentType",
        "QuantityChange",
        "TotalRevenue",
        "TotalCost",
        "LinkedTransactionID",
        "Notes",
    ])
    settings = AppSettings(
        data_file=tmp_path / "data.xlsx",
        lounge_name="Test",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
        default_salesman_id="S001",
    )
    return bll.RuntimeContext(settings=settings, workbook=wb)


def test_register_list_salesmen_command_returns_non_mutating_command_spec() -> None:
    """
    GIVEN list-salesmen command module
    WHEN register_list_salesmen_command is called
    THEN a non-mutating CommandSpec is returned with expected metadata
    """
    # Arrange / Act
    spec = list_salesmen.register_list_salesmen_command()

    # Assert
    assert spec.name == "list-salesmen"
    assert spec.is_mutating is False


def test_register_list_salesmen_registrar_configures_all_flag() -> None:
    """
    GIVEN subparser factory instance
    WHEN list-salesmen registrar is executed
    THEN parser configures optional --all flag and command default
    """
    # Arrange
    spec = list_salesmen.register_list_salesmen_command()
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command")
    spec.register(subparsers)

    # Act
    args = parser.parse_args(["list-salesmen", "--all"])

    # Assert
    assert args.command == "list-salesmen"
    assert args.all is True


@pytest.mark.parametrize("include_inactive", [False, True])
def test_display_salesmen_report_prints_empty_state_message(include_inactive, capsys) -> None:
    """
    GIVEN empty salesman iterable and include_inactive mode
    WHEN _display_salesmen_report is called
    THEN mode-specific empty-state message is printed
    """
    # Arrange / Act
    list_salesmen._display_salesmen_report(
        [], include_inactive=include_inactive)

    # Assert
    output = capsys.readouterr().out
    assert (
        "No salesmen found." in output
        if include_inactive
        else "No active salesmen found." in output
    )


@pytest.mark.parametrize("include_inactive", [False, True])
def test_display_salesmen_report_prints_expected_columns_by_mode(include_inactive, capsys) -> None:
    """
    GIVEN non-empty salesman iterable and include_inactive mode
    WHEN _display_salesmen_report is called
    THEN output columns differ according to mode and include active marker when required
    """
    # Arrange
    rows = [
        dal.SalesmanRow("S001", "Ana", True),
        dal.SalesmanRow("S002", "Bob", False),
    ]

    # Act
    list_salesmen._display_salesmen_report(
        rows, include_inactive=include_inactive)

    # Assert
    output = capsys.readouterr().out
    assert "Salesman ID" in output
    if include_inactive:
        assert "Active" in output
    else:
        assert "Active" not in output


@pytest.mark.parametrize("include_inactive", [False, True])
def test_run_list_salesmen_report_calls_bll_and_returns_zero(include_inactive, tmp_path: Path, capsys) -> None:
    """
    GIVEN runtime context and parsed list-salesmen args with all flag mode
    WHEN _run_list_salesmen_report is called
    THEN salesmen are listed with include_inactive forwarded and zero is returned
    """
    # Arrange
    context = _make_context(tmp_path)
    args = argparse.Namespace(all=include_inactive)

    # Act
    exit_code = list_salesmen._run_list_salesmen_report(context, args)

    # Assert
    assert exit_code == 0
    output = capsys.readouterr().out
    assert "S001" in output
    if include_inactive:
        assert "S002" in output
