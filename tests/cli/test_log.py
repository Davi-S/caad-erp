import argparse
from decimal import Decimal
from types import SimpleNamespace

from caad_erp import cli, bll


def test_register_log_command_returns_spec():
    """
    Given the log registration 
    When register_log_command runs 
    Then a command spec returns.
    """

    # Arrange
    # No additional setup required for registration.

    # Act
    spec = cli.register_log_command()

    # Assert
    assert spec.name == "log"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_log_command_configures_arguments():
    """
    Given the log parser 
    When arguments are parsed 
    Then the namespace captures the command.
    """

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
    """
    Given parsed arguments 
    When run_log_report executes 
    Then the BLL list function is invoked.
    """

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


def test_run_log_report_prints_transactions(runtime_context, monkeypatch, capsys):
    """
    Given existing log entries 
    When run_log_report executes 
    Then the CLI prints a transaction listing.
    """

    # Arrange
    args = argparse.Namespace()
    transaction = SimpleNamespace(
        transaction_id="20250101000000000001",
        timestamp_iso="2025-01-01T12:00:00+00:00",
        transaction_type="SALE",
        product_id="COF-ESPRESSO",
        salesman_id="GRR20240001",
        payment_type="Cash",
        quantity_change=Decimal("-2"),
        total_revenue=Decimal("7.00"),
        total_cost=Decimal("0.00"),
        linked_transaction_id=None,
        notes="Morning sale",
    )

    def fake_list(context: bll.RuntimeContext) -> list[object]:
        assert context is runtime_context
        return [transaction]

    monkeypatch.setattr(cli.bll, "list_transactions", fake_list)

    # Act
    result = cli.run_log_report(runtime_context, args)
    captured = capsys.readouterr().out

    # Assert
    assert result == 0
    assert "Transaction log:" in captured
    assert "20250101000000000001" in captured
    assert "SALE" in captured
    assert "Morning sale" in captured
