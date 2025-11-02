import argparse
import logging
import typing as t
from pathlib import Path

from caad_erp import core_logic

from . import commands
from .command_spec import CommandSpec

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    """Construct the top-level CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="lounge-cli",
        description="Command-line tools for the Lounge ERP workbook.",
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
) -> t.Mapping[str, CommandSpec]:
    """Wire all CLI sub-commands onto the supplied parser."""
    subparsers = parser.add_subparsers(
        dest="command", required=True, title="commands")
    write_specs = register_write_commands(subparsers)
    read_specs = register_read_commands(subparsers)
    return build_command_table([*write_specs.values(), *read_specs.values()])


def register_write_commands(
    subparsers: argparse._SubParsersAction,
) -> t.Dict[str, CommandSpec]:
    """Declare mutating CLI commands such as sales and restocks."""
    specs = {
        "add-product": commands.register_add_product_command(subparsers),
        "add-salesman": commands.register_add_salesman_command(subparsers),
        "deactivate-product": commands.register_deactivate_product_command(subparsers),
        "deactivate-salesman": commands.register_deactivate_salesman_command(subparsers),
        "sell": commands.register_sell_command(subparsers),
        "restock": commands.register_restock_command(subparsers),
        "write-off": commands.register_write_off_command(subparsers),
        "pay-debt": commands.register_pay_debt_command(subparsers),
        "void": commands.register_void_command(subparsers),
    }
    for spec in specs.values():
        spec.register(subparsers)
    return specs


def register_read_commands(
    subparsers: argparse._SubParsersAction,
) -> t.Dict[str, CommandSpec]:
    """Declare read-only CLI commands such as reports."""
    specs = {
        "stock": commands.register_stock_command(subparsers),
        "profit": commands.register_profit_command(subparsers),
        "debts": commands.register_debts_command(subparsers),
        "log": commands.register_log_command(subparsers),
    }
    for spec in specs.values():
        spec.register(subparsers)
    return specs


def dispatch_command(
    context: core_logic.RuntimeContext,
    args: argparse.Namespace,
    command_table: t.Mapping[str, CommandSpec],
) -> int:
    """Dispatch the parsed arguments to the configured executor."""
    if not hasattr(args, "command") or args.command is None:
        raise KeyError("No command specified")
    spec = command_table.get(args.command)
    if spec is None:
        raise KeyError(f"Unknown command: {args.command}")
    return spec.execute(context, args)


def build_command_table(
    specs: t.Iterable[CommandSpec],
) -> t.MutableMapping[str, CommandSpec]:
    """Build an index of command specifications keyed by command name."""
    table: t.Dict[str, CommandSpec] = {}
    for spec in specs:
        if spec.name in table:
            raise ValueError(f"Duplicate command name: {spec.name}")
        table[spec.name] = spec
    return table


def handle_cli_error(error: Exception) -> int:
    """Convert raised exceptions into user-friendly exit codes."""
    if isinstance(error, core_logic.BusinessRuleViolation):
        logger.error("%s", error)
        return 2
    if isinstance(error, FileNotFoundError):
        logger.error("%s", error)
        return 3
    logger.error("%s", error)
    return 1


def persist_workbook(context: core_logic.RuntimeContext) -> None:
    """Persist workbook changes after successful execution."""
    try:
        core_logic.persist_context(context)
    except PermissionError as error:
        raise RuntimeError(str(error)) from error


def load_runtime_context(config_path: t.Optional[Path] = None) -> core_logic.RuntimeContext:
    """Resolve the runtime context for CLI operations."""
    target = Path(
        config_path) if config_path is not None else Path.cwd() / "config.ini"
    return core_logic.load_runtime_context(target)


def main(argv: t.Sequence[str] | None = None) -> int:
    """CLI entry point that orchestrates parsing and execution."""
    parse = build_parser()
    command_table = configure_subcommands(parse)
    args = parse.parse_args(argv)
    try:
        context = load_runtime_context(getattr(args, "config", None))
        exit_code = dispatch_command(context, args, command_table)
        if exit_code == 0:
            persist_workbook(context)
        return exit_code
    except Exception as error:
        return handle_cli_error(error)
