import argparse

from caad_erp import bll, constants

from .. import command_spec
from ..parser import handle_cli_error


def register_pay_debt_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``pay-debt`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "pay-debt"
    help_text = "Record a credit payment for an outstanding sale."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``pay-debt`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the credit payment
                workflow.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-l", "--linked-transaction-id", required=True)
        parser.add_argument("-r", "--total-revenue", required=True)
        parser.add_argument("-i", "--salesman-id", required=True)
        parser.add_argument(
            "-p",
            "--payment-type",
            choices=[
                member.value
                for member in constants.PaymentType
                if member != constants.PaymentType.ON_CREDIT
            ],
            required=True,
        )
        parser.add_argument("-n", "--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name, help_text=help_text, register=_registrar, execute=_run_pay_debt
    )


def _translate_pay_debt(args: argparse.Namespace) -> bll.CreditPaymentCommand:
    """Convert parsed CLI arguments into a ``CreditPaymentCommand``.

    Args:
        args (argparse.Namespace): Namespace populated with ``pay-debt``
            options.

    Returns:
        bll.CreditPaymentCommand: Domain command conveying the payment details.
            Monetary amounts are coerced to integers, and the payment type
            string is converted to :class:`~caad_erp.constants.PaymentType`.

    Raises:
        ValueError: If ``--total-revenue`` cannot be parsed as a valid integer
            number.
        ValueError: If ``--payment-type`` does not correspond to an allowed
            :class:`~caad_erp.constants.PaymentType` value.
    """
    payment = constants.PaymentType(args.payment_type)
    return bll.CreditPaymentCommand(
        linked_transaction_id=args.linked_transaction_id,
        salesman_id=args.salesman_id,
        total_revenue=int(args.total_revenue),
        payment_type=payment,
        notes=args.notes,
    )


def _run_pay_debt(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the credit payment workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to transactional mutations.
        args (argparse.Namespace): Parsed CLI arguments describing the credit
            payment.

    Returns:
        int: Exit code ``0`` on success, or a non-zero exit code on failure.
    """
    try:
        command = _translate_pay_debt(args)
        bll.record_credit_payment(context, command)
        return 0
    except Exception as error:
        return handle_cli_error(error)
