import argparse

from caad_erp import bll

from .. import command_spec
from ..parser import handle_cli_error


def register_add_product_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``add-product`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "add-product"
    help_text = "Register a new product in the Products sheet."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``add-product`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for creating the
                parser dedicated to this command.

        Returns:
            argparse.ArgumentParser: Parser configured with all accepted
                ``add-product`` options.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-i", "--product-id", required=True)
        parser.add_argument("-n", "--product-name", required=True)
        parser.add_argument("-p", "--sell-price", required=True)
        parser.add_argument(
            "-x",
            "--inactive",
            action="store_true",
            help="Mark the product as inactive on creation.",
        )
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name, help_text=help_text, register=_registrar, execute=_run_add_product
    )


def _translate_add_product(args: argparse.Namespace) -> bll.ProductCommand:
    """Convert parsed CLI arguments into a product command object.

    Args:
        args (argparse.Namespace): Namespace produced by
            :func:`argparse.ArgumentParser.parse_args` for the command.

    Returns:
        bll.ProductCommand: Command payload compatible with
            :func:`bll.add_product`. Numerical values are coerced to
            integers and the ``--inactive`` flag is inverted
            into the ``is_active`` boolean expected by the business layer.

    Raises:
        ValueError: If ``--sell-price`` cannot be parsed as a
            valid integer number.
    """
    return bll.ProductCommand(
        product_id=args.product_id,
        product_name=args.product_name,
        sell_price=int(args.sell_price),
        is_active=not getattr(args, "inactive", False),
    )


def _run_add_product(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-product workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Active runtime context containing
            the workbook session to mutate.
        args (argparse.Namespace): Parsed CLI arguments representing user
            input for the ``add-product`` command.

    Returns:
        int: Exit code ``0`` on success, or a non-zero exit code on failure.
    """
    try:
        command = _translate_add_product(args)
        bll.add_product(context, command)
        return 0
    except Exception as error:
        return handle_cli_error(error)
