import argparse
from decimal import Decimal

from caad_erp import core_logic

from ..command_spec import CommandSpec


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


def translate_write_off(args: argparse.Namespace) -> core_logic.WriteOffCommand:
    """Translate CLI args into a write-off command object."""
    return core_logic.WriteOffCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=Decimal(args.quantity),
        notes=args.notes,
    )


def run_write_off(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the write-off workflow via the BLL."""
    command = translate_write_off(args)
    core_logic.record_write_off(context, command)
    return 0
