import argparse
import typing as t

from caad_erp import bll

from .. import command_spec
from ..parser import handle_cli_error


def register_profit_command() -> command_spec.CommandSpec:
    """Create CLI wiring for the ``profit`` reporting sub-command.

    Returns:
        CommandSpec: Specification containing the parser registrar and
            executor used to register and execute the command.
    """
    name = "profit"
    help_text = "Display revenue, cost, and profit summaries."

    def _registrar(action: command_spec.SubparserFactory) -> argparse.ArgumentParser:
        """Attach ``profit`` arguments to the provided sub-parser.

        Args:
            action (SubparserFactory): Factory responsible for adding the
                command-specific parser to the CLI.

        Returns:
            argparse.ArgumentParser: Parser configured for the profit report
                command.
        """
        parser = action.add_parser(name, help=help_text)
        parser.set_defaults(command=name)
        return parser

    return command_spec.CommandSpec(
        name=name,
        help_text=help_text,
        register=_registrar,
        execute=_run_profit_report,
        is_mutating=False,
    )


def _display_profit_summary(summary: t.Mapping[str, int]) -> None:
    """Print the aggregated revenue, cost, and profit metrics.

    Args:
        summary (Mapping[str, int]): Output from
            :func:`bll.calculate_profit_summary` containing the totals to
            display.
    """

    total_revenue = summary.get("total_revenue", 0)
    total_cost = summary.get("total_cost", 0)
    profit = summary.get("profit", total_revenue + total_cost)

    print("Profit summary:")
    print(f"  Total revenue : {total_revenue / 100:.2f}")
    print(f"  Total cost    : {total_cost / 100:.2f}")
    print(f"  Profit        : {profit / 100:.2f}")


def _run_profit_report(context: bll.RuntimeContext, args: argparse.Namespace) -> int:
    """Compute and display the profit summary for the current workbook.

    Args:
        context (bll.RuntimeContext): Runtime context providing access to the
            open workbook and caches.
        args (argparse.Namespace): Parsed CLI arguments; reserved for future
            options and currently unused.

    Returns:
        int: ``0`` on success, or a non-zero exit code on failure.
    """

    try:
        summary = bll.calculate_profit_summary(context)
        _display_profit_summary(summary)
        return 0
    except Exception as error:
        return handle_cli_error(error)
