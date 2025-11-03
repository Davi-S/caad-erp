import argparse

from caad_erp import bll

from ..command_spec import CommandSpec, SubparserFactory


def register_stock_command() -> CommandSpec:
    """Create CLI wiring for the ``stock`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "stock"
    help_text = "Display current stock levels."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``stock`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the stock report
                command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_stock_report)


def run_stock_report(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the stock reporting workflow.

    Args:
        context (bll.RuntimeContext): Runtime context providing access
            to product and inventory caches.
        args (argparse.Namespace): Parsed CLI arguments for the command. This
            command currently consumes no additional options but is included
            for API parity.

    Returns:
        int: Exit code ``0`` after calculating the inventory snapshot.
    """
    bll.calculate_inventory(context)
    return 0
