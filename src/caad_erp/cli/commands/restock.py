import argparse
from decimal import Decimal

from caad_erp import core_logic

from ..command_spec import CommandSpec, SubparserFactory


def register_restock_command() -> CommandSpec:
    """Create CLI wiring for the ``restock`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "restock"
    help_text = "Record a restock transaction."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``restock`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the restock
                workflow.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--product-id", required=True)
        parser.add_argument("--quantity", required=True)
        parser.add_argument("--total-cost", required=True)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_restock)


def translate_restock(args: argparse.Namespace) -> core_logic.RestockCommand:
    """Convert parsed CLI arguments into a ``RestockCommand``.

    Args:
        args (argparse.Namespace): Namespace populated with ``restock``
            options.

    Returns:
        core_logic.RestockCommand: Domain command capturing restock details.
            Quantity and cost values are coerced to :class:`~decimal.Decimal`.

    Raises:
        decimal.InvalidOperation: If ``--quantity`` or ``--total-cost`` cannot
            be parsed as valid decimal numbers.
    """
    return core_logic.RestockCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=Decimal(args.quantity),
        total_cost=Decimal(args.total_cost),
        notes=args.notes,
    )


def run_restock(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the restock workflow through the business logic layer.

    Args:
        context (core_logic.RuntimeContext): Runtime context providing access
            to transactional mutations.
        args (argparse.Namespace): Parsed CLI arguments describing the
            restock operation.

    Returns:
        int: Exit code ``0`` when the restock is recorded successfully.
    """
    command = translate_restock(args)
    core_logic.record_restock(context, command)
    return 0
