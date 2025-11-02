import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec, SubparserFactory


def register_log_command() -> CommandSpec:
    """Register the parser and executor for ``log``."""
    name = "log"
    help_text = "Display the transaction log."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_log_report)


def run_log_report(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the transaction log reporting workflow."""
    core_logic.list_transactions(context)
    return 0
