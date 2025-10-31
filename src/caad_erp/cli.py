"""Command-line interface for CAAD ERP.

This module defines the presentation layer plumbing for the lounge CLI while
staying free of business logic. Implementations will translate parsed
arguments into the command objects expected by the business layer.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, Mapping, MutableMapping, Optional, Sequence

from . import core_logic


@dataclass(frozen=True)
class CommandSpec:
    """Describe how a CLI sub-command is configured and executed."""

    name: str
    help_text: str
    register: Callable[[argparse._SubParsersAction[argparse.ArgumentParser]], argparse.ArgumentParser]
    execute: Callable[[core_logic.RuntimeContext, argparse.Namespace], int]


def build_parser() -> argparse.ArgumentParser:
    """Construct the top-level CLI argument parser."""

    raise NotImplementedError


def configure_subcommands(
    parser: argparse.ArgumentParser,
) -> Mapping[str, CommandSpec]:
    """Wire all CLI sub-commands onto the supplied parser."""

    raise NotImplementedError


def register_write_commands(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> Dict[str, CommandSpec]:
    """Declare mutating CLI commands such as sales and restocks."""

    raise NotImplementedError


def register_read_commands(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> Dict[str, CommandSpec]:
    """Declare read-only CLI commands such as reports."""

    raise NotImplementedError


def register_add_product_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``add-product``."""

    raise NotImplementedError


def register_add_salesman_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``add-salesman``."""

    raise NotImplementedError


def register_sale_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``sale``."""

    raise NotImplementedError


def register_restock_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``restock``."""

    raise NotImplementedError


def register_write_off_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``write-off``."""

    raise NotImplementedError


def register_pay_debt_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``pay-debt``."""

    raise NotImplementedError


def register_void_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``void``."""

    raise NotImplementedError


def register_stock_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``stock``."""

    raise NotImplementedError


def register_profit_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``profit``."""

    raise NotImplementedError


def register_debts_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``debts``."""

    raise NotImplementedError


def register_log_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``log``."""

    raise NotImplementedError


def load_runtime_context(config_path: Optional[Path] = None) -> core_logic.RuntimeContext:
    """Resolve the runtime context for CLI operations."""

    raise NotImplementedError


def dispatch_command(
    context: core_logic.RuntimeContext,
    args: argparse.Namespace,
    command_table: Mapping[str, CommandSpec],
) -> int:
    """Dispatch the parsed arguments to the configured executor."""

    raise NotImplementedError


def build_command_table(
    specs: Iterable[CommandSpec],
) -> MutableMapping[str, CommandSpec]:
    """Build an index of command specifications keyed by command name."""

    raise NotImplementedError


def translate_add_product(args: argparse.Namespace) -> None:
    """Translate CLI args into an add-product request."""

    raise NotImplementedError


def translate_add_salesman(args: argparse.Namespace) -> None:
    """Translate CLI args into an add-salesman request."""

    raise NotImplementedError


def translate_sale(args: argparse.Namespace) -> core_logic.SaleCommand:
    """Translate CLI args into a sale command object."""

    raise NotImplementedError


def translate_restock(args: argparse.Namespace) -> core_logic.RestockCommand:
    """Translate CLI args into a restock command object."""

    raise NotImplementedError


def translate_write_off(args: argparse.Namespace) -> core_logic.WriteOffCommand:
    """Translate CLI args into a write-off command object."""

    raise NotImplementedError


def translate_pay_debt(args: argparse.Namespace) -> core_logic.CreditPaymentCommand:
    """Translate CLI args into a credit payment command object."""

    raise NotImplementedError


def translate_void(
    args: argparse.Namespace,
) -> core_logic.VoidCommand:
    """Translate CLI args into a void command object."""

    raise NotImplementedError


def run_add_product(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-product workflow in the BLL."""

    raise NotImplementedError


def run_add_salesman(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-salesman workflow in the BLL."""

    raise NotImplementedError


def run_sale(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the sale workflow via the BLL."""

    raise NotImplementedError


def run_restock(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the restock workflow via the BLL."""

    raise NotImplementedError


def run_write_off(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the write-off workflow via the BLL."""

    raise NotImplementedError


def run_pay_debt(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the credit payment workflow via the BLL."""

    raise NotImplementedError


def run_void(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the void workflow via the BLL."""

    raise NotImplementedError


def run_stock_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the stock reporting workflow."""

    raise NotImplementedError


def run_profit_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the profit reporting workflow."""

    raise NotImplementedError


def run_debts_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the outstanding debts reporting workflow."""

    raise NotImplementedError


def run_log_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the transaction log reporting workflow."""

    raise NotImplementedError


def handle_cli_error(error: Exception) -> int:
    """Convert raised exceptions into user-friendly exit codes."""

    raise NotImplementedError


def persist_workbook(context: core_logic.RuntimeContext) -> None:
    """Persist workbook changes after successful execution."""

    raise NotImplementedError


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point that orchestrates parsing and execution."""

    raise NotImplementedError
