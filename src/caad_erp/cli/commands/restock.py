import argparse
from decimal import Decimal

from caad_erp import core_logic

from ..command_spec import CommandSpec


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


def translate_restock(args: argparse.Namespace) -> core_logic.RestockCommand:
    """Translate CLI args into a restock command object."""
    return core_logic.RestockCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=Decimal(args.quantity),
        total_cost=Decimal(args.total_cost),
        notes=args.notes,
    )


def run_restock(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the restock workflow via the BLL."""
    command = translate_restock(args)
    core_logic.record_restock(context, command)
    return 0
