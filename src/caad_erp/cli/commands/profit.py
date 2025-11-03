import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec, SubparserFactory


def register_profit_command() -> CommandSpec:
    """Create CLI wiring for the ``profit`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "profit"
    help_text = "Display revenue, cost, and profit summaries."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``profit`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the profit report
                command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_profit_report)


def run_profit_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the profit reporting workflow.

    Args:
        context (core_logic.RuntimeContext): Runtime context providing access
            to cached inventory and transaction data.
        args (argparse.Namespace): Parsed CLI arguments for the command. This
            command currently consumes no additional options but is included
            for API parity.

    Returns:
        int: Exit code ``0`` after calculating the profit summary.
    """
    core_logic.calculate_profit_summary(context)
    return 0
