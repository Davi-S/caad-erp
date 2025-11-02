import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec


def register_profit_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``profit``."""
    name = "profit"
    help_text = "Display revenue, cost, and profit summaries."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_profit_report)


def run_profit_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the profit reporting workflow."""
    core_logic.calculate_profit_summary(context)
    return 0
