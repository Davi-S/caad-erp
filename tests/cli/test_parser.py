import argparse
import typing as t
from pathlib import Path

import pytest

from caad_erp import bll, cli, exceptions

WRITE_COMMANDS = {
    "add-product",
    "add-salesman",
    "deactivate-product",
    "deactivate-salesman",
    "sale",
    "restock",
    "write-off",
    "pay-debt",
    "void",
}

READ_COMMANDS = {
    "stock",
    "profit",
    "debts",
    "log",
}


def _stub_parser(command: str) -> argparse.ArgumentParser:
    """Create a stub parser that always returns the supplied command."""

    class _Stub(argparse.ArgumentParser):

        def parse_args(  # type: ignore
            self, args: t.Iterable[str] | None = None, namespace: argparse.Namespace | None = None
        ):
            return argparse.Namespace(command=command)

    return _Stub(prog="test")


def _registered_choices(parser: argparse.ArgumentParser) -> set[str]:
    """Return the set of registered sub-command names for assertion helpers."""

    actions = getattr(parser, "_subparsers", None)
    if not actions:
        return set()
    group_actions = actions._group_actions  # type: ignore[attr-defined]
    return set(group_actions[0].choices) if group_actions else set()


def test_build_parser_returns_argument_parser():
    """build_parser should produce a configured ArgumentParser instance."""

    parser = cli.build_parser()
    assert isinstance(parser, argparse.ArgumentParser)


def test_build_parser_sets_program_metadata():
    """build_parser should set user-facing program metadata."""

    parser = cli.build_parser()
    assert parser.prog == "caad-erp-cli"
    assert "Command-line tools for the CAAD ERP workbook." in (
        parser.description or "")


def test_configure_subcommands_registers_write_commands(cli_parser):
    """configure_subcommands should wire all mutating sub-commands."""

    command_table = cli.configure_subcommands(cli_parser)
    for name in WRITE_COMMANDS:
        assert name in command_table
    choices = _registered_choices(cli_parser)
    for name in WRITE_COMMANDS:
        assert name in choices


def test_configure_subcommands_registers_read_commands(cli_parser):
    """configure_subcommands should wire all reporting sub-commands."""

    command_table = cli.configure_subcommands(cli_parser)
    for name in READ_COMMANDS:
        assert name in command_table
    choices = _registered_choices(cli_parser)
    for name in READ_COMMANDS:
        assert name in choices


def test_register_write_commands_returns_command_specs(subparsers_action):
    """register_write_commands should return a mapping of CommandSpec objects."""

    specs = cli.register_write_commands(subparsers_action)
    assert set(specs) == WRITE_COMMANDS
    for spec in specs.values():
        assert isinstance(spec, cli.CommandSpec)


def test_register_write_commands_configures_parsers(subparsers_action):
    """register_write_commands should attach each parser with help text."""

    cli.register_write_commands(subparsers_action)
    for name in WRITE_COMMANDS:
        assert name in subparsers_action.choices


def test_register_read_commands_returns_command_specs(subparsers_action):
    """register_read_commands should return a mapping of CommandSpec objects."""

    specs = cli.register_read_commands(subparsers_action)
    assert set(specs) == READ_COMMANDS
    for spec in specs.values():
        assert isinstance(spec, cli.CommandSpec)


def test_register_read_commands_configures_parsers(subparsers_action):
    """register_read_commands should attach each parser with help text."""

    cli.register_read_commands(subparsers_action)
    for name in READ_COMMANDS:
        assert name in subparsers_action.choices


def test_load_runtime_context_uses_provided_path(config_file, monkeypatch):
    """load_runtime_context should load settings from the specified config path."""

    sentinel_context = object()

    def fake_loader(path: Path | None) -> object:
        assert path == config_file
        return sentinel_context

    monkeypatch.setattr(bll, "load_runtime_context", fake_loader)
    assert cli.load_runtime_context(config_file) is sentinel_context


def test_load_runtime_context_supports_defaults(monkeypatch, tmp_path):
    """load_runtime_context should resolve config.ini from the working directory."""

    config_path = tmp_path / "config.ini"
    config_path.write_text("[Dummy]\nkey=value\n")
    sentinel_context = object()

    def fake_loader(path: Path | None) -> object:
        assert path == config_path
        return sentinel_context

    monkeypatch.setattr(bll, "load_runtime_context", fake_loader)
    monkeypatch.chdir(tmp_path)
    assert cli.load_runtime_context() is sentinel_context


def test_dispatch_command_invokes_executor(runtime_context, command_table_entry):
    """dispatch_command should call the executor associated with the command."""

    command_name, spec = command_table_entry
    command_table = {command_name: spec}
    args = argparse.Namespace(command=command_name)
    result = cli.dispatch_command(runtime_context, args, command_table)
    assert result == 0
    assert spec.execute.__dict__["called"] is True


def test_dispatch_command_handles_unknown_commands(runtime_context):
    """dispatch_command should raise a clear error for unknown commands."""

    args = argparse.Namespace(command="unknown")
    with pytest.raises(KeyError):
        cli.dispatch_command(runtime_context, args, {})


def test_build_command_table_indexes_specs(command_spec_iterable):
    """build_command_table should index specs by their command names."""

    table = cli.build_command_table(command_spec_iterable)
    assert set(table) == {spec.name for spec in command_spec_iterable}


def test_build_command_table_detects_duplicate_commands():
    """build_command_table should guard against duplicate command names."""

    specs = [
        cli.CommandSpec("alpha", "A", lambda s: s.add_parser(
            "alpha"), lambda c, a: 0),
        cli.CommandSpec("alpha", "Duplicate",
                        lambda s: s.add_parser("alpha"), lambda c, a: 0),
    ]
    with pytest.raises(ValueError):
        cli.build_command_table(specs)


@pytest.mark.parametrize(
    "error, expected",
    [
        (exceptions.BusinessRuleViolation("invalid"), 2),
        (FileNotFoundError("missing"), 3),
        (ValueError("bad value"), 1),
    ],
)
def test_handle_cli_error_returns_exit_code(error: Exception, expected: int, caplog: pytest.LogCaptureFixture):
    """handle_cli_error should convert exceptions into exit codes."""

    caplog.set_level("ERROR")
    exit_code = cli.handle_cli_error(error)
    assert exit_code == expected
    assert caplog.records


def test_handle_cli_error_logs_human_readable_message(caplog: pytest.LogCaptureFixture):
    """handle_cli_error should emit a user-friendly log message."""

    caplog.set_level("ERROR")
    error = exceptions.BusinessRuleViolation("invalid")
    cli.handle_cli_error(error)
    assert any("invalid" in record.getMessage() for record in caplog.records)


def test_persist_workbook_saves_changes(runtime_context, monkeypatch):
    """persist_workbook should request the data layer to save the workbook."""

    called = {}

    def fake_persist(context: bll.RuntimeContext) -> None:
        called["context"] = context

    monkeypatch.setattr(cli.bll, "persist_context", fake_persist)
    cli.persist_workbook(runtime_context)
    assert called["context"] is runtime_context


def test_persist_workbook_handles_read_only_workbooks(runtime_context, monkeypatch):
    """persist_workbook should handle read-only workbook scenarios gracefully."""

    def fake_persist(_: bll.RuntimeContext) -> None:
        raise PermissionError("read-only")

    monkeypatch.setattr(cli.bll, "persist_context", fake_persist)
    with pytest.raises(RuntimeError, match="read-only"):
        cli.persist_workbook(runtime_context)


def test_main_executes_specified_command(monkeypatch, runtime_context):
    """main should execute the command parsed from argv."""

    parser = _stub_parser(command="sale")
    command_table = {"sale": cli.CommandSpec(
        "sale", "help", lambda _: parser, lambda *_: 0)}

    monkeypatch.setattr(cli.parser, "build_parser", lambda: parser)
    monkeypatch.setattr(cli.parser, "configure_subcommands",
                        lambda _: command_table)
    monkeypatch.setattr(cli.parser, "load_runtime_context",
                        lambda path=None: runtime_context)

    called = {}

    def fake_dispatch(context: bll.RuntimeContext, args: argparse.Namespace, table: t.Mapping[str, cli.CommandSpec]) -> int:
        called["context"] = context
        called["args"] = args
        called["table"] = table
        return 0

    monkeypatch.setattr(cli.parser, "dispatch_command", fake_dispatch)
    monkeypatch.setattr(cli.parser, "persist_workbook",
                        lambda ctx: called.setdefault("persisted", ctx))

    exit_code = cli.main(["sale"])
    assert exit_code == 0
    assert called["context"] is runtime_context
    assert called["persisted"] is runtime_context
    assert called["args"].command == "sale"


def test_main_handles_bll_errors(monkeypatch, runtime_context):
    """main should surface business rule violations as non-zero exits."""

    parser = _stub_parser(command="sale")
    command_table = {"sale": cli.CommandSpec(
        "sale", "help", lambda _: parser, lambda *_: 0)}

    monkeypatch.setattr(cli.parser, "build_parser", lambda: parser)
    monkeypatch.setattr(cli.parser, "configure_subcommands",
                        lambda _: command_table)
    monkeypatch.setattr(cli.parser, "load_runtime_context",
                        lambda path=None: runtime_context)

    def fake_dispatch(*_: object) -> int:
        raise exceptions.BusinessRuleViolation("invalid")

    monkeypatch.setattr(cli.parser, "dispatch_command", fake_dispatch)
    monkeypatch.setattr(
        cli.parser,
        "persist_workbook",
        lambda _: iter(()).throw(AssertionError(  # type: ignore
            "should not persist")),
    )

    handled = {}

    def fake_handle(error: Exception) -> int:
        handled["error"] = error
        return 99

    monkeypatch.setattr(cli.parser, "handle_cli_error", fake_handle)
    exit_code = cli.main(["sale"])
    assert exit_code == 99
    assert isinstance(handled["error"], exceptions.BusinessRuleViolation)


def test_main_persists_on_success(monkeypatch, runtime_context):
    """main should persist workbook changes when the command succeeds."""

    parser = _stub_parser(command="profit")
    command_table = {"profit": cli.CommandSpec(
        "profit", "help", lambda _: parser, lambda *_: 0)}

    monkeypatch.setattr(cli.parser, "build_parser", lambda: parser)
    monkeypatch.setattr(cli.parser, "configure_subcommands",
                        lambda _: command_table)
    monkeypatch.setattr(cli.parser, "load_runtime_context",
                        lambda path=None: runtime_context)
    monkeypatch.setattr(cli.parser, "dispatch_command", lambda *_: 0)

    persisted = {}

    def fake_persist(context: bll.RuntimeContext) -> None:
        persisted["context"] = context

    monkeypatch.setattr(cli.parser, "persist_workbook", fake_persist)
    exit_code = cli.main(["profit"])
    assert exit_code == 0
    assert persisted["context"] is runtime_context
