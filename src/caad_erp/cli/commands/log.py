import argparse

from caad_erp import bll

from .. import command_spec


def register_log_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``log`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "log"
    help_text = "Display the transaction log."

    def registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``log`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the log report
                command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_log_report)


def run_log_report(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the transaction log reporting workflow.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to the transaction log cache.
        args (argparse.Namespace): Parsed CLI arguments for the command. This
            command currently consumes no additional options but is included
            for API parity.

    Returns:
        int: Exit code ``0`` after retrieving the log entries.
    """
    bll.list_transactions(context)
    return 0
