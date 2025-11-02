import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec


def register_stock_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``stock``."""
    name = "stock"
    help_text = "Display current stock levels."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_stock_report)


def run_stock_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the stock reporting workflow."""
    core_logic.calculate_inventory(context)
    return 0
