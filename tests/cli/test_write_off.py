import argparse
from decimal import Decimal

from caad_erp import cli, core_logic


def test_register_write_off_command_returns_spec():
    """register_write_off_command should return a CommandSpec."""

    spec = cli.register_write_off_command()
    assert spec.name == "write-off"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_write_off_command_configures_arguments():
    """register_write_off_command should define write-off arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_write_off_command()
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "write-off",
            "--product-id",
            "P1001",
            "--quantity",
            "1",
            "--salesman-id",
            "S-DEFAULT",
            "--notes",
            "Damaged",
        ]
    )
    assert namespace.product_id == "P1001"
    assert namespace.quantity == "1"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.notes == "Damaged"


def test_translate_write_off_returns_write_off_command():
    """translate_write_off should produce a WriteOffCommand instance."""

    args = argparse.Namespace(
        product_id="P1001",
        quantity="1",
        salesman_id="S-DEFAULT",
        notes="Damaged",
    )
    command = cli.translate_write_off(args)
    assert isinstance(command, core_logic.WriteOffCommand)
    assert command.quantity == Decimal("1")
    assert command.salesman_id == "S-DEFAULT"
    assert command.notes == "Damaged"


def test_run_write_off_invokes_bll(runtime_context, monkeypatch):
    """run_write_off should delegate to the business logic layer."""

    args = argparse.Namespace()
    command = core_logic.WriteOffCommand(
        product_id="P1001",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
    )
    monkeypatch.setattr(cli.commands.write_off,
                        "translate_write_off", lambda value: command)
    called = {}

    def fake_record(context: core_logic.RuntimeContext, cmd: core_logic.WriteOffCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.core_logic, "record_write_off", fake_record)
    result = cli.run_write_off(runtime_context, args)
    assert result == 0
    assert called["cmd"] is command
