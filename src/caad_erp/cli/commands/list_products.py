import argparse
import typing as t

from caad_erp import bll

from .. import command_spec


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
            "--all",
            action="store_true",
            help="Include inactive products in the output.",
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


def _display_products_report(
    products: t.Iterable[object], *, include_inactive: bool
) -> None:
    """Print product records in a fixed-width table.

    Args:
        products (Iterable[object]): Product rows returned by
            :func:`bll.list_products`.
        include_inactive (bool): Whether inactive products were requested,
            which controls table columns and empty-state messaging.
    """
    rows = list(products)
    if not rows:
        print("No products found." if include_inactive else "No active products found.")
        return

    if include_inactive:
        print(f"{'Product ID':<20} {'Name':<30} {'Sell Price':>12} {'Active':>7}")
        print(f"{'-' * 20} {'-' * 30} {'-' * 12} {'-' * 7}")
        for row in rows:
            print(
                f"{getattr(row, 'product_id', ''):<20} "
                f"{getattr(row, 'product_name', ''):<30} "
                f"{getattr(row, 'sell_price', 0) / 100:>12.2f} "
                f"{('yes' if getattr(row, 'is_active', False) else 'no'):>7}"
            )
        return

    print(f"{'Product ID':<20} {'Name':<30} {'Sell Price':>12}")
    print(f"{'-' * 20} {'-' * 30} {'-' * 12}")
    for row in rows:
        print(
            f"{getattr(row, 'product_id', ''):<20} "
            f"{getattr(row, 'product_name', ''):<30} "
            f"{getattr(row, 'sell_price', 0) / 100:>12.2f}"
        )


def _run_list_products_report(
    context: bll.RuntimeContext, args: argparse.Namespace
) -> int:
    """Fetch products and display them on the console.

    Args:
        context (bll.RuntimeContext): Runtime context used to access workbook
            data and caches.
        args (argparse.Namespace): Parsed CLI arguments for this command.

    Returns:
        int: ``0`` after listing products.
    """
    include_inactive = bool(getattr(args, "all", False))
    products = bll.list_products(context, include_inactive=include_inactive)
    _display_products_report(products, include_inactive=include_inactive)
    return 0
