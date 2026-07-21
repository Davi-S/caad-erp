import argparse

from caad_erp import bll

from .. import command_spec


def _str_to_bool(value: str) -> bool:
    """Safely parse boolean values from CLI string inputs."""
    value_lower = str(value).lower()
    if value_lower in ("yes", "true", "t", "y", "1"):
        return True
    elif value_lower in ("no", "false", "f", "n", "0"):
        return False
    raise argparse.ArgumentTypeError(f"Boolean value expected, got '{value}'.")


def register_edit_product_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``edit-product`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """

    name = "edit-product"
    help_text = "Edit fields of a product"

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``edit-product`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI definition.

        Returns:
            argparse.ArgumentParser: Parser configured for product
                deactivation inputs.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-i", "--product-id", required=True)
        parser.add_argument("-n", "--product-name", required=False, default=None)
        parser.add_argument("-p", "--product-sell-price", required=False, default=None)
        parser.add_argument(
            "-a", "--product-is-active", required=False, default=None, type=_str_to_bool
        )
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name, help_text=help_text, register=_registrar, execute=_run_edit_product
    )


def _translate_edit_product(args: argparse.Namespace) -> bll.ProductCommand:
    """Normalize CLI arguments into a product update command.

    Args:
        args (argparse.Namespace): Namespace containing the
            ``edit-product`` options.

    Returns:
        bll.ProductCommand: Command setting passed field while leaving other
        fields unchanged.
    """
    return bll.ProductCommand(
        product_id=args.product_id.strip(),
        product_name=args.product_name,
        sell_price=int(args.product_sell_price) if args.product_sell_price else None,
        is_active=args.product_is_active,
    )


def _run_edit_product(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the edit-product workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Active runtime context that
            exposes workbook mutation APIs.
        args (argparse.Namespace): Parsed CLI arguments for the command.

    Returns:
        int: Exit code ``0`` after the product has been altered.
    """

    command = _translate_edit_product(args)
    bll.update_product(context, command)
    return 0
