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
    """Given the parser factory When build_parser runs Then an argparse parser is returned."""

    # Arrange
    # No additional setup required for parser construction.

    # Act
    parser = cli.build_parser()

    # Assert
    assert isinstance(parser, argparse.ArgumentParser)


def test_build_parser_sets_program_metadata():
    """Given the parser factory When build_parser runs Then program metadata is populated."""

    # Arrange
    # No additional setup required for parser construction.

    # Act
    parser = cli.build_parser()

    # Assert
    assert parser.prog == "caad-erp-cli"
    assert "Command-line tools for the CAAD ERP workbook." in (
        parser.description or "")


def test_configure_subcommands_registers_write_commands(cli_parser):
    """Given a base parser When configure_subcommands runs Then all write commands register."""

    # Arrange
    parser = cli_parser

    # Act
    command_table = cli.configure_subcommands(parser)
    choices = _registered_choices(parser)

    # Assert
    for name in WRITE_COMMANDS:
        assert name in command_table
    for name in WRITE_COMMANDS:
        assert name in choices


def test_configure_subcommands_registers_read_commands(cli_parser):
    """Given a base parser When configure_subcommands runs Then all read commands register."""

    # Arrange
    parser = cli_parser

    # Act
    command_table = cli.configure_subcommands(parser)
    choices = _registered_choices(parser)

    # Assert
    for name in READ_COMMANDS:
        assert name in command_table
    for name in READ_COMMANDS:
        assert name in choices


def test_register_write_commands_returns_command_specs(subparsers_action):
    """Given subparser actions When register_write_commands executes Then command specs are returned."""

    # Arrange
    action = subparsers_action

    # Act
    specs = cli.register_write_commands(action)

    # Assert
    assert set(specs) == WRITE_COMMANDS
    for spec in specs.values():
        assert isinstance(spec, cli.CommandSpec)


def test_register_write_commands_configures_parsers(subparsers_action):
    """Given subparser actions When register_write_commands executes Then parser choices include each command."""

    # Arrange
    action = subparsers_action

    # Act
    cli.register_write_commands(action)

    # Assert
    for name in WRITE_COMMANDS:
        assert name in action.choices


def test_register_read_commands_returns_command_specs(subparsers_action):
    """Given subparser actions When register_read_commands executes Then command specs are returned."""

    # Arrange
    action = subparsers_action

    # Act
    specs = cli.register_read_commands(action)

    # Assert
    assert set(specs) == READ_COMMANDS
    for spec in specs.values():
        assert isinstance(spec, cli.CommandSpec)


def test_register_read_commands_configures_parsers(subparsers_action):
    """Given subparser actions When register_read_commands executes Then parser choices include each command."""

    # Arrange
    action = subparsers_action

    # Act
    cli.register_read_commands(action)

    # Assert
    for name in READ_COMMANDS:
        assert name in action.choices


def test_load_runtime_context_uses_provided_path(config_file, monkeypatch):
    """Given an explicit config path When load_runtime_context executes Then that path is forwarded."""

    # Arrange
    sentinel_context = object()

    def fake_loader(path: Path | None) -> object:
        assert path == config_file
        return sentinel_context

    monkeypatch.setattr(bll, "load_runtime_context", fake_loader)

    # Act
    result = cli.load_runtime_context(config_file)

    # Assert
    assert result is sentinel_context


def test_load_runtime_context_supports_defaults(monkeypatch, tmp_path):
    """Given a working directory config.ini When load_runtime_context executes Then the default path is used."""

    # Arrange
    config_path = tmp_path / "config.ini"
    config_path.write_text("[Dummy]\nkey=value\n")
    sentinel_context = object()

    def fake_loader(path: Path | None) -> object:
        assert path == config_path
        return sentinel_context

    monkeypatch.setattr(bll, "load_runtime_context", fake_loader)
    monkeypatch.chdir(tmp_path)

    # Act
    result = cli.load_runtime_context()

    # Assert
    assert result is sentinel_context


def test_dispatch_command_invokes_executor(runtime_context, command_table_entry):
    """Given a known command When dispatch_command runs Then its executor is invoked."""

    # Arrange
    command_name, spec = command_table_entry
    command_table = {command_name: spec}
    args = argparse.Namespace(command=command_name)

    # Act
    result = cli.dispatch_command(runtime_context, args, command_table)

    # Assert
    assert result == 0
    assert spec.execute.__dict__["called"] is True


def test_dispatch_command_handles_unknown_commands(runtime_context):
    """Given an unknown command When dispatch_command runs Then KeyError is raised."""

    # Arrange
    args = argparse.Namespace(command="unknown")

    # Act / Assert
    with pytest.raises(KeyError):
        cli.dispatch_command(runtime_context, args, {})


def test_build_command_table_indexes_specs(command_spec_iterable):
    """Given command specs When build_command_table executes Then the mapping keys match spec names."""

    # Arrange
    specs = command_spec_iterable

    # Act
    table = cli.build_command_table(specs)

    # Assert
    assert set(table) == {spec.name for spec in specs}


def test_build_command_table_detects_duplicate_commands():
    """Given duplicate command specs When build_command_table runs Then ValueError is raised."""

    # Arrange
    specs = [
        cli.CommandSpec("alpha", "A", lambda s: s.add_parser(
            "alpha"), lambda c, a: 0),
        cli.CommandSpec("alpha", "Duplicate",
                        lambda s: s.add_parser("alpha"), lambda c, a: 0),
    ]

    # Act / Assert
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
    """Given CLI exceptions When handle_cli_error executes Then the mapped exit code is returned."""

    # Arrange
    caplog.set_level("ERROR")

    # Act
    exit_code = cli.handle_cli_error(error)

    # Assert
    assert exit_code == expected
    assert caplog.records


def test_handle_cli_error_logs_human_readable_message(caplog: pytest.LogCaptureFixture):
    """Given a CLI exception When handle_cli_error runs Then a readable message is logged."""

    # Arrange
    caplog.set_level("ERROR")
    error = exceptions.BusinessRuleViolation("invalid")

    # Act
    cli.handle_cli_error(error)

    # Assert
    assert any("invalid" in record.getMessage() for record in caplog.records)


def test_persist_workbook_saves_changes(runtime_context, monkeypatch):
    """Given a runtime context When persist_workbook executes Then the BLL persistence helper is called."""

    # Arrange
    called = {}

    def fake_persist(context: bll.RuntimeContext) -> None:
        called["context"] = context

    monkeypatch.setattr(cli.bll, "persist_context", fake_persist)

    # Act
    cli.persist_workbook(runtime_context)

    # Assert
    assert called["context"] is runtime_context


def test_persist_workbook_handles_read_only_workbooks(runtime_context, monkeypatch):
    """Given a read-only persistence error When persist_workbook runs Then RuntimeError is raised."""

    # Arrange
    def fake_persist(_: bll.RuntimeContext) -> None:
        raise PermissionError("read-only")

    monkeypatch.setattr(cli.bll, "persist_context", fake_persist)

    # Act / Assert
    with pytest.raises(RuntimeError, match="read-only"):
        cli.persist_workbook(runtime_context)


def test_main_executes_specified_command(monkeypatch, runtime_context):
    """Given CLI arguments When main executes Then the dispatched command runs and persists."""

    # Arrange
    parser = _stub_parser(command="sale")
    command_table = {"sale": cli.CommandSpec(
        "sale", "help", lambda _: parser, lambda *_: 0)}
    monkeypatch.setattr(cli.parser, "build_parser", lambda: parser)
    monkeypatch.setattr(cli.parser, "configure_subcommands",
                        lambda _: command_table)
    monkeypatch.setattr(cli.parser, "load_runtime_context",
                        lambda path=None: runtime_context)
    called = {}

    def fake_dispatch(
        context: bll.RuntimeContext, args: argparse.Namespace, table: t.Mapping[str, cli.CommandSpec]
    ) -> int:
        called["context"] = context
        called["args"] = args
        called["table"] = table
        return 0

    monkeypatch.setattr(cli.parser, "dispatch_command", fake_dispatch)
    monkeypatch.setattr(cli.parser, "persist_workbook",
                        lambda ctx: called.setdefault("persisted", ctx))

    # Act
    exit_code = cli.main(["sale"])

    # Assert
    assert exit_code == 0
    assert called["context"] is runtime_context
    assert called["persisted"] is runtime_context
    assert called["args"].command == "sale"


def test_main_handles_bll_errors(monkeypatch, runtime_context):
    """Given a business rule failure When main executes Then the error handler determines the exit code."""

    # Arrange
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
        lambda _: iter(()).throw(AssertionError(
            "should not persist")),  # type: ignore[arg-type]
    )
    handled = {}

    def fake_handle(error: Exception) -> int:
        handled["error"] = error
        return 99

    monkeypatch.setattr(cli.parser, "handle_cli_error", fake_handle)

    # Act
    exit_code = cli.main(["sale"])

    # Assert
    assert exit_code == 99
    assert isinstance(handled["error"], exceptions.BusinessRuleViolation)


def test_main_persists_on_success(monkeypatch, runtime_context):
    """Given a successful command When main executes Then workbook changes are persisted."""

    # Arrange
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

    # Act
    exit_code = cli.main(["profit"])

    # Assert
    assert exit_code == 0
    assert persisted["context"] is runtime_context
