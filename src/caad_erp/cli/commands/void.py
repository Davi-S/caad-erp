import argparse

from caad_erp import core_logic

from ..command_spec import CommandSpec


def register_void_command(
    subparsers: argparse._SubParsersAction[argparse.ArgumentParser],
) -> CommandSpec:
    """Register the parser and executor for ``void``."""
    name = "void"
    help_text = "Void an existing transaction."

    def registrar(action: argparse._SubParsersAction[argparse.ArgumentParser]) -> argparse.ArgumentParser:
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--linked-transaction-id", required=True)
        parser.add_argument("--notes", dest="notes", default=None)
        parser.set_defaults(command=name)
        return parser

    return CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_void)


def translate_void(
    args: argparse.Namespace,
) -> core_logic.VoidCommand:
    """Translate CLI args into a void command object."""
    return core_logic.VoidCommand(
        linked_transaction_id=args.linked_transaction_id,
        replacement_command=None,
        notes=args.notes,
    )


def run_void(context: core_logic.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the void workflow via the BLL."""
    command = translate_void(args)
    core_logic.record_void(context, command)
    return 0
