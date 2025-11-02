import argparse
import typing as t
from decimal import Decimal

from caad_erp import core_logic

from ..command_spec import CommandSpec, SubparserFactory


def register_add_product_command() -> CommandSpec:
    """Register the parser and executor for ``add-product``."""
    name = "add-product"
    help_text = "Register a new product in the Products sheet."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--product-name", required=True)
        parser.add_argument("--sell-price", required=True)
        parser.add_argument("--inactive", action="store_true",
                            help="Mark the product as inactive on creation.")
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_add_product)


def run_add_product(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-product workflow in the BLL."""
    payload = translate_add_product(args)
    core_logic.add_product(context, **payload)  # type: ignore[attr-defined]
    return 0


def translate_add_product(args: argparse.Namespace) -> t.Mapping[str, t.Any]:
    """Translate CLI args into an add-product request."""
    return {
        "product_id": args.product_id,
        "product_name": args.product_name,
        "sell_price": Decimal(args.sell_price),
        "is_active": not getattr(args, "inactive", False),
    }
