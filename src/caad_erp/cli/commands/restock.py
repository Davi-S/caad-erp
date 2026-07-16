import argparse

from caad_erp import bll

from .. import command_spec


def register_restock_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``restock`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "restock"
    help_text = "Record a restock transaction."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``restock`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the restock
                workflow.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-i", "--product-id", required=True)
        parser.add_argument("-q", "--quantity", required=True)
        parser.add_argument("-c", "--total-cost", required=True)
        parser.add_argument("-s", "--salesman-id", required=True)
        parser.add_argument("-n", "--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=_registrar, execute=_run_restock)


def _translate_restock(args: argparse.Namespace) -> bll.RestockCommand:
    """Convert parsed CLI arguments into a ``RestockCommand``.

    Args:
        args (argparse.Namespace): Namespace populated with ``restock``
            options.

    Returns:
        bll.RestockCommand: Domain command capturing restock details.
            Quantity and cost values are coerced to integers.

    Raises:
        ValueError: If ``--quantity`` or ``--total-cost`` cannot
            be parsed as valid integer numbers.
    """
    return bll.RestockCommand(
        product_id=args.product_id,
        salesman_id=args.salesman_id,
        quantity=int(args.quantity),
        total_cost=int(args.total_cost),
        notes=args.notes,
    )


def _run_restock(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the restock workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to transactional mutations.
        args (argparse.Namespace): Parsed CLI arguments describing the
            restock operation.

    Returns:
        int: Exit code ``0`` when the restock is recorded successfully.
    """
    command = _translate_restock(args)
    # TODO: Need to return error when the restock fails
    # For example, on inactive salesman
    bll.record_restock(context, command)
    return 0
