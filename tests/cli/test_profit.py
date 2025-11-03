import argparse
import typing as t
from decimal import Decimal

from caad_erp import cli, bll


def test_register_profit_command_returns_spec():
    """register_profit_command should return a CommandSpec."""

    spec = cli.register_profit_command()
    assert spec.name == "profit"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_profit_command_configures_arguments():
    """register_profit_command should define profit-report arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_profit_command()
    spec.register(subparsers)
    namespace = parser.parse_args(["profit"])
    assert namespace.command == "profit"


def test_run_profit_report_invokes_bll(runtime_context, monkeypatch):
    """run_profit_report should perform a read-only workflow."""

    args = argparse.Namespace()
    called = {}

    def fake_summary(context: bll.RuntimeContext) -> t.Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(
        cli.bll, "calculate_profit_summary", fake_summary)
    result = cli.run_profit_report(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
