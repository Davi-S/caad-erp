import argparse

from caad_erp import bll

from .. import command_spec


def register_edit_salesman_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``edit-salesman`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """

    name = "edit-salesman"
    help_text = "Edit fields of a salesman."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``edit-salesman`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory used to add the command-specific
                parser to the CLI definition.

        Returns:
            argparse.ArgumentParser: Parser configured for salesman
                deactivation inputs.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("-i", "--salesman-id", required=True)
        parser.add_argument("-n", "--salesman-name", required=False, default=None)
        parser.add_argument(
            "-a", "--salesman-is-active", required=False, action="store_true"
        )

        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name, help_text=help_text, register=_registrar, execute=_run_edit_salesman
    )


def _translate_edit_salesman(args: argparse.Namespace) -> bll.SalesmanCommand:
    """Normalize CLI arguments into a salesman update command.

    Args:
        args (argparse.Namespace): Namespace containing the
            ``edit-salesman`` options.

    Returns:
        bll.SalesmanCommand: Command setting passed fields while leaving other
        fields unchanged.
    """
    return bll.SalesmanCommand(
        salesman_id=str(args.salesman_id).strip(),
        salesman_name=args.salesman_name,
        is_active=args.salesman_is_active,
    )


def _run_edit_salesman(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the edit-salesman workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Active runtime context that
            exposes workbook mutation APIs.
        args (argparse.Namespace): Parsed CLI arguments for the command.

    Returns:
        int: Exit code ``0`` after the salesman has been altered.
    """

    command = _translate_edit_salesman(args)
    bll.update_salesman(context, command)
    return 0
