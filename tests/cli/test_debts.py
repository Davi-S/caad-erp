import argparse
import typing as t
from decimal import Decimal

from caad_erp import cli, bll
from caad_erp.bll import reports


def test_register_debts_command_returns_spec():
    """
    Given the debts registration 
    When register_debts_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_debts_command()

    # Assert
    assert spec.name == "debts"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_debts_command_configures_arguments():
    """
    Given the debts parser 
    When arguments are parsed 
    Then the namespace captures the command.
    """

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
    """
    Given parsed arguments 
    When run_debts_report executes 
    Then the BLL calculator is invoked.
    """

    # Arrange
    args = argparse.Namespace()
    called = {}

    def fake_summary(context: bll.RuntimeContext) -> t.Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(cli.bll, "calculate_outstanding_debts", fake_summary)

    # Act
    result = cli.run_debts_report(runtime_context, args)

    # Assert
    assert result == 0
    assert called["context"] is runtime_context


def test_run_debts_report_prints_balances(runtime_context, monkeypatch, capsys):
    """
    Given outstanding credit balances 
    When run_debts_report executes 
    Then the CLI prints the expected totals.
    """

    # Arrange
    args = argparse.Namespace()
    balance = reports.OutstandingDebt(
        transaction_id="TXN-001",
        timestamp_iso="2025-01-01T10:00:00",
        product_id="COF-ESPRESSO",
        salesman_id="GRR20240001",
        quantity=Decimal("3"),
        expected_amount=Decimal("9.00"),
        amount_paid=Decimal("2.00"),
        balance=Decimal("7.00"),
    )

    def fake_summary(context: bll.RuntimeContext) -> t.Mapping[str, t.Any]:
        assert context is runtime_context
        return {
            "balances": [balance],
            "total_outstanding": Decimal("7.00"),
        }

    monkeypatch.setattr(cli.bll, "calculate_outstanding_debts", fake_summary)

    # Act
    result = cli.run_debts_report(runtime_context, args)
    captured = capsys.readouterr().out

    # Assert
    assert result == 0
    assert "TXN-001" in captured
    assert "7.00" in captured
    assert "Outstanding credit balances" in captured
