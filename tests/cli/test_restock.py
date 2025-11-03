import argparse
from decimal import Decimal

from caad_erp import cli, core_logic


def test_register_restock_command_returns_spec():
    """register_restock_command should return a CommandSpec."""

    spec = cli.register_restock_command()
    assert spec.name == "restock"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_restock_command_configures_arguments():
    """register_restock_command should define restock-specific arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_restock_command()
    spec.register(subparsers)
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
    assert namespace.product_id == "P1001"
    assert namespace.quantity == "5"
    assert namespace.total_cost == "10.00"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.notes == "Bulk restock"


def test_translate_restock_returns_restock_command():
    """translate_restock should produce a RestockCommand instance."""

    args = argparse.Namespace(
        product_id="P1001",
        quantity="5",
        total_cost="10.00",
        salesman_id="S-DEFAULT",
        notes="Bulk restock",
    )
    command = cli.translate_restock(args)
    assert isinstance(command, core_logic.RestockCommand)
    assert command.quantity == Decimal("5")
    assert command.total_cost == Decimal("10.00")
    assert command.salesman_id == "S-DEFAULT"
    assert command.notes == "Bulk restock"


def test_run_restock_invokes_bll(runtime_context, monkeypatch):
    """run_restock should delegate to the business logic layer."""

    args = argparse.Namespace()
    command = core_logic.RestockCommand(
        product_id="P1001",
        salesman_id="S-DEFAULT",
        quantity=Decimal("5"),
        total_cost=Decimal("10"),
    )
    monkeypatch.setattr(cli.commands.restock,
                        "translate_restock", lambda value: command)
    called = {}

    def fake_record(context: core_logic.RuntimeContext, cmd: core_logic.RestockCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.core_logic, "record_restock", fake_record)
    result = cli.run_restock(runtime_context, args)
    assert result == 0
    assert called["cmd"] is command
