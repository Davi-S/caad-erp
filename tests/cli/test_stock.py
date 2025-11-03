import argparse
import typing as t
from decimal import Decimal

from caad_erp import cli, core_logic


def test_register_stock_command_returns_spec():
    """register_stock_command should return a CommandSpec."""

    spec = cli.register_stock_command()
    assert spec.name == "stock"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_stock_command_configures_arguments():
    """register_stock_command should define stock-report arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_stock_command()
    spec.register(subparsers)
    namespace = parser.parse_args(["stock"])
    assert namespace.command == "stock"


def test_run_stock_report_invokes_bll(runtime_context, monkeypatch):
    """run_stock_report should perform a read-only workflow."""

    args = argparse.Namespace()
    called = {}

    def fake_calculate(context: core_logic.RuntimeContext) -> t.Mapping[str, Decimal]:
        called["context"] = context
        return {}

    monkeypatch.setattr(cli.core_logic, "calculate_inventory", fake_calculate)
    result = cli.run_stock_report(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
