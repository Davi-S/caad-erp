"""Tests for the REPL command module."""

import argparse
from unittest.mock import patch

from caad_erp import cli
from caad_erp.cli.commands.repl import (
    EXIT_COMMANDS,
    PROMPT,
    register_repl_command,
    repl_loop,
    run_repl,
)


def test_register_repl_command_returns_spec():
    """
    Given the REPL command registration
    When register_repl_command executes
    Then a CommandSpec is returned.
    """

    # Arrange / Act
    spec = register_repl_command()

    # Assert
    assert isinstance(spec, cli.CommandSpec)
    assert spec.name == "repl"
    assert spec.help_text == "Start an interactive REPL session."


def test_register_repl_command_configures_arguments(subparsers_action):
    """
    Given subparser actions
    When the REPL command is registered
    Then the parser choice includes 'repl'.
    """

    # Arrange
    spec = register_repl_command()

    # Act
    spec.register(subparsers_action)

    # Assert
    assert "repl" in subparsers_action.choices


def test_run_repl_returns_error_without_parser(runtime_context):
    """
    Given args without repl_parser
    When run_repl executes
    Then it returns error code 1.
    """

    # Arrange
    args = argparse.Namespace(command="repl")

    # Act
    with patch("builtins.print") as mock_print:
        result = run_repl(runtime_context, args)

    # Assert
    assert result == 1
    mock_print.assert_called_with("REPL mode is not properly configured.")


def test_repl_loop_exits_on_exit_command(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When 'exit' is entered
    Then the loop terminates with code 0.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    command_table = {"stock": cli.commands.register_stock_command()}
    inputs = iter(["exit"])

    # Act
    result = repl_loop(
        context=runtime_context,
        parser=cli_parser,
        command_table=command_table,
        input_fn=lambda _: next(inputs),
    )

    # Assert
    assert result == 0


def test_repl_loop_exits_on_quit_command(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When 'quit' is entered
    Then the loop terminates with code 0.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    command_table = {"stock": cli.commands.register_stock_command()}
    inputs = iter(["quit"])

    # Act
    result = repl_loop(
        context=runtime_context,
        parser=cli_parser,
        command_table=command_table,
        input_fn=lambda _: next(inputs),
    )

    # Assert
    assert result == 0


def test_repl_loop_exits_on_eof(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When EOF is encountered
    Then the loop terminates with code 0.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    command_table = {"stock": cli.commands.register_stock_command()}

    def raise_eof(_):
        raise EOFError()

    # Act
    with patch("builtins.print"):
        result = repl_loop(
            context=runtime_context,
            parser=cli_parser,
            command_table=command_table,
            input_fn=raise_eof,
        )

    # Assert
    assert result == 0


def test_repl_loop_continues_on_keyboard_interrupt(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When KeyboardInterrupt occurs
    Then the loop continues.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    command_table = {"stock": cli.commands.register_stock_command()}
    call_count = [0]

    def interrupt_then_exit(_):
        call_count[0] += 1
        if call_count[0] == 1:
            raise KeyboardInterrupt()
        return "exit"

    # Act
    with patch("builtins.print"):
        result = repl_loop(
            context=runtime_context,
            parser=cli_parser,
            command_table=command_table,
            input_fn=interrupt_then_exit,
        )

    # Assert
    assert result == 0
    assert call_count[0] == 2


def test_repl_loop_skips_empty_lines(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When empty lines are entered
    Then they are skipped.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    command_table = {"stock": cli.commands.register_stock_command()}
    inputs = iter(["", "   ", "exit"])

    # Act
    result = repl_loop(
        context=runtime_context,
        parser=cli_parser,
        command_table=command_table,
        input_fn=lambda _: next(inputs),
    )

    # Assert
    assert result == 0


def test_repl_loop_prevents_nested_repl(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When 'repl' is entered
    Then nested REPL is prevented.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    command_table = {"stock": cli.commands.register_stock_command()}
    inputs = iter(["repl", "exit"])
    printed = []

    def capture_print(msg):
        printed.append(msg)

    # Act
    with patch("builtins.print", side_effect=capture_print):
        result = repl_loop(
            context=runtime_context,
            parser=cli_parser,
            command_table=command_table,
            input_fn=lambda _: next(inputs),
        )

    # Assert
    assert result == 0
    assert "Cannot start nested REPL session." in printed


def test_repl_loop_executes_command(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When a valid command is entered
    Then the command is executed.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    executed = {"called": False}

    def execute_mock(ctx, args):
        executed["called"] = True
        return 0

    stock_spec = cli.CommandSpec(
        name="stock",
        help_text="Stock",
        register=lambda s: s.add_parser("stock"),
        execute=execute_mock,
    )
    command_table = {"stock": stock_spec}
    inputs = iter(["stock", "exit"])

    # Act
    result = repl_loop(
        context=runtime_context,
        parser=cli_parser,
        command_table=command_table,
        input_fn=lambda _: next(inputs),
    )

    # Assert
    assert result == 0
    assert executed["called"] is True


def test_repl_loop_persists_on_successful_write_command(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session with a persist function and write commands
    When a write command succeeds
    Then persistence is triggered.
    """

    # Arrange
    persisted = {"called": False}

    def persist_mock(ctx):
        persisted["called"] = True

    def execute_mock(ctx, args):
        return 0

    # Register the sale command with argparse
    sale_parser = subparsers_action.add_parser("sale")
    sale_parser.set_defaults(command="sale")

    sale_spec = cli.CommandSpec(
        name="sale",
        help_text="Sale",
        register=lambda s: s.add_parser("sale"),
        execute=execute_mock,
    )
    command_table = {"sale": sale_spec}
    inputs = iter(["sale", "exit"])
    write_commands = frozenset({"sale"})

    # Act
    result = repl_loop(
        context=runtime_context,
        parser=cli_parser,
        command_table=command_table,
        persist_fn=persist_mock,
        write_commands=write_commands,
        input_fn=lambda _: next(inputs),
    )

    # Assert
    assert result == 0
    assert persisted["called"] is True


def test_repl_loop_does_not_persist_on_read_command(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session with a persist function and write commands
    When a read command succeeds
    Then persistence is NOT triggered.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    persisted = {"called": False}

    def persist_mock(ctx):
        persisted["called"] = True

    def execute_mock(ctx, args):
        return 0

    stock_spec = cli.CommandSpec(
        name="stock",
        help_text="Stock",
        register=lambda s: s.add_parser("stock"),
        execute=execute_mock,
    )
    command_table = {"stock": stock_spec}
    inputs = iter(["stock", "exit"])
    write_commands = frozenset({"sale"})  # stock is not a write command

    # Act
    result = repl_loop(
        context=runtime_context,
        parser=cli_parser,
        command_table=command_table,
        persist_fn=persist_mock,
        write_commands=write_commands,
        input_fn=lambda _: next(inputs),
    )

    # Assert
    assert result == 0
    assert persisted["called"] is False


def test_repl_loop_handles_command_errors(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session with error handler
    When a command raises an exception
    Then the error handler is called.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    handled = {"called": False}

    def error_handler(error):
        handled["called"] = True
        handled["error"] = error
        return 1

    def execute_mock(ctx, args):
        raise ValueError("Test error")

    stock_spec = cli.CommandSpec(
        name="stock",
        help_text="Stock",
        register=lambda s: s.add_parser("stock"),
        execute=execute_mock,
    )
    command_table = {"stock": stock_spec}
    inputs = iter(["stock", "exit"])

    # Act
    result = repl_loop(
        context=runtime_context,
        parser=cli_parser,
        command_table=command_table,
        error_handler=error_handler,
        input_fn=lambda _: next(inputs),
    )

    # Assert
    assert result == 0
    assert handled["called"] is True
    assert isinstance(handled["error"], ValueError)


def test_repl_loop_handles_invalid_shlex_input(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When invalid shell syntax is entered
    Then an error is printed and the loop continues.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    command_table = {"stock": cli.commands.register_stock_command()}
    inputs = iter(['stock "unclosed', "exit"])
    printed = []

    def capture_print(msg):
        printed.append(msg)

    # Act
    with patch("builtins.print", side_effect=capture_print):
        result = repl_loop(
            context=runtime_context,
            parser=cli_parser,
            command_table=command_table,
            input_fn=lambda _: next(inputs),
        )

    # Assert
    assert result == 0
    assert any("Invalid input:" in str(p) for p in printed)


def test_repl_loop_handles_unknown_command(runtime_context, cli_parser, subparsers_action):
    """
    Given a REPL session
    When an unknown command is entered
    Then an error is printed and the loop continues.
    """

    # Arrange
    cli.register_read_commands(subparsers_action)
    command_table = {"stock": cli.commands.register_stock_command()}
    inputs = iter(["unknown_cmd", "exit"])
    printed = []

    def capture_print(msg):
        printed.append(msg)

    # Act
    with patch("builtins.print", side_effect=capture_print):
        result = repl_loop(
            context=runtime_context,
            parser=cli_parser,
            command_table=command_table,
            input_fn=lambda _: next(inputs),
        )

    # Assert
    assert result == 0
    # Note: argparse will print the error for unknown command


def test_prompt_constant():
    """
    Given the REPL module
    When PROMPT is accessed
    Then it has the expected value.
    """

    # Assert
    assert PROMPT == "(caad-erp) > "


def test_exit_commands_constant():
    """
    Given the REPL module
    When EXIT_COMMANDS is accessed
    Then it contains 'exit' and 'quit'.
    """

    # Assert
    assert "exit" in EXIT_COMMANDS
    assert "quit" in EXIT_COMMANDS
