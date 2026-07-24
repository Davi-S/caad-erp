import argparse
import typing as t

from caad_erp import bll

from .. import command_spec
from ..parser import handle_cli_error


def register_stock_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``stock`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "stock"
    help_text = "Display current stock levels."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``stock`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the stock report
                command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name,
        help_text=help_text,
        register=_registrar,
        execute=_run_stock_report,
        is_mutating=False,
    )


def _display_inventory_report(inventory: t.Mapping[str, int]) -> None:
    """Print the current inventory quantities in a fixed-width table.

    Args:
        inventory (Mapping[str, int]): Mapping of product identifiers to
            the on-hand quantity calculated by the business layer.
    """

    if not inventory:
        print("No stock data available.")
        return

    print("Product ID           Quantity")
    print("-------------------- --------")
    for product_id, quantity in sorted(inventory.items()):
        print(f"{product_id:<20} {quantity}")


def _run_stock_report(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Calculate inventory levels and display them to the user.

    Args:
        context (bll.RuntimeContext): Runtime context used to load workbook
            data and caches.
        args (argparse.Namespace): Parsed CLI arguments. Present for API
            symmetry with other commands, currently unused.

    Returns:
        int: ``0`` on success, or a non-zero exit code on failure.
    """

    try:
        inventory = bll.calculate_inventory(context)
        _display_inventory_report(inventory)
        return 0
    except Exception as error:
        return handle_cli_error(error)
