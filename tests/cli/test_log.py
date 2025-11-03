import argparse

from caad_erp import cli, bll


def test_register_log_command_returns_spec():
    """Given the log registration When register_log_command runs Then a command spec returns."""

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_log_command()

    # Assert
    assert spec.name == "log"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_log_command_configures_arguments():
    """Given the log parser When arguments are parsed Then the namespace captures the command."""

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_log_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args(["log"])

    # Assert
    assert namespace.command == "log"


def test_run_log_report_invokes_bll(runtime_context, monkeypatch):
    """Given parsed arguments When run_log_report executes Then the BLL list_transactions is invoked."""

    # Arrange
    args = argparse.Namespace()
    called = {}

    def fake_list(context: bll.RuntimeContext) -> list[object]:
        called["context"] = context
        return []

    monkeypatch.setattr(cli.bll, "list_transactions", fake_list)

    # Act
    result = cli.run_log_report(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context
