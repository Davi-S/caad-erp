import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec, SubparserFactory


def register_deactivate_salesman_command() -> CommandSpec:
    """Register the parser and executor for ``deactivate-salesman``."""

    name = "deactivate-salesman"
    help_text = "Mark an existing salesman as inactive."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--salesman-id", required=True)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_deactivate_salesman)


def translate_deactivate_salesman(args: argparse.Namespace) -> str:
    """Translate CLI args into a salesman identifier to deactivate."""

    return str(args.salesman_id).strip()


def run_deactivate_salesman(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the deactivate-salesman workflow via the BLL."""

    salesman_id = translate_deactivate_salesman(args)
    core_logic.update_salesman(context, salesman_id, is_active=False)
    return 0
