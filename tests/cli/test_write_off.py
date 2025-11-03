import argparse
from decimal import Decimal

from caad_erp import cli, bll


def test_register_write_off_command_returns_spec():
    """Given the write-off registration When register_write_off_command runs Then a command spec returns."""

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_write_off_command()

    # Assert
    assert spec.name == "write-off"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_write_off_command_configures_arguments():
    """Given the write-off parser When arguments are parsed Then the namespace captures the inputs."""

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_write_off_command()
    spec.register(subparsers)

    # Act
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

    # Assert
    assert namespace.product_id == "P1001"
    assert namespace.quantity == "1"
    assert namespace.salesman_id == "S-DEFAULT"
    assert namespace.notes == "Damaged"


def test_translate_write_off_returns_write_off_command():
    """Given CLI arguments When translate_write_off executes Then a WriteOffCommand is produced."""

    # Arrange
    args = argparse.Namespace(
        product_id="P1001",
        quantity="1",
        salesman_id="S-DEFAULT",
        notes="Damaged",
    )

    # Act
    command = cli.translate_write_off(args)

    # Assert
    assert isinstance(command, bll.WriteOffCommand)
    assert command.quantity == Decimal("1")
    assert command.salesman_id == "S-DEFAULT"
    assert command.notes == "Damaged"


def test_run_write_off_invokes_bll(runtime_context, monkeypatch):
    """Given parsed arguments When run_write_off executes Then the BLL write-off recorder is called."""

    # Arrange
    args = argparse.Namespace()
    command = bll.WriteOffCommand(
        product_id="P1001",
        salesman_id="S-DEFAULT",
        quantity=Decimal("1"),
    )
    monkeypatch.setattr(cli.commands.write_off,
                        "translate_write_off", lambda value: command)
    called = {}

    def fake_record(context: bll.RuntimeContext, cmd: bll.WriteOffCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.bll, "record_write_off", fake_record)

    # Act
    result = cli.run_write_off(runtime_context, args)

    # Assert
    assert result == 0
    assert called["cmd"] is command
