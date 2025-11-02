import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec, SubparserFactory


def register_deactivate_product_command() -> CommandSpec:
    """Register the parser and executor for ``deactivate-product``."""

    name = "deactivate-product"
    help_text = "Mark an existing product as inactive."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_deactivate_product)


def translate_deactivate_product(args: argparse.Namespace) -> str:
    """Translate CLI args into a product identifier to deactivate."""

    return str(args.product_id).strip()


def run_deactivate_product(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the deactivate-product workflow via the BLL."""

    product_id = translate_deactivate_product(args)
    core_logic.update_product(context, product_id, is_active=False)
    return 0
