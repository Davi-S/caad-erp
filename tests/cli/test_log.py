import argparse

from caad_erp import cli, core_logic


def test_register_log_command_returns_spec():
    """register_log_command should return a CommandSpec."""

    spec = cli.register_log_command()
    assert spec.name == "log"
    assert spec.help_text
    assert callable(spec.execute)


def test_register_log_command_configures_arguments():
    """register_log_command should define transaction-log arguments."""

    parser = argparse.ArgumentParser(prog="cli")
    subparsers = parser.add_subparsers(dest="command")
    spec = cli.register_log_command()
    spec.register(subparsers)
    namespace = parser.parse_args(["log"])
    assert namespace.command == "log"


def test_run_log_report_invokes_bll(runtime_context, monkeypatch):
    """run_log_report should perform a read-only workflow."""

    args = argparse.Namespace()
    called = {}

    def fake_list(context: core_logic.RuntimeContext) -> list[object]:
        called["context"] = context
        return []

    monkeypatch.setattr(cli.core_logic, "list_transactions", fake_list)
    result = cli.run_log_report(runtime_context, args)
    assert result == 0
    assert called["context"] is runtime_context
