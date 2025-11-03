import argparse

from caad_erp import cli, bll


def test_register_void_command_returns_spec():
    """Given the void registration When register_void_command runs Then a command spec returns."""

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_void_command()

    # Assert
    assert spec.name == "void"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_void_command_configures_arguments():
    """Given the void parser When arguments are parsed Then the namespace captures the inputs."""

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_void_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args(
        [
            "void",
            "--linked-transaction-id",
            "T20250101010101000000",
            "--notes",
            "Mistake",
        ]
    )

    # Assert
    assert namespace.linked_transaction_id == "T20250101010101000000"
    assert namespace.notes == "Mistake"


def test_translate_void_returns_void_command():
    """Given CLI arguments When translate_void executes Then a VoidCommand is produced."""

    # Arrange
    args = argparse.Namespace(
        linked_transaction_id="T20250101010101000000",
        notes="Mistake",
    )

    # Act
    command = cli.translate_void(args)

    # Assert
    assert isinstance(command, bll.VoidCommand)
    assert command.linked_transaction_id == "T20250101010101000000"
    assert command.notes == "Mistake"
    assert command.replacement_command is None


def test_run_void_invokes_bll(runtime_context, monkeypatch):
    """Given parsed arguments When run_void executes Then the BLL void recorder is called."""

    # Arrange
    args = argparse.Namespace()
    command = bll.VoidCommand(
        linked_transaction_id="T1", replacement_command=None)
    monkeypatch.setattr(cli.commands.void, "translate_void",
                        lambda value: command)
    called = {}

    def fake_record(context: bll.RuntimeContext, cmd: bll.VoidCommand) -> None:
        called["context"] = context
        called["cmd"] = cmd

    monkeypatch.setattr(cli.bll, "record_void", fake_record)

    # Act
    result = cli.run_void(runtime_context, args)

    # Assert
    assert result == 0
    assert called["cmd"] is command
