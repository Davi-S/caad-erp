import argparse

from caad_erp import bll, constants

from .. import command_spec
from ..parser import handle_cli_error


def register_sale_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``sale`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "sale"
    help_text = "Record a sale transaction."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``sale`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the sale workflow.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-i", "--product-id", required=True)
        parser.add_argument("-q", "--quantity", required=True)
        parser.add_argument("-s", "--salesman-id", required=True)
        parser.add_argument("-r", "--total-revenue", required=True)
        parser.add_argument(
            "-p",
            "--payment-type",
            choices=[member.value for member in constants.PaymentType],
            required=True,
        )
        parser.add_argument("-n", "--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name, help_text=help_text, register=_registrar, execute=_run_sale
    )


def _translate_sale(args: argparse.Namespace) -> bll.SaleCommand:
    """Convert parsed CLI arguments into a ``SaleCommand``.

    Args:
        args (argparse.Namespace): Namespace populated with ``sale`` options.

    Returns:
        bll.SaleCommand: Domain command capturing sale details.
            Quantity and revenue values are coerced to integers , and the
            payment type string is converted to
            :class:`~caad_erp.constants.PaymentType`.

    Raises:
        ValueError: If ``--quantity`` or ``--total-revenue`` cannot be parsed as
            valid integer numbers.
        ValueError: If ``--payment-type`` does not correspond to a known
            :class:`~caad_erp.constants.PaymentType` value.
    """
    payment = constants.PaymentType(args.payment_type)
    return bll.SaleCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=int(args.quantity),
        total_revenue=int(args.total_revenue),
        payment_type=payment,
        notes=args.notes,
    )


def _run_sale(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the sale workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to transactional mutations.
        args (argparse.Namespace): Parsed CLI arguments describing the sale
            operation.

    Returns:
        int: Exit code ``0`` on success, or a non-zero exit code on failure.
    """
    try:
        command = _translate_sale(args)
        bll.record_sale(context, command)
        return 0
    except Exception as error:
        return handle_cli_error(error)
