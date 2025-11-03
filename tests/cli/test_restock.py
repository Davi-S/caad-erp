import argparse
from decimal import Decimal

from caad_erp import cli, bll


def test_register_restock_command_returns_spec():
    """
    Given the restock registration 
    When register_restock_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_restock_command()

    # Assert
    assert spec.name == "restock"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_restock_command_configures_arguments():
    """
    Given the restock parser 
    When arguments are parsed 
    Then the namespace captures the inputs.
    """

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_restock_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args(
        [
            "restock",
            "--product-id",
            "P1001",
            "--quantity",
            "5",
            "--total-cost",
            "10.00",
            "--salesman-id",
            "S-DEFAULT",
            "--notes",
            "Bulk restock",
        ]
    )

    # Assert
    assert namespace.product_id == "P1001"
    assert namespace.quantity == "5"
    assert namespace.total_cost == "10.00"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.notes == "Bulk restock"


def test_translate_restock_returns_restock_command():
    """
    Given CLI arguments 
    When translate_restock executes 
    Then a RestockCommand is produced.
    """

    # Arrange
    args = argparse.Namespace(
        product_id="P1001",
        quantity="5",
        total_cost="10.00",
        salesman_id="S-DEFAULT",
        notes="Bulk restock",
    )

    # Act
    command = cli.translate_restock(args)

    # Assert
    assert isinstance(command, bll.RestockCommand)
    assert command.quantity == Decimal("5")
    assert command.total_cost == Decimal("10.00")
    assert command.salesman_id == "S-DEFAULT"
    assert command.notes == "Bulk restock"


def test_run_restock_invokes_bll(runtime_context, monkeypatch):
    """
    Given parsed arguments 
    When run_restock executes 
    Then the BLL restock recorder is called.
    """

    # Arrange
    args = argparse.Namespace()
    command = bll.RestockCommand(
        product_id="P1001",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_cost=Decimal("10"),
    )
    monkeypatch.setattr(cli.commands.restock,
                        "translate_restock", lambda value: command)
    called = {}

    def fake_record(context: bll.RuntimeContext, cmd: bll.RestockCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.bll, "record_restock", fake_record)

    # Act
    result = cli.run_restock(runtime_context, args)

    # Assert
    assert result == 0
    assert called["cmd"] is command
