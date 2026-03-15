import argparse
import io
import sys
from pathlib import Path

import openpyxl
import pytest

from caad_erp import bll, constants
from caad_erp.cli import command_spec, repl
from caad_erp.settings import AppSettings


def _make_context(data_file: Path) -> bll.RuntimeContext:
    wb = openpyxl.Workbook()
    settings = AppSettings(
        data_file=data_file,
        lounge_name="Test",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
        default_salesman_id="S001",
    )
    return bll.RuntimeContext(settings=settings, workbook=wb)


def _run_with_stdin(text: str, func):
    original_stdin = sys.stdin
    sys.stdin = io.StringIO(text)
    try:
        return func()
    finally:
        sys.stdin = original_stdin


def test_run_repl_returns_zero_after_eof(tmp_path: Path) -> None:
    """
    GIVEN interactive input that raises EOFError immediately
    WHEN run_repl is called
    THEN REPL exits cleanly with status code zero
    """
    # Arrange
    context = _make_context(tmp_path / "data.xlsx")
    parser_obj = argparse.ArgumentParser()

    # Act
    exit_code = _run_with_stdin(
        "",
        lambda: repl.run_repl(context, parser_obj, {}),
    )

    # Assert
    assert exit_code == 0


@pytest.mark.parametrize("exit_token", ["exit", "quit"])
def test_run_repl_exits_on_exit_tokens(exit_token, tmp_path: Path) -> None:
    """
    GIVEN interactive input beginning with exit or quit token
    WHEN run_repl processes the line
    THEN loop exits and status code zero is returned
    """
    # Arrange
    context = _make_context(tmp_path / "data.xlsx")
    parser_obj = argparse.ArgumentParser()

    # Act
    exit_code = _run_with_stdin(
        f"{exit_token}\n",
        lambda: repl.run_repl(context, parser_obj, {}),
    )

    # Assert
    assert exit_code == 0


def test_run_repl_ignores_blank_lines(tmp_path: Path) -> None:
    """
    GIVEN interactive input containing blank or whitespace-only lines
    WHEN run_repl processes input
    THEN blank lines are ignored without command dispatch
    """
    # Arrange
    calls = []

    def _execute(context, args):
        calls.append("ran")
        return 0

    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    sub.add_parser("x")
    table = {
        "x": command_spec.CommandSpec(
            name="x",
            help_text="x",
            register=lambda action: action.add_parser("x"),
            execute=_execute,
            is_mutating=False,
        )
    }
    context = _make_context(tmp_path / "data.xlsx")

    # Act
    _run_with_stdin("\n   \n x\nexit\n", lambda: repl.run_repl(
        context, parser_obj, table))

    # Assert
    assert calls == ["ran"]


def test_run_repl_handles_shlex_split_errors_and_continues(tmp_path: Path, capsys) -> None:
    """
    GIVEN malformed shell-like input causing shlex parsing failure
    WHEN run_repl processes the line
    THEN an error message is printed and REPL continues
    """
    # Arrange
    context = _make_context(tmp_path / "data.xlsx")
    parser_obj = argparse.ArgumentParser()

    # Act
    _run_with_stdin("\"unterminated\nexit\n",
                    lambda: repl.run_repl(context, parser_obj, {}))

    # Assert
    assert "error:" in capsys.readouterr().out


def test_run_repl_absorbs_argparse_system_exit_and_continues(tmp_path: Path) -> None:
    """
    GIVEN parser.parse_args raising SystemExit due to parse error or help
    WHEN run_repl processes the line
    THEN exception is absorbed and REPL continues
    """
    # Arrange
    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    cmd = sub.add_parser("x")
    cmd.add_argument("--required", required=True)
    context = _make_context(tmp_path / "data.xlsx")

    # Act
    exit_code = _run_with_stdin(
        "x\nexit\n", lambda: repl.run_repl(context, parser_obj, {}))

    # Assert
    assert exit_code == 0


def test_run_repl_rejects_unknown_or_repl_command_inside_session(tmp_path: Path, capsys) -> None:
    """
    GIVEN parsed arguments whose command is missing or unavailable in command table
    WHEN run_repl processes the command
    THEN error message is printed and execution continues
    """
    # Arrange
    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    sub.add_parser("repl")
    context = _make_context(tmp_path / "data.xlsx")

    # Act
    _run_with_stdin("repl\nexit\n", lambda: repl.run_repl(
        context, parser_obj, {}))

    # Assert
    assert "not available inside the REPL" in capsys.readouterr().out


def test_run_repl_executes_known_command_spec(tmp_path: Path) -> None:
    """
    GIVEN parsed arguments for a known command present in command table
    WHEN run_repl processes the command
    THEN corresponding execute function is called
    """
    # Arrange
    calls = []

    def _execute(context, args):
        calls.append(args.command)
        return 0

    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    sub.add_parser("x")
    table = {
        "x": command_spec.CommandSpec(
            name="x",
            help_text="x",
            register=lambda action: action.add_parser("x"),
            execute=_execute,
            is_mutating=False,
        )
    }
    context = _make_context(tmp_path / "data.xlsx")

    # Act
    _run_with_stdin("x\nexit\n", lambda: repl.run_repl(
        context, parser_obj, table))

    # Assert
    assert calls == ["x"]


def test_run_repl_handles_command_execution_exceptions_and_continues(tmp_path: Path, capsys) -> None:
    """
    GIVEN command execution raising an exception
    WHEN run_repl processes the command
    THEN error is printed and REPL loop continues
    """
    # Arrange
    def _execute(context, args):
        raise RuntimeError("boom")

    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    sub.add_parser("x")
    table = {
        "x": command_spec.CommandSpec(
            name="x",
            help_text="x",
            register=lambda action: action.add_parser("x"),
            execute=_execute,
            is_mutating=False,
        )
    }
    context = _make_context(tmp_path / "data.xlsx")

    # Act
    _run_with_stdin("x\nexit\n", lambda: repl.run_repl(
        context, parser_obj, table))

    # Assert
    assert "error: boom" in capsys.readouterr().out


def test_run_repl_persists_after_successful_mutating_command(tmp_path: Path) -> None:
    """
    GIVEN a mutating command that returns zero
    WHEN run_repl processes the command
    THEN bll.persist_context is called
    """
    # Arrange
    data_file = tmp_path / "persisted.xlsx"

    def _execute(context, args):
        context.workbook.active["A1"] = "saved"
        return 0

    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    sub.add_parser("x")
    table = {
        "x": command_spec.CommandSpec(
            name="x",
            help_text="x",
            register=lambda action: action.add_parser("x"),
            execute=_execute,
            is_mutating=True,
        )
    }
    context = _make_context(data_file)

    # Act
    _run_with_stdin("x\nexit\n", lambda: repl.run_repl(
        context, parser_obj, table))

    # Assert
    assert data_file.exists()


def test_run_repl_does_not_persist_for_non_mutating_command(tmp_path: Path) -> None:
    """
    GIVEN a non-mutating command that returns zero
    WHEN run_repl processes the command
    THEN persistence is not attempted
    """
    # Arrange
    data_file = tmp_path / "not_persisted.xlsx"

    def _execute(context, args):
        context.workbook.active["A1"] = "changed"
        return 0

    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    sub.add_parser("x")
    table = {
        "x": command_spec.CommandSpec(
            name="x",
            help_text="x",
            register=lambda action: action.add_parser("x"),
            execute=_execute,
            is_mutating=False,
        )
    }
    context = _make_context(data_file)

    # Act
    _run_with_stdin("x\nexit\n", lambda: repl.run_repl(
        context, parser_obj, table))

    # Assert
    assert not data_file.exists()


def test_run_repl_does_not_persist_for_nonzero_exit_code(tmp_path: Path) -> None:
    """
    GIVEN a command returning nonzero exit code
    WHEN run_repl processes the command
    THEN persistence is not attempted
    """
    # Arrange
    data_file = tmp_path / "not_persisted.xlsx"

    def _execute(context, args):
        return 5

    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    sub.add_parser("x")
    table = {
        "x": command_spec.CommandSpec(
            name="x",
            help_text="x",
            register=lambda action: action.add_parser("x"),
            execute=_execute,
            is_mutating=True,
        )
    }
    context = _make_context(data_file)

    # Act
    _run_with_stdin("x\nexit\n", lambda: repl.run_repl(
        context, parser_obj, table))

    # Assert
    assert not data_file.exists()


def test_run_repl_reports_persist_failures_without_crashing(tmp_path: Path, capsys) -> None:
    """
    GIVEN successful mutating command followed by persistence failure
    WHEN run_repl attempts to persist
    THEN persistence error is reported and session continues
    """
    # Arrange
    data_file = tmp_path / "as_dir"
    data_file.mkdir()

    def _execute(context, args):
        context.workbook.active["A1"] = "changed"
        return 0

    parser_obj = argparse.ArgumentParser()
    sub = parser_obj.add_subparsers(dest="command")
    sub.add_parser("x")
    table = {
        "x": command_spec.CommandSpec(
            name="x",
            help_text="x",
            register=lambda action: action.add_parser("x"),
            execute=_execute,
            is_mutating=True,
        )
    }
    context = _make_context(data_file)

    # Act
    exit_code = _run_with_stdin(
        "x\nexit\n", lambda: repl.run_repl(context, parser_obj, table))

    # Assert
    assert exit_code == 0
    assert "failed to save workbook" in capsys.readouterr().out
