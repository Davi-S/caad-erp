import argparse

from caad_erp import bll

from .. import command_spec


def register_void_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``void`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "void"
    help_text = "Void an existing transaction."

    def registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``void`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the void workflow.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--linked-transaction-id", required=True)
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_void)


def translate_void(
    args: argparse.Namespace,
) -> bll.VoidCommand:
    """Convert parsed CLI arguments into a ``VoidCommand``.

    Args:
        args (argparse.Namespace): Namespace populated with ``void`` options.

    Returns:
        bll.VoidCommand: Domain command capturing void details.
    """
    return bll.VoidCommand(
        linked_transaction_id=args.linked_transaction_id,
        notes=args.notes,
    )


def run_void(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the void workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to transactional mutations.
        args (argparse.Namespace): Parsed CLI arguments describing the void
            operation.

    Returns:
        int: Exit code ``0`` when the void is recorded successfully.
    """
    command = translate_void(args)
    bll.record_void(context, command)
    return 0
