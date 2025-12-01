"""Argument parsing utilities for the CAAD ERP command-line interface.

This module wires the public CLI surface by constructing the root parser,
registering each command specification, dispatching execution, and translating
low-level exceptions into exit codes suitable for shell automation.
"""

import argparse
import logging
import typing as t
from pathlib import Path

from caad_erp import bll, exceptions

from . import command_spec, commands

logger = logging.getLogger(__name__)


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
    include_repl: bool = True,
) -> t.Mapping[str, command_spec.CommandSpec]:
    """Attach read and write sub-commands to the base parser.

    This routine coordinates registration of every command exposed by the CLI
    by delegating to :func:`register_write_commands` and
    :func:`register_read_commands`. The resulting command table is keyed by
    command name for quick lookups during dispatch.

    Args:
        parser (argparse.ArgumentParser): Parser produced by
            :func:`build_parser` that should receive sub-command definitions.
        include_repl (bool): Whether to include the REPL command. Defaults to
            True. Set to False when building the inner parser for REPL mode.

    Returns:
        Mapping[str, CommandSpec]: Immutable view mapping command names to
            their registered specifications.
    """
    # When no command is provided, we default to REPL mode
    subparsers = parser.add_subparsers(
        dest="command", required=False, title="commands")
    write_specs = register_write_commands(subparsers)
    read_specs = register_read_commands(subparsers)
    all_specs = [*write_specs.values(), *read_specs.values()]

    if include_repl:
        repl_spec = commands.register_repl_command()
        repl_spec.register(subparsers)
        all_specs.append(repl_spec)

    return build_command_table(all_specs)


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

    When invoked without a command or with the ``repl`` command, an interactive
    REPL session is started. The REPL loads the RuntimeContext once and reuses
    it across multiple commands for improved performance.

    Args:
        argv (Sequence[str] | None): Optional argument vector to parse. When
            ``None`` the default ``sys.argv`` semantics apply.

    Returns:
        int: Exit status emitted by the invoked command or error handler.
    """
    parse = build_parser()
    command_table = configure_subcommands(parse)
    args = parse.parse_args(argv)

    # If no command is specified, default to REPL mode
    is_repl_mode = args.command is None or args.command == "repl"

    if is_repl_mode:
        # Build a separate parser for REPL mode (without the repl command)
        repl_parser = build_parser()
        repl_command_table = configure_subcommands(repl_parser, include_repl=False)
        args.repl_parser = repl_parser
        args.repl_command_table = repl_command_table
        args.repl_error_handler = handle_cli_error
        args.command = "repl"  # Ensure command is set for dispatch

    try:
        context = load_runtime_context(getattr(args, "config", None))
        exit_code = dispatch_command(context, args, command_table)
        # Only persist for non-REPL commands; REPL does not need persistence
        if exit_code == 0 and not is_repl_mode:
            persist_workbook(context)
        return exit_code
    except Exception as error:
        return handle_cli_error(error)
