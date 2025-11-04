import argparse
import typing as t
from decimal import Decimal

from caad_erp import cli, bll


def test_register_stock_command_returns_spec():
    """
    Given the stock registration 
    When register_stock_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_stock_command()

    # Assert
    assert spec.name == "stock"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_stock_command_configures_arguments():
    """
    Given the stock parser 
    When arguments are parsed 
    Then the namespace captures the command.
    """

    # Arrange
    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_stock_command()
    spec.register(subparsers)

    # Act
    namespace = parser.parse_args(["stock"])

    # Assert
    assert namespace.command == "stock"


def test_run_stock_report_invokes_bll(runtime_context, monkeypatch):
    """
    Given parsed arguments 
    When run_stock_report executes 
    Then the BLL stock calculator is invoked.
    """

    # Arrange
    args = argparse.Namespace()
    called = {}

    def fake_calculate(context: bll.RuntimeContext) -> t.Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(cli.bll, "calculate_inventory", fake_calculate)

    # Act
    result = cli.run_stock_report(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context


def test_run_stock_report_prints_inventory(runtime_context, monkeypatch, capsys):
    """
    Given available inventory 
    When run_stock_report executes 
    Then the CLI displays quantities.
    """

    # Arrange
    args = argparse.Namespace()

    def fake_calculate(context: bll.RuntimeContext) -> t.Mapping[str, Decimal]:
        assert context is runtime_context
        return {
            "COF-ESPRESSO": Decimal("10"),
            "SNK-GRANOLA": Decimal("5"),
        }

    monkeypatch.setattr(cli.bll, "calculate_inventory", fake_calculate)

    # Act
    result = cli.run_stock_report(runtime_context, args)
    captured = capsys.readouterr().out

    # Assert
    assert result == 0
    assert "COF-ESPRESSO" in captured
    assert "10" in captured
    assert "SNK-GRANOLA" in captured
