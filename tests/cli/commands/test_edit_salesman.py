from pathlib import Path

import argparse
import openpyxl

from caad_erp import bll, constants
from caad_erp.cli.commands import deactivate_salesman
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


def test_register_deactivate_salesman_command_returns_command_spec() -> None:
    """
    GIVEN deactivate-salesman command module
    WHEN register_deactivate_salesman_command is called
    THEN a CommandSpec is returned with expected metadata
    """
    # Arrange / Act
    spec = deactivate_salesman.register_deactivate_salesman_command()

    # Assert
    assert spec.name == "deactivate-salesman"
    assert spec.is_mutating is True


def test_register_deactivate_salesman_registrar_configures_required_id() -> None:
    """
    GIVEN subparser factory instance
    WHEN deactivate-salesman registrar is executed
    THEN parser includes required salesman-id and command default
    """
    # Arrange
    spec = deactivate_salesman.register_deactivate_salesman_command()
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command")
    spec.register(subparsers)

    # Act
    args = parser.parse_args(["deactivate-salesman", "--salesman-id", "S001"])

    # Assert
    assert args.command == "deactivate-salesman"
    assert args.salesman_id == "S001"


def test_translate_deactivate_salesman_sets_is_active_false_and_trims_id() -> None:
    """
    GIVEN parsed deactivate-salesman args with salesman id value
    WHEN _translate_deactivate_salesman is called
    THEN SalesmanCommand is produced with trimmed id and is_active false
    """
    # Arrange
    args = argparse.Namespace(salesman_id="  S001  ")

    # Act
    command = deactivate_salesman._translate_deactivate_salesman(args)

    # Assert
    assert command.salesman_id == "S001"
    assert command.is_active is False


def test_run_deactivate_salesman_calls_bll_update_and_returns_zero(tmp_path: Path) -> None:
    """
    GIVEN runtime context and parsed deactivate-salesman args
    WHEN _run_deactivate_salesman is called
    THEN bll.update_salesman is invoked and zero is returned
    """
    # Arrange
    context = _make_context(tmp_path)
    args = argparse.Namespace(salesman_id="S001")

    # Act
    exit_code = deactivate_salesman._run_deactivate_salesman(context, args)

    # Assert
    assert exit_code == 0
    updated = bll.get_salesman(context, "S001")
    assert updated.is_active is False
