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

    def registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
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
            "--all",
            action="store_true",
            help="Include inactive salesmen in the output.",
        )
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name,
        help_text=help_text,
        register=registrar,
        execute=run_list_salesmen_report,
        is_mutating=False,
    )


def display_salesmen_report(
    salesmen: t.Iterable[object], *, include_inactive: bool
) -> None:
    """Print salesman records in a fixed-width table.

    Args:
        salesmen (Iterable[object]): Salesman rows returned by
            :func:`bll.list_salesmen`.
        include_inactive (bool): Whether inactive salesmen were requested,
            which controls table columns and empty-state messaging.
    """
    rows = list(salesmen)
    if not rows:
        print("No salesmen found." if include_inactive else "No active salesmen found.")
        return

    if include_inactive:
        print(f"{'Salesman ID':<20} {'Name':<30} {'Active':>7}")
        print(f"{'-' * 20} {'-' * 30} {'-' * 7}")
        for row in rows:
            print(
                f"{getattr(row, 'salesman_id', ''):<20} "
                f"{getattr(row, 'salesman_name', ''):<30} "
                f"{('yes' if getattr(row, 'is_active', False) else 'no'):>7}"
            )
        return

    print(f"{'Salesman ID':<20} {'Name':<30}")
    print(f"{'-' * 20} {'-' * 30}")
    for row in rows:
        print(
            f"{getattr(row, 'salesman_id', ''):<20} "
            f"{getattr(row, 'salesman_name', ''):<30}"
        )


def run_list_salesmen_report(
    context: bll.RuntimeContext, args: argparse.Namespace
) -> int:
    """Fetch salesmen and display them on the console.

    Args:
        context (bll.RuntimeContext): Runtime context used to access workbook
            data and caches.
        args (argparse.Namespace): Parsed CLI arguments for this command.

    Returns:
        int: ``0`` after listing salesmen.
    """
    include_inactive = bool(getattr(args, "all", False))
    salesmen = bll.list_salesmen(context, include_inactive=include_inactive)
    display_salesmen_report(salesmen, include_inactive=include_inactive)
    return 0
