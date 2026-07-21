import argparse

from caad_erp import bll

from .. import command_spec


def register_deactivate_product_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``deactivate-product`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """

    name = "deactivate-product"
    help_text = "Mark an existing product as inactive."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``deactivate-product`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI definition.

        Returns:
            argparse.ArgumentParser: Parser configured for product
                deactivation inputs.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-i", "--product-id", required=True)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=_registrar, execute=_run_deactivate_product)


def _translate_deactivate_product(args: argparse.Namespace) -> bll.ProductCommand:
    """Normalize CLI arguments into a product update command.

    Args:
        args (argparse.Namespace): Namespace containing the
            ``deactivate-product`` options.

    Returns:
        bll.ProductCommand: Command setting ``is_active`` to ``False`` while
            leaving other fields unchanged.
    """
    return bll.ProductCommand(
        product_id=str(args.product_id).strip(),
        product_name=None,
        sell_price=None,
        is_active=False,
    )


def _run_deactivate_product(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the deactivate-product workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Active runtime context that
            exposes workbook mutation APIs.
        args (argparse.Namespace): Parsed CLI arguments for the command.

    Returns:
        int: Exit code ``0`` after the product has been flagged as inactive.
    """

    command = _translate_deactivate_product(args)
    bll.update_product(context, command)
    return 0
