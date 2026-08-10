import argparse

from caad_erp import bll, constants

from .. import command_spec
from ..parser import handle_cli_error


def register_bulk_sale_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``bulk-sale`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "bulk-sale"
    help_text = "Record multiple sale transactions in a single operation."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``bulk-sale`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the bulk-sale workflow.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-s", "--salesman-id", required=True, help="Salesman ID for the sale transaction.")
        parser.add_argument(
            "-p",
            "--payment-type",
            choices=[member.value for member in constants.PaymentType],
            required=True,
            help="Payment type for all items.",
        )
        parser.add_argument("-n", "--notes", dest="notes", default=None, help="Optional transaction notes.")
        parser.add_argument(
            "-i",
            "--item",
            action="append",
            nargs=3,
            metavar=("PRODUCT_ID", "QTY", "TOTAL_REVENUE"),
            required=True,
            help="Product ID, quantity, and total revenue for an item (repeatable).",
        )
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name, help_text=help_text, register=_registrar, execute=_run_bulk_sale
    )


def _translate_bulk_sale(args: argparse.Namespace) -> list[bll.SaleCommand]:
    """Convert parsed CLI arguments into a list of ``SaleCommand`` objects.

    Args:
        args (argparse.Namespace): Namespace populated with ``bulk-sale`` options.

    Returns:
        list[bll.SaleCommand]: Domain commands capturing sale details.

    Raises:
        ValueError: If quantity or revenue values cannot be parsed as valid integers.
    """
    payment = constants.PaymentType(args.payment_type)
    commands: list[bll.SaleCommand] = []
    for item in args.item:
        product_id, qty_str, rev_str = item
        commands.append(
            bll.SaleCommand(
                product_id=product_id,
                salesman_id=args.salesman_id,
                quantity=int(qty_str),
                total_revenue=int(rev_str),
                payment_type=payment,
                notes=args.notes,
            )
        )
    return commands


def _run_bulk_sale(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the bulk sale workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to transactional mutations.
        args (argparse.Namespace): Parsed CLI arguments describing the bulk sale
            operation.

    Returns:
        int: Exit code ``0`` on success, or a non-zero exit code on failure.
    """
    try:
        commands = _translate_bulk_sale(args)
        bll.record_bulk_sale(context, commands)
        return 0
    except Exception as error:
        return handle_cli_error(error)
