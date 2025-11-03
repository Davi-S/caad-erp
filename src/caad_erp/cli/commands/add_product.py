import argparse
import typing as t
from decimal import Decimal

from caad_erp import bll

from ..command_spec import CommandSpec, SubparserFactory


def register_add_product_command() -> CommandSpec:
    """Create CLI wiring for the ``add-product`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "add-product"
    help_text = "Register a new product in the Products sheet."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``add-product`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for creating the
                parser dedicated to this command.

        Returns:
            argparse.ArgumentParser: Parser configured with all accepted
                ``add-product`` options.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--product-name", required=True)
        parser.add_argument("--sell-price", required=True)
        parser.add_argument("--inactive", action="store_true",
                            help="Mark the product as inactive on creation.")
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_add_product)


def translate_add_product(args: argparse.Namespace) -> t.Mapping[str, t.Any]:
    """Convert parsed CLI arguments into ``add_product`` keyword arguments.

    Args:
        args (argparse.Namespace): Namespace produced by
            :func:`argparse.ArgumentParser.parse_args` for the command.

    Returns:
        Mapping[str, Any]: Keyword payload compatible with
            :func:`bll.add_product`. Numerical values are coerced to
            :class:`~decimal.Decimal` and the ``--inactive`` flag is inverted
            into the ``is_active`` boolean expected by the business layer.

    Raises:
        decimal.InvalidOperation: If ``--sell-price`` cannot be parsed as a
            valid decimal number.
    """
    return {
        "product_id": args.product_id,
        "product_name": args.product_name,
        "sell_price": Decimal(args.sell_price),
        "is_active": not getattr(args, "inactive", False),
    }


def run_add_product(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-product workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Active runtime context containing
            the workbook session to mutate.
        args (argparse.Namespace): Parsed CLI arguments representing user
            input for the ``add-product`` command.

    Returns:
        int: Exit code ``0`` on success. Errors are propagated for higher level
            handling.
    """
    payload = translate_add_product(args)
    bll.add_product(context, **payload)  # type: ignore[attr-defined]
    return 0
