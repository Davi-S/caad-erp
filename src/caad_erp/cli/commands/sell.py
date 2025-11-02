import argparse
from decimal import Decimal

from caad_erp import core_logic
from caad_erp.constants import PaymentType

from ..command_spec import CommandSpec


def register_sell_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``sell``."""
    name = "sell"
    help_text = "Record a sale transaction."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--quantity", required=True)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--total-revenue", required=True)
        parser.add_argument(
            "--payment-type",
            choices=[member.value for member in PaymentType],
            required=True,
        )
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_sell)


def translate_sell(args: argparse.Namespace) -> core_logic.SaleCommand:
    """Translate CLI args into a sale command object."""
    payment = PaymentType(args.payment_type)
    return core_logic.SaleCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=Decimal(args.quantity),
        total_revenue=Decimal(args.total_revenue),
        payment_type=payment,
        notes=args.notes,
    )


def run_sell(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the sale workflow via the BLL."""
    command = translate_sell(args)
    core_logic.record_sale(context, command)
    return 0
