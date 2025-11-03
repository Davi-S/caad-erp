import argparse
import typing as t
from decimal import Decimal

from caad_erp import cli, bll


def test_register_profit_command_returns_spec():
    """
    Given the profit registration 
    When register_profit_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_profit_command()

    # Assert
    assert spec.name == "profit"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_profit_command_configures_arguments():
    """
    Given the profit parser 
    When arguments are parsed 
    Then the namespace captures the command.
    """

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_profit_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args(["profit"])

    # Assert
    assert namespace.command == "profit"


def test_run_profit_report_invokes_bll(runtime_context, monkeypatch):
    """
    Given parsed arguments 
    When run_profit_report executes 
    Then the BLL profit calculator is invoked.
    """

    # Arrange
    args = argparse.Namespace()
    called = {}

    def fake_summary(context: bll.RuntimeContext) -> t.Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(cli.bll, "calculate_profit_summary", fake_summary)

    # Act
    result = cli.run_profit_report(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context
