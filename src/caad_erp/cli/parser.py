"""Argument parsing utilities for the CAAD ERP command-line interface.

This module wires the public CLI surface by constructing the root parser,
registering each command specification, dispatching execution, and translating
low-level exceptions into exit codes suitable for shell automation.
"""

import argparse
import logging
import shlex
import typing as t
from pathlib import Path

from caad_erp import bll, exceptions

from . import command_spec, commands

logger = logging.getLogger(__name__)

REPL_PROMPT = "(caad-erp) > "
EXIT_COMMANDS = frozenset({"exit", "quit"})


def build_parser() -> argparse.ArgumentParser:
    """Construct the root parser for all CLI entry points.

    The base parser handles global options that apply to every sub-command,
    such as the optional ``--config`` override. Sub-command registration is
    layered on top of the returned instance via
    :func:`configure_subcommands`.

    Returns:
        argparse.ArgumentParser: Parser pre-configured with the CLI program
            metadata and shared options.
    """
    parser = argparse.ArgumentParser(
        prog="caad-erp-cli",
        description="Command-line tools for the CAAD ERP workbook.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Optional path to config.ini (defaults to ./config.ini).",
    )
    return parser


def configure_subcommands(
    parser: argparse.ArgumentParser,
    *,
    required: bool = True,
) -> t.Mapping[str, command_spec.CommandSpec]:
    """Attach read and write sub-commands to the base parser.

    This routine coordinates registration of every command exposed by the CLI
    by delegating to :func:`register_write_commands` and
    :func:`register_read_commands`. The resulting command table is keyed by
    command name for quick lookups during dispatch.

    Args:
        parser (argparse.ArgumentParser): Parser produced by
            :func:`build_parser` that should receive sub-command definitions.
        required (bool): Whether a subcommand is required. Set to ``False``
            to allow entering REPL mode when no command is given.

    Returns:
        Mapping[str, CommandSpec]: Immutable view mapping command names to
            their registered specifications.
    """
    subparsers = parser.add_subparsers(
        dest="command", required=required, title="commands")
    write_specs = register_write_commands(subparsers)
    read_specs = register_read_commands(subparsers)
    register_repl_command(subparsers)
    return build_command_table([*write_specs.values(), *read_specs.values()])


def register_write_commands(
    subparsers: argparse._SubParsersAction,
) -> t.Dict[str, command_spec.CommandSpec]:
    """Register state-mutating commands like sales, restocks, and voids.

    Args:
        subparsers (argparse._SubParsersAction): Sub-parser collection created
            by :meth:`argparse.ArgumentParser.add_subparsers` that is used to
            install each write-capable command.

    Returns:
        dict[str, CommandSpec]: Mapping of command names to their
            specifications, already registered with ``subparsers``.
    """
    specs = {
        "add-product": commands.register_add_product_command(),
        "add-salesman": commands.register_add_salesman_command(),
        "deactivate-product": commands.register_deactivate_product_command(),
        "deactivate-salesman": commands.register_deactivate_salesman_command(),
        "sale": commands.register_sale_command(),
        "restock": commands.register_restock_command(),
        "write-off": commands.register_write_off_command(),
        "pay-debt": commands.register_pay_debt_command(),
        "void": commands.register_void_command(),
    }
    for spec in specs.values():
        spec.register(subparsers)
    return specs


def register_read_commands(
    subparsers: argparse._SubParsersAction,
) -> t.Dict[str, command_spec.CommandSpec]:
    """Register read-only reporting commands such as stock and profit views.

    Args:
        subparsers (argparse._SubParsersAction): Sub-parser collection created
            by :meth:`argparse.ArgumentParser.add_subparsers` that is used to
            install each reporting command.

    Returns:
        dict[str, CommandSpec]: Mapping of command names to their
            specifications, already registered with ``subparsers``.
    """
    specs = {
        "stock": commands.register_stock_command(),
        "profit": commands.register_profit_command(),
        "debts": commands.register_debts_command(),
        "log": commands.register_log_command(),
    }
    for spec in specs.values():
        spec.register(subparsers)
    return specs


def register_repl_command(subparsers: argparse._SubParsersAction) -> None:
    """Register the ``repl`` command that enters interactive mode.

    Args:
        subparsers (argparse._SubParsersAction): Sub-parser collection created
            by :meth:`argparse.ArgumentParser.add_subparsers` that is used to
            install the REPL command.

    The ``repl`` command is a special entry point that does not execute any
    business logic directly. Instead, it signals to :func:`main` that the
    interactive loop should be started.
    """
    subparsers.add_parser(
        "repl",
        help="Start an interactive REPL session.",
    )


def run_repl(
    context: bll.RuntimeContext,
    command_table: t.Mapping[str, command_spec.CommandSpec],
) -> int:
    """Run an interactive REPL loop reusing the same runtime context.

    Args:
        context (bll.RuntimeContext): Live runtime context that holds
            workbook handles and cached data. This context is reused across
            all commands executed in the REPL session.
        command_table (Mapping[str, CommandSpec]): Lookup table produced by
            :func:`build_command_table` describing all registered commands.

    Returns:
        int: Exit status. Returns ``0`` when the user exits normally.
    """
    while True:
        try:
            line = input(REPL_PROMPT)
        except EOFError:
            print()
            break
        except KeyboardInterrupt:
            print()
            continue

        line = line.strip()
        if not line:
            continue

        if line.lower() in EXIT_COMMANDS:
            break

        try:
            tokens = shlex.split(line)
        except ValueError as error:
            print(f"Error parsing command: {error}")
            continue

        if not tokens:
            continue

        # Build a fresh parser for each command to parse the REPL input
        repl_parser = build_parser()
        repl_command_table = configure_subcommands(repl_parser, required=True)

        try:
            args = repl_parser.parse_args(tokens)
        except SystemExit:
            # argparse calls sys.exit on errors; catch it so REPL continues
            continue

        # Check for repl command within REPL (not useful, just ignore)
        if getattr(args, "command", None) == "repl":
            print("Already in REPL mode.")
            continue

        try:
            exit_code = dispatch_command(context, args, repl_command_table)
            if exit_code == 0:
                persist_workbook(context)
        except Exception as error:
            handle_cli_error(error)

    return 0


def dispatch_command(
    context: bll.RuntimeContext,
    args: argparse.Namespace,
    command_table: t.Mapping[str, command_spec.CommandSpec],
) -> int:
    """Route parsed CLI arguments to the appropriate command executor.

    Args:
        context (bll.RuntimeContext): Live runtime context that holds
            workbook handles and cached data.
        args (argparse.Namespace): Namespace returned by
            :meth:`argparse.ArgumentParser.parse_args` containing CLI inputs.
        command_table (Mapping[str, CommandSpec]): Lookup table produced by
            :func:`build_command_table` describing all registered commands.

    Returns:
        int: Exit status produced by the selected command implementation.

    Raises:
        KeyError: If the requested command is missing from ``command_table``
            or if the parsed arguments do not define a command.
    """
    if not hasattr(args, "command") or args.command is None:
        raise KeyError("No command specified")
    spec = command_table.get(args.command)
    if spec is None:
        raise KeyError(f"Unknown command: {args.command}")
    return spec.execute(context, args)


def build_command_table(
    specs: t.Iterable[command_spec.CommandSpec],
) -> t.MutableMapping[str, command_spec.CommandSpec]:
    """Index command specifications by their declared command name.

    Args:
        specs (Iterable[CommandSpec]): Collection of command definitions to be
            made addressable by name.

    Returns:
        MutableMapping[str, CommandSpec]: Mapping containing every spec keyed
            by :attr:`CommandSpec.name`.

    Raises:
        ValueError: If multiple specifications declare the same command name,
            which would make dispatch ambiguous.
    """
    table: t.Dict[str, command_spec.CommandSpec] = {}
    for spec in specs:
        if spec.name in table:
            raise ValueError(f"Duplicate command name: {spec.name}")
        table[spec.name] = spec
    return table


def handle_cli_error(error: Exception) -> int:
    """Translate uncaught exceptions into CLI-friendly exit codes.

    Args:
        error (Exception): Unhandled exception raised during command
            execution.

    Returns:
        int: Exit status communicating the error category to the shell. Domain
            validation issues map to ``2``, missing files to ``3``, and all
            other failures to ``1``.
    """
    if isinstance(error, exceptions.BusinessRuleViolation):
        logger.error("%s", error)
        return 2
    if isinstance(error, FileNotFoundError):
        logger.error("%s", error)
        return 3
    logger.error("%s", error)
    return 1


def persist_workbook(context: bll.RuntimeContext) -> None:
    """Flush pending workbook mutations to disk after a successful run.

    Args:
        context (bll.RuntimeContext): Runtime context whose workbook
            should be persisted.

    Raises:
        RuntimeError: If saving the workbook fails due to permission
            constraints. The original :class:`PermissionError` is preserved as
            the cause.
    """
    try:
        bll.persist_context(context)
    except PermissionError as error:
        raise RuntimeError(str(error)) from error


def load_runtime_context(config_path: t.Optional[Path] = None) -> bll.RuntimeContext:
    """Load configuration and workbook state for CLI execution.

    Args:
        config_path (Path | None): Optional override pointing to ``config.ini``.
            When omitted the search starts in the current working directory.

    Returns:
        bll.RuntimeContext: Context object bundling parsed settings,
            an open workbook, and cache containers.

    Raises:
        FileNotFoundError: If the configuration file or workbook cannot be
            located.
        KeyError: When required configuration options are missing.
    """
    return bll.load_runtime_context(config_path)


def main(argv: t.Sequence[str] | None = None) -> int:
    """Parse arguments, execute the selected command, and persist changes.

    When no command is given or the ``repl`` command is specified, the CLI
    enters an interactive REPL mode that reuses the same runtime context
    across multiple commands.

    Args:
        argv (Sequence[str] | None): Optional argument vector to parse. When
            ``None`` the default ``sys.argv`` semantics apply.

    Returns:
        int: Exit status emitted by the invoked command or error handler.
    """
    parse = build_parser()
    command_table = configure_subcommands(parse, required=False)
    args = parse.parse_args(argv)
    try:
        context = load_runtime_context(getattr(args, "config", None))
        command = getattr(args, "command", None)
        if command is None or command == "repl":
            return run_repl(context, command_table)
        exit_code = dispatch_command(context, args, command_table)
        if exit_code == 0:
            persist_workbook(context)
        return exit_code
    except Exception as error:
        return handle_cli_error(error)
