import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec, SubparserFactory


def register_log_command() -> CommandSpec:
    """Create CLI wiring for the ``log`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "log"
    help_text = "Display the transaction log."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
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

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_log_report)


def run_log_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the transaction log reporting workflow.

    Args:
        context (core_logic.RuntimeContext): Runtime context providing access
            to the transaction log cache.
        args (argparse.Namespace): Parsed CLI arguments for the command. This
            command currently consumes no additional options but is included
            for API parity.

    Returns:
        int: Exit code ``0`` after retrieving the log entries.
    """
    core_logic.list_transactions(context)
    return 0
