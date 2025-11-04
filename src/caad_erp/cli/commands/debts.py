import argparse

from caad_erp import bll

from .. import command_spec


def register_debts_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``debts`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "debts"
    help_text = "Display outstanding credit balances."

    def registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``debts`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the debts report
                command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_debts_report)


def run_debts_report(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the outstanding debts reporting workflow.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to the immutable transaction log and caches.
        args (argparse.Namespace): Parsed CLI arguments for the command. This
            command currently consumes no additional options but is included
            for API parity.

    Returns:
        int: Exit code ``0`` after triggering the calculation.
    """
    bll.calculate_outstanding_debts(context)
    return 0
