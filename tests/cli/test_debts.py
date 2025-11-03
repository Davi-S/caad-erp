import argparse
import typing as t
from decimal import Decimal

from caad_erp import cli, bll


def test_register_debts_command_returns_spec():
    """register_debts_command should return a CommandSpec."""

    spec = cli.register_debts_command()
    assert spec.name == "debts"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_debts_command_configures_arguments():
    """register_debts_command should define debt-report arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_debts_command()
    spec.register(subparsers)
    namespace = parser.parse_args(["debts"])
    assert namespace.command == "debts"


def test_run_debts_report_invokes_bll(runtime_context, monkeypatch):
    """run_debts_report should perform a read-only workflow."""

    args = argparse.Namespace()
    called = {}

    def fake_summary(context: bll.RuntimeContext) -> t.Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(
        cli.bll, "calculate_outstanding_debts", fake_summary, raising=False)
    result = cli.run_debts_report(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
