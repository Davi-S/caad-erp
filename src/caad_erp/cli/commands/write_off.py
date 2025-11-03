import argparse
from decimal import Decimal

from caad_erp import bll

from .. import command_spec


def register_write_off_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``write-off`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "write-off"
    help_text = "Record a write-off transaction."

    def registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``write-off`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the write-off
                workflow.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--quantity", required=True)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_write_off)


def translate_write_off(args: argparse.Namespace) -> bll.WriteOffCommand:
    """Convert parsed CLI arguments into a ``WriteOffCommand``.

    Args:
        args (argparse.Namespace): Namespace populated with ``write-off``
            options.

    Returns:
        bll.WriteOffCommand: Domain command capturing write-off details.
            Quantity is coerced to :class:`~decimal.Decimal`.

    Raises:
        decimal.InvalidOperation: If ``--quantity`` cannot be parsed as a valid
            decimal number.
    """
    return bll.WriteOffCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=Decimal(args.quantity),
        notes=args.notes,
    )


def run_write_off(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the write-off workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to transactional mutations.
        args (argparse.Namespace): Parsed CLI arguments describing the
            write-off operation.

    Returns:
        int: Exit code ``0`` when the write-off is recorded successfully.
    """
    command = translate_write_off(args)
    bll.record_write_off(context, command)
    return 0
