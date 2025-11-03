import argparse

from caad_erp import bll

from .. import command_spec


def register_deactivate_salesman_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``deactivate-salesman`` sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """

    name = "deactivate-salesman"
    help_text = "Mark an existing salesman as inactive."

    def registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``deactivate-salesman`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory used to add the command-specific
                parser to the CLI definition.

        Returns:
            argparse.ArgumentParser: Parser configured for salesman
                deactivation inputs.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument("--salesman-id", required=True)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(name=name, help_text=help_text, register=registrar, execute=run_deactivate_salesman)


def translate_deactivate_salesman(args: argparse.Namespace) -> str:
    """Normalize CLI arguments into a salesman identifier.

    Args:
        args (argparse.Namespace): Namespace containing the
            ``deactivate-salesman`` options.

    Returns:
        str: Sanitized salesman identifier suitable for
            :func:`bll.update_salesman`.
    """

    return str(args.salesman_id).strip()


def run_deactivate_salesman(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Execute the deactivate-salesman workflow through the business logic layer.

    Args:
        context (bll.RuntimeContext): Active runtime context that
            exposes workbook mutation APIs.
        args (argparse.Namespace): Parsed CLI arguments for the command.

    Returns:
        int: Exit code ``0`` after the salesman has been flagged as inactive.
    """

    salesman_id = translate_deactivate_salesman(args)
    bll.update_salesman(context, salesman_id, is_active=False)
    return 0
