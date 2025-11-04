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


def test_run_profit_report_prints_summary(runtime_context, monkeypatch, capsys):
    """
    Given calculated totals 
    When run_profit_report executes 
    Then the CLI prints the summary values.
    """

    # Arrange
    args = argparse.Namespace()

    def fake_summary(context: bll.RuntimeContext) -> t.Mapping[str, Decimal]:
        assert context is runtime_context
        return {
            "total_revenue": Decimal("120.50"),
            "total_cost": Decimal("-45.30"),
            "profit": Decimal("75.20"),
        }

    monkeypatch.setattr(cli.bll, "calculate_profit_summary", fake_summary)

    # Act
    result = cli.run_profit_report(runtime_context, args)
    captured = capsys.readouterr().out

    # Assert
    assert result == 0
    assert "Profit summary:" in captured
    assert "120.50" in captured
    assert "-45.30" in captured
    assert "75.20" in captured
