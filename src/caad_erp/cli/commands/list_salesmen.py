import argparse
import typing as t

from caad_erp import bll

from .. import command_spec


def register_list_salesmen_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``list-salesmen`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "list-salesmen"
    help_text = "Display registered salesmen."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``list-salesmen`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the list-salesmen
                report command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.add_argument(
            "-i",
            "--salesman-id",
            required=False,
            help="Get information for this specific salesman only.",
        )
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name,
        help_text=help_text,
        register=_registrar,
        execute=_run_list_salesmen_report,
        is_mutating=False,
    )


def _display_salesmen_report(salesmen: t.Iterable[object]) -> None:
    """Print salesman records in a fixed-width table.

    Args:
        salesmen (Iterable[object]): Salesman rows returned by
            :func:`bll.list_salesmen`.
    """
    rows = list(salesmen)
    if not rows:
        print("No salesmen found.")
        return

    print(f"{'Salesman ID':<20} {'Name':<30} {'Active':>7}")
    print(f"{'-' * 20} {'-' * 30} {'-' * 7}")
    for row in rows:
        print(
            f"{getattr(row, 'salesman_id', ''):<20} "
            f"{getattr(row, 'salesman_name', ''):<30} "
            f"{('yes' if getattr(row, 'is_active', False) else 'no'):>7}"
        )


def _run_list_salesmen_report(
    context: bll.RuntimeContext, args: argparse.Namespace
) -> int:
    """Fetch all salesmen and display them on the console.

    Args:
        context (bll.RuntimeContext): Runtime context used to access workbook
            data and caches.
        args (argparse.Namespace): Parsed CLI arguments for this command
            (currently unused; retained for signature consistency).

    Returns:
        int: ``0`` after listing salesmen.
    """
    salesmen = bll.list_salesmen(context)
    salesman = (
        salesmen
        if not args.salesman_id
        else [
            salesman
            for salesman in salesmen
            if salesman.salesman_id == args.salesman_id
        ]
    )
    _display_salesmen_report(salesman)
    return 0
