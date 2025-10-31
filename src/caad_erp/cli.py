"""Command-line entry points for the CAAD ERP toolkit.

All orchestration in this module is limited to argparse wiring and translating
command-line arguments into the command objects consumed by the business
layer. Keeping the CLI thin ensures the same parser configuration can be
reused by tests, scripts, or any alternative front-end that wants to expose
the package capabilities.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Mapping, MutableMapping, Optional, Sequence

from . import core_logic, log
from .constants import PaymentType


@dataclass(frozen=True)
class CommandSpec:
    """Describe how a CLI sub-command is configured and executed."""

    name: str
    help_text: str
    register: Callable[[argparse._SubParsersAction[argparse.ArgumentParser]], argparse.ArgumentParser]
    execute: Callable[[core_logic.RuntimeContext, argparse.Namespace], int]


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
) -> Mapping[str, CommandSpec]:
    """Wire all CLI sub-commands onto the supplied parser."""
    subparsers = parser.add_subparsers(dest="command", required=True, title="commands")
    write_specs = register_write_commands(subparsers)
    read_specs = register_read_commands(subparsers)
    return build_command_table([*write_specs.values(), *read_specs.values()])


def register_write_commands(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> Dict[str, CommandSpec]:
    """Declare mutating CLI commands such as sales and restocks."""
    specs = {
        "add-product": register_add_product_command(subparsers),
        "add-salesman": register_add_salesman_command(subparsers),
        "sale": register_sale_command(subparsers),
        "restock": register_restock_command(subparsers),
        "write-off": register_write_off_command(subparsers),
        "pay-debt": register_pay_debt_command(subparsers),
        "void": register_void_command(subparsers),
    }
    for spec in specs.values():
        spec.register(subparsers)
    return specs


def register_read_commands(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> Dict[str, CommandSpec]:
    """Declare read-only CLI commands such as reports."""
    specs = {
        "stock": register_stock_command(subparsers),
        "profit": register_profit_command(subparsers),
        "debts": register_debts_command(subparsers),
        "log": register_log_command(subparsers),
    }
    for spec in specs.values():
        spec.register(subparsers)
    return specs


def register_add_product_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``add-product``."""
    name = "add-product"
    help_text = "Register a new product in the Products sheet."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--product-name", required=True)
        parser.add_argument("--sell-price", required=True)
        parser.add_argument("--inactive", action="store_true", help="Mark the product as inactive on creation.")
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_add_product)


def register_add_salesman_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``add-salesman``."""
    name = "add-salesman"
    help_text = "Register a new salesman in the Salesmen sheet."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--salesman-name", required=True)
        parser.add_argument("--inactive", action="store_true", help="Mark the salesman as inactive on creation.")
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_add_salesman)


def register_sale_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``sale``."""
    name = "sale"
    help_text = "Record a sale transaction."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--quantity", required=True)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--total-revenue", required=True)
        parser.add_argument(
            "--payment-type",
            choices=[member.value for member in PaymentType],
            required=True,
        )
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_sale)


def register_restock_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``restock``."""
    name = "restock"
    help_text = "Record a restock transaction."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--quantity", required=True)
        parser.add_argument("--total-cost", required=True)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_restock)


def register_write_off_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``write-off``."""
    name = "write-off"
    help_text = "Record a write-off transaction."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--quantity", required=True)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_write_off)


def register_pay_debt_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``pay-debt``."""
    name = "pay-debt"
    help_text = "Record a credit payment for an outstanding sale."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--linked-transaction-id", required=True)
        parser.add_argument("--total-revenue", required=True)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_pay_debt)


def register_void_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``void``."""
    name = "void"
    help_text = "Void an existing transaction."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--linked-transaction-id", required=True)
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_void)


def register_stock_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``stock``."""
    name = "stock"
    help_text = "Display current stock levels."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_stock_report)


def register_profit_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``profit``."""
    name = "profit"
    help_text = "Display revenue, cost, and profit summaries."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_profit_report)


def register_debts_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``debts``."""
    name = "debts"
    help_text = "Display outstanding credit balances."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_debts_report)


def register_log_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``log``."""
    name = "log"
    help_text = "Display the transaction log."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_log_report)


def load_runtime_context(config_path: Optional[Path] = None) -> core_logic.RuntimeContext:
    """Resolve the runtime context for CLI operations."""
    target = Path(config_path) if config_path is not None else Path.cwd() / "config.ini"
    return core_logic.load_runtime_context(target)


def dispatch_command(
    context: core_logic.RuntimeContext,
    args: argparse.Namespace,
    command_table: Mapping[str, CommandSpec],
) -> int:
    """Dispatch the parsed arguments to the configured executor."""
    if not hasattr(args, "command") or args.command is None:
        raise KeyError("No command specified")
    spec = command_table.get(args.command)
    if spec is None:
        raise KeyError(f"Unknown command: {args.command}")
    return spec.execute(context, args)


def build_command_table(
    specs: Iterable[CommandSpec],
) -> MutableMapping[str, CommandSpec]:
    """Build an index of command specifications keyed by command name."""
    table: Dict[str, CommandSpec] = {}
    for spec in specs:
        if spec.name in table:
            raise ValueError(f"Duplicate command name: {spec.name}")
        table[spec.name] = spec
    return table


def translate_add_product(args: argparse.Namespace) -> Mapping[str, Any]:
    """Translate CLI args into an add-product request."""
    return {
        "product_id": args.product_id,
        "product_name": args.product_name,
        "sell_price": Decimal(args.sell_price),
        "is_active": not getattr(args, "inactive", False),
    }


def translate_add_salesman(args: argparse.Namespace) -> Mapping[str, Any]:
    """Translate CLI args into an add-salesman request."""
    return {
        "salesman_id": args.salesman_id,
        "salesman_name": args.salesman_name,
        "is_active": not getattr(args, "inactive", False),
    }


def translate_sale(args: argparse.Namespace) -> core_logic.SaleCommand:
    """Translate CLI args into a sale command object."""
    payment = PaymentType(args.payment_type)
    return core_logic.SaleCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=Decimal(args.quantity),
        total_revenue=Decimal(args.total_revenue),
        payment_type=payment,
        notes=args.notes,
    )


def translate_restock(args: argparse.Namespace) -> core_logic.RestockCommand:
    """Translate CLI args into a restock command object."""
    return core_logic.RestockCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=Decimal(args.quantity),
        total_cost=Decimal(args.total_cost),
        notes=args.notes,
    )


def translate_write_off(args: argparse.Namespace) -> core_logic.WriteOffCommand:
    """Translate CLI args into a write-off command object."""
    return core_logic.WriteOffCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=Decimal(args.quantity),
        notes=args.notes,
    )


def translate_pay_debt(args: argparse.Namespace) -> core_logic.CreditPaymentCommand:
    """Translate CLI args into a credit payment command object."""
    return core_logic.CreditPaymentCommand(
        linked_transaction_id=args.linked_transaction_id,
        salesman_id=args.salesman_id,
        total_revenue=Decimal(args.total_revenue),
        notes=args.notes,
    )


def translate_void(
    args: argparse.Namespace,
) -> core_logic.VoidCommand:
    """Translate CLI args into a void command object."""
    return core_logic.VoidCommand(
        linked_transaction_id=args.linked_transaction_id,
        replacement_command=None,
        notes=args.notes,
    )


def run_add_product(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-product workflow in the BLL."""
    payload = translate_add_product(args)
    core_logic.add_product(context, **payload)  # type: ignore[attr-defined]
    return 0


def run_add_salesman(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-salesman workflow in the BLL."""
    payload = translate_add_salesman(args)
    core_logic.add_salesman(context, **payload)  # type: ignore[attr-defined]
    return 0


def run_sale(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the sale workflow via the BLL."""
    command = translate_sale(args)
    core_logic.record_sale(context, command)
    return 0


def run_restock(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the restock workflow via the BLL."""
    command = translate_restock(args)
    core_logic.record_restock(context, command)
    return 0


def run_write_off(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the write-off workflow via the BLL."""
    command = translate_write_off(args)
    core_logic.record_write_off(context, command)
    return 0


def run_pay_debt(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the credit payment workflow via the BLL."""
    command = translate_pay_debt(args)
    core_logic.record_credit_payment(context, command)
    return 0


def run_void(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the void workflow via the BLL."""
    command = translate_void(args)
    core_logic.record_void(context, command)
    return 0


def run_stock_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the stock reporting workflow."""
    core_logic.calculate_inventory(context)
    return 0


def run_profit_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the profit reporting workflow."""
    core_logic.calculate_profit_summary(context)
    return 0


def run_debts_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the outstanding debts reporting workflow."""
    core_logic.calculate_outstanding_debts(context)  # type: ignore[attr-defined]
    return 0


def run_log_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the transaction log reporting workflow."""
    core_logic.list_transactions(context)
    return 0


def handle_cli_error(error: Exception) -> int:
    """Convert raised exceptions into user-friendly exit codes."""
    if isinstance(error, core_logic.BusinessRuleViolation):
        log.error("%s", error)
        return 2
    if isinstance(error, FileNotFoundError):
        log.error("%s", error)
        return 3
    log.error("%s", error)
    return 1


def persist_workbook(context: core_logic.RuntimeContext) -> None:
    """Persist workbook changes after successful execution."""
    try:
        core_logic.persist_context(context)
    except PermissionError as error:
        raise RuntimeError(str(error)) from error


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point that orchestrates parsing and execution."""
    parser = build_parser()
    command_table = configure_subcommands(parser)
    args = parser.parse_args(argv)
    try:
        context = load_runtime_context(getattr(args, "config", None))
        exit_code = dispatch_command(context, args, command_table)
        if exit_code == 0:
            persist_workbook(context)
        return exit_code
    except Exception as error:  # pragma: no cover - centralised error handler tested separately
        return handle_cli_error(error)
