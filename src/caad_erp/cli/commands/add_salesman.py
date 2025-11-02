import argparse
import typing as t

from caad_erp import core_logic

from ..command_spec import CommandSpec, SubparserFactory


def register_add_salesman_command() -> CommandSpec:
    """Register the parser and executor for ``add-salesman``."""
    name = "add-salesman"
    help_text = "Register a new salesman in the Salesmen sheet."

    def registrar(action: SubparserFactory) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--salesman-id", required=True)
        parser.add_argument("--salesman-name", required=True)
        parser.add_argument("--inactive", action="store_true",
                            help="Mark the salesman as inactive on creation.")
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_add_salesman)


def translate_add_salesman(args: argparse.Namespace) -> t.Mapping[str, t.Any]:
    """Translate CLI args into an add-salesman request."""
    return {
        "salesman_id": args.salesman_id,
        "salesman_name": args.salesman_name,
        "is_active": not getattr(args, "inactive", False),
    }


def run_add_salesman(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-salesman workflow in the BLL."""
    payload = translate_add_salesman(args)
    core_logic.add_salesman(context, **payload)  # type: ignore[attr-defined]
    return 0
