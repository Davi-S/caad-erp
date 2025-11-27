"""Interactive REPL mode for the CAAD ERP command-line interface.

This module implements a Read-Eval-Print Loop that maintains a single
RuntimeContext across multiple commands, avoiding expensive I/O and cache
rebuilding on each invocation.
"""

import argparse
import shlex
import typing as t

from caad_erp import bll, exceptions

from .. import command_spec

PROMPT = "(caad-erp) > "
EXIT_COMMANDS = frozenset({"exit", "quit"})


def register_repl_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``repl`` interactive sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "repl"
    help_text = "Start an interactive REPL session."

    def registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``repl`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the REPL command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name, help_text=help_text, register=registrar, execute=run_repl
    )


def run_repl(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the interactive REPL loop.

    The REPL reads commands from standard input, parses them using the same
    argument parser as one-shot mode, and executes them while reusing the
    provided RuntimeContext. This avoids expensive workbook reloading between
    commands.

    Args:
        context (bll.RuntimeContext): Runtime context loaded once at session
            start and shared across all commands in the session.
        args (argparse.Namespace): Parsed CLI arguments from the initial
            invocation. The ``repl_parser`` and ``repl_command_table`` 
            attributes are used for parsing REPL input.

    Returns:
        int: ``0`` on normal exit via 'exit' or 'quit' command, or when
            EOF is encountered.
    """
    repl_parser = getattr(args, "repl_parser", None)
    repl_command_table = getattr(args, "repl_command_table", None)
    persist_fn = getattr(args, "repl_persist_fn", None)
    error_handler = getattr(args, "repl_error_handler", None)

    if repl_parser is None or repl_command_table is None:
        print("REPL mode is not properly configured.")
        return 1

    return repl_loop(
        context=context,
        parser=repl_parser,
        command_table=repl_command_table,
        persist_fn=persist_fn,
        error_handler=error_handler,
    )


def repl_loop(
    context: bll.RuntimeContext,
    parser: argparse.ArgumentParser,
    command_table: t.Mapping[str, command_spec.CommandSpec],
    persist_fn: t.Callable[[bll.RuntimeContext], None] | None = None,
    error_handler: t.Callable[[Exception], int] | None = None,
    input_fn: t.Callable[[str], str] = input,
) -> int:
    """Core REPL loop implementation.

    This function handles the interactive command loop, reading user input,
    parsing commands, executing them, and persisting changes on success.

    Args:
        context: Runtime context shared across all commands.
        parser: Argument parser for parsing REPL input lines.
        command_table: Mapping of command names to their specifications.
        persist_fn: Optional callback to persist workbook after successful
            write commands. If None, no persistence occurs.
        error_handler: Optional callback to handle exceptions and return
            appropriate exit codes. If None, errors are printed directly.
        input_fn: Callable for reading user input (allows testing).

    Returns:
        int: ``0`` on normal exit.
    """
    while True:
        try:
            line = input_fn(PROMPT)
        except EOFError:
            print()
            return 0
        except KeyboardInterrupt:
            print()
            continue

        line = line.strip()
        if not line:
            continue

        if line.lower() in EXIT_COMMANDS:
            return 0

        # Skip the 'repl' command itself to prevent nested REPLs
        if line.split()[0].lower() == "repl":
            print("Cannot start nested REPL session.")
            continue

        try:
            argv = shlex.split(line)
        except ValueError as e:
            print(f"Invalid input: {e}")
            continue

        try:
            cmd_args = parser.parse_args(argv)
        except SystemExit:
            # argparse calls sys.exit on parse errors; catch and continue
            continue

        try:
            spec = command_table.get(cmd_args.command)
            if spec is None:
                print(f"Unknown command: {cmd_args.command}")
                continue

            exit_code = spec.execute(context, cmd_args)
            if exit_code == 0 and persist_fn is not None:
                persist_fn(context)
        except Exception as error:
            if error_handler is not None:
                error_handler(error)
            else:
                print(f"Error: {error}")


__all__ = ["register_repl_command", "run_repl", "repl_loop", "PROMPT", "EXIT_COMMANDS"]
