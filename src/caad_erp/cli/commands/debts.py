import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec


def register_debts_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``debts``."""
    name = "debts"
    help_text = "Display outstanding credit balances."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_debts_report)


def run_debts_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the outstanding debts reporting workflow."""
    core_logic.calculate_outstanding_debts(
        context)  # type: ignore[attr-defined]
    return 0
