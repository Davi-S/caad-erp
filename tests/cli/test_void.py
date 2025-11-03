import argparse

from caad_erp import cli, bll


def test_register_void_command_returns_spec():
    """register_void_command should return a CommandSpec."""

    spec = cli.register_void_command()
    assert spec.name == "void"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_void_command_configures_arguments():
    """register_void_command should define void-specific arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_void_command()
    spec.register(subparsers)
    namespace = parser.parse_args(
        [
            "void",
            "--linked-transaction-id",
            "T20250101010101000000",
            "--notes",
            "Mistake",
        ]
    )
    assert namespace.linked_transaction_id == "T20250101010101000000"
    assert namespace.notes == "Mistake"


def test_translate_void_returns_void_command():
    """translate_void should produce a VoidCommand instance."""

    args = argparse.Namespace(
        linked_transaction_id="T20250101010101000000",
        notes="Mistake",
    )
    command = cli.translate_void(args)
    assert isinstance(command, bll.VoidCommand)
    assert command.linked_transaction_id == "T20250101010101000000"
    assert command.notes == "Mistake"
    assert command.replacement_command is None


def test_run_void_invokes_bll(runtime_context, monkeypatch):
    """run_void should delegate to the business logic layer."""

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
    result = cli.run_void(runtime_context, args)
    assert result == 0
    assert called["cmd"] is command
