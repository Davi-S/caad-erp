import argparse
from decimal import Decimal

from caad_erp import core_logic
from caad_erp.constants import PaymentType

from ..command_spec import CommandSpec, SubparserFactory


def register_pay_debt_command() -> CommandSpec:
    """Create CLI wiring for the ``pay-debt`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "pay-debt"
    help_text = "Record a credit payment for an outstanding sale."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``pay-debt`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the credit payment
                workflow.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--linked-transaction-id", required=True)
        parser.add_argument("--total-revenue", required=True)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument(
            "--payment-type",
            choices=[member.value for member in PaymentType if member !=
                     PaymentType.ON_CREDIT],
            required=True,
        )
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_pay_debt)


def translate_pay_debt(args: argparse.Namespace) -> core_logic.CreditPaymentCommand:
    """Convert parsed CLI arguments into a ``CreditPaymentCommand``.

    Args:
        args (argparse.Namespace): Namespace populated with ``pay-debt``
            options.

    Returns:
        core_logic.CreditPaymentCommand: Domain command conveying the payment
            details. Monetary amounts are coerced to
            :class:`~decimal.Decimal`, and the payment type string is converted
            to :class:`~caad_erp.constants.PaymentType`.

    Raises:
        decimal.InvalidOperation: If ``--total-revenue`` cannot be parsed as a
            valid decimal number.
        ValueError: If ``--payment-type`` does not correspond to an allowed
            :class:`~caad_erp.constants.PaymentType` value.
    """
    payment = PaymentType(args.payment_type)
    return core_logic.CreditPaymentCommand(
        linked_transaction_id=args.linked_transaction_id,
        salesman_id=args.salesman_id,
        total_revenue=Decimal(args.total_revenue),
        payment_type=payment,
        notes=args.notes,
    )


def run_pay_debt(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the credit payment workflow through the business logic layer.

    Args:
        context (core_logic.RuntimeContext): Runtime context providing access
            to transactional mutations.
        args (argparse.Namespace): Parsed CLI arguments describing the credit
            payment.

    Returns:
        int: Exit code ``0`` when the payment is recorded successfully.
    """
    command = translate_pay_debt(args)
    core_logic.record_credit_payment(context, command)
    return 0
