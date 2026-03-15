import argparse

from caad_erp import bll

from .. import command_spec


def register_add_salesman_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``add-salesman`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "add-salesman"
    help_text = "Register a new salesman in the Salesmen sheet."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``add-salesman`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured with the
                ``add-salesman`` options.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-i", "--salesman-id", required=True)
        parser.add_argument("-n", "--salesman-name", required=True)
        parser.add_argument("-x", "--inactive", action="store_true",
                            help="Mark the salesman as inactive on creation.")
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=_registrar, execute=_run_add_salesman)


def _translate_add_salesman(args: argparse.Namespace) -> bll.SalesmanCommand:
    """Convert parsed CLI arguments into a salesman command object.

    Args:
        args (argparse.Namespace): Namespace produced for the
            ``add-salesman`` command.

    Returns:
        bll.SalesmanCommand: Command payload used by
            :func:`bll.add_salesman`. The ``--inactive`` option is inverted
            into the ``is_active`` flag.
    """
    return bll.SalesmanCommand(
        salesman_id=args.salesman_id,
        salesman_name=args.salesman_name,
        is_active=not getattr(args, "inactive", False),
    )


def _run_add_salesman(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the add-salesman workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Active runtime context containing
            workbook accessors and caches.
        args (argparse.Namespace): Parsed CLI arguments for the command.

    Returns:
        int: Exit code ``0`` when the salesman is successfully recorded.
    """
    command = _translate_add_salesman(args)
    bll.add_salesman(context, command)
    return 0
