import argparse
import typing as t

from caad_erp import bll

from .. import command_spec
from ..parser import handle_cli_error


def register_list_products_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``list-products`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "list-products"
    help_text = "Display registered products."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``list-products`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the list-products
                report command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument(
            "-i",
            "--product-id",
            required=False,
            help="Get information for this specific product only.",
        )
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name,
        help_text=help_text,
        register=_registrar,
        execute=_run_list_products_report,
        is_mutating=False,
    )


def _display_products_report(products: t.Iterable[object]) -> None:
    """Print product records in a fixed-width table.

    Args:
        products (Iterable[object]): Product rows returned by
            :func:`bll.list_products`.
    """
    rows = list(products)
    if not rows:
        print("No products found.")
        return

    print(f"{'Product ID':<20} {'Name':<30} {'Sell Price':>12} {'Active':>7}")
    print(f"{'-' * 20} {'-' * 30} {'-' * 12} {'-' * 7}")
    for row in rows:
        print(
            f"{getattr(row, 'product_id', ''):<20} "
            f"{getattr(row, 'product_name', ''):<30} "
            f"{getattr(row, 'sell_price', 0) / 100:>12.2f} "
            f"{('yes' if getattr(row, 'is_active', False) else 'no'):>7}"
        )


def _run_list_products_report(
    context: bll.RuntimeContext, args: argparse.Namespace
) -> int:
    """Fetch all products and display them on the console.

    Args:
        context (bll.RuntimeContext): Runtime context used to access workbook
            data and caches.
        args (argparse.Namespace): Parsed CLI arguments for this command
            (currently unused; retained for signature consistency).

    Returns:
        int: ``0`` on success, or a non-zero exit code on failure.
    """
    try:
        products = bll.list_products(context)
        product = (
            products
            if not args.product_id
            else [product for product in products if product.product_id == args.product_id]
        )
        _display_products_report(product)
        return 0
    except Exception as error:
        return handle_cli_error(error)
