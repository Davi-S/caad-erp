import argparse

from caad_erp import bll

from ..command_spec import CommandSpec, SubparserFactory


def register_deactivate_product_command() -> CommandSpec:
    """Create CLI wiring for the ``deactivate-product`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """

    name = "deactivate-product"
    help_text = "Mark an existing product as inactive."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``deactivate-product`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI definition.

        Returns:
            argparse.ArgumentParser: Parser configured for product
                deactivation inputs.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_deactivate_product)


def translate_deactivate_product(args: argparse.Namespace) -> str:
    """Normalize CLI arguments into a product identifier.

    Args:
        args (argparse.Namespace): Namespace containing the
            ``deactivate-product`` options.

    Returns:
        str: Sanitized product identifier suitable for
            :func:`bll.update_product`.
    """

    return str(args.product_id).strip()


def run_deactivate_product(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the deactivate-product workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Active runtime context that
            exposes workbook mutation APIs.
        args (argparse.Namespace): Parsed CLI arguments for the command.

    Returns:
        int: Exit code ``0`` after the product has been flagged as inactive.
    """

    product_id = translate_deactivate_product(args)
    bll.update_product(context, product_id, is_active=False)
    return 0
