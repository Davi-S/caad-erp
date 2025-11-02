import argparse
from decimal import Decimal

from caad_erp import core_logic
from caad_erp.constants import PaymentType

from ..command_spec import CommandSpec, SubparserFactory


def register_pay_debt_command() -> CommandSpec:
    """Register the parser and executor for ``pay-debt``."""
    name = "pay-debt"
    help_text = "Record a credit payment for an outstanding sale."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
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
    """Translate CLI args into a credit payment command object."""
    payment = PaymentType(args.payment_type)
    return core_logic.CreditPaymentCommand(
        linked_transaction_id=args.linked_transaction_id,
        salesman_id=args.salesman_id,
        total_revenue=Decimal(args.total_revenue),
        payment_type=payment,
        notes=args.notes,
    )


def run_pay_debt(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the credit payment workflow via the BLL."""
    command = translate_pay_debt(args)
    core_logic.record_credit_payment(context, command)
    return 0
