import argparse
import typing as t
from decimal import Decimal

from caad_erp import cli, bll


def test_register_debts_command_returns_spec():
    """Given the debts registration When register_debts_command runs Then a command spec returns."""

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_debts_command()

    # Assert
    assert spec.name == "debts"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_debts_command_configures_arguments():
    """Given the debts parser When arguments are parsed Then the namespace captures the command."""

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_debts_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args(["debts"])

    # Assert
    assert namespace.command == "debts"


def test_run_debts_report_invokes_bll(runtime_context, monkeypatch):
    """Given parsed arguments When run_debts_report executes Then the BLL debt calculator is invoked."""

    # Arrange
    args = argparse.Namespace()
    called = {}

    def fake_summary(context: bll.RuntimeContext) -> t.Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(
        cli.bll, "calculate_outstanding_debts", fake_summary, raising=False
    )

    # Act
    result = cli.run_debts_report(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context
